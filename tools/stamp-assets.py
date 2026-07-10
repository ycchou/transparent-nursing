#!/usr/bin/env python3
"""
自動化資產破快取：以「內容雜湊」蓋掉所有 ?v= 版本號，取代手動逐檔升版。

問題：本站以 `import './x.js?v=NN'` / `fetch('data/x.json?v=NN')` 破快取，過去每次改
一支共用模組就要手動去所有 importer + HTML 逐一升版，漏一個就會載到舊模組（stale）。

做法：掃描所有 *.html 與 js/*.js，把每個 `<路徑>?v=XXX` 的 XXX 換成「該目標檔內容的
sha1 前 10 碼」。只有內容真的變的檔會換到新雜湊、才會 bust；沒變的維持不動。
用 fixed-point 疊代處理相依關係（A 引 B，B 變 → A 對 B 的 URL 變 → A 內容變 → A 的
雜湊變 → A 的 importer 也跟著換），收斂為止，無需人工排序。

用法：python tools/stamp-assets.py       （改完程式、部署前跑一次）
      python tools/stamp-assets.py --check（CI 用：若有檔需更新則非 0 退出，不寫檔）
"""
import os
import re
import sys
import glob
import hashlib

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 匹配 <路徑>.js|.json|.css?v=XXX（本地資產；CDN 無 ?v= 不會中）
REF_RE = re.compile(r'((?:\.{0,2}/)?[\w./@-]+\.(?:js|json|css))\?v=[\w]+')
HASH_LEN = 10


def resolve_target(ref, src_abs):
    """把參照路徑解析成實體檔案絕對路徑；解析不到（含 ${} 動態路徑）回 None。"""
    if '${' in ref or '{' in ref:
        return None
    # data/ 開頭 → 相對 repo root（fetch 以文件根為基準）
    m = re.match(r'\.{0,2}/?(data/.+)$', ref)
    if m:
        return os.path.join(ROOT, m.group(1))
    # 其餘 → 相對「參照所在檔」的目錄（ES import 語意）
    return os.path.normpath(os.path.join(os.path.dirname(src_abs), ref))


def main():
    check_only = '--check' in sys.argv

    src_files = sorted(glob.glob(os.path.join(ROOT, '*.html')) +
                       glob.glob(os.path.join(ROOT, 'js', '*.js')))
    # newline='' 保留原始換行（CRLF/LF），使記憶體字串 == 磁碟位元組
    sources = {p: open(p, encoding='utf-8', newline='').read() for p in src_files}

    def strip_tokens(b):
        return re.sub(rb'\?v=[\w]+', b'?v=', b)

    # 兩層策略：
    #  A) 程式碼(js)：全站共用「單一 CODE_TOKEN」。任何 js 邏輯變 → 整包 js 一起 bust。
    #     以「去掉 ?v= 後的所有 js 內容」算雜湊 → 冪等、無循環相依/振盪問題。
    #  B) 資料(data/*.json)：各自「逐檔內容雜湊」→ 只有該資料變才 bust（保留資料可快取性）。
    js_files = sorted(glob.glob(os.path.join(ROOT, 'js', '*.js')))
    h = hashlib.sha1()
    for jf in js_files:
        with open(jf, 'rb') as f:
            h.update(strip_tokens(f.read()))
    code_token = h.hexdigest()[:HASH_LEN]

    data_hash_cache = {}

    def data_hash(path):
        if path not in data_hash_cache:
            with open(path, 'rb') as f:
                data_hash_cache[path] = hashlib.sha1(f.read()).hexdigest()[:HASH_LEN]
        return data_hash_cache[path]

    unresolved = set()

    def stamp(text, src):
        def repl(mo):
            ref = mo.group(1)
            tgt = resolve_target(ref, src)
            if not tgt or not os.path.exists(tgt):
                if not (tgt is None and '{' in ref):
                    unresolved.add((os.path.relpath(src, ROOT), ref))
                return mo.group(0)
            token = code_token if tgt.endswith('.js') else data_hash(tgt)
            return f'{ref}?v={token}'
        return REF_RE.sub(repl, text)

    for src in list(sources):
        sources[src] = stamp(sources[src], src)

    # 動態路徑（模板字串 ${...}）無法逐檔雜湊，改用「同批重建的代理檔」雜湊當版本：
    #   personnel/${id}       → personnel-index.json
    #   nurse-ratio/by-code   → nurse-ratio.json
    #   financials/${code}    → hospital-financials.json
    DYNAMIC_PROXY = [
        (r"(data/personnel/\$\{[^}]+\}\.json)\?v=[\w]+", 'personnel-index.json'),
        (r"(data/nurse-ratio/by-code/\$\{[^}]+\}\.json)\?v=[\w]+", 'nurse-ratio.json'),
        (r"(data/financials/\$\{[^}]+\}\.json)\?v=[\w]+", 'hospital-financials.json'),
    ]
    for pat, proxy in DYNAMIC_PROXY:
        pf = os.path.join(ROOT, 'data', proxy)
        if not os.path.exists(pf):
            continue
        pv = data_hash(pf)
        for src in list(sources):
            sources[src] = re.sub(pat, rf"\1?v={pv}", sources[src])

    # 比對磁碟、決定要不要寫
    dirty = []
    for p, t in sources.items():
        if open(p, encoding='utf-8', newline='').read() != t:
            dirty.append(p)

    if unresolved:
        print('⚠ 解析不到的參照（保持原樣，請檢查）：')
        for s, r in sorted(unresolved):
            print(f'    {s}  ->  {r}')

    if check_only:
        if dirty:
            print(f'需更新 {len(dirty)} 檔（請跑 python tools/stamp-assets.py）：')
            for p in dirty:
                print('    ' + os.path.relpath(p, ROOT))
            sys.exit(1)
        print('✔ 所有 ?v= 均為最新內容雜湊')
        return

    for p in dirty:
        open(p, 'w', encoding='utf-8', newline='').write(sources[p])
    print(f'✔ 已更新 {len(dirty)} 檔的 ?v= 內容雜湊' if dirty else '✔ 無需更新（已是最新）')


if __name__ == '__main__':
    main()
