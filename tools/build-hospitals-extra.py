#!/usr/bin/env python3
"""
產生 js/hospitals-extra.js：表單「機構名稱」自動建議的手動補充清單。

hospitals.js 來自「一般醫院評鑑合格名單」，未涵蓋走精神科醫院評鑑等其他管道的
院區/醫院（在護病比 VPN 資料中以 source:'vpn-only' 出現、對不到評鑑名單）。
本工具取這些 vpn-only 機構，以健保署特約醫事機構開放資料（含官方名稱+地址）
補上正式名稱與縣市，去除已在評鑑名單中者，輸出成建議補充清單。

資料來源（健保署 data.gov.tw，同 fetch-hospital-addresses.py）：
  醫學中心 D21001-003 / 區域醫院 D21002-005 / 地區醫院 D21003-003 / 診所 D21004-009
  欄位：醫事機構代碼(0),醫事機構名稱(1),醫事機構種類(2),電話(3),地址(4)

用法：python tools/build-hospitals-extra.py
"""
import os
import re
import csv
import io
import sys
import json
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NURSE_FILE = os.path.join(ROOT, 'data', 'nurse-ratio.json')
HOSPITALS_JS = os.path.join(ROOT, 'js', 'hospitals.js')
OUT_FILE = os.path.join(ROOT, 'js', 'hospitals-extra.js')

NHI_API = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId='
NHI_RESOURCES = [
    'A21030000I-D21001-003',  # 醫學中心
    'A21030000I-D21002-005',  # 區域醫院
    'A21030000I-D21003-003',  # 地區醫院
    'A21030000I-D21004-009',  # 診所
]

CITIES = {
    '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市',
    '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
}

# 共用代號多院區等健保署只給母院名者，用機構代碼手動指定正確名稱/縣市/層級。
MANUAL = {
    '0101090517': {'name': '臺北市立聯合醫院松德院區', 'city': '臺北市', 'level': '區域醫院'},
}
SKIP_CODES = {'3501200000'}  # 臺北虛擬診所，無實體地址


def norm(s):
    return (s or '').strip().replace('台', '臺')


def city_from_address(addr):
    a = norm(addr)
    return a[:3] if a[:3] in CITIES else ''


def load_accred_keys():
    """讀 hospitals.js 已收錄的 (名稱, 縣市)（正規化）作為去重集合。
    以 (name, city) 為鍵，避免同名不同縣市的不同醫院被誤去重。"""
    text = open(HOSPITALS_JS, encoding='utf-8').read()
    keys = set()
    for m in re.finditer(r"\{\s*name:\s*'([^']+)',\s*city:\s*'([^']*)'", text):
        keys.add((norm(m.group(1)), m.group(2)))
    return keys


def fetch_nhi():
    """回傳 { code: {name, address} }。"""
    idx = {}
    for rid in NHI_RESOURCES:
        raw = subprocess.run(['curl', '-s', '-m', '120', NHI_API + rid],
                             capture_output=True, timeout=180).stdout
        text = raw.decode('utf-8-sig', errors='replace')
        reader = csv.reader(io.StringIO(text))
        next(reader, None)
        n = 0
        for row in reader:
            if len(row) < 5:
                continue
            code = row[0].strip()
            if code and code not in idx:
                idx[code] = {'name': row[1].strip(), 'address': row[4].strip()}
                n += 1
        print(f'  {rid}: {n} 筆')
    return idx


def main():
    nr = json.load(open(NURSE_FILE, encoding='utf-8'))['hospitals']
    vpn = [h for h in nr if h.get('source') == 'vpn-only']
    print(f'vpn-only 機構：{len(vpn)} 家')

    accred = load_accred_keys()
    print(f'評鑑名單既有 (名稱,縣市)：{len(accred)} 筆（用於去重）')

    print('抓取健保署特約醫事機構資料 …')
    nhi = fetch_nhi()
    print(f'  健保署代碼索引 {len(nhi)} 筆')

    entries = []
    seen = set()
    unresolved = []
    dropped = []
    for h in vpn:
        code = h['code']
        if code in SKIP_CODES:
            dropped.append((code, h.get('name'), '虛擬診所/無地址'))
            continue
        if code in MANUAL:
            rec = MANUAL[code]
            name, city, level = rec['name'], rec['city'], rec['level']
        else:
            src = nhi.get(code)
            if not src or not src.get('name'):
                unresolved.append((code, h.get('name')))
                continue
            name = norm(src['name'])
            city = city_from_address(src['address'])
            level = h.get('level') or ''
        key = (norm(name), city)
        if key in accred:
            dropped.append((code, name, '已在評鑑名單'))
            continue
        if key in seen:
            dropped.append((code, name, '補充清單內重複'))
            continue
        seen.add(key)
        entries.append({'name': name, 'city': city, 'level': level})

    entries.sort(key=lambda e: (e['city'] or 'zz', e['level'], e['name']))

    lines = [
        '// 手動補充清單：評鑑合格名單（hospitals.js，一般醫院評鑑）漏收、但實際營運且有',
        '// 護理師執業的機構/院區，於表單機構名稱自動建議時一併納入。',
        '//',
        '// 來源：護病比 VPN 資料中 source:\'vpn-only\'（對不到評鑑名單）的機構，以健保署',
        '// 特約醫事機構開放資料補上官方名稱與縣市。多為精神科醫院/療養院等走不同評鑑管道者。',
        '// 由 tools/build-hospitals-extra.py 產生（松德院區等共用代號院區於該工具 MANUAL 指定）。',
        '',
        'export const HOSPITALS_EXTRA = [',
    ]
    for e in entries:
        lines.append(f"  {{ name: '{e['name']}', city: '{e['city']}', level: '{e['level']}' }},")
    lines.append('];')
    open(OUT_FILE, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    print(f'✔ 已寫出 {OUT_FILE}（{len(entries)} 家）')
    if dropped:
        print(f'  排除 {len(dropped)} 家：')
        for code, name, why in dropped:
            print(f'    {code}  {name}  -> {why}')
    if unresolved:
        print(f'  健保署查不到（略過）{len(unresolved)} 家：')
        for code, name in unresolved:
            print(f'    {code}  {name}')


if __name__ == '__main__':
    main()
