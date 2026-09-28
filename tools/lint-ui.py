#!/usr/bin/env python3
"""
UI 小規則檢查（CI 的 check job 會跑）。

目前只有一條：關閉鈕不可用文字「×」（或 &times; ✕ ✖）當圖示，要用 icon('x') 的 SVG。
各字型的 × 基線不同、無法真正置中，這是全站關閉鈕反覆歪掉的根因。見 css/src/24-close-buttons.css。

用法：python tools/lint-ui.py   （有違規時列出位置並 exit 1）
"""
import glob
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = glob.glob(os.path.join(ROOT, 'js', '*.js')) + glob.glob(os.path.join(ROOT, '*.html')) + \
    glob.glob(os.path.join(ROOT, 'templates', '*.html'))

# 一個 <button …> 開頭、屬性裡有 close／關閉，內容（去掉空白）只有 × 類字元
CLOSE_BTN = re.compile(r'<button\b[^>]*(?:close|關閉)[^>]*>\s*(?:×|&times;|✕|✖)\s*</button>', re.I)

bad = []
for path in FILES:
    text = open(path, encoding='utf-8').read()
    for m in CLOSE_BTN.finditer(text):
        line = text.count('\n', 0, m.start()) + 1
        bad.append(f'{os.path.relpath(path, ROOT)}:{line}  {m.group(0)[:90]}')

if bad:
    print('✘ 關閉鈕用了文字「×」，請改成 ${icon(\'x\', { size: 18 })}（見 css/src/24-close-buttons.css）：')
    print('\n'.join('   ' + b for b in bad))
    sys.exit(1)
print('✔ UI 檢查通過（關閉鈕皆使用 SVG 圖示）')
