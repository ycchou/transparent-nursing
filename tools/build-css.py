#!/usr/bin/env python3
"""
串接 css/src/*.css → css/styles.css（網站實際載入的單一檔）。

樣式原始碼依區域拆在 css/src/，檔名的數字前綴就是串接順序（＝ CSS 疊加順序，後面的蓋前面）。
瀏覽器仍只載入一個 css/styles.css，效能與拆檔前相同。

  · 改樣式：改 css/src/ 下的檔案，再跑本工具（tools/build-all.py 最後會自動跑）
  · 不要直接改 css/styles.css——下次建置會被覆蓋；validate-data.py 也會檢查兩者是否一致
  · 新增檔案：取一個數字前綴放進適當的疊加位置即可，不必改任何頁面

用法：python tools/build-css.py [--check]   （--check：只檢查是否已是最新，不寫檔；過期時 exit 1）
"""
import glob
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'css', 'src')
OUT = os.path.join(ROOT, 'css', 'styles.css')
BANNER = ('/* 此檔由 tools/build-css.py 從 css/src/*.css 串接產生，請勿直接修改——'
          '改 css/src/ 後重跑 python tools/build-css.py */\n')


def build():
    files = sorted(glob.glob(os.path.join(SRC, '*.css')))
    if not files:
        sys.exit('✘ css/src/ 沒有任何 .css')
    parts = []
    for f in files:
        with open(f, encoding='utf-8') as fp:
            parts.append(fp.read())
    return BANNER + ''.join(parts), files


def main():
    out, files = build()
    try:
        with open(OUT, encoding='utf-8') as fp:
            cur = fp.read()
    except OSError:
        cur = None
    if '--check' in sys.argv:
        if cur != out:
            sys.exit('✘ css/styles.css 與 css/src/ 不一致：請跑 python tools/build-css.py')
        print('✔ css/styles.css 是最新的')
        return
    if cur == out:
        print(f'✔ css/styles.css 無變動（{len(files)} 個原始檔）')
        return
    with open(OUT, 'w', encoding='utf-8') as fp:
        fp.write(out)
    print(f'✔ 已串接 {len(files)} 個原始檔 → css/styles.css（{out.count(chr(10))} 行）')


if __name__ == '__main__':
    main()
