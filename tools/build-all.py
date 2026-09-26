#!/usr/bin/env python3
"""
一鍵重建：依相依順序跑所有資料工具，最後破快取＋驗證。取代「憑記憶手動照順序跑」。

分三類步驟：
  local  — 從 repo 內已提交的原始檔（PDF/ODS/CSV）重建，離線可跑。
  net    — 需連網（健保署開放資料 / 政府 API）；預設略過，加 --fetch 才跑。
  final  — 破快取（stamp-assets）與資料驗證，每次都跑。

增量（預設）：每個 local 步驟宣告自己的輸入檔（原始檔＋上游產物＋腳本本身），
記錄上次成功執行後的輸入指紋於 .build-cache/build-all.json。輸入沒變的步驟直接略過；
上游步驟重跑後其產物改變，下游會因輸入指紋不同而跟著重跑——相依關係自動成立。
原始檔沒更新時不會重跑，也就不會產生只差 generatedAt 時間戳的雜訊 diff。

用法：
  python tools/build-all.py            # 增量：只跑輸入有變的 local 步驟（＋stamp＋validate）
  python tools/build-all.py --all      # 忽略指紋，local 步驟全部重跑
  python tools/build-all.py --fetch    # 連 net 步驟一起跑（完整重建）
  python tools/build-all.py --list     # 只列出計畫（含哪些步驟會因輸入變動而執行），不執行
  python tools/build-all.py --mark     # 不執行，把目前輸入記為「已建置」（新機器／剛 clone 時建立基準）
"""
import glob
import hashlib
import json
import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_FILE = os.path.join(ROOT, '.build-cache', 'build-all.json')
PY = sys.executable

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

# (kind, cmd, 說明, 輸入 glob 清單)。kind: 'local' | 'net' | 'final'
# 輸入只列「讀」的檔；自己會寫的產物不要列（apply-hospital-corrections 這類就地修改者例外，
# 見 run_step：一律記錄「執行後」的指紋，所以就地修改不會造成下次誤判）。
STEPS = [
    ('net',   ['python', 'tools/fetch-hospital-addresses.py'],   '健保署 → 地址 overlay', []),
    ('net',   ['node',   'tools/fetch-financials-list.js'],      '健保署 → 財報清單（供簡稱對照）', []),
    ('local', ['python', 'tools/build-financials.py'],           'ODS 年度報表 → 財報（醫療服務申報情形）',
     ['data/財務報告醫院醫療服務申報情形/*.ods', 'data/hospital-financials-list.json']),
    ('local', ['python', 'tools/extract-hospitals.py'],          '評鑑 PDF → hospitals.json',
     ['data/108-114年醫院評鑑及教學醫院評鑑(含兒醫)合格名單.pdf']),
    ('local', ['python', 'tools/build-nurse-ratio.py'],          'VPN ODS → 護病比＋merged',
     ['data/VPN登錄之各月份三班護病比/*.ods', 'data/hospitals.json']),
    ('local', ['python', 'tools/apply-hospital-corrections.py'], '套用 manual 修正',
     ['data/manual/hospitals-corrections.json', 'data/hospitals-address-overlay.json',
      'data/hospitals-merged.json', 'data/nurse-ratio.json']),
    ('local', ['python', 'tools/build-personnel.py'],            '監測 PDF → 人力（逐檔快取）',
     ['data/醫院醫事人力持續性監測/*/*.pdf', 'data/nurse-ratio.json', 'data/hospitals-merged.json',
      'data/manual/personnel-corrections.json']),
    ('net',   ['python', 'tools/build-hospitals-master.py'],     '→ 醫院主檔（表單用，需健保署）', []),
    ('local', ['python', 'tools/build-violations-map.py'],       '違規 → 名稱對照（會讀線上 Sheet）',
     ['data/hospitals-merged.json', 'data/manual/violations-hospital-overrides.json']),
    ('local', ['python', 'tools/split-hospital-data.py'],        '拆 per-code 小檔',
     ['data/hospital-financials.json', 'data/nurse-ratio.json']),
    ('final', ['python', 'tools/stamp-assets.py'],               '破快取：內容雜湊 ?v=', []),
    ('final', ['python', 'tools/validate-data.py'],              '資料結構驗證', []),
]


def expand(patterns, script):
    files = {os.path.join(ROOT, script)}
    for pat in patterns:
        files.update(glob.glob(os.path.join(ROOT, pat)))
    return sorted(files)


def fingerprint(files, memo):
    """輸入檔內容雜湊的總和。memo 以 (size, mtime) 記住單檔雜湊，大 PDF 不必每次重讀。"""
    h = hashlib.sha1()
    for f in files:
        st = os.stat(f)
        key = f'{os.path.relpath(f, ROOT)}|{st.st_size}|{st.st_mtime_ns}'
        if key not in memo:
            fh = hashlib.sha1()
            with open(f, 'rb') as fp:
                for chunk in iter(lambda: fp.read(1 << 20), b''):
                    fh.update(chunk)
            memo[key] = fh.hexdigest()
        h.update(f'{os.path.relpath(f, ROOT)}={memo[key]}\n'.encode('utf-8'))
    return h.hexdigest()


def load_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as fp:
            return json.load(fp)
    except (OSError, ValueError):
        return {'steps': {}, 'memo': {}}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    live = set()
    for kind, cmd, _desc, pats in STEPS:
        if kind == 'local':
            for f in expand(pats, cmd[1]):
                st = os.stat(f)
                live.add(f'{os.path.relpath(f, ROOT)}|{st.st_size}|{st.st_mtime_ns}')
    state['memo'] = {k: v for k, v in state['memo'].items() if k in live}   # 丟掉舊版本的單檔雜湊
    with open(STATE_FILE, 'w', encoding='utf-8') as fp:
        json.dump(state, fp, ensure_ascii=False, indent=1)


def run(cmd):
    cmd = [PY if c == 'python' else c for c in cmd]
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        print(f'\n✗ 步驟失敗（exit {r.returncode}）：{" ".join(cmd)}')
        sys.exit(r.returncode)


def main():
    do_fetch = '--fetch' in sys.argv
    list_only = '--list' in sys.argv
    force = '--all' in sys.argv
    state = load_state()

    if '--mark' in sys.argv:
        for kind, cmd, _desc, pats in STEPS:
            if kind == 'local':
                state['steps'][cmd[1]] = fingerprint(expand(pats, cmd[1]), state['memo'])
        save_state(state)
        print('✔ 已將目前所有 local 步驟的輸入記為「已建置」')
        return

    plan = [s for s in STEPS if s[0] != 'net' or do_fetch]
    skipped = [s for s in STEPS if s[0] == 'net' and not do_fetch]

    print('建置計畫' + ('（含 --fetch 連網步驟）' if do_fetch else '（略過連網步驟，加 --fetch 可含）')
          + ('；--all 全部重跑' if force else '；增量：輸入沒變的 local 步驟會略過'))
    for i, (kind, cmd, desc, pats) in enumerate(plan, 1):
        note = ''
        if kind == 'local' and not force:
            fp = fingerprint(expand(pats, cmd[1]), state['memo'])
            note = '  ← 輸入有變' if state['steps'].get(cmd[1]) != fp else '  （未變）'
        print(f'  {i:2}. [{kind:5}] {desc}{note}')
    if skipped:
        print('  略過（net，未加 --fetch）：' + '、'.join(d for _, _, d, _ in skipped))
    if list_only:
        return

    print('\n開始執行 …\n')
    ran = 0
    for i, (kind, cmd, desc, pats) in enumerate(plan, 1):
        if kind == 'local':
            files = expand(pats, cmd[1])
            if not force and state['steps'].get(cmd[1]) == fingerprint(files, state['memo']):
                print(f'—— [{i}/{len(plan)}] {desc}：輸入未變，略過')
                continue
        print(f'—— [{i}/{len(plan)}] {desc} ——')
        run(cmd)
        ran += 1
        if kind == 'local':
            # 記「執行後」的指紋：就地修改自身輸入的步驟（套用修正）下次才不會被誤判為有變
            state['steps'][cmd[1]] = fingerprint(expand(pats, cmd[1]), state['memo'])
            save_state(state)
    save_state(state)
    print(f'\n✔ 全部完成（實際執行 {ran} 個步驟）')


if __name__ == '__main__':
    main()
