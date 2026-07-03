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


def loadCodeToCity():
    """從 data/hospitals.json 讀機構代號 → 縣市對照表，給 nurse-ratio 補 city 用"""
    path = os.path.join(ROOT, 'data', 'hospitals.json')
    if not os.path.isfile(path):
        print('  ⚠️  找不到 hospitals.json，city 欄位將全部為 null')
        return {}
    with open(path, encoding='utf-8') as f:
        hd = json.load(f)
    mapping = {}
    for h in hd.get('hospitals', []):
        code = h.get('code')
        city = h.get('city')
        if code and city:
            mapping[str(code).strip()] = city
    print(f'  ✓ 從 hospitals.json 讀到 {len(mapping)} 個機構代號 → 縣市對照')
    return mapping


def main():
    if not os.path.isdir(SRC_DIR):
        print(f'❌ 找不到來源資料夾: {SRC_DIR}')
        return

    files = sorted(
        [f for f in os.listdir(SRC_DIR) if f.lower().endswith('.ods')]
    )
    if not files:
        print(f'❌ 資料夾內沒有 .ods 檔')
        return

    print(f'📂 找到 {len(files)} 個 .ods 檔')

    # 讀 hospitals.json 拿 code → city 對照
    codeToCity = loadCodeToCity()

    # 集合所有月份 + 每個醫院
    hospitalsByCode = {}  # code → {id, name, level, city, history: {monthKey: {day, eve, night}}}
    monthsSet = set()

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
                if code not in hospitalsByCode:
                    hospitalsByCode[code] = {
                        'id': code,
                        'name': rec['name'],
                        'level': rec['level'],
                        'city': codeToCity.get(code),  # 對照不到的診所會是 None
                        'history': {},
                    }
                # 名稱可能微調，用最新的
                hospitalsByCode[code]['name'] = rec['name']
                hospitalsByCode[code]['level'] = rec['level']
                # city 也順便補（若之前是 None 但現在有）
                if hospitalsByCode[code].get('city') is None:
                    hospitalsByCode[code]['city'] = codeToCity.get(code)
                hospitalsByCode[code]['history'][monthKey] = {
                    'day': rec['day'],
                    'eve': rec['eve'],
                    'night': rec['night'],
                }
            monthsSet.add(monthKey)
            print(f'  ✓ {monthKey}: {len(data)} 家醫院  ← {filename}')
        except Exception as e:
            print(f'  ❌ 解析失敗: {filename} — {e}')

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
