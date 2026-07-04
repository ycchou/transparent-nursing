#!/usr/bin/env python3
"""
統整 data/VPN登錄之各月份三班護病比/*.ods 成一份 data/nurse-ratio.json

使用方式：
  python3 tools/build-nurse-ratio.py

每月新增新的 .ods 檔到 data/VPN登錄之各月份三班護病比/ 後，
重跑此腳本即可自動更新 nurse-ratio.json。
"""

import os
import re
import sys
import json
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

# Windows stdout 需要 utf-8 才能印中文/emoji
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 專案根目錄
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'data', 'VPN登錄之各月份三班護病比')
OUT_FILE = os.path.join(ROOT, 'data', 'nurse-ratio.json')

# 三班護病比欄位索引（主表格）
COL_LEVEL = 0        # 特約類別
COL_HOSP_CODE = 3    # 機構代號
COL_HOSP_NAME = 4    # 機構名稱
COL_BEDS = 6         # 急性一般病床數
COL_DAY_RATIO = 9    # 白班護病比
COL_EVE_RATIO = 11   # 小夜班護病比
COL_NIGHT_RATIO = 13 # 大夜班護病比

NS_TABLE = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
NS_TEXT = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'


def rocFilenameToKey(filename):
    """115年4月...ods → 11504（民國年 zero-padded 月）"""
    m = re.search(r'(\d{3})年(\d{1,2})月', filename)
    if not m:
        return None
    return f'{m.group(1)}{int(m.group(2)):02d}'


def normalizeLevel(raw):
    """
    '1醫學中心' → '醫學中心'
    '2區域醫院' → '區域醫院'
    '3地區醫院' → '地區醫院'
    '醫中兒醫' → '醫學中心'
    """
    if not raw:
        return None
    t = raw.strip()
    if '醫學中心' in t or t == '醫中兒醫':
        return '醫學中心'
    if '區域醫院' in t:
        return '區域醫院'
    if '地區醫院' in t:
        return '地區醫院'
    return None


def parseNumber(s):
    """把 '5.5' / '5.5%' / '' / '—' 轉成 float 或 None"""
    if not s:
        return None
    t = str(s).strip().replace(',', '').replace('%', '')
    if not t or t == '—' or t == '-':
        return None
    try:
        v = float(t)
        return v if v > 0 else None
    except ValueError:
        return None


def parseInt(s):
    if not s:
        return None
    t = str(s).strip().replace(',', '')
    try:
        v = int(t)
        return v if v > 0 else None
    except ValueError:
        return None


def parseOds(path):
    """讀 .ods 檔（.zip 內含 content.xml），回傳第一張非精神sheet 的 rows"""
    with zipfile.ZipFile(path, 'r') as z:
        with z.open('content.xml') as f:
            content = f.read().decode('utf-8')
    if content.startswith('﻿'):
        content = content[1:]
    root = ET.fromstring(content)

    tables = list(root.iter(NS_TABLE + 'table'))
    if not tables:
        return None

    # 選第一張非精神類別的 sheet
    target = None
    for t in tables:
        name = t.get(NS_TABLE + 'name') or ''
        if '精神' in name:
            continue
        # 略過 metadata sheet (工作表1) 通常都是空的模板
        row_count = sum(1 for _ in t.iter(NS_TABLE + 'table-row'))
        if row_count < 50:  # 空模板通常很短
            continue
        target = t
        break

    if target is None:
        # fallback：拿第一張有夠多資料的 sheet
        for t in tables:
            row_count = sum(1 for _ in t.iter(NS_TABLE + 'table-row'))
            if row_count >= 50:
                target = t
                break

    if target is None:
        return None

    rows = []
    for row in target.iter(NS_TABLE + 'table-row'):
        cells = []
        for cell in row:
            tag = cell.tag.split('}')[-1]
            if tag == 'covered-table-cell':
                cells.append('')
                continue
            if tag != 'table-cell':
                continue
            repeat = int(cell.get(NS_TABLE + 'number-columns-repeated', '1'))
            if repeat > 30:
                repeat = 1
            text = ''.join(t.text or '' for t in cell.iter(NS_TEXT + 'p'))
            for _ in range(repeat):
                cells.append(text)
        while cells and cells[-1] == '':
            cells.pop()
        if cells:
            rows.append(cells)
    return rows


def extractHospitalRatios(rows):
    """從 rows 抽出所有醫院資料，回傳 {code: {name, level, day, eve, night}}"""
    out = {}
    for r in rows:
        if len(r) < COL_NIGHT_RATIO + 1:
            continue
        level = normalizeLevel(r[COL_LEVEL])
        if not level:
            continue
        code = str(r[COL_HOSP_CODE]).strip()
        if not re.match(r'^\d{10}$', code):
            continue
        name = str(r[COL_HOSP_NAME]).strip()
        if not name:
            continue

        beds = parseInt(r[COL_BEDS])
        day = parseNumber(r[COL_DAY_RATIO])
        eve = parseNumber(r[COL_EVE_RATIO])
        night = parseNumber(r[COL_NIGHT_RATIO])

        # 全 0 → 未報，跳過
        if beds is None and day is None and eve is None and night is None:
            continue

        out[code] = {
            'name': name,
            'level': level,
            'day': day,
            'eve': eve,
            'night': night,
        }
    return out


HOSPITALS_JSON = os.path.join(ROOT, 'data', 'hospitals.json')
HOSPITALS_MERGED_JSON = os.path.join(ROOT, 'data', 'hospitals-merged.json')


def loadAccredHospitalsIndex():
    """從 data/hospitals.json (評鑑 PDF 萃取) 讀完整醫院索引：code → [full record, ...]

    同一代號有多院區時保留全部（例：臺北市聯醫 6 院區都掛 0101090517）；
    fullName 完全相同的重複條目會去重（PDF 萃取常見瑕疵）。
    """
    if not os.path.isfile(HOSPITALS_JSON):
        print('  ⚠️  找不到 hospitals.json，將無評鑑資訊可用')
        return {}, {}
    with open(HOSPITALS_JSON, encoding='utf-8') as f:
        hd = json.load(f)
    accredIndex = {}  # code → list[record]
    for h in hd.get('hospitals', []):
        code = h.get('code')
        if not code:
            continue
        code = str(code).strip()
        existing = accredIndex.setdefault(code, [])
        # 依 fullName 去重
        if any(e.get('name') == h.get('name') for e in existing):
            continue
        existing.append(h)
    total = sum(len(v) for v in accredIndex.values())
    dup_codes = sum(1 for v in accredIndex.values() if len(v) > 1)
    print(f'  ✓ 讀到評鑑名單 {total} 筆 / {len(accredIndex)} 家 (共用代號多院區: {dup_codes} 家)')
    return accredIndex, hd


def longestCommonPrefix(strs):
    """回傳一組字串的最長共同前綴"""
    if not strs:
        return ''
    s1 = min(strs)
    s2 = max(strs)
    for i, c in enumerate(s1):
        if i >= len(s2) or c != s2[i]:
            return s1[:i]
    return s1


def extractBranchName(fullName, commonPrefix):
    """給 fullName 與共用前綴，回傳院區短名（例：中興院區、和平婦幼院區）"""
    if not fullName:
        return None
    if commonPrefix and fullName.startswith(commonPrefix):
        return fullName[len(commonPrefix):] or None
    return fullName


def writeMergedHospitalsIndex(accredIndex, accredMeta, vpnHospitalsByCode):
    """
    產生合併版醫院總表 data/hospitals-merged.json
    - 評鑑名單為主（保留全部欄位）
    - VPN 有但評鑑沒收錄的醫院補進來（source='vpn-only'）
    - 交集標 source='both'
    每筆記錄格式：
      { code, name, shortName, city, level, source, address?, phone?, accredResult? ... }
    """
    records = []

    # 評鑑名單優先：同代號多院區 → 各自輸出一筆（共用 shortName）
    for code, acList in accredIndex.items():
        vp = vpnHospitalsByCode.get(code)
        shortName = vp['name'] if vp else None
        for ac in acList:
            records.append({
                'code': code,
                'name': ac.get('name'),        # 評鑑正式全名（含院區）
                'shortName': shortName,        # 全部院區共用 VPN 簡稱
                'city': ac.get('city'),
                'level': ac.get('level'),
                'address': ac.get('address'),
                'phone': ac.get('phone'),
                'source': 'both' if vp else 'accred',
                'sharedCode': len(acList) > 1,
            })

    # VPN 有但評鑑沒收錄的
    for code, vp in vpnHospitalsByCode.items():
        if code in accredIndex:
            continue
        records.append({
            'code': code,
            'name': vp['name'],
            'shortName': vp['name'],
            'city': None,
            'level': vp['level'],
            'address': None,
            'phone': None,
            'source': 'vpn-only',
            'sharedCode': False,
        })

    # 排序：層級 → 縣市 → 名稱
    LEVEL_ORDER = {'醫學中心': 0, '區域醫院': 1, '地區醫院': 2}
    orderedList = sorted(
        records,
        key=lambda h: (LEVEL_ORDER.get(h['level'], 99), h['city'] or 'zz', h['name'] or ''),
    )

    stats = {'both': 0, 'accred': 0, 'vpn-only': 0}
    for h in records:
        stats[h['source']] = stats.get(h['source'], 0) + 1

    tz = timezone(timedelta(hours=8))
    output = {
        'generatedAt': datetime.now(tz).isoformat(),
        'sourceAccred': accredMeta.get('source'),
        'sourceVPN': 'data/VPN登錄之各月份三班護病比/*.ods',
        'totalHospitals': len(orderedList),
        'sourceCounts': stats,
        'hospitals': orderedList,
    }

    with open(HOSPITALS_MERGED_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=None, separators=(',', ':'))

    print(f'  ✓ 寫入合併總表 {HOSPITALS_MERGED_JSON}')
    print(f'    - 兩表都有 (both):     {stats["both"]:>4}')
    print(f'    - 只評鑑有 (accred):    {stats["accred"]:>4}')
    print(f'    - 只 VPN 有 (vpn-only): {stats["vpn-only"]:>4}')
    print(f'    - 合計：              {len(orderedList):>4}')

    return orderedList


def main():
    if not os.path.isdir(SRC_DIR):
        print(f'❌ 找不到來源資料夾: {SRC_DIR}')
        return

    files = sorted(
        [f for f in os.listdir(SRC_DIR)
         if f.lower().endswith('.ods') and not f.startswith('~$')]  # 濾掉 Office lock 檔
    )
    if not files:
        print(f'❌ 資料夾內沒有 .ods 檔')
        return

    print(f'📂 找到 {len(files)} 個 .ods 檔')

    # 讀評鑑名單（PDF 萃取 → hospitals.json）
    accredIndex, accredMeta = loadAccredHospitalsIndex()

    # 集合所有月份 + 每個醫院
    hospitalsByCode = {}  # code → {id, name, shortName, fullName, level, city, address, history}
    monthsSet = set()
    vpnHospitalsByCode = {}  # 給 merged 表用（只含 VPN 出現過的醫院）

    for filename in files:
        monthKey = rocFilenameToKey(filename)
        if not monthKey:
            print(f'  ⚠️  略過（無法從檔名抓月份）: {filename}')
            continue
        path = os.path.join(SRC_DIR, filename)
        try:
            rows = parseOds(path)
            if not rows:
                print(f'  ⚠️  略過（無資料 sheet）: {filename}')
                continue
            data = extractHospitalRatios(rows)
            for code, rec in data.items():
                accredList = accredIndex.get(code, [])
                vpnHospitalsByCode[code] = { 'name': rec['name'], 'level': rec['level'] }
                monthEntry = { 'day': rec['day'], 'eve': rec['eve'], 'night': rec['night'] }

                if len(accredList) > 1:
                    # 多院區：拆成 N 筆，各自 fullName / level / 分院顯示名，但共用 history
                    prefix = longestCommonPrefix([a.get('name') or '' for a in accredList])
                    for idx, accred in enumerate(accredList):
                        sub_id = f'{code}-{idx + 1}'
                        branch = extractBranchName(accred.get('name'), prefix)
                        display_name = f"{rec['name']}·{branch}" if branch else rec['name']
                        if sub_id not in hospitalsByCode:
                            hospitalsByCode[sub_id] = {
                                'id': sub_id,
                                'code': code,               # 保留原機構代號供辨識
                                'name': display_name,       # VPN 簡稱 + 院區
                                'fullName': accred.get('name'),
                                'level': accred.get('level') or rec['level'],
                                'city': accred.get('city'),
                                'address': accred.get('address'),
                                'phone': accred.get('phone'),
                                'source': 'both',
                                'branch': branch,
                                'sharedCode': {
                                    'code': code,
                                    'branchCount': len(accredList),
                                    'note': f'此代號涵蓋 {len(accredList)} 院區，VPN 護病比為整體回報之數字',
                                },
                                'history': {},
                            }
                        hospitalsByCode[sub_id]['history'][monthKey] = monthEntry
                else:
                    # 單院區（或 VPN-only）：走原本路徑
                    accred = accredList[0] if accredList else {}
                    if code not in hospitalsByCode:
                        hospitalsByCode[code] = {
                            'id': code,
                            'code': code,
                            'name': rec['name'],
                            'fullName': accred.get('name'),
                            'level': rec['level'],
                            'city': accred.get('city'),
                            'address': accred.get('address'),
                            'phone': accred.get('phone'),
                            'source': 'both' if accredList else 'vpn-only',
                            'history': {},
                        }
                    hospitalsByCode[code]['name'] = rec['name']
                    hospitalsByCode[code]['level'] = rec['level']
                    hospitalsByCode[code]['history'][monthKey] = monthEntry
            monthsSet.add(monthKey)
            print(f'  ✓ {monthKey}: {len(data)} 家醫院  ← {filename}')
        except Exception as e:
            print(f'  ❌ 解析失敗: {filename} — {e}')

    # 產生醫院合併總表（評鑑為主 + VPN 補）
    print()
    print('📋 產生合併醫院總表...')
    writeMergedHospitalsIndex(accredIndex, accredMeta, vpnHospitalsByCode)

    # 排序 months
    months = sorted(monthsSet)

    # 排序 hospitals：先依 level，再依 name
    LEVEL_ORDER = {'醫學中心': 0, '區域醫院': 1, '地區醫院': 2}
    hospitals = sorted(
        hospitalsByCode.values(),
        key=lambda h: (LEVEL_ORDER.get(h['level'], 99), h['name']),
    )

    # 時區 +8
    tz = timezone(timedelta(hours=8))
    generatedAt = datetime.now(tz).isoformat()

    output = {
        'generatedAt': generatedAt,
        'sourceDir': 'data/VPN登錄之各月份三班護病比/',
        'months': months,
        'monthCount': len(months),
        'hospitalCount': len(hospitals),
        'hospitals': hospitals,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=None, separators=(',', ':'))

    size_kb = os.path.getsize(OUT_FILE) / 1024
    print()
    print(f'✅ 寫入 {OUT_FILE}')
    print(f'   月份數: {len(months)}  範圍: {months[0]} ~ {months[-1]}')
    print(f'   醫院數: {len(hospitals)}')
    print(f'   檔案大小: {size_kb:.1f} KB')


if __name__ == '__main__':
    main()
