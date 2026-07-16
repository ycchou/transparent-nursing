#!/usr/bin/env python3
"""
從官方年度報表 ODS 重建醫院財務資料集。

來源：data/財務報告醫院醫療服務申報情形/*.ods（衛福部・健保署「醫院財務資訊公開」
      年度報表，民國 104–113，每年一檔）。同一份財務揭露，但年度報表比即時查詢站
      （RGFE0030S01，F1–F8）多帶 8 個營運欄位與「分區」維度。

輸出（沿用舊 schema 形狀，再擴充欄位；取代 tools/fetch-hospital-financials.py 的主來源角色）：
  - data/hospital-financials.json      全量（財務比較表用）
  單院小檔 data/financials/{code}.json 由 tools/split-hospital-data.py 依此檔拆出（勿在此重複產生）。

各年欄位順序相對「院所代號」固定，故以「院所代號」欄索引 p 為錨相對取值，
不受各年標題用詞（醫療↔醫務）或是否有「流水號」前綴影響。

用法：python tools/build-financials.py
需求：pip install odfpy pandas
"""

import glob
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ODS_DIR = os.path.join(ROOT, "data", "財務報告醫院醫療服務申報情形")
LIST_FILE = os.path.join(ROOT, "data", "hospital-financials-list.json")
OUT_FILE = os.path.join(ROOT, "data", "hospital-financials.json")

SOURCE = "https://med.nhi.gov.tw/rgfe0000/RGFE0030S01.aspx"

# 欄位 metadata（既有 F1–F8 沿用舊 title；新增營運欄位）
FIELDS = {
    "F1": {"title": "醫務本業利益/虧損", "rankTitle": "醫務本業利益/虧損排名", "unit": "億元"},
    "F2": {"title": "非醫務本業利益/虧損", "rankTitle": "非醫務本業利益/虧損排名", "unit": "億元"},
    "F3": {"title": "整體獲利/虧損", "rankTitle": "整體獲利/虧損排名", "unit": "億元"},
    "F5": {"title": "醫務利益率", "rankTitle": "醫務利益率排名", "unit": "百分比"},
    "F6": {"title": "醫務收入", "rankTitle": "醫務收入排名", "unit": "億元"},
    "F7": {"title": "醫務成本", "rankTitle": "醫務成本排名", "unit": "億元"},
    "F8": {"title": "全日平均護病比", "rankTitle": "全日平均護病比排名", "unit": "人"},
    "DOCTOR": {"title": "醫師數", "rankTitle": "醫師數排名", "unit": "人數"},
    "BED": {"title": "病床數", "rankTitle": "病床數排名", "unit": "床"},
    "PT_ALL": {"title": "門住合計醫療點數", "rankTitle": "門住合計醫療點數排名", "unit": "億點"},
    "OPD_CNT": {"title": "門診件數", "rankTitle": "門診件數排名", "unit": "萬件"},
    "OPD_PT": {"title": "門診醫療點數", "rankTitle": "門診醫療點數排名", "unit": "億點"},
    "IPD_CNT": {"title": "住診件數", "rankTitle": "住診件數排名", "unit": "萬件"},
    "IPD_PT": {"title": "住診醫療點數", "rankTitle": "住診醫療點數排名", "unit": "億點"},
    "IPD_DAY": {"title": "住院天數", "rankTitle": "住院天數排名", "unit": "萬日"},
}

# 相對「院所代號」欄索引 p 的位移（分區/特約/名稱 + 各數值欄）
OFFSETS = {
    "REGION": -2,
    "HOSP_CNT_TYPNAM": -1,
    "NAME": +1,
    "F1": +2,
    "F3": +3,
    "DOCTOR": +4,
    "BED": +5,
    "PT_ALL": +6,
    "OPD_CNT": +7,
    "OPD_PT": +8,
    "IPD_CNT": +9,
    "IPD_PT": +10,
    "IPD_DAY": +11,
    "F6": +12,
    "F7": +13,
    "F5": +14,
    "F8": +15,
}

# 依各年度所有申報院所重算排名的欄位（值越大排名 1）
RANK_KEYS = ["F1", "F3", "F5", "F6", "DOCTOR", "BED", "OPD_CNT", "IPD_DAY"]


def norm_code(raw):
    """院所代號正規化：數字補零至 10 碼；字母代號保留原樣。無效回 None。"""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    if isinstance(raw, int):
        return str(raw).zfill(10)
    s = str(raw).strip()
    if not s:
        return None
    if s.isdigit():
        return s.zfill(10)
    return s  # 字母代號（JY…）


def norm_region(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s.replace("台北", "臺北") if s else None


def norm_text(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s or None


def to_num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("%", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fmt2(v):
    n = to_num(v)
    return None if n is None else f"{n:.2f}"


def fmt1(v):
    n = to_num(v)
    return None if n is None else f"{n:.1f}"


def fmt_int(v):
    n = to_num(v)
    return None if n is None else str(int(round(n)))


def fmt_pct(v):
    """醫務利益率：ODS 存小數（0.0102…）→ '1.03%'。"""
    n = to_num(v)
    return None if n is None else f"{n * 100:.2f}%"


def find_code_anchor(df):
    """回傳 (header_row, code_col)：含『院所代號』且欄索引最小者。找不到回 (None, None)。

    106 檔右側附掛原始 DB dump（40 欄），最左區塊才是乾淨資料，故取最小欄索引。
    """
    best = None
    for r in range(min(6, len(df))):
        for c in range(df.shape[1]):
            cell = df.iat[r, c]
            if isinstance(cell, str) and "院所代號" in cell:
                if best is None or c < best[1]:
                    best = (r, c)
    return best if best else (None, None)


def parse_ods(path, year):
    df = pd.read_excel(path, engine="odf", sheet_name=0, header=None)
    hr, p = find_code_anchor(df)
    if hr is None:
        raise ValueError(f"{path}: 找不到『院所代號』欄")

    rows = []
    for r in range(hr + 1, len(df)):
        code = norm_code(df.iat[r, p])
        if not code:
            continue
        name = norm_text(df.iat[r, p + OFFSETS["NAME"]])
        if not name:
            continue

        def cell(key):
            col = p + OFFSETS[key]
            return df.iat[r, col] if 0 <= col < df.shape[1] else None

        f1 = to_num(cell("F1"))
        f3 = to_num(cell("F3"))
        f2 = None if (f1 is None or f3 is None) else f3 - f1

        row = {
            "code": code,
            "name": name,
            "YEAR": year,
            "REGION": norm_region(cell("REGION")),
            "HOSP_CNT_TYPNAM": norm_text(cell("HOSP_CNT_TYPNAM")),
            "F1Val": fmt2(f1),
            "F2Val": None if f2 is None else f"{f2:.2f}",
            "F3Val": fmt2(f3),
            "F5Val": fmt_pct(cell("F5")),
            "F6Val": fmt2(cell("F6")),
            "F7Val": fmt2(cell("F7")),
            "F8Val": fmt1(cell("F8")),
            "DOCTORVal": fmt_int(cell("DOCTOR")),
            "BEDVal": fmt_int(cell("BED")),
            "PT_ALLVal": fmt2(cell("PT_ALL")),
            "OPD_CNTVal": fmt2(cell("OPD_CNT")),
            "OPD_PTVal": fmt2(cell("OPD_PT")),
            "IPD_CNTVal": fmt2(cell("IPD_CNT")),
            "IPD_PTVal": fmt2(cell("IPD_PT")),
            "IPD_DAYVal": fmt2(cell("IPD_DAY")),
        }
        rows.append(row)
    return rows


def assign_ranks(all_rows_by_year):
    """就地為每年度、每個 RANK_KEYS 欄位寫入 {key}Rank（值越大排名 1）。"""
    for year, rows in all_rows_by_year.items():
        for key in RANK_KEYS:
            valued = [r for r in rows if to_num(r.get(f"{key}Val")) is not None]
            valued.sort(key=lambda r: to_num(r[f"{key}Val"]), reverse=True)
            for i, r in enumerate(valued, 1):
                r[f"{key}Rank"] = i


def load_shortnames():
    """code → shortName（沿用既有清單）。"""
    try:
        doc = json.load(open(LIST_FILE, encoding="utf-8"))
        return {h["code"]: h.get("shortName", "") for h in doc.get("hospitals", [])}
    except Exception:
        return {}


def main():
    files = sorted(glob.glob(os.path.join(ODS_DIR, "*.ods")))
    if not files:
        print(f"找不到 ODS：{ODS_DIR}")
        sys.exit(1)

    shortnames = load_shortnames()

    by_year = {}          # year → [row]
    hosp = {}             # code → { code, name, shortName, rows: {year: row} }
    for path in files:
        m = re.search(r"(\d{3})年", os.path.basename(path))
        if not m:
            print(f"略過（無年度）：{path}")
            continue
        year = m.group(1)
        rows = parse_ods(path, year)
        by_year[year] = rows
        print(f"  {year} 年：{len(rows)} 家")
        for row in rows:
            code = row["code"]
            h = hosp.setdefault(code, {"code": code, "names": {}, "rows": {}})
            h["names"][year] = row["name"]
            h["rows"][year] = row

    assign_ranks(by_year)

    # 組出各院最終物件：name 取最新年度、依年度排序 rows、清掉暫存欄
    def clean_row(row):
        out = {"YEAR": row["YEAR"], "HOSP_CNT_TYPNAM": row.get("HOSP_CNT_TYPNAM"),
               "REGION": row.get("REGION")}
        for key in ["F1", "F2", "F3", "F5", "F6", "F7", "F8", "DOCTOR", "BED",
                    "PT_ALL", "OPD_CNT", "OPD_PT", "IPD_CNT", "IPD_PT", "IPD_DAY"]:
            v = row.get(f"{key}Val")
            if v is not None:
                out[f"{key}Val"] = v
            rk = row.get(f"{key}Rank")
            if rk is not None:
                out[f"{key}Rank"] = rk
        return out

    hospitals = []
    for code, h in hosp.items():
        latest_year = max(h["names"].keys(), key=int)
        rows_sorted = [clean_row(h["rows"][y]) for y in sorted(h["rows"].keys(), key=int)]
        hospitals.append({
            "code": code,
            "name": h["names"][latest_year],
            "shortName": shortnames.get(code, ""),
            "rows": rows_sorted,
        })

    # 排序：依最新年度整體結餘（F3）遞減，無值置後（僅影響輸出穩定性）
    def sort_key(h):
        last = h["rows"][-1] if h["rows"] else {}
        v = to_num(last.get("F3Val"))
        return (0, -v) if v is not None else (1, 0)
    hospitals.sort(key=sort_key)

    doc = {
        "generatedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "source": SOURCE,
        "sourceNote": "衛生福利部・健保署「醫院財務資訊公開」年度報表（民國 104–113）",
        "fields": FIELDS,
        "count": len(hospitals),
        "hospitals": hospitals,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f"✔ 全量 {len(hospitals)} 家 → {OUT_FILE}")
    print("  （單院小檔請跑 tools/split-hospital-data.py 拆出）")


if __name__ == "__main__":
    main()
