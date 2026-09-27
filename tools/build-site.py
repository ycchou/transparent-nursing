#!/usr/bin/env python3
"""
組出要部署的網站：只複製瀏覽器實際會用到的檔案到 _site/（GitHub Actions 上傳這個資料夾）。

以前是整個 repo 根目錄原封不動部署，連同 300 多個原始 PDF／ODS（約 250MB）、tools/、
Cloudflare Worker 與 Apps Script 原始碼、樣板都公開在網站路徑上，部署也慢。
改成白名單：新增要公開的檔案類型時，改下面的 INCLUDE 即可。

用法：python tools/build-site.py [輸出資料夾，預設 _site]
"""
import fnmatch
import os
import shutil
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 要部署的檔案（相對 repo 根目錄的 glob；* 不跨資料夾，** 跨資料夾）
INCLUDE = [
    '*.html', 'manifest.json', 'robots.txt', 'sitemap.xml',
    'css/styles.css',                    # 只要串接後的產物；css/src/ 是原始碼
    'js/*.js',
    'assets/**',
    'slides/*.html',                     # 對外分享過網址的簡報頁
    'data/*.json',                       # 整理後的資料（原始 PDF／ODS 不部署）
    'data/financials/*.json',
    'data/personnel/*.json',
    'data/nurse-ratio/by-code/*.json',
    'data/manual/*.json',
    'data/mock/*.csv',                   # 測試資料（?data=mock）
]


def match(path, pattern):
    if '**' in pattern:
        return path.startswith(pattern.split('**')[0])
    # * 不跨資料夾
    return fnmatch.fnmatch(path, pattern) and path.count('/') == pattern.count('/')


def tracked_files():
    """只部署已進版控的檔案（本機的暫存、快取、.build-cache 不會混進去）"""
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout
    return [p for p in out.decode('utf-8').split('\0') if p]


def main():
    dest = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else '_site')
    if os.path.exists(dest):
        shutil.rmtree(dest)
    files = [p for p in tracked_files() if any(match(p, pat) for pat in INCLUDE)]
    size = 0
    for rel in files:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        size += os.path.getsize(src)
    print(f'✔ {len(files)} 個檔案（{size / 1024 / 1024:.1f} MB）→ {os.path.relpath(dest, ROOT)}/')


if __name__ == '__main__':
    main()
