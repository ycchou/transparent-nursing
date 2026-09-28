"""
醫院換碼對照（data/manual/hospital-successors.json）的共用讀取。

同一家醫院改制／換機構代號時，建置工具在讀入資料當下就把舊碼換成新碼，
讓護病比、人力、財報的歷史接成同一條時間線；新碼記錄另帶 formerCodes。

用法（tools/ 下的腳本）：from hospital_successors import canonical_code, former_codes, is_former
"""
import json
import os

_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     'data', 'manual', 'hospital-successors.json')


def _load():
    try:
        with open(_PATH, encoding='utf-8') as fp:
            raw = json.load(fp).get('successors', {})
    except OSError:
        return {}
    return {old: v['to'] for old, v in raw.items()}


SUCCESSORS = _load()


def canonical_code(code):
    """舊碼 → 現行碼（可多段換碼）；非舊碼原樣回傳。"""
    seen = set()
    while code in SUCCESSORS and code not in seen:
        seen.add(code)
        code = SUCCESSORS[code]
    return code


def is_former(code):
    return code in SUCCESSORS


def former_codes():
    """現行碼 → [舊碼…]（排序）。"""
    out = {}
    for old in SUCCESSORS:
        out.setdefault(canonical_code(old), []).append(old)
    return {k: sorted(v) for k, v in out.items()}
