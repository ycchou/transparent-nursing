#!/usr/bin/env python3
"""
從政府資料開放平台下載本機缺少的「三班護病比」月份 ODS。

來源：data.gov.tw 資料集 168974「三班護病比(112年7月起)」（健保署，每月更新）
  metadata：https://data.gov.tw/api/v2/rest/dataset/168974
  檔案：    https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D2001Y-xxx

注意：截至 115/09，開放資料平台只上架到 113/12；114 年起的月份只在健保署主站
（https://www.nhi.gov.tw/ch/cp-15138-b2fee-3669-1.html），該站有 Cloudflare 機器人驗證，
程式無法下載，需以瀏覽器手動下載——下載後交給 tools/update-data.py 自動歸檔（它會掃
~/Downloads 與 data/_inbox/）。平台若日後補上新月份，本工具會自動抓到。

只用標準函式庫。
用法：python tools/fetch-nurse-ratio.py [--dry-run]
輸出最後一行為 JSON：{"new": [...], "latestOpenData": "113年12月", "latestLocal": "115年07月"}
"""
import json
import os
import re
import sys
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'VPN登錄之各月份三班護病比')
DATASET = 'https://data.gov.tw/api/v2/rest/dataset/168974'
MANUAL_PAGE = 'https://www.nhi.gov.tw/ch/cp-15138-b2fee-3669-1.html'
UA = 'Mozilla/5.0 (transparent-nursing data fetcher; +https://ycchou.github.io/transparent-nursing/)'


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def ym_of(text):
    m = re.search(r'(\d{3})年(\d{1,2})月', text or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def local_months():
    return {ym_of(f) for f in os.listdir(SRC) if f.lower().endswith('.ods') and ym_of(f)}


def main():
    dry = '--dry-run' in sys.argv
    have = local_months()
    meta = json.loads(get(DATASET, 60))['result']
    res = [(ym_of(d.get('resourceDescription')), d) for d in meta.get('distribution') or []]
    res = sorted((ym, d) for ym, d in res if ym)
    latest_od = res[-1][0] if res else None
    latest_local = max(have) if have else None
    fmt = lambda ym: f'{ym[0]}年{ym[1]:02d}月' if ym else '—'
    print(f'開放資料最新：{fmt(latest_od)}；本機最新：{fmt(latest_local)}')

    new = []
    for ym, d in res:
        if ym in have:
            continue
        name = f"{ym[0]}年{ym[1]}月{d['resourceDescription'].split('月', 1)[1].strip()}.ods"
        if dry:
            print(f'  將下載 {fmt(ym)}')
            continue
        blob = get(d['resourceDownloadUrl'])
        if not blob.startswith(b'PK'):   # ODS 是 zip 格式
            print(f'  ✘ {fmt(ym)} 下載內容不是 ODS，略過')
            continue
        with open(os.path.join(SRC, name), 'wb') as fp:
            fp.write(blob)
        print(f'  ✔ {name}')
        new.append(fmt(ym))

    if latest_od and latest_local and latest_local > latest_od and not new:
        print(f'  開放資料平台只到 {fmt(latest_od)}；更新的月份請到 {MANUAL_PAGE} 手動下載 ODS，'
              f'留在「下載」資料夾即可，update-data.py 會自動歸檔')
    print(json.dumps({'new': new, 'latestOpenData': fmt(latest_od), 'latestLocal': fmt(latest_local)},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
