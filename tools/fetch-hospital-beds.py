#!/usr/bin/env python3
"""
從衛福部「醫院評鑑資訊專區」抓各醫院（含各院區）登記的病床設施。

來源：https://openinfo.mohw.gov.tw/web/C02?type=1&basAgencyId=<代號>&zoneCode=<院區>
  POST /C01/GetPageData   醫院清單（一院區一筆：BAS_AGENCY_ID、ZONE_CODE、ZONE_NAME）
  POST /C02/GetPageData   單一院區明細；magbed 為病床設施
                          （BED_KIND_NAME：一般病床／特殊病床／其他，BED_CODE_NAME，BED_OPEN）
只有「目前登記」的快照，沒有逐月歷史（逐月 4 種床別仍以人力監控 PDF 為準）。

輸出：
  data/hospital-beds.json   { updated, hospitals:[{code, name, zones:[{zone, name, total}]}] }（索引）
  data/beds/{code}.json     { code, name, updated, zones:[{zone, name, beds:[[類別, 床名, 床數], …]}] }
床數為 0 的床別不輸出。只用標準函式庫。

用法：python tools/fetch-hospital-beds.py
"""
import datetime
import glob
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'data', 'beds')
INDEX = os.path.join(ROOT, 'data', 'hospital-beds.json')
BASE = 'https://openinfo.mohw.gov.tw'
UA = 'Mozilla/5.0 (transparent-nursing data fetcher; +https://ycchou.github.io/transparent-nursing/)'
WORKERS = 4
# 「總病床」只算一般＋特殊；「其他」是手術台、產台、診療室等，不算病床
BED_KINDS = ('一般病床', '特殊病床')


def api(path, payload, tries=3):
    """該站的 AJAX 慣例：body 為 {"data": "<JSON 字串>", device, browser, token}。"""
    body = json.dumps({'data': json.dumps(payload, ensure_ascii=False),
                       'device': 'pc', 'browser': 'chrome', 'token': ''}).encode('utf-8')
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE + path, data=body, method='POST',
                                         headers={'Content-Type': 'application/json', 'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def fetch_zone(item):
    code, zone = item['BAS_AGENCY_ID'], item['ZONE_CODE']
    d = api('/C02/GetPageData', {'BAS_AGENCY_ID': code, 'ZONE_CODE': zone}).get('data') or {}
    beds = [[b['BED_KIND_NAME'], b['BED_CODE_NAME'], int(b['BED_OPEN'] or 0)] for b in (d.get('magbed') or [])]
    return {
        'code': code,
        'name': ((d.get('magbas') or {}).get('BAS_NAME') or item.get('BAS_NAME') or '').strip(),
        'zone': zone,
        'zoneName': (item.get('ZONE_NAME') or '').strip(),
        'beds': [b for b in beds if b[2] > 0],
    }


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def main():
    lst = api('/C01/GetPageData', {'TYPE': '1', 'currentPage': 1, 'pageSize': '2000'})
    items = lst.get('list') or []
    if not items or len(items) != lst.get('totalRecord'):
        sys.exit(f'醫院清單異常：取得 {len(items)} 筆、官方 {lst.get("totalRecord")} 筆')
    print(f'醫院院區：{len(items)} 筆，抓取病床設施 …')

    with ThreadPoolExecutor(WORKERS) as ex:
        zones = list(ex.map(fetch_zone, items))

    by_code = {}
    for z in zones:
        h = by_code.setdefault(z['code'], {'code': z['code'], 'name': z['name'], 'zones': []})
        h['zones'].append({'zone': z['zone'], 'name': z['zoneName'], 'beds': z['beds']})

    updated = datetime.date.today().isoformat()
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, '*.json')):
        if os.path.splitext(os.path.basename(old))[0] not in by_code:
            os.remove(old)
    index = []
    for code, h in sorted(by_code.items()):
        h['zones'].sort(key=lambda z: z['zone'])
        write_json(os.path.join(OUT_DIR, f'{code}.json'), {**h, 'updated': updated})
        index.append({'code': code, 'name': h['name'], 'zones': [
            {'zone': z['zone'], 'name': z['name'], 'total': sum(b[2] for b in z['beds'] if b[0] in BED_KINDS)}
            for z in h['zones']]})
    write_json(INDEX, {'updated': updated, 'hospitals': index})
    empty = sum(1 for z in zones if not z['beds'])
    print(f'✔ {len(by_code)} 家醫院（{len(zones)} 院區，{empty} 院區無病床資料）→ data/beds/、data/hospital-beds.json')


if __name__ == '__main__':
    main()
