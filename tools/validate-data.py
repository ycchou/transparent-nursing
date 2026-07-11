#!/usr/bin/env python3
"""
輕量資料驗證（無外部相依）：部署前檢查主要 JSON 輸出的結構是否正常，
避免 build 跑歪、格式壞掉、或忘了重建就上線。CI 可直接跑：非 0 退出＝有問題。

用法：python tools/validate-data.py
"""
import os
import re
import sys
import json
import glob

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []
CODE_RE = re.compile(r'^\d{10}$')


def load(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        errors.append(f'{rel}：檔案不存在')
        return None
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception as e:
        errors.append(f'{rel}：JSON 解析失敗 {e}')
        return None


def check(cond, msg):
    if not cond:
        errors.append(msg)


def nonempty_list(d, key):
    return isinstance(d, dict) and isinstance(d.get(key), list) and len(d[key]) > 0


def validate():
    # 1) 醫院主檔（表單用）
    m = load('data/hospitals-master.json')
    if m:
        check(nonempty_list(m, 'hospitals'), 'hospitals-master：hospitals 應為非空陣列')
        bad = [h for h in m['hospitals'] if not h.get('name') or not h.get('city') or not h.get('level')]
        check(not bad, f'hospitals-master：{len(bad)} 筆缺 name/city/level')

    # 2) 評鑑+VPN 主檔（runtime）
    mg = load('data/hospitals-merged.json')
    if mg:
        check(nonempty_list(mg, 'hospitals'), 'hospitals-merged：hospitals 應為非空陣列')
        check(all(h.get('code') for h in mg.get('hospitals', [])), 'hospitals-merged：有筆缺 code')

    # 3) 護病比
    nr = load('data/nurse-ratio.json')
    if nr:
        check(nonempty_list(nr, 'months'), 'nurse-ratio：months 應為非空陣列')
        check(nonempty_list(nr, 'hospitals'), 'nurse-ratio：hospitals 應為非空陣列')
        check(all(h.get('id') and 'history' in h for h in nr.get('hospitals', [])),
              'nurse-ratio：有筆缺 id/history')

    # 4) 人力監控
    pi = load('data/personnel-index.json')
    if pi:
        check(nonempty_list(pi, 'hospitals'), 'personnel-index：hospitals 應為非空陣列')
        check(isinstance(pi.get('categories'), list) and len(pi['categories']) == 13,
              'personnel-index：categories 應為 13 職類')
        check(all(h.get('id') and h.get('code') for h in pi.get('hospitals', [])),
              'personnel-index：有筆缺 id/code')
        # 抽查每家 per-code 檔的結構：月份遞增不重複、actual/eval 每列為 None 或長度 13
        bad_struct = []
        for h in pi.get('hospitals', []):
            p = os.path.join(ROOT, 'data', 'personnel', f"{h['id']}.json")
            if not os.path.exists(p):
                continue
            try:
                d = json.load(open(p, encoding='utf-8'))
            except Exception:
                bad_struct.append(f"{h['id']}(壞JSON)"); continue
            months = d.get('months', [])
            if months != sorted(months) or len(months) != len(set(months)):
                bad_struct.append(f"{h['id']}(月份未遞增或重複)")
            for key in ('actual', 'eval'):
                seq = d.get(key, [])
                if len(seq) != len(months) or any(r is not None and len(r) != 13 for r in seq):
                    bad_struct.append(f"{h['id']}({key} 列數/欄數不符)"); break
        check(not bad_struct, f'personnel/*.json：{len(bad_struct)} 家結構異常 {bad_struct[:5]}')

    # 5) 財務
    fi = load('data/hospital-financials.json')
    if fi:
        check(nonempty_list(fi, 'hospitals'), 'hospital-financials：hospitals 應為非空陣列')
        check(isinstance(fi.get('fields'), dict) and fi['fields'], 'hospital-financials：fields 應為非空物件')

    # 6) 違規對照表
    vm = load('data/violations-hospital-map.json')
    if vm:
        check(isinstance(vm.get('map'), dict) and len(vm['map']) > 0, 'violations-hospital-map：map 應為非空物件')

    # 7) per-code 拆檔存在且數量與來源相符
    if nr:
        codes = {h['code'] for h in nr.get('hospitals', [])}
        got = len(glob.glob(os.path.join(ROOT, 'data', 'nurse-ratio', 'by-code', '*.json')))
        check(got == len(codes), f'nurse-ratio/by-code：{got} 檔 vs 來源 {len(codes)} 代號（請重跑 split-hospital-data.py）')
    if fi:
        want = len([h for h in fi.get('hospitals', []) if h.get('code')])
        got = len(glob.glob(os.path.join(ROOT, 'data', 'financials', '*.json')))
        check(got == want, f'financials/：{got} 檔 vs 來源 {want} 家（請重跑 split-hospital-data.py）')
    if pi:
        want = len(pi.get('hospitals', []))
        got = len(glob.glob(os.path.join(ROOT, 'data', 'personnel', '*.json')))
        check(got == want, f'personnel/：{got} 檔 vs index {want} 家')


def main():
    validate()
    if errors:
        print(f'驗證失敗（{len(errors)} 項）：')
        for e in errors:
            print('   - ' + e)
        sys.exit(1)
    print('✔ 資料驗證通過')


if __name__ == '__main__':
    main()
