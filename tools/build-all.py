#!/usr/bin/env python3
"""
一鍵重建：依相依順序跑所有資料工具，最後破快取＋驗證。取代「憑記憶手動照順序跑」。

分兩類步驟：
  local  — 從 repo 內已提交的原始檔（PDF/ODS/CSV）重建，離線可跑。
  net    — 需連網（健保署開放資料 / 政府 API）；預設略過，加 --fetch 才跑。

用法：
  python tools/build-all.py            # 只跑 local 步驟（＋stamp＋validate）
  python tools/build-all.py --fetch    # 連 net 步驟一起跑（完整重建）
  python tools/build-all.py --list     # 只列出計畫、不執行
"""
import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# (kind, cmd, 說明)。kind: 'local' | 'net' | 'final'
STEPS = [
    ('net',   ['python', 'tools/fetch-hospital-addresses.py'],   '健保署 → 地址 overlay'),
    ('net',   ['node',   'tools/fetch-financials-list.js'],      '健保署 → 財報清單（供簡稱對照）'),
    ('local', ['python', 'tools/build-financials.py'],           'ODS 年度報表 → 財報（醫療服務申報情形）'),
    ('local', ['python', 'tools/extract-hospitals.py'],          '評鑑 PDF → hospitals.json'),
    ('local', ['python', 'tools/build-nurse-ratio.py'],          'VPN ODS → 護病比＋merged'),
    ('local', ['python', 'tools/apply-hospital-corrections.py'], '套用 manual 修正'),
    ('local', ['python', 'tools/build-personnel.py'],            '監測 PDF → 人力'),
    ('net',   ['python', 'tools/build-hospitals-master.py'],     '→ 醫院主檔（表單用，需健保署）'),
    ('local', ['python', 'tools/build-violations-map.py'],       '違規 → 名稱對照'),
    ('local', ['python', 'tools/split-hospital-data.py'],        '拆 per-code 小檔'),
    ('final', ['python', 'tools/stamp-assets.py'],               '破快取：內容雜湊 ?v='),
    ('final', ['python', 'tools/validate-data.py'],              '資料結構驗證'),
]


def main():
    do_fetch = '--fetch' in sys.argv
    list_only = '--list' in sys.argv

    plan = [s for s in STEPS if s[0] != 'net' or do_fetch]
    skipped = [s for s in STEPS if s[0] == 'net' and not do_fetch]

    print('建置計畫' + ('（含 --fetch 連網步驟）' if do_fetch else '（略過連網步驟，加 --fetch 可含）'))
    for i, (kind, cmd, desc) in enumerate(plan, 1):
        print(f'  {i:2}. [{kind:5}] {desc}   （{" ".join(cmd)}）')
    if skipped:
        print('  略過（net，未加 --fetch）：')
        for _, cmd, desc in skipped:
            print(f'       - {desc}')
    if list_only:
        return

    print('\n開始執行 …\n')
    for i, (kind, cmd, desc) in enumerate(plan, 1):
        print(f'—— [{i}/{len(plan)}] {desc} ——')
        r = subprocess.run(cmd, cwd=ROOT)
        if r.returncode != 0:
            print(f'\n✗ 步驟失敗（exit {r.returncode}）：{" ".join(cmd)}')
            sys.exit(r.returncode)
    print('\n✔ 全部完成')


if __name__ == '__main__':
    main()
