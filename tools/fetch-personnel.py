#!/usr/bin/env python3
"""
從衛福部「醫院評鑑資訊專區」自動下載新月份的「醫院醫事人力持續性監測結果」PDF。

來源：https://openinfo.mohw.gov.tw/web/D01（資料下載列表，前端以 AJAX 呼叫下列 API）
  POST /D01/GetPageData   列表（每月一筆，標題如「115年7月份「醫院醫事人力持續性監測結果」」）
  POST /D02/Init          單筆詳細（附件清單，每月一個 zip：醫學中心／區域醫院／地區醫院 3 份 PDF）
  GET  /Web/DlFromFolder?key=<OD_SYS_FI_SEQ>   下載附件
  GET  /Web/DlZipFile?key=<DOWNLOAD_SEQ>       舊式（DOWNLOAD_TYPE=01）直接下載 zip

只下載本機 data/醫院醫事人力持續性監測/ 還沒有（或不滿 3 份 PDF）的月份，
解壓到 {ROC年}年{MM}月/，檔名沿用官方命名（build-personnel.py 靠檔名判斷層級）。
只用標準函式庫，不需額外安裝。

用法：
  python tools/fetch-personnel.py            下載缺少的月份
  python tools/fetch-personnel.py --dry-run  只列出會下載哪些月份
輸出最後一行為 JSON：{"new": ["115年07月", ...]}，供 update-personnel.py 判斷是否要重建。
"""
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', '醫院醫事人力持續性監測')
BASE = 'https://openinfo.mohw.gov.tw'
TITLE_KEY = '醫院醫事人力持續性監測結果'
LEVELS = ('醫學中心', '區域醫院', '地區醫院')
# 官方檔名偶有錯字（110/04 寫成「區域中心」「地區中心」），與 build-personnel.py 的 LEVEL_ALIASES 一致
LEVEL_ALIASES = {'醫學中心': ('醫學中心',), '區域醫院': ('區域醫院', '區域中心'), '地區醫院': ('地區醫院', '地區中心')}


def has_level(files, lv):
    return any(n in f for f in files for n in LEVEL_ALIASES[lv])
FIRST_MONTH = (108, 7)   # 108/03～06 為掃描影像，build-personnel.py 不解析，也不用抓
UA = 'Mozilla/5.0 (transparent-nursing data fetcher; +https://ycchou.github.io/transparent-nursing/)'


def api(path, payload):
    """該站的 AJAX 慣例：body 為 {"data": "<JSON 字串>", device, browser, token}。"""
    body = json.dumps({'data': json.dumps(payload, ensure_ascii=False),
                       'device': 'pc', 'browser': 'chrome', 'token': ''}).encode('utf-8')
    req = urllib.request.Request(BASE + path, data=body, method='POST',
                                 headers={'Content-Type': 'application/json', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def list_reports():
    """逐頁取完整列表 → [(year, month, seq, type)]，同月重複時取 seq 最大（最新上傳）。"""
    found = {}
    page = 1
    while True:
        res = api('/D01/GetPageData', {'DOWNLOAD_TYPE': '', 'START': '', 'END': '',
                                       'currentPage': page, 'pageSize': '50'})
        for it in res.get('list') or []:
            title = it.get('TITLE') or ''
            m = re.search(r'(\d{3})年(\d{1,2})月份', title)
            if TITLE_KEY not in title or not m:
                continue
            ym = (int(m.group(1)), int(m.group(2)))
            seq = int(it['DOWNLOAD_SEQ'])
            if ym not in found or seq > found[ym][0]:
                found[ym] = (seq, it.get('DOWNLOAD_TYPE'))
        if page >= int(res.get('totalPage') or 1):
            break
        page += 1
    return sorted((y, mo, seq, typ) for (y, mo), (seq, typ) in found.items())


def folder_of(y, mo):
    return os.path.join(SRC, f'{y}年{mo:02d}月')


def is_complete(y, mo):
    d = folder_of(y, mo)
    if not os.path.isdir(d):
        return False
    pdfs = [f for f in os.listdir(d) if f.lower().endswith('.pdf')]
    return all(has_level(pdfs, lv) for lv in LEVELS)


def zip_name(info):
    """zip 內檔名：有 UTF-8 旗標就直接用，否則多半是 Big5（Windows 壓縮）。"""
    if info.flag_bits & 0x800:
        return info.filename
    raw = info.filename.encode('cp437')
    for enc in ('big5', 'cp950', 'utf-8'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return info.filename


def extract_pdfs(blob, dest):
    os.makedirs(dest, exist_ok=True)
    saved = []
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            name = os.path.basename(zip_name(info))
            if not name.lower().endswith('.pdf'):
                continue
            with open(os.path.join(dest, name), 'wb') as fp:
                fp.write(z.read(info))
            saved.append(name)
    return saved


def fetch_month(y, mo, seq, typ):
    if typ == '01':
        blobs = [download(f'{BASE}/Web/DlZipFile?key={seq}')]
    else:
        det = api('/D02/Init', {'DOWNLOAD_SEQ': str(seq)}).get('data') or {}
        blobs = [download(f"{BASE}/Web/DlFromFolder?key={f['OD_SYS_FI_SEQ']}")
                 for f in det.get('fileList') or [] if str(f.get('FILE_NAME', '')).lower().endswith('.zip')]
    saved = []
    for b in blobs:
        saved += extract_pdfs(b, folder_of(y, mo))
    return saved


def main():
    dry = '--dry-run' in sys.argv
    reports = list_reports()
    if not reports:
        sys.exit('找不到任何「醫院醫事人力持續性監測結果」——網站 API 可能改版，請檢查 fetch-personnel.py')
    latest = reports[-1]
    print(f'官方最新：{latest[0]}年{latest[1]}月（共 {len(reports)} 個月）')

    todo = [r for r in reports if (r[0], r[1]) >= FIRST_MONTH and not is_complete(r[0], r[1])]
    if not todo:
        print('本機已是最新，不需下載')
    new = []
    for y, mo, seq, typ in todo:
        label = f'{y}年{mo:02d}月'
        if dry:
            print(f'  將下載 {label}（seq={seq}）')
            continue
        saved = fetch_month(y, mo, seq, typ)
        missing = [lv for lv in LEVELS if not has_level(saved, lv)]
        print(f'  {label}：{len(saved)} 份 PDF' + (f'（缺 {"、".join(missing)}）' if missing else ''))
        if saved:
            new.append(label)
    print(json.dumps({'new': new, 'latest': f'{latest[0]}年{latest[1]:02d}月'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
