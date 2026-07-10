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


MP_RE = re.compile(r'[ \t]*<link rel="modulepreload" href="\./js/[^"]+"\s*/>\r?\n')
IMPORT_FROM_RE = re.compile(r"from\s+'\./([\w-]+\.js)")            # js 內靜態 import（排除動態 import()）
HTML_SRC_RE = re.compile(r'<script[^>]*type="module"[^>]*src="\./js/([\w-]+\.js)')
HTML_BLOCK_RE = re.compile(r'<script[^>]*type="module"[^>]*>(.*?)</script>', re.S)
HTML_IMPORT_RE = re.compile(r"from\s+'\./js/([\w-]+\.js)")


def _js_static_deps(name, sources):
    text = sources.get(os.path.join(ROOT, 'js', name))
    if text is None:
        p = os.path.join(ROOT, 'js', name)
        text = open(p, encoding='utf-8', newline='').read() if os.path.exists(p) else ''
    return set(IMPORT_FROM_RE.findall(text))


def _closure(entries, sources):
    seen, stack = set(), list(entries)
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        stack += [d for d in _js_static_deps(n, sources) if d not in seen]
    return seen


def regen_modulepreloads(sources):
    """每頁重算「完整靜態 import 圖」並改寫 <link rel=modulepreload>，讓整包模組平行下載、
    消除 ES module 逐層探索的請求瀑布。動態 import() 的懶載模組不列入（維持懶載）。"""
    for html in [p for p in sources if p.endswith('.html')]:
        text = sources[html]
        m0 = MP_RE.search(text)
        if not m0:
            continue  # 無現成 modulepreload 區塊 → 不亂插
        entries = set(HTML_SRC_RE.findall(text))
        for block in HTML_BLOCK_RE.findall(text):
            entries |= set(HTML_IMPORT_RE.findall(block))
        if not entries:
            continue
        indent = re.match(r'[ \t]*', m0.group(0)).group(0)
        nl = '\r\n' if '\r\n' in m0.group(0) else '\n'
        mods = sorted(_closure(entries, sources))
        blk = ''.join(f'{indent}<link rel="modulepreload" href="./js/{n}?v=0" />{nl}' for n in mods)
        first = m0.start()
        wo = MP_RE.sub('', text)           # first 之前無 modulepreload，故位置不位移
        sources[html] = wo[:first] + blk + wo[first:]


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

    # 先重算各頁完整 modulepreload（寫 ?v=0），下方 ?v= 蓋雜湊時一併填入 code_token
    regen_modulepreloads(sources)

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
