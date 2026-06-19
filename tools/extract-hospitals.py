"""
從衛福部「108-114年醫院評鑑及教學醫院評鑑(含兒醫)合格名單.pdf」抽取完整醫院資料。
輸出三檔：
  data/hospitals.json   — 結構化 JSON + metadata
  data/hospitals.csv    — Excel 友善 CSV（含 BOM）
  data/hospitals-README.md — 欄位說明文件

執行方式：python tools/extract-hospitals.py
"""
import pdfplumber, os, re, json, csv, sys, io
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# PDF 路徑（如有更新請改這裡）
PDF_PATH = os.path.expanduser("~/Downloads/108-114年醫院評鑑及教學醫院評鑑(含兒醫)合格名單.pdf")

LEVEL_OK = {'醫學中心', '區域醫院', '地區醫院'}
CODE_RE = re.compile(r'^\d{10}$')
END_RE = re.compile(r'(?:醫院|中心|分院)(?:\s*[(（][^)）]*[)）])?\s*$|[)）]\s*$')
PAREN_LIMIT_RE = re.compile(r'\s*[(（]\s*僅[^)）]*[)）]\s*$')


def clean_name(name):
    return PAREN_LIMIT_RE.sub('', (name or '').strip()).strip()


def split_by_end_regex(lines, n_expected, end_regex=None):
    """N 個 code 對應 N 個名稱，以結尾 regex 切。"""
    if not lines:
        return []
    if n_expected <= 1:
        return [''.join(lines)]
    result, buf = [], ''
    for line in lines:
        buf += line
        if end_regex and end_regex.search(buf):
            result.append(buf)
            buf = ''
    if buf:
        if result:
            result[-1] += buf
        else:
            result.append(buf)
    return result


def extract():
    records = []
    seen = set()

    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table[1:]:
                    if not row or len(row) < 13:
                        continue
                    if not (row[0] or '').strip().isdigit():
                        continue

                    code_cell = (row[1] or '').strip()
                    name_cell = (row[2] or '').strip()
                    city_cell = (row[3] or '').strip()
                    level = (row[4] or '').replace('\n', '').strip()
                    if level not in LEVEL_OK:
                        continue

                    hosp_result = (row[5] or '').replace('\n', '').strip()
                    teach_result = (row[6] or '').replace('\n', '').strip()
                    hosp_year = (row[7] or '').strip()
                    teach_year = (row[8] or '').strip()
                    hosp_period = (row[9] or '').replace('\n', '').strip()
                    teach_period = (row[10] or '').replace('\n', '').strip()
                    phone = (row[11] or '').strip()
                    addr_cell = (row[12] or '').strip()

                    code_lines = [c.strip() for c in code_cell.split('\n') if c.strip()]
                    name_lines = [n.strip() for n in name_cell.split('\n') if n.strip()]
                    city_lines = [c.strip() for c in city_cell.split('\n') if c.strip()]
                    addr_lines = [a.strip() for a in addr_cell.split('\n') if a.strip()]
                    phone_lines = [p.strip() for p in phone.split('\n') if p.strip()]

                    valid_codes = [c for c in code_lines if CODE_RE.match(c)]
                    n = max(1, len(valid_codes))
                    names = split_by_end_regex(name_lines, n, END_RE)
                    addresses = split_by_end_regex(addr_lines, n, None) if n > 1 else [''.join(addr_lines)]

                    for i in range(len(names)):
                        nm = clean_name(names[i])
                        if not nm:
                            continue
                        code = valid_codes[i] if i < len(valid_codes) else ''
                        city = city_lines[i] if i < len(city_lines) else (city_lines[0] if city_lines else '')
                        addr = addresses[i] if i < len(addresses) else (addr_cell or '')

                        key = (code, nm, city, level)
                        if key in seen:
                            continue
                        seen.add(key)
                        records.append({
                            'code': code,
                            'name': nm,
                            'city': city,
                            'level': level,
                            'hospitalAccredResult': hosp_result,
                            'teachingAccredResult': teach_result,
                            'hospitalAccredYear': hosp_year,
                            'teachingAccredYear': teach_year,
                            'hospitalAccredPeriod': hosp_period,
                            'teachingAccredPeriod': teach_period,
                            'phone': '；'.join(phone_lines) if phone_lines else '',
                            'address': addr.replace('\n', ' '),
                        })

    LEVEL_ORDER = {'醫學中心': 0, '區域醫院': 1, '地區醫院': 2}
    records.sort(key=lambda h: (h['city'], LEVEL_ORDER.get(h['level'], 9), h['name']))
    return records


def write_outputs(records):
    os.makedirs('data', exist_ok=True)

    out = {
        'source': '108-114年醫院評鑑及教學醫院評鑑(含兒醫)合格名單.pdf',
        'publisher': '衛生福利部',
        'extractedAt': '2026-06-19',
        'total': len(records),
        'fields': {
            'code': '機構代碼（10 碼）',
            'name': '機構名稱',
            'city': '所在縣市',
            'level': '評鑑類別（醫學中心 / 區域醫院 / 地區醫院）',
            'hospitalAccredResult': '醫院評鑑結果',
            'teachingAccredResult': '教學醫院評鑑結果',
            'hospitalAccredYear': '醫院評鑑年度',
            'teachingAccredYear': '教學醫院評鑑年度',
            'hospitalAccredPeriod': '醫院評鑑期效',
            'teachingAccredPeriod': '教學醫院評鑑期效',
            'phone': '機構電話',
            'address': '機構地址',
        },
        'hospitals': records,
    }
    with open('data/hospitals.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    with open('data/hospitals.csv', 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(out['fields'].keys()))
        writer.writeheader()
        for r in records:
            writer.writerow(r)

    readme = (
        '# 醫院評鑑名單資料\n\n'
        '## 檔案\n\n'
        '- `hospitals.json` — 結構化 JSON，含 metadata 與 12 個欄位\n'
        '- `hospitals.csv` — Excel 友善 CSV（含 UTF-8 BOM）\n\n'
        '## 來源\n\n'
        '衛生福利部「108-114 年醫院評鑑及教學醫院評鑑（含兒醫）合格名單」PDF\n\n'
        '## 欄位說明（共 12 個）\n\n'
        '| 欄位 | 中文 | 範例 |\n'
        '|---|---|---|\n'
        '| code | 機構代碼（10 碼） | 1101100011 |\n'
        '| name | 機構名稱 | 台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院 |\n'
        '| city | 所在縣市 | 臺北市 |\n'
        '| level | 評鑑類別 | 醫學中心 / 區域醫院 / 地區醫院 |\n'
        '| hospitalAccredResult | 醫院評鑑結果 | 醫院評鑑優等（醫學中心） |\n'
        '| teachingAccredResult | 教學醫院評鑑結果 | 教學醫院評鑑合格 |\n'
        '| hospitalAccredYear | 醫院評鑑年度 | 112 |\n'
        '| teachingAccredYear | 教學醫院評鑑年度 | 112 |\n'
        '| hospitalAccredPeriod | 醫院評鑑期效 | 113/1/1-118/12/31 |\n'
        '| teachingAccredPeriod | 教學評鑑期效 | 113/1/1-118/12/31 |\n'
        '| phone | 機構電話 | 02-25433535 |\n'
        '| address | 機構地址 | 臺北市中山區中山北路二段92號 |\n\n'
        '## 與 `js/hospitals.js` 的差異\n\n'
        '- `js/hospitals.js` 是給前端 autocomplete 用的輕量版，只有 `{ name, city, level }`\n'
        f'- 本目錄是完整版，保留全部 PDF 欄位（共 {len(records)} 家）\n'
        '- 兩者醫院總數應一致，可用 `code` 互相對應\n\n'
        '## 更新方式\n\n'
        '如果 PDF 有新版（衛福部年度更新時），重跑 `python tools/extract-hospitals.py` 即可重新產生。\n'
    )
    with open('data/hospitals-README.md', 'w', encoding='utf-8') as f:
        f.write(readme)


def main():
    if not os.path.exists(PDF_PATH):
        print(f'錯誤：找不到 PDF 來源：{PDF_PATH}', file=sys.stderr)
        sys.exit(1)

    records = extract()
    write_outputs(records)

    lv_count = Counter(r['level'] for r in records)
    city_count = Counter(r['city'] for r in records)
    print(f'總計 {len(records)} 家醫院')
    print(f'  醫學中心: {lv_count["醫學中心"]} 家')
    print(f'  區域醫院: {lv_count["區域醫院"]} 家')
    print(f'  地區醫院: {lv_count["地區醫院"]} 家')
    print()
    print('Top 5 縣市:')
    for city, n in sorted(city_count.items(), key=lambda x: -x[1])[:5]:
        print(f'  {city}: {n} 家')
    print()
    print('寫入：')
    print(f'  data/hospitals.json ({os.path.getsize("data/hospitals.json"):,} bytes)')
    print(f'  data/hospitals.csv  ({os.path.getsize("data/hospitals.csv"):,} bytes)')
    print(f'  data/hospitals-README.md ({os.path.getsize("data/hospitals-README.md"):,} bytes)')


if __name__ == '__main__':
    main()
