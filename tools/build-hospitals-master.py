#!/usr/bin/env python3
"""
產生 data/hospitals-master.json：全站醫院識別的「單一權威主檔」（以機構代號為鍵）。

過去醫院清單散落多處、且表單用的是沒有代號的 JS 模組（hospitals.js / hospitals-extra.js）
→ 難去重、難維護。本工具彙整成一份 code 為鍵的 JSON，供表單機構名稱自動建議使用。

來源：
  data/hospitals.json                  評鑑合格名單（extract-hospitals.py 產出，含 code）
  data/nurse-ratio.json                護病比（取 source=='vpn-only'：對不到評鑑名單者）
  data/hospitals-address-overlay.json  vpn-only 缺地址者的縣市（fetch-hospital-addresses.py）
  健保署特約醫事機構開放資料             vpn-only 的官方名稱（data.gov.tw）

輸出每筆：{ code, name, city, level, source }（source: 'accred' | 'vpn'）
用法：python tools/build-hospitals-master.py
"""
import os
import re
import csv
import io
import sys
import json
import subprocess
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FILE = os.path.join(ROOT, 'data', 'hospitals-master.json')

NHI_API = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId='
NHI_RESOURCES = [
    'A21030000I-D21001-003', 'A21030000I-D21002-005',
    'A21030000I-D21003-003', 'A21030000I-D21004-009',
]

CITIES = {
    '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市',
    '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
}

# 共用代號多院區、健保署只給母院名者，用機構代碼手動指定（例：北市聯醫松德院區為精神專科，
# 走精神科醫院評鑑、不在一般評鑑名單）。
MANUAL = {
    '0101090517': {'name': '臺北市立聯合醫院松德院區', 'city': '臺北市', 'level': '區域醫院'},
}
SKIP_CODES = {'3501200000'}  # 臺北虛擬診所，無實體地址


def norm(s):
    return (s or '').strip().replace('台', '臺')


def city_from_address(addr):
    a = norm(addr)
    return a[:3] if a[:3] in CITIES else ''


def fetch_nhi():
    idx = {}
    for rid in NHI_RESOURCES:
        raw = subprocess.run(['curl', '-s', '-m', '120', NHI_API + rid],
                             capture_output=True, timeout=180).stdout
        text = raw.decode('utf-8-sig', errors='replace')
        reader = csv.reader(io.StringIO(text))
        next(reader, None)
        for row in reader:
            if len(row) >= 5 and row[0].strip() and row[0].strip() not in idx:
                idx[row[0].strip()] = {'name': row[1].strip(), 'address': row[4].strip()}
    return idx


def main():
    accred = json.load(open(os.path.join(ROOT, 'data', 'hospitals.json'), encoding='utf-8'))['hospitals']
    nr = json.load(open(os.path.join(ROOT, 'data', 'nurse-ratio.json'), encoding='utf-8'))['hospitals']
    ov = json.load(open(os.path.join(ROOT, 'data', 'hospitals-address-overlay.json'), encoding='utf-8'))
    ov = ov.get('overlay') or ov

    entries = []
    seen_keys = set()      # (name, city) 去重
    seen_codes = set()

    # 1) 評鑑合格名單（權威官方名，含 code）
    for h in accred:
        code = h.get('code')
        name = norm(h.get('name'))
        city = norm(h.get('city'))
        level = h.get('level')
        if not name:
            continue
        entries.append({'code': code, 'name': name, 'city': city, 'level': level, 'source': 'accred'})
        seen_keys.add((name, city))
        if code:
            seen_codes.add(code)

    # 2) vpn-only（對不到評鑑名單）：以健保署官方名 + overlay 縣市補上
    print('抓取健保署特約醫事機構資料 …')
    nhi = fetch_nhi()
    print(f'  健保署代碼索引 {len(nhi)} 筆')

    vpn = [h for h in nr if h.get('source') == 'vpn-only']
    added = 0
    unresolved = []
    for h in vpn:
        code = h['code']
        if code in SKIP_CODES:
            continue
        if code in MANUAL:
            rec = MANUAL[code]
            name, city, level = norm(rec['name']), rec['city'], rec['level']
        else:
            src = nhi.get(code)
            if not src or not src.get('name'):
                unresolved.append((code, h.get('name')))
                continue
            name = norm(src['name'])
            city = city_from_address(src['address']) or norm((ov.get(code) or {}).get('city'))
            level = h.get('level') or ''
        key = (name, city)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        entries.append({'code': code, 'name': name, 'city': city, 'level': level, 'source': 'vpn'})
        added += 1

    entries.sort(key=lambda e: (e['city'] or 'zz', e['level'] or '', e['name']))

    out = {
        'generatedAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
        'note': '全站醫院識別主檔（表單機構名稱建議用）。由 tools/build-hospitals-master.py 產生。'
                'accred=評鑑合格名單；vpn=只在護病比 VPN 有、對不到評鑑名單（健保署官方名補齊）。',
        'count': len(entries),
        'hospitals': entries,
    }
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    from collections import Counter
    print(f'✔ 已寫出 {OUT_FILE}（{len(entries)} 家；評鑑 {len(accred)}、新增 vpn {added}）')
    print(f'  層級分布：{dict(Counter(e["level"] for e in entries))}')
    if unresolved:
        print(f'  健保署查不到（略過）{len(unresolved)} 家')


if __name__ == '__main__':
    main()
