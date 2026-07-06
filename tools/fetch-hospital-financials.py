#!/usr/bin/env python3
"""
爬取健保署「醫院財務資訊公開」→ data/hospital-financials.json

資料來源：https://med.nhi.gov.tw/rgfe0000/RGFE0030S01.aspx（免登入 JSON PageMethods）
  - initDdl（RGFE0020S01.aspx/initDdl）：欄位定義 F1~F8（標題/排名標題/單位）
  - QueryDetail（RGFE0030S01.aspx/QueryDetail）body {"hospId": <10碼>}：該院各年度財務明細

醫院清單先由 tools/fetch-financials-list.js（headless Chrome 選「全部/全部」）產出
data/hospital-financials-list.json，本工具讀它、逐院抓明細、彙整輸出。

用法：
  node tools/fetch-financials-list.js        # 先產出清單（需 puppeteer-core）
  python3 tools/fetch-hospital-financials.py  # 再抓明細（可續跑：已抓的略過）

以 subprocess 呼叫 curl（Python urllib 對 nhi 憑證會 SSL 失敗）。禮貌性：每院間隔 + 逾時重試。
"""

import os
import sys
import json
import time
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST_FILE = os.path.join(ROOT, 'data', 'hospital-financials-list.json')
OUT_FILE = os.path.join(ROOT, 'data', 'hospital-financials.json')

BASE = 'https://med.nhi.gov.tw/rgfe0000/'
DETAIL_URL = BASE + 'RGFE0030S01.aspx/QueryDetail'
INITDDL_URL = BASE + 'RGFE0020S01.aspx/initDdl'

REQUEST_DELAY = 0.4   # 每院間隔秒數（禮貌性）
MAX_RETRY = 3
TIMEOUT = 30


def curl_json(url, payload):
    """POST JSON，回傳解析後的 .d；失敗回 None。"""
    for attempt in range(1, MAX_RETRY + 1):
        try:
            out = subprocess.run(
                ['curl', '-s', '-m', str(TIMEOUT), '-X', 'POST', url,
                 '-H', 'Content-Type: application/json; charset=UTF-8',
                 '-H', 'X-Requested-With: XMLHttpRequest',
                 '--data', json.dumps(payload)],
                capture_output=True, timeout=TIMEOUT + 10,
            ).stdout
            data = json.loads(out.decode('utf-8', 'replace'))
            return data.get('d')
        except Exception:
            if attempt < MAX_RETRY:
                time.sleep(1.5 * attempt)
    return None


def fetch_fields():
    d = curl_json(INITDDL_URL, {}) or []
    fields = {}
    for x in d:
        ft = x.get('fieldType')
        if ft:
            fields[ft] = {
                'title': x.get('valueTitle', ''),
                'rankTitle': x.get('rankTitle', ''),
                'unit': x.get('valueUnit', ''),
            }
    return fields


def clean_row(row):
    return {k: v for k, v in row.items() if not k.startswith('__')}


def load_existing():
    """續跑：讀已輸出的結果，回 { code: hospital_obj }。"""
    if not os.path.exists(OUT_FILE):
        return {}
    try:
        doc = json.load(open(OUT_FILE, encoding='utf-8'))
        return {h['code']: h for h in doc.get('hospitals', [])}
    except Exception:
        return {}


def main():
    if not os.path.exists(LIST_FILE):
        print(f'找不到清單 {LIST_FILE}\n請先執行：node tools/fetch-financials-list.js')
        sys.exit(1)
    hosp_list = json.load(open(LIST_FILE, encoding='utf-8'))['hospitals']
    print(f'清單 {len(hosp_list)} 家')

    print('取欄位定義 initDdl …')
    fields = fetch_fields()
    print(f'  欄位 {len(fields)} 個：' + '、'.join(f'{k}={v["title"]}' for k, v in fields.items()))

    done = load_existing()  # 已抓過（有 rows）的略過
    results = {}
    n_new = n_empty = 0
    for i, h in enumerate(hosp_list, 1):
        code = h['code']
        prev = done.get(code)
        if prev and prev.get('rows'):
            results[code] = prev
            continue
        rows = curl_json(DETAIL_URL, {'hospId': code}) or []
        rows = [clean_row(r) for r in rows]
        results[code] = {
            'code': code,
            'name': h.get('name', ''),
            'shortName': h.get('shortName', ''),
            'rows': rows,
        }
        if rows:
            n_new += 1
        else:
            n_empty += 1
        if i % 25 == 0 or i == len(hosp_list):
            print(f'  [{i}/{len(hosp_list)}] 已抓 {n_new} 家有資料、{n_empty} 家空')
            _write(fields, hosp_list, results)  # 中途存檔，可續跑
        time.sleep(REQUEST_DELAY)

    _write(fields, hosp_list, results)
    with_data = sum(1 for h in results.values() if h['rows'])
    print(f'✔ 完成：{with_data} 家有財報、{len(results) - with_data} 家無 → {OUT_FILE}')


def _write(fields, hosp_list, results):
    # 依原清單順序輸出
    ordered = [results[h['code']] for h in hosp_list if h['code'] in results]
    from datetime import datetime, timezone, timedelta
    doc = {
        'generatedAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
        'source': BASE + 'RGFE0030S01.aspx',
        'fields': fields,
        'count': len(ordered),
        'hospitals': ordered,
    }
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
