#!/usr/bin/env python3
"""
補齊護病比/機構總覽缺少的醫院地址：data/hospitals-address-overlay.json

nurse-ratio.json 有 ~74 家「vpn-only」醫院（只出現在 VPN 三班護病比、未收錄於
醫院評鑑 PDF），因此沒有地址/縣市。這些機構都有 10 碼醫事機構代碼，可用
健保署開放資料（特約醫事機構）以代碼查到地址與電話。

資料來源（健保署，data.gov.tw）：
  醫學中心 D21001-003 / 區域醫院 D21002-005 / 地區醫院 D21003-003 / 診所 D21004-009
  CSV 端點：https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=<rId>
  欄位：醫事機構代碼,醫事機構名稱,醫事機構種類,電話,地址,...

產出 data/hospitals-address-overlay.json：{ "<id或code>": { address, city, phone } }
前端 nurse-ratio.js 以 hospital.id、hospital.js 以 code 套用（只補「原本缺地址」者）。

共用機構代號的多院區（如北市聯醫各院區）在健保署只有一個「登記地址」，無法區分
各院區，故以 MANUAL_OVERRIDES 用 nurse-ratio 的 id 補上正確的分院地址。

使用方式：python3 tools/fetch-hospital-addresses.py
"""

import os
import csv
import sys
import io
import json
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NURSE_FILE = os.path.join(ROOT, 'data', 'nurse-ratio.json')
OUT_FILE = os.path.join(ROOT, 'data', 'hospitals-address-overlay.json')

NHI_API = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId='
NHI_RESOURCES = [
    'A21030000I-D21001-003',  # 醫學中心
    'A21030000I-D21002-005',  # 區域醫院
    'A21030000I-D21003-003',  # 地區醫院
    'A21030000I-D21004-009',  # 診所（含中醫/牙醫；補少數非醫院代碼）
]

# 共用代號的多院區：健保署只給登記地址，這裡用 nurse-ratio 的 id 補正確分院地址
MANUAL_OVERRIDES = {
    '0101090517-松德': {'address': '臺北市信義區松德路309號', 'city': '臺北市', 'phone': '02-2726-3141'},
}
# 沒有實體地址者（虛擬診所等）略過
SKIP_CODES = {'3501200000'}

# 3 碼縣市名（用於從地址前綴取縣市）
CITIES = {
    '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市',
    '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
}


def city_from_address(addr):
    a = (addr or '').strip().replace('台', '臺')
    return a[:3] if a[:3] in CITIES else ''


def fetch_nhi():
    """回傳 { code: {address, phone} }（涵蓋醫院＋診所）。"""
    idx = {}
    for rid in NHI_RESOURCES:
        # 用 curl（Python urllib 對此政府憑證會 SSL 驗證失敗：Missing Subject Key Identifier）
        raw = subprocess.run(
            ['curl', '-s', '-m', '120', NHI_API + rid],
            capture_output=True, timeout=180,
        ).stdout
        text = raw.decode('utf-8-sig', errors='replace')
        reader = csv.reader(io.StringIO(text))
        header = next(reader, None)
        n = 0
        for row in reader:
            if len(row) < 5:
                continue
            code = row[0].strip()
            if code and code not in idx:
                idx[code] = {'address': row[4].strip(), 'phone': row[3].strip()}
                n += 1
        print(f'  {rid}: {n} 筆')
    return idx


def main():
    print('讀取 nurse-ratio.json 找缺地址的醫院 …')
    nr = json.load(open(NURSE_FILE, encoding='utf-8'))['hospitals']
    missing = [h for h in nr if not (h.get('address') or '').strip()]
    print(f'  缺地址 {len(missing)} 家')

    print('抓取健保署特約醫事機構資料 …')
    nhi = fetch_nhi()
    print(f'  健保署代碼索引 {len(nhi)} 筆')

    overlay = {}
    filled = skipped = 0
    unresolved = []
    for h in missing:
        hid, code = h.get('id'), h.get('code')
        if hid in MANUAL_OVERRIDES:
            overlay[hid] = MANUAL_OVERRIDES[hid]
            filled += 1
            continue
        if code in SKIP_CODES:
            skipped += 1
            continue
        rec = nhi.get(code)
        if rec and rec['address']:
            overlay[hid] = {
                'address': rec['address'],
                'city': city_from_address(rec['address']),
                'phone': rec['phone'],
            }
            filled += 1
        else:
            unresolved.append((code, h.get('name')))

    out = {
        'note': '缺地址醫院的補充地址（健保署特約醫事機構開放資料）；key 為 nurse-ratio id / 機構代碼。由 tools/fetch-hospital-addresses.py 產生。',
        'count': len(overlay),
        'overlay': overlay,
    }
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'✔ 已寫出 {OUT_FILE}（補 {filled} 家、略過 {skipped} 家）')
    if unresolved:
        print(f'  仍查不到 {len(unresolved)} 家：')
        for code, name in unresolved:
            print(f'    {code}  {name}')


if __name__ == '__main__':
    main()
