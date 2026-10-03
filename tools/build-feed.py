#!/usr/bin/env python3
"""
機構追蹤推播：比對「各醫院最新到哪一期」，產生這次要推播的事件。

  data/feed/manifest.json  各醫院目前的最新期別（財報年度 f、護病比月份 r）——比對基準
  data/feed/outbox.json    新出現的期別 → 推播批次（保留近 OUTBOX_KEEP_DAYS 天）。部署成功後，
                           GitHub Actions 把近 NOTIFY_WINDOW_DAYS 天的批次 POST 給 tn-submit /notify

只有「出現新期別」才算事件；重跑 build、修正數值、改名稱對照都不會觸發。
manifest 每次都更新，所以同一期不會產生第二個批次。
outbox 是「追加」而不是覆寫：連續 push 兩次時前一次的部署會被取消，若只留最新一批，
前一批就永遠不會送出。Worker 以批次 id 去重，所以同一批被送幾次都只推一次。

用法（通常由 tools/update-data.py 呼叫，不必手動跑）：
  python tools/build-feed.py            比對並寫檔，印出推播預覽
  python tools/build-feed.py --silent   只更新比對基準、不產生推播（補舊資料、大修正時用）
  python tools/build-feed.py --dry-run  只印預覽，不寫任何檔
第一次執行（還沒有 manifest）只建立基準，不會把全部醫院當成新資料推出去。
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = os.path.join(ROOT, 'data', 'feed')
MANIFEST = os.path.join(FEED, 'manifest.json')
OUTBOX = os.path.join(FEED, 'outbox.json')
TZ = timezone(timedelta(hours=8))
OUTBOX_KEEP_DAYS = 30


def load(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as fp:
        return json.load(fp)


def hospital_names():
    """機構代號 → 推播顯示名稱（簡稱優先）。只收機構總覽頁有的代號（使用者只能從那裡追蹤）。"""
    names, best = {}, {}
    for h in load('data/hospitals-merged.json')['hospitals']:
        code, name = h.get('code'), h.get('name')
        if not code or not name:
            continue
        # 比照前端：同代號取名稱最短的那筆（多院區＝母院）
        if code not in best or len(name) < len(best[code]['name']):
            best[code] = h
    for code, h in best.items():
        names[code] = h.get('shortName') or h['name']
    return names


def current_state(names):
    state = {}
    for h in load('data/hospital-financials.json')['hospitals']:
        years = [r['YEAR'] for r in h.get('rows', []) if r.get('YEAR')]
        if h.get('code') in names and years:
            state.setdefault(h['code'], {})['f'] = max(years, key=int)
    for h in load('data/nurse-ratio.json')['hospitals']:
        hist = h.get('history') or {}
        months = [m for m, v in hist.items() if v and any(x is not None for x in v.values())]
        code = h.get('code')
        if code in names and months:
            prev = state.setdefault(code, {}).get('r')
            latest = max(months, key=int)
            state[code]['r'] = latest if not prev or int(latest) > int(prev) else prev   # 多院區取最新
    return state


def label(kind, key):
    if kind == 'f':
        return f'{key} 年財報已更新'
    return f'{key[:3]}/{key[3:]} 護病比已更新'


def main():
    silent = '--silent' in sys.argv
    dry = '--dry-run' in sys.argv
    names = hospital_names()
    cur = current_state(names)

    prev = None
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fp:
            prev = json.load(fp)['hospitals']

    now = datetime.now(TZ)
    events = []
    if prev is not None:
        for code in sorted(cur):
            for kind, key in sorted(cur[code].items()):
                old = prev.get(code, {}).get(kind)
                if not old or int(key) > int(old):
                    events.append({'code': code, 'kind': kind, 'key': key,
                                   'name': names[code], 'label': label(kind, key)})

    by_kind = {k: [e for e in events if e['kind'] == k] for k in ('f', 'r')}
    print('推播預覽：', end='')
    if prev is None:
        print('第一次執行，只建立比對基準（不推播）')
    elif not events:
        print('沒有新的財報年度或護病比月份，不推播')
    else:
        parts = []
        for k, title in (('f', '財報'), ('r', '護病比')):
            evs = by_kind[k]
            if evs:
                sample = '、'.join(e['name'] for e in evs[:5]) + ('…' if len(evs) > 5 else '')
                keys = '／'.join(sorted({e['key'] for e in evs}))
                parts.append(f'{title} {keys} 共 {len(evs)} 家（{sample}）')
        print('；'.join(parts) + ('　→ --silent：只更新基準，不推播' if silent else ''))

    if dry:
        return
    os.makedirs(FEED, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8') as fp:
        json.dump({'generatedAt': now.isoformat(timespec='seconds'),
                   'note': '各醫院最新期別（f 財報年度、r 護病比月份）；由 tools/build-feed.py 產生，推播比對基準',
                   'hospitals': cur}, fp, ensure_ascii=False, indent=0, sort_keys=True)
        fp.write('\n')
    if events and not silent:
        batches = []
        if os.path.exists(OUTBOX):
            with open(OUTBOX, encoding='utf-8') as fp:
                batches = json.load(fp).get('batches', [])
        cutoff = now - timedelta(days=OUTBOX_KEEP_DAYS)
        batches = [b for b in batches if datetime.fromisoformat(b['createdAt']) >= cutoff]
        digest = hashlib.sha1(json.dumps(events, sort_keys=True).encode('utf-8')).hexdigest()[:12]
        batches.append({'batch': f'{now:%Y%m%d}-{digest}', 'createdAt': now.isoformat(timespec='seconds'),
                        'events': events})
        with open(OUTBOX, 'w', encoding='utf-8') as fp:
            json.dump({'note': '推播批次；部署成功後由 GitHub Actions 送到 tn-submit /notify（Worker 以 batch 去重）。'
                               '由 tools/build-feed.py 產生',
                       'batches': batches}, fp, ensure_ascii=False, indent=1)
            fp.write('\n')
    print(json.dumps({'events': len(events), 'silent': silent, 'bootstrap': prev is None}))


if __name__ == '__main__':
    main()
