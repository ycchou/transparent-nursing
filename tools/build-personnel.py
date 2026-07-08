#!/usr/bin/env python3
"""
解析衛福部「醫院醫事人力持續性監測結果」PDF → 結構化資料檔（多核平行）。

來源：桌面資料夾 醫院醫事人力持續性監測/{ROC月}/*.pdf（每月 3 檔：醫學中心／區域醫院／地區醫院）
輸出：
  data/personnel-index.json           picker 用清單（categories / bedTypes / hospitals）
  data/personnel/{code}.json          每家醫院逐月時間序列

僅解析文字型 PDF（108/07～115/05，83 個月）；108/03～06 為掃描影像、已排除。
用法：python tools/build-personnel.py
"""
import os, re, sys, json, glob
from multiprocessing import Pool, cpu_count
import pdfplumber

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\Chou Yu-Cheng\Desktop\醫院醫事人力持續性監測"
OUT_INDEX = os.path.join(ROOT, 'data', 'personnel-index.json')
OUT_DIR = os.path.join(ROOT, 'data', 'personnel')

BED_TYPES = ['急性一般病床', '慢性一般病床', '精神急性一般病床', '精神慢性一般病床']
CATEGORIES = ['醫師', '醫事放射', '醫事檢驗', '護產', '藥事', '營養',
              '物理治療', '職能治療', '語言治療', '聽力師', '社會工作', '呼吸治療', '精神臨床心理']
ROW_TYPES = {'設置標準': 'setup', '評鑑基準': 'eval', '實際人數': 'actual'}
SKIP_MONTHS = {'108年03月', '108年04月', '108年05月', '108年06月'}


def clean(s):
    return re.sub(r'\s+', '', str(s)) if s is not None else ''


def to_int(s):
    s = clean(s).replace(',', '')
    if s in ('', '-', '－', 'N/A'):
        return None
    try:
        return int(s)
    except ValueError:
        return None


def month_key(folder):
    m = re.match(r'^(\d+)年(\d+)月', folder)
    return f"{int(m.group(1)):03d}{int(m.group(2)):02d}" if m else None


def level_of(fname):
    for lv in ('醫學中心', '區域醫院', '地區醫院'):
        if lv in fname:
            return lv
    return None


def col_bounds(pg1):
    """由第 1 頁的表格框線取 24 欄的 x 邊界（共 25 個）。"""
    tbls = pg1.find_tables()
    if not tbls:
        return None
    cells = tbls[0].cells
    return sorted(set(round(c[0], 1) for c in cells) | set(round(c[2], 1) for c in cells))


def _bucket_row(cluster, xs, ncol):
    cells = [''] * ncol
    for w in sorted(cluster, key=lambda x: x['x0']):
        cx = (w['x0'] + w['x1']) / 2
        ci = next((i for i in range(ncol) if xs[i] - 1 <= cx <= xs[i + 1] + 1), None)
        if ci is None:
            ci = 0 if cx < xs[0] else ncol - 1
        cells[ci] = (cells[ci] + w['text']).strip()
    return cells


def rows_from_page(page, xs, row_gap=4.0):
    """以字詞 x 位置分欄（不靠框線）；列的分群用「top 相鄰間距」而非固定分箱。
    舊版 PDF 續頁無框線（預設 extract_tables 只抓得到第 1 頁），且部分月份每列
    的標籤與數字 top 相差約 0.4px，固定分箱會把「實際人數」的數字與標籤拆成兩
    列 → 實際值變空。改用間距分群（列距約 13px、列內 <1px）可穩定分列。"""
    words = sorted(page.extract_words(x_tolerance=1.5, y_tolerance=2),
                   key=lambda w: (w['top'], w['x0']))
    ncol = len(xs) - 1
    out, cur, last = [], [], None
    for w in words:
        if last is not None and (w['top'] - last) > row_gap:
            out.append(_bucket_row(cur, xs, ncol))
            cur = []
        cur.append(w)
        last = w['top']
    if cur:
        out.append(_bucket_row(cur, xs, ncol))
    return out


def parse_one(task):
    """worker：解析單一 PDF，回傳該檔所有醫院-月記錄。"""
    path, level, mkey = task
    out = {}   # code -> rec
    cur = None
    try:
        with pdfplumber.open(path) as pdf:
            xs = col_bounds(pdf.pages[0])
            for page in pdf.pages:
                rows = rows_from_page(page, xs) if xs else \
                    [r for t in (page.extract_tables() or []) for r in t]
                for row in rows:
                    if not row or len(row) < 24:
                        continue
                    code = clean(row[1])
                    rtype = clean(row[10])
                    if re.fullmatch(r'\d{10}', code):
                        cur = code
                        rec = out.setdefault(code, {'code': code, 'mkey': mkey, 'level': level,
                                                     'name': clean(row[2]), 'branch': clean(row[3]),
                                                     'city': clean(row[4]),
                                                     'beds': [to_int(row[6 + i]) for i in range(4)],
                                                     'rows': {}})
                        if rtype in ROW_TYPES:
                            rec['rows'][ROW_TYPES[rtype]] = [to_int(row[11 + i]) for i in range(13)]
                    elif code == '' and rtype in ROW_TYPES and cur and cur in out:
                        out[cur]['rows'][ROW_TYPES[rtype]] = [to_int(row[11 + i]) for i in range(13)]
    except Exception as e:
        return ('ERR', f"{os.path.basename(path)}: {e}")
    return ('OK', list(out.values()))


def build_tasks():
    months = sorted(
        d for d in os.listdir(SRC)
        if os.path.isdir(os.path.join(SRC, d)) and re.match(r'^\d+年\d+月$', d) and d not in SKIP_MONTHS
    )
    tasks = []
    for folder in months:
        mkey = month_key(folder)
        d = os.path.join(SRC, folder)
        for f in os.listdir(d):
            if f.lower().endswith('.pdf') and level_of(f):
                tasks.append((os.path.join(d, f), level_of(f), mkey))
    return months, tasks


def main():
    months, tasks = build_tasks()
    print(f"月份：{len(months)}（{months[0]} ~ {months[-1]}）；PDF 任務：{len(tasks)}")

    store = {}   # (code, mkey) -> rec
    errs = []
    nproc = min(8, cpu_count())
    done = 0
    with Pool(nproc) as pool:
        for status, payload in pool.imap_unordered(parse_one, tasks):
            done += 1
            if status == 'ERR':
                errs.append(payload)
            else:
                for rec in payload:
                    store[(rec['code'], rec['mkey'])] = rec
            if done % 30 == 0:
                print(f"  ...{done}/{len(tasks)}")
    print(f"解析完成；錯誤 {len(errs)}", errs[:5] if errs else '')

    # 套用人工修正（來源 PDF 異常值，例如數字誤植）
    corr_path = os.path.join(ROOT, 'data', 'personnel-corrections.json')
    ncorr = 0
    if os.path.exists(corr_path):
        with open(corr_path, encoding='utf-8') as fp:
            corr = json.load(fp).get('corrections', {})
        for code, mmap in corr.items():
            for mkey, fields in mmap.items():
                rec = store.get((code, mkey))
                if not rec:
                    continue
                for which in ('actual', 'eval'):
                    for cat, val in (fields.get(which) or {}).items():
                        if cat in CATEGORIES:
                            rec['rows'].setdefault(which, [None] * 13)[CATEGORIES.index(cat)] = val
                            ncorr += 1
                for bt, val in (fields.get('beds') or {}).items():
                    if bt in BED_TYPES:
                        rec['beds'][BED_TYPES.index(bt)] = val
                        ncorr += 1
        print(f"套用人工修正 {ncorr} 個值")

    # 官方正式名稱：PDF 長名稱有時落在中列導致空白，一律以 hospitals-merged 為準
    merged_names = {}
    mp = os.path.join(ROOT, 'data', 'hospitals-merged.json')
    if os.path.exists(mp):
        with open(mp, encoding='utf-8') as fp:
            for h in json.load(fp).get('hospitals', []):
                if h.get('code') and h.get('name'):
                    merged_names.setdefault(h['code'], h['name'])

    # 依醫院彙整
    hosp = {}
    for (code, mkey), rec in store.items():
        h = hosp.setdefault(code, {})
        h[mkey] = rec

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, '*.json')):
        os.remove(old)

    index = []
    for code, months_map in hosp.items():
        mkeys = sorted(months_map.keys())
        last = months_map[mkeys[-1]]
        name = merged_names.get(code) or last['name'] or code
        out = {
            'code': code, 'name': name, 'city': last['city'], 'level': last['level'],
            'categories': CATEGORIES, 'bedTypes': BED_TYPES,
            'months': mkeys,
            'beds': [months_map[m]['beds'] for m in mkeys],
            'actual': [months_map[m]['rows'].get('actual') for m in mkeys],
            'eval': [months_map[m]['rows'].get('eval') for m in mkeys],
        }
        with open(os.path.join(OUT_DIR, f"{code}.json"), 'w', encoding='utf-8') as fp:
            json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
        index.append({'code': code, 'name': name, 'city': last['city'], 'level': last['level'],
                      'firstMonth': mkeys[0], 'lastMonth': mkeys[-1], 'monthCount': len(mkeys)})

    # 全國逐月加總（僅計 3 層級齊全的月份，避免 110/04 這類缺整層級的月造成假降）
    m_levels, m_actual, m_beds, m_count = {}, {}, {}, {}
    for (code, mkey), rec in store.items():
        m_levels.setdefault(mkey, set()).add(rec['level'])
        m_count[mkey] = m_count.get(mkey, 0) + 1
        a = rec['rows'].get('actual')
        if a:
            ma = m_actual.setdefault(mkey, [0] * 13)
            for i, v in enumerate(a):
                if v is not None:
                    ma[i] += v
        for i, v in enumerate(rec.get('beds') or []):
            if v is not None:
                m_beds.setdefault(mkey, [0] * 4)[i] += v
    complete = sorted(m for m in m_levels if {'醫學中心', '區域醫院', '地區醫院'} <= m_levels[m])
    with open(os.path.join(ROOT, 'data', 'personnel-aggregate.json'), 'w', encoding='utf-8') as fp:
        json.dump({
            'categories': CATEGORIES, 'bedTypes': BED_TYPES,
            'months': complete,
            'totalActual': [m_actual.get(m, [0] * 13) for m in complete],
            'totalBeds': [m_beds.get(m, [0] * 4) for m in complete],
            'hospitalCount': [m_count[m] for m in complete],
        }, fp, ensure_ascii=False, separators=(',', ':'))
    print(f"全國加總月份：{len(complete)}（排除缺整層級月 {sorted(set(m_levels) - set(complete))}）")

    index.sort(key=lambda x: (x['city'], x['level'], x['name']))
    from datetime import datetime, timezone, timedelta
    with open(OUT_INDEX, 'w', encoding='utf-8') as fp:
        json.dump({
            'generatedAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
            'source': 'openinfo.mohw.gov.tw/web/D01 醫院醫事人力持續性監測結果',
            'monthRange': [months[0], months[-1]],
            'categories': CATEGORIES, 'bedTypes': BED_TYPES,
            'count': len(index), 'hospitals': index,
        }, fp, ensure_ascii=False, separators=(',', ':'))

    from collections import Counter
    print(f"醫院數：{len(index)}；最新層級分布：{dict(Counter(x['level'] for x in index))}")
    print(f"輸出：personnel-index.json 與 data/personnel/*.json（{len(index)} 檔）")


if __name__ == '__main__':
    main()
