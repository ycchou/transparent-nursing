#!/usr/bin/env python3
"""
官方資料一鍵更新：人力監控、三班護病比、醫院財務。

  1. 抓新資料
     · 人力監控  tools/fetch-personnel.py   衛福部網站，全自動下載
     · 護病比    tools/fetch-nurse-ratio.py 政府開放資料平台（目前只到 113/12）
     · 財務      查健保署財務 API 的最新年度，有新年度就提示下載網址
  2. 歸檔手動下載的檔案：掃 ~/Downloads 與 data/_inbox/，把
       *三班護病比*.ods                     → data/VPN登錄之各月份三班護病比/
       *財務報告醫院醫療服務申報情形*.ods    → data/財務報告醫院醫療服務申報情形/
     （健保署主站有機器人驗證，這兩種只能用瀏覽器下載；下載後留在「下載」資料夾即可）
  3. tools/build-all.py 增量建置：只重跑輸入有變的步驟（人力監控另有逐檔快取）
  4. README.md 的資料範圍（人力監控、護病比）改成最新

用法：
  python tools/update-data.py                  抓＋歸檔＋有變才建置
  python tools/update-data.py --commit         完成後 git commit（只提交資料與其衍生檔）
  python tools/update-data.py --commit --push  並 push（push 到 main 即觸發 GitHub Pages 部署）
  python tools/update-data.py --no-fetch       不連網，只歸檔手動下載的檔案並建置

需要：pdfplumber（人力監控）、odfpy＋pandas（財務）
"""
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
INBOXES = [os.path.join(ROOT, 'data', '_inbox'), os.path.expanduser('~/Downloads')]
IMPORT_RULES = [
    # (檔名關鍵字, 目的資料夾, 說明, 手動下載頁)
    ('三班護病比', 'data/VPN登錄之各月份三班護病比', '護病比',
     'https://www.nhi.gov.tw/ch/cp-15138-b2fee-3669-1.html'),
    ('財務報告醫院醫療服務申報情形', 'data/財務報告醫院醫療服務申報情形', '財務年度報表',
     'https://www.nhi.gov.tw/'),
]
FIN_API = 'https://med.nhi.gov.tw/rgfe0000/RGFE0030S01.aspx/QueryDetail'
FIN_PROBE = '1132070011'   # 林口長庚：歷年都有申報，用來探測官方最新年度
COMMIT_PATHS = ['data', 'README.md', '*.html', 'js']


def run(args, capture=False, check=True):
    print(f'\n$ {" ".join(os.path.relpath(a, ROOT) if a.startswith(ROOT) else a for a in args)}')
    r = subprocess.run(args, cwd=ROOT, capture_output=capture, text=capture, encoding='utf-8' if capture else None)
    if capture:
        sys.stdout.write(r.stdout)
        sys.stderr.write(r.stderr)
    if check and r.returncode != 0:
        sys.exit(f'✘ 失敗：{" ".join(args)}（exit {r.returncode}）')
    return r


def last_json(stdout):
    for line in reversed((stdout or '').strip().splitlines()):
        if line.startswith('{'):
            return json.loads(line)
    return {}


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as fp:
        for chunk in iter(lambda: fp.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def import_downloads():
    """把手動下載的 ODS 歸檔到正確資料夾。內容已存在（同雜湊）就略過；不刪除來源檔。"""
    imported = []
    for key, dest, label, _url in IMPORT_RULES:
        dest_abs = os.path.join(ROOT, dest)
        have = {sha1(p) for p in glob.glob(os.path.join(dest_abs, '*.ods'))}
        for box in INBOXES:
            for src in glob.glob(os.path.join(box, f'*{key}*.ods')):
                name = os.path.basename(src)
                # 瀏覽器重複下載會加「 (1)」之類的尾綴，去掉；檔名必須帶「XXX年」才歸得了檔
                name = re.sub(r'\s*\(\d+\)(?=\.ods$)', '', name)
                if not re.search(r'\d{3}年', name) or sha1(src) in have:
                    continue
                shutil.copy2(src, os.path.join(dest_abs, name))
                have.add(sha1(src))
                imported.append(f'{label}：{name}')
    for s in imported:
        print(f'  ✔ 歸檔 {s}')
    return imported


def check_financials():
    """查健保署財務 API 的最新年度，與本機比較。回傳提示字串或 None。"""
    try:
        out = subprocess.run(['curl', '-s', '-m', '30', '-X', 'POST', FIN_API,
                              '-H', 'Content-Type: application/json; charset=UTF-8',
                              '-H', 'X-Requested-With: XMLHttpRequest',
                              '--data', json.dumps({'hospId': FIN_PROBE})],
                             capture_output=True, check=True).stdout
        api_latest = max(int(r['YEAR']) for r in json.loads(out)['d'])
    except Exception as e:   # noqa: BLE001 — 探測失敗不影響其他資料更新
        return f'財務：無法查詢健保署最新年度（{e}）'
    with open(os.path.join(ROOT, 'data', 'hospital-financials.json'), encoding='utf-8') as fp:
        local_latest = max(int(r['YEAR']) for h in json.load(fp)['hospitals'] for r in h['rows'])
    print(f'財務：健保署最新 {api_latest} 年；本機最新 {local_latest} 年')
    if api_latest > local_latest:
        return (f'財務：健保署已有 {api_latest} 年資料，請下載「{api_latest}年財務報告醫院醫療服務申報情形.ods」'
                f'（健保署網站「醫院財務資訊公開」年度報表），留在「下載」資料夾後再跑一次')
    return None


def roc_slash(key):
    """'11507' 或 '115年07月' → '115/07'"""
    m = re.match(r'(\d{3})\D*(\d{1,2})', key)
    return f'{m.group(1)}/{int(m.group(2)):02d}'


def update_readme():
    with open(os.path.join(ROOT, 'data', 'personnel-index.json'), encoding='utf-8') as fp:
        pi = json.load(fp)
    with open(os.path.join(ROOT, 'data', 'nurse-ratio.json'), encoding='utf-8') as fp:
        nr = json.load(fp)
    p_first, p_last = (roc_slash(x) for x in pi['monthRange'])
    n_first, n_last = roc_slash(nr['months'][0]), roc_slash(nr['months'][-1])
    p = os.path.join(ROOT, 'README.md')
    with open(p, encoding='utf-8') as fp:
        s = fp.read()
    s2 = s
    # 人力監控
    s2 = re.sub(r'\d+ 筆（含院區）、民國 \d+/\d+–\d+/\d+ 逐月', f'{pi["count"]} 筆（含院區）、民國 {p_first}–{p_last} 逐月', s2)
    s2 = re.sub(r'(醫事人力監測 \| [^|]+\| )\d+ 筆・\d+/\d+–\d+/\d+', lambda m: f'{m.group(1)}{pi["count"]} 筆・{p_first}–{p_last}', s2)
    # 護病比
    s2 = re.sub(r'急性一般病床護病比，\d+ 家、民國 \d+/\d+–\d+/\d+ 逐月',
                f'急性一般病床護病比，{nr["hospitalCount"]} 家、民國 {n_first}–{n_last} 逐月', s2)
    s2 = re.sub(r'(三班護病比 \| [^|]+\| )\d+ 家・\d+/\d+–\d+/\d+', lambda m: f'{m.group(1)}{nr["hospitalCount"]} 家・{n_first}–{n_last}', s2)
    if s2 != s:
        with open(p, 'w', encoding='utf-8') as fp:
            fp.write(s2)
        print(f'README：人力監控 {p_first}–{p_last}、護病比 {n_first}–{n_last}')
    return p_last, n_last


def main():
    fetch = '--no-fetch' not in sys.argv
    commit = '--commit' in sys.argv
    push = '--push' in sys.argv
    notes, new = [], []

    if fetch:
        r = run([PY, 'tools/fetch-personnel.py'], capture=True, check=False)
        if r.returncode == 0:
            new += [f'人力 {m}' for m in last_json(r.stdout).get('new', [])]
        else:
            notes.append('人力監控：下載失敗，詳見上方訊息')
        r = run([PY, 'tools/fetch-nurse-ratio.py'], capture=True, check=False)
        if r.returncode == 0:
            new += [f'護病比 {m}' for m in last_json(r.stdout).get('new', [])]
        else:
            notes.append('護病比：開放資料查詢失敗，詳見上方訊息')
        fin = check_financials()
        if fin:
            notes.append(fin)

    print('\n歸檔手動下載的檔案（~/Downloads、data/_inbox/）…')
    new += import_downloads()

    run([PY, 'tools/build-all.py'])
    p_last, n_last = update_readme()

    print('\n' + '═' * 60)
    print(f'人力監控到 {p_last}；護病比到 {n_last}')
    print('本次新增：' + ('、'.join(new) if new else '無'))
    for n in notes:
        print('⚠ ' + n)

    if commit:
        run(['git', 'add', '--', *COMMIT_PATHS])
        if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=ROOT).returncode == 0:
            print('沒有需要提交的變更')
            return
        msg = 'data: 官方資料更新' + (f'（{"、".join(new)}）' if new else '') + \
              f'\n\n人力監控至 {p_last}；護病比至 {n_last}。由 tools/update-data.py 產生。'
        run(['git', 'commit', '-m', msg])
        if push:
            run(['git', 'push'])
            print('✔ 已 push，GitHub Pages 會自動部署')


if __name__ == '__main__':
    main()
