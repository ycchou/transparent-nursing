#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人力監測資料・異常守門（每次 build 後可跑，尤其新增月份時）。

偵測『疑似原始填報數字誤植』：對每家醫院、每職類(actual)的逐月序列，以局部窗口
中位數為基準，找出單月暴增/暴跌的離群點（多打/少打一位數的樣態）。
這是 advisory 工具（預設 exit 0）：印出候選供人工判讀，不自動改值、不補未填報。

跨院汙染（同 code 掉前導 0 → 下一家覆蓋上一家）已於 build-personnel.py 的
parse_one（norm_code + 不覆蓋防護）根因修正；本工具作為回歸守門，若未來新月份 PDF
又出現大量離群，會在此浮現。

用法：
  python tools/audit-personnel.py            # 局部窗口（精準、月月守門用）
  python tools/audit-personnel.py --deep     # 整條序列基準（歷史全掃、召回高、雜訊多）
  python tools/audit-personnel.py --fail     # 有 digit 級候選就 exit 1（進 CI 用）
"""
import os
import sys
import json
import glob
from statistics import median

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONNEL_DIR = os.path.join(ROOT, 'data', 'personnel')

MIN_NEI = 6    # 整條序列至少要有幾個非空值才判斷
MIN_ABS = 3    # 基準中位數過小不判斷，避免小數值抖動誤報


WIN = 4        # 局部窗口半徑（月）


def window_median(series, i):
    """以『前後各 WIN 個月（扣除本月）中位數』為基準比對。
    局部窗口對單月/短暫的暴增暴跌最靈敏（也是月月新增資料時最實用的守門）。
    註：對『連續多月的持續性誤植』(例：宏仁醫師連 6 個月誤植 222) 中段可能標不到，
    但其起訖邊界仍會被標記，足以引導人工回看整條序列；徹底歷史掃描可另用 --deep。"""
    lo, hi = max(0, i - WIN), min(len(series), i + WIN + 1)
    nei = [series[j] for j in range(lo, hi) if j != i and series[j] is not None]
    return (median(nei), len(nei)) if nei else (None, 0)


def series_median(series, i):
    """整條序列（扣除本月）中位數：--deep 模式用，對持續性誤植召回較高、雜訊也較多。"""
    nei = [series[j] for j in range(len(series)) if j != i and series[j] is not None]
    return (median(nei), len(nei)) if nei else (None, 0)


def classify(v, med):
    if med is None or med < MIN_ABS or v is None or v == 0:
        return None
    r = v / med
    if 7.0 <= r <= 13.0:
        return 'extra_digit', r          # 多打一位數（≈10 倍）
    if 0.06 <= r <= 0.15:
        return 'missing_digit', r        # 少打一位數（≈1/10）
    if r >= 4.0:
        return 'spike_high', r
    if r <= 0.25:
        return 'spike_low', r
    return None


def scan_hospital(h, deep):
    out = []
    cats, months, actual = h['categories'], h['months'], h['actual']
    basis = series_median if deep else window_median
    for ci, cat in enumerate(cats):
        series = [(row[ci] if row is not None else None) for row in actual]
        for i, v in enumerate(series):
            if v is None:
                continue
            med, n = basis(series, i)
            if n < MIN_NEI:
                continue
            c = classify(v, med)
            if c:
                kind, r = c
                out.append({'id': h['id'], 'name': h['name'], 'level': h.get('level'),
                            'field': cat, 'month': months[i], 'value': v,
                            'localMedian': round(med, 1), 'ratio': round(r, 2), 'kind': kind})
    return out


def main():
    deep = '--deep' in sys.argv
    results = []
    for f in glob.glob(os.path.join(PERSONNEL_DIR, '*.json')):
        results.extend(scan_hospital(json.load(open(f, encoding='utf-8')), deep))
    print(f"（基準：{'整條序列中位數 --deep' if deep else '局部窗口中位數'}）")
    order = {'extra_digit': 0, 'missing_digit': 1, 'spike_high': 2, 'spike_low': 3}
    results.sort(key=lambda x: (order[x['kind']], -abs(x['ratio'] - 1)))

    from collections import Counter
    kc = Counter(x['kind'] for x in results)
    print(f'人力監測離群候選：{len(results)}')
    for k in ('extra_digit', 'missing_digit', 'spike_high', 'spike_low'):
        if kc.get(k):
            print(f'  {k}: {kc[k]}')
    digit = [x for x in results if x['kind'] in ('extra_digit', 'missing_digit')]
    print(f'\n=== digit 級（最可能是原始誤植，需人工確認後才進 corrections）：{len(digit)} ===')
    for x in digit:
        print(f"  [{x['kind']:13}] {x['name'][:22]:22} {x['field']:8} {x['month']} "
              f"值={x['value']} 局部中位={x['localMedian']} 倍率={x['ratio']}")

    if '--fail' in sys.argv and digit:
        print('\n有 digit 級離群候選（--fail 模式）→ exit 1')
        sys.exit(1)


if __name__ == '__main__':
    main()
