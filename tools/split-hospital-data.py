#!/usr/bin/env python3
"""
把大型單體 JSON 拆成 per-code 小檔，供「機構總覽」只載入所需那一家（不必整包下載）。

機構總覽頁查一家醫院，過去要下載整包 nurse-ratio.json(≈760KB) 與 hospital-financials.json
(≈700KB)。此工具額外產出 per-code 小檔（單檔僅數 KB），機構總覽改載小檔即可。
（護病比、財務兩個「獨立頁」仍需完整清單做全院排序比較，故保留原完整 JSON 不動。）

輸出：
  data/nurse-ratio/by-code/{code}.json   { months, hospitals:[該代號各院區] }
  data/financials/{code}.json            { fields, rows }

用法：python tools/split-hospital-data.py   （於 build-nurse-ratio / fetch-hospital-financials 後跑）
"""
import os
import sys
import json
import glob
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def split_nurse_ratio():
    src = os.path.join(ROOT, 'data', 'nurse-ratio.json')
    if not os.path.exists(src):
        print('  跳過 nurse-ratio（找不到來源）')
        return 0
    doc = json.load(open(src, encoding='utf-8'))
    months = doc.get('months', [])
    by_code = defaultdict(list)
    for h in doc.get('hospitals', []):
        by_code[h['code']].append(h)

    out_dir = os.path.join(ROOT, 'data', 'nurse-ratio', 'by-code')
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, '*.json')):
        os.remove(old)
    for code, branches in by_code.items():
        write_json(os.path.join(out_dir, f'{code}.json'), {'months': months, 'hospitals': branches})
    return len(by_code)


def split_financials():
    src = os.path.join(ROOT, 'data', 'hospital-financials.json')
    if not os.path.exists(src):
        print('  跳過 financials（找不到來源）')
        return 0
    doc = json.load(open(src, encoding='utf-8'))
    fields = doc.get('fields')
    out_dir = os.path.join(ROOT, 'data', 'financials')
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, '*.json')):
        os.remove(old)
    n = 0
    for h in doc.get('hospitals', []):
        code = h.get('code')
        if not code:
            continue
        write_json(os.path.join(out_dir, f'{code}.json'),
                   {'fields': fields, 'code': code, 'name': h.get('name'),
                    'shortName': h.get('shortName'), 'rows': h.get('rows', [])})
        n += 1
    return n


def main():
    print('拆分大型 JSON 為 per-code 小檔 …')
    nr = split_nurse_ratio()
    print(f'  nurse-ratio → {nr} 個 by-code 檔')
    fi = split_financials()
    print(f'  financials  → {fi} 個 per-code 檔')
    print('✔ 完成（機構總覽改載這些小檔；獨立頁仍用完整 JSON）')


if __name__ == '__main__':
    main()
