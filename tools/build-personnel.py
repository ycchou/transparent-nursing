#!/usr/bin/env python3
"""
解析衛福部「醫院醫事人力持續性監測結果」PDF → 結構化資料檔（多核平行）。

來源：data/醫院醫事人力持續性監測/{ROC月}/*.pdf（每月 3 檔：醫學中心／區域醫院／地區醫院）
輸出：
  data/personnel-index.json           picker 用清單（categories / bedTypes / hospitals）
  data/personnel/{id}.json            每家醫院（或院區）逐月時間序列

多院區處理：同一機構代號可能逐院區各一列（如北市聯醫 0101090517 有仁愛/中興/…），
以 (code, normalizeBranch(branch)) 為鍵拆分，比照 build-nurse-ratio.py。單院區 id=code，
多院區 id=code-院區（與護病比一致）。

僅解析文字型 PDF（108/07～115/05，83 個月）；108/03～06 為掃描影像、已排除。
用法：python tools/build-personnel.py
"""
import os, re, sys, json, glob
from collections import defaultdict
from multiprocessing import Pool, cpu_count
import pdfplumber

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', '醫院醫事人力持續性監測')
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


def normalize_branch(b):
    """正規化院區字串（跨月份/檔案比對用）：去尾綴「院區」及奇怪尾綴，使早期短名與
    後期「◯◯院區」收斂為同鍵。比照 build-nurse-ratio.py 的 normalizeBranch。"""
    if not b:
        return ''
    t = str(b).strip()
    for tail in ('及其婦幼', '及其分院'):
        if t.endswith(tail):
            t = t[:-len(tail)]
    if t.endswith('院區'):
        t = t[:-2]
    return t


def load_nurse_multi():
    """讀 nurse-ratio.json，取「真正多院區」的權威院區清單（僅這些 code 才拆院區）。
    回傳 {code: {branchKey: {'branch': 顯示院區, 'levels': set()}}}。

    監測 PDF 的「院區」欄位品質差（同一單院醫院逐月寫成『本院』/空白/『本院及其◯院區』
    /解析碎片），若照單全收會誤拆數十家單院醫院。改以護病比已認定的多院區為準，
    並把監測的院區字串貼合(snap)到護病比的院區身分，達成與護病比一致。"""
    nr = {}
    p = os.path.join(ROOT, 'data', 'nurse-ratio.json')
    if not os.path.exists(p):
        return nr
    from collections import defaultdict as _dd
    by_code = _dd(list)
    with open(p, encoding='utf-8') as fp:
        for h in json.load(fp).get('hospitals', []):
            if h.get('code'):
                by_code[h['code']].append(h)
    for code, hs in by_code.items():
        if len(hs) < 2:
            continue  # 單院區不拆
        branches = {}
        for h in hs:
            hid = h.get('id') or code
            slug = hid.split('-', 1)[1] if '-' in hid else normalize_branch(h.get('branch'))
            b = branches.setdefault(slug, {'branch': h.get('branch') or slug, 'levels': set()})
            if h.get('level'):
                b['levels'].add(h['level'])
        nr[code] = branches
    return nr


def snap_branch(raw_branch, level, nr_branches):
    """把監測 PDF 的院區字串貼合到護病比的院區 slug。
    優先序：正規化精準 → 前綴(共同前 ≥2 字) → 同層級唯一者 → 該層級任一/正規化值。"""
    nb = normalize_branch(raw_branch)
    if nb in nr_branches:
        return nb
    for slug in nr_branches:
        common = 0
        for i in range(min(len(nb), len(slug))):
            if nb[i] == slug[i]:
                common += 1
            else:
                break
        if common >= 2:
            return slug
    same = [slug for slug, meta in nr_branches.items() if level in meta['levels']]
    if len(same) == 1:
        return same[0]
    if same:
        return same[0]
    return nb or 'main'


def merged_mother_name(code, months_map, merged_names):
    """多院區的母院名：PDF row[2] 偶因欄位錯位變成『醫院』等碎片，故取群組內
    最常見的乾淨名稱（長度≥5 且非碎片），退而求其次用 merged 官方名。"""
    from collections import Counter
    names = Counter()
    for rec in months_map.values():
        nm = (rec.get('name') or '').strip()
        if len(nm) >= 5 and nm not in ('醫院', '院'):
            names[nm] += 1
    if names:
        return names.most_common(1)[0][0]
    return merged_names.get(code) or code


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


def norm_code(raw):
    """PDF 有時掉了機構代碼開頭的 0（如 '145030020' 實為 '0145030020'）。
    抽出數字後，9 碼補一個前導 0 成 10 碼；回傳 10 碼字串或 None。
    這是跨院汙染的根因修正：舊版用 re.fullmatch(r'\\d{10}') 會漏掉掉 0 的 9 碼代碼，
    導致 cur 不換手、下一家的『實際人數』覆蓋到上一家。"""
    d = re.sub(r'\D', '', raw or '')
    if len(d) == 9:
        d = '0' + d
    return d if len(d) == 10 else None


def parse_one(task):
    """worker：解析單一 PDF，回傳該檔所有醫院(院區)-月記錄。
    以『有醫院名稱(row[2]) + 可解析代碼(row[1])』的列作為新醫院區塊起點；其後無名稱的
    續列（實際人數/設置標準）歸屬同一家。關鍵防護：同一家若已有某型值(actual/eval/setup)，
    不再覆蓋 —— 第二筆同型值代表『下一家醫院的表頭未被辨識』，覆蓋即跨院汙染，故拒絕。
    以 (code, branchKey) 為鍵，使同代號多院區（如北市聯醫）各自成列、互不覆蓋。"""
    path, level, mkey = task
    out = {}   # (code, branchKey) -> rec
    cur = None  # 目前的 (code, branchKey)
    try:
        with pdfplumber.open(path) as pdf:
            xs = col_bounds(pdf.pages[0])
            for page in pdf.pages:
                rows = rows_from_page(page, xs) if xs else \
                    [r for t in (page.extract_tables() or []) for r in t]
                for row in rows:
                    if not row or len(row) < 24:
                        continue
                    name = clean(row[2])
                    code = norm_code(clean(row[1]))
                    rtype = clean(row[10])
                    if code:                                  # 有可解析代碼 → 新醫院區塊起點
                        # 註：以代碼(非名稱)為換手訊號；某些月份表頭名稱格會空白，
                        # 若額外要求 name 會漏掉該院當月（官方名之後由 merged_names 補回）。
                        branch = clean(row[3])
                        key = (code, normalize_branch(branch))
                        cur = key
                        rec = out.setdefault(key, {'code': code, 'mkey': mkey, 'level': level,
                                                    'name': name, 'branch': branch,
                                                    'city': clean(row[4]),
                                                    'beds': [to_int(row[6 + i]) for i in range(4)],
                                                    'rows': {}})
                        if rtype in ROW_TYPES and ROW_TYPES[rtype] not in rec['rows']:
                            rec['rows'][ROW_TYPES[rtype]] = [to_int(row[11 + i]) for i in range(13)]
                    elif cur and cur in out and rtype in ROW_TYPES:
                        if ROW_TYPES[rtype] not in out[cur]['rows']:   # 不覆蓋 → 防跨院汙染
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

    store = {}   # (code, branchKey, mkey) -> rec
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
                    store[(rec['code'], normalize_branch(rec['branch']), rec['mkey'])] = rec
            if done % 30 == 0:
                print(f"  ...{done}/{len(tasks)}")
    print(f"解析完成；錯誤 {len(errs)}", errs[:5] if errs else '')

    # 套用人工修正（來源 PDF 異常值，例如數字誤植）。修正表以 code 為鍵，
    # 套用到該 code 同月份的所有院區記錄（現有修正皆單院區，key branchKey='')。
    corr_path = os.path.join(ROOT, 'data', 'manual', 'personnel-corrections.json')
    ncorr = 0
    if os.path.exists(corr_path):
        with open(corr_path, encoding='utf-8') as fp:
            corr = json.load(fp).get('corrections', {})
        for code, mmap in corr.items():
            for mkey, fields in mmap.items():
                recs = [r for (c, _b, mk), r in store.items() if c == code and mk == mkey]
                for rec in recs:
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

    # 只有護病比認定的「真正多院區」才拆院區；其餘 code 一律收合成單筆（id=code），
    # 避免監測 PDF 逐月變動的院區欄位把單院醫院誤拆成數筆。
    nr_multi = load_nurse_multi()
    print(f"多院區 code（沿用護病比）：{sorted(nr_multi.keys())}")

    def final_branch_key(code, raw_branch, level):
        """回傳該筆記錄最終的院區 slug；非多院區 code 一律 ''（收合）。"""
        if code in nr_multi:
            return snap_branch(raw_branch, level, nr_multi[code])
        return ''

    # 依 (code, finalBranchKey) 彙整逐月序列
    hosp = {}
    for (code, _rawKey, mkey), rec in store.items():
        fk = final_branch_key(code, rec['branch'], rec['level'])
        hosp.setdefault((code, fk), {})[mkey] = rec

    branches_by_code = defaultdict(set)
    for (code, fk) in hosp:
        branches_by_code[code].add(fk)

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, '*.json')):
        os.remove(old)

    index = []
    for (code, fk), months_map in hosp.items():
        mkeys = sorted(months_map.keys())
        last = months_map[mkeys[-1]]
        siblings = branches_by_code[code]
        multi = code in nr_multi and len(siblings) > 1
        if not multi:
            hid = code
            name = merged_names.get(code) or last['name'] or code
            branch_disp = ''
        else:
            hid = f"{code}-{fk}"
            # 顯示院區用護病比的院區名（一致），母院名取穩定來源
            branch_disp = nr_multi[code].get(fk, {}).get('branch') or last['branch'] or fk
            mother = merged_mother_name(code, months_map, merged_names)
            name = f"{mother}·{branch_disp}"
        out = {
            'code': code, 'id': hid, 'branch': branch_disp,
            'name': name, 'city': last['city'], 'level': last['level'],
            'categories': CATEGORIES, 'bedTypes': BED_TYPES,
            'months': mkeys,
            'beds': [months_map[m]['beds'] for m in mkeys],
            'actual': [months_map[m]['rows'].get('actual') for m in mkeys],
            'eval': [months_map[m]['rows'].get('eval') for m in mkeys],
        }
        if multi:
            out['sharedCode'] = {
                'code': code, 'branchCount': len(siblings),
                'note': f'此機構代號涵蓋多院區（{len(siblings)} 個），各院區資料分別呈現',
            }
        with open(os.path.join(OUT_DIR, f"{hid}.json"), 'w', encoding='utf-8') as fp:
            json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
        entry = {'code': code, 'id': hid, 'branch': branch_disp, 'name': name,
                 'city': last['city'], 'level': last['level'],
                 'firstMonth': mkeys[0], 'lastMonth': mkeys[-1], 'monthCount': len(mkeys)}
        if multi:
            entry['sharedCode'] = True
        index.append(entry)

    # 全國逐月加總（僅計 3 層級齊全的月份，避免 110/04 這類缺整層級的月造成假降）。
    # 以院區為單位加總（含先前被覆蓋掉的院區，修正低估）；hospitalCount 計 distinct code。
    m_levels, m_actual, m_beds = {}, {}, {}
    m_codes = defaultdict(set)
    for (code, branchKey, mkey), rec in store.items():
        m_levels.setdefault(mkey, set()).add(rec['level'])
        m_codes[mkey].add(code)
        a = rec['rows'].get('actual')
        if a:
            ma = m_actual.setdefault(mkey, [0] * 13)
            for i, v in enumerate(a):
                if v is not None:
                    ma[i] += v
        for i, v in enumerate(rec.get('beds') or []):
            if v is not None:
                m_beds.setdefault(mkey, [0] * 4)[i] += v
    m_count = {mkey: len(codes) for mkey, codes in m_codes.items()}
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
