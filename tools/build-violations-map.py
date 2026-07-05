#!/usr/bin/env python3
"""
建立違規機構 → 機構代號 對照表：data/violations-hospital-map.json

違規紀錄（勞檢/性平/職安）三支 Google Sheet CSV 的機構欄是勞動部
「事業單位名稱(負責人)」自由格式，沒有機構代號，名稱又髒（夾負責人、
「某人即某商號」、附設長照機構…）。本工具把這些名稱正規化後，比對
data/hospitals-merged.json 的 canonical name，命中就記下該院 10 碼代號，
產出「原始名稱 → 代號」對照表供前端純字典查詢。

只對接 482 家評鑑醫院；診所/長照/檢驗所等非評鑑機構不在對照表內。

使用方式：
  python3 tools/build-violations-map.py

違規 Sheet 定期新增列時重跑即可。normalize_name() 與
js/institution-name.js 的 normalizeInstitutionName() 邏輯須保持一致。
"""

import os
import re
import csv
import sys
import json
import io
import urllib.request
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MERGED_FILE = os.path.join(ROOT, 'data', 'hospitals-merged.json')
OVERRIDES_FILE = os.path.join(ROOT, 'data', 'violations-hospital-overrides.json')
OUT_MAP = os.path.join(ROOT, 'data', 'violations-hospital-map.json')
OUT_UNMATCHED = os.path.join(ROOT, 'data', 'violations-hospital-map.unmatched.txt')

# 三支違規 CSV published URL —— 須與 js/violations.js、js/gender.js、js/osha.js
# 內的 CSV_URL 保持一致（若前端換 Sheet，這裡也要換）。
FEEDS = {
    'labor': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN/pub?gid=190468784&single=true&output=csv',
    'gender': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy/pub?gid=1540285352&single=true&output=csv',
    'osha': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_/pub?gid=1130584206&single=true&output=csv',
}

INSTITUTION_COL = 3   # 事業單位名稱 欄索引（三支皆為 index 3）
JI_MAX_OWNER_LEN = 4  # 「X即Y」的負責人姓名長度上限
CONTAIN_MIN_LEN = 6   # 「canonical ⊆ 違規名」比對時 canonical 正規化後最短長度
PREFIX_MIN_LEN = 7    # 「違規名為 canonical 前綴」比對時違規名最短長度


def normalize_name(raw):
    """與 js/institution-name.js normalizeInstitutionName() 等價。"""
    s = (raw or '').strip()
    if not s:
        return ''
    # 1. 「X即Y」→ Y
    ji = s.find('即')
    if 0 < ji <= JI_MAX_OWNER_LEN:
        s = s[ji + 1:]
    # 2. 去括號（半形/全形）及內容
    s = re.sub(r'[（(][^（()）]*[)）]', '', s)
    # 3. 臺→台
    s = s.replace('臺', '台')
    # 4. 去空白（含全形）
    s = re.sub(r'[\s　]+', '', s)
    return s.strip()


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (build-violations-map)'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode('utf-8-sig', errors='replace')
    return list(csv.reader(io.StringIO(raw)))


def extract_names(rows):
    """跳過 metadata / header，取出機構名稱欄。"""
    names = []
    started = False
    for row in rows:
        if not row:
            continue
        if not started:
            # header 列：第一欄為「編號」
            if row and row[0].strip() == '編號':
                started = True
            continue
        if len(row) > INSTITUTION_COL:
            name = (row[INSTITUTION_COL] or '').strip()
            if name:
                names.append(name)
    return names


def load_merged():
    with open(MERGED_FILE, encoding='utf-8') as f:
        data = json.load(f)
    hosps = data.get('hospitals', [])
    # canonical 正規化名 → code（同名多代號時，保留第一個；院區細分靠 longest-wins）
    norm_to_code = {}
    entries = []  # (norm_name, code, name)
    for h in hosps:
        code = h.get('code')
        name = h.get('name')
        if not code or not name:
            continue
        nn = normalize_name(name)
        if not nn:
            continue
        entries.append((nn, code, name))
        norm_to_code.setdefault(nn, code)
    # 依正規化名長度降冪，供 longest-wins 包含比對
    entries.sort(key=lambda e: len(e[0]), reverse=True)
    return norm_to_code, entries


def match_name(raw, norm_to_code, entries):
    nn = normalize_name(raw)
    if not nn:
        return None
    # 1. 精確
    if nn in norm_to_code:
        return norm_to_code[nn]
    # 2. canonical ⊆ 違規正規化名（取最長的 canonical）
    #    處理違規名夾負責人/委託註記，去雜訊後 canonical 完整內嵌其中。
    for cnorm, code, _name in entries:  # entries 已依長度降冪
        if len(cnorm) >= CONTAIN_MIN_LEN and cnorm in nn:
            return code
    # 3. 違規名為 canonical 的前綴（canonical 多了「及其X院區/附設民眾診療服務處」等尾綴）
    #    只認前綴以避免中段誤命中；多筆時取最短 canonical（基準院區）。
    if len(nn) >= PREFIX_MIN_LEN:
        best = None
        for cnorm, code, _name in entries:
            if cnorm.startswith(nn) and len(cnorm) > len(nn):
                if best is None or len(cnorm) < best[0]:
                    best = (len(cnorm), code)
        if best:
            return best[1]
    return None


def load_overrides():
    if not os.path.exists(OVERRIDES_FILE):
        return {}
    try:
        with open(OVERRIDES_FILE, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f'  ⚠ overrides 讀取失敗，略過：{e}')
        return {}


def looks_like_hospital(name):
    return ('醫院' in name) or ('醫療' in name) or ('醫學' in name)


def main():
    print('讀取 hospitals-merged.json …')
    norm_to_code, entries = load_merged()
    print(f'  canonical 醫院 {len(entries)} 筆')

    all_names = set()
    for feed, url in FEEDS.items():
        print(f'抓取 {feed} CSV …')
        try:
            rows = fetch_csv(url)
            names = extract_names(rows)
            all_names.update(names)
            print(f'  {feed}: {len(names)} 筆機構名（distinct 累計 {len(all_names)}）')
        except Exception as e:
            print(f'  ⚠ {feed} 抓取失敗：{e}')

    print('比對中 …')
    mapping = {}
    unmatched_hosp = []
    for name in sorted(all_names):
        code = match_name(name, norm_to_code, entries)
        if code:
            mapping[name] = code
        elif looks_like_hospital(name):
            unmatched_hosp.append(name)

    # 疊加人工覆蓋（最後套用；code 為 null / 空 → 從對照表移除該誤判）
    overrides = load_overrides()
    ov_applied = 0
    for name, code in overrides.items():
        if name.startswith('_'):
            continue  # 以 _ 開頭為註解 key
        if code:
            mapping[name] = code
        else:
            mapping.pop(name, None)
        ov_applied += 1

    tz = timezone(timedelta(hours=8))
    out = {
        'generatedAt': datetime.now(tz).isoformat(),
        'note': '違規機構名稱 → 機構代號對照表；只含命中評鑑醫院者。由 tools/build-violations-map.py 產生。',
        'count': len(mapping),
        'map': mapping,
    }
    with open(OUT_MAP, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    with open(OUT_UNMATCHED, 'w', encoding='utf-8') as f:
        f.write(f'# 疑似醫院但未命中的違規機構名稱（{len(unmatched_hosp)} 筆）\n')
        f.write('# 若確為評鑑醫院，可在 data/violations-hospital-overrides.json 補上 {"名稱": "代號"}。\n\n')
        for n in unmatched_hosp:
            f.write(n + '\n')

    print(f'✔ 已寫出 {OUT_MAP}')
    print(f'  對照 {len(mapping)} 筆（overrides 套用 {ov_applied} 筆）')
    print(f'  疑似醫院未命中 {len(unmatched_hosp)} 筆 → {OUT_UNMATCHED}')


if __name__ == '__main__':
    main()
