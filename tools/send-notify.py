#!/usr/bin/env python3
"""
把 data/feed/outbox.json 近期的推播批次送給 tn-submit Worker（GitHub Actions 部署成功後執行）。

  · 只送近 NOTIFY_WINDOW_DAYS 天建立的批次；Worker 以批次 id 去重，重送不會重複推播
  · 送完後反覆呼叫 /push/drain 直到佇列清空（每次 Worker 執行最多送 40 則）
  · 沒設 NOTIFY_URL／NOTIFY_TOKEN（推播還沒啟用）就直接略過，不讓部署失敗

環境變數：
  NOTIFY_URL    Worker 的 /notify 網址，例 https://tn-submit.<子網域>.workers.dev/notify
  NOTIFY_TOKEN  與 Worker secret NOTIFY_TOKEN 相同
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTBOX = os.path.join(ROOT, 'data', 'feed', 'outbox.json')
NOTIFY_WINDOW_DAYS = 3
MAX_DRAIN_CALLS = 200


def post(url, token, body=None):
    req = urllib.request.Request(url, method='POST', data=json.dumps(body or {}).encode('utf-8'),
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    url, token = os.environ.get('NOTIFY_URL', '').strip(), os.environ.get('NOTIFY_TOKEN', '').strip()
    if not url or not token:
        print('未設定 NOTIFY_URL／NOTIFY_TOKEN，略過推播')
        return
    if not os.path.exists(OUTBOX):
        print('沒有 outbox.json，略過推播')
        return
    with open(OUTBOX, encoding='utf-8') as fp:
        batches = json.load(fp).get('batches', [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=NOTIFY_WINDOW_DAYS)
    recent = [b for b in batches if datetime.fromisoformat(b['createdAt']) >= cutoff]
    if not recent:
        print(f'近 {NOTIFY_WINDOW_DAYS} 天沒有新的推播批次，略過')
        return

    remaining = 0
    for b in recent:
        try:
            r = post(url, token, b)
        except urllib.error.HTTPError as e:
            sys.exit(f'✘ /notify 失敗（HTTP {e.code}）：{e.read().decode("utf-8", "replace")[:200]}')
        state = '已處理過，略過' if r.get('duplicate') else f'{r.get("events")} 個事件 → 排入 {r.get("queued")} 則通知'
        print(f'批次 {b["batch"]}：{state}；本次送出 {r.get("sent", 0)} 則')
        remaining = r.get('remaining', 0)

    drain_url = url.rsplit('/notify', 1)[0] + '/push/drain'
    calls = 0
    while remaining and remaining > 0 and calls < MAX_DRAIN_CALLS:
        time.sleep(1)
        r = post(drain_url, token)
        calls += 1
        remaining = r.get('remaining', 0)
        print(f'  續送 {r.get("sent", 0)} 則，剩 {remaining} 則')
    print('✔ 推播完成' if not remaining else f'⚠ 還剩 {remaining} 則，Worker 會在每日排程補送')


if __name__ == '__main__':
    main()
