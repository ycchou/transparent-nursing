#!/usr/bin/env python3
"""
套用 data/hospitals-corrections.json 的人工修正到：
  - data/hospitals-merged.json   （name=fullName、shortName、address、city）
  - data/nurse-ratio.json        （name=vpnName、fullName、address、city）
  - data/hospitals-address-overlay.json （若該碼有 overlay，同步 address/city）

用途：修正來源資料（評鑑名單／VPN）的機構錯誤（改制換碼、名稱/地址誤植），
且能在重跑 build-nurse-ratio.py 之後再次套用。

使用方式：python3 tools/apply-hospital-corrections.py
"""

import os
import sys
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORR_FILE = os.path.join(ROOT, 'data', 'hospitals-corrections.json')
MERGED = os.path.join(ROOT, 'data', 'hospitals-merged.json')
NURSE = os.path.join(ROOT, 'data', 'nurse-ratio.json')
OVERLAY = os.path.join(ROOT, 'data', 'hospitals-address-overlay.json')


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def main():
    corr = load(CORR_FILE)['corrections']

    # hospitals-merged.json — compact 格式（與 build 一致）
    mg = load(MERGED)
    n = 0
    for h in mg.get('hospitals', []):
        c = corr.get(h.get('code'))
        if not c:
            continue
        h['name'] = c['fullName']
        h['shortName'] = c['shortName']
        h['address'] = c['address']
        h['city'] = c['city']
        if c.get('phone'):
            h['phone'] = c['phone']
        n += 1
    with open(MERGED, 'w', encoding='utf-8') as f:
        json.dump(mg, f, ensure_ascii=False, indent=None, separators=(',', ':'))
    print(f'  merged: 修正 {n} 筆')

    # nurse-ratio.json — compact 格式
    nr = load(NURSE)
    n = 0
    for h in nr.get('hospitals', []):
        c = corr.get(h.get('code'))
        if not c:
            continue
        h['name'] = c['vpnName']
        h['fullName'] = c['fullName']
        h['address'] = c['address']
        h['city'] = c['city']
        if c.get('phone'):
            h['phone'] = c['phone']
        n += 1
    with open(NURSE, 'w', encoding='utf-8') as f:
        json.dump(nr, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  nurse-ratio: 修正 {n} 筆')

    # address overlay（若存在該碼，同步地址/縣市）
    if os.path.exists(OVERLAY):
        ov = load(OVERLAY)
        table = ov.get('overlay', {})
        n = 0
        for code, c in corr.items():
            if code in table:
                table[code]['address'] = c['address']
                table[code]['city'] = c['city']
                n += 1
        with open(OVERLAY, 'w', encoding='utf-8') as f:
            json.dump(ov, f, ensure_ascii=False, indent=2)
        print(f'  address-overlay: 同步 {n} 筆')

    print('✔ 修正完成')


if __name__ == '__main__':
    main()
