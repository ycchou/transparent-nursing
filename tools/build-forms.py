#!/usr/bin/env python3
"""
由樣板產生 5 個表單頁：templates/participate-form.html ＋ templates/forms.json → participate-<slug>.html

5 頁的骨架（head、表單容器、法律同意卡、送出列…）完全相同，只有標題、meta 描述、eyebrow、導言與
表單腳本不同。改共用部分只改樣板一處；新增表單類別：在 forms.json 加一筆＋寫 js/form-<slug>.js。

  · 不要直接改 participate-<slug>.html——下次建置會被覆蓋；validate-data.py 會檢查是否一致
  · 產生時沿用現有頁面的 ?v= 雜湊，之後由 stamp-assets.py 依內容更新（build-all.py 會依序執行）

用法：python tools/build-forms.py [--check]   （--check：只檢查是否最新，過期時 exit 1）
"""
import json
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'templates', 'participate-form.html')
CONFIG = os.path.join(ROOT, 'templates', 'forms.json')
V_RE = re.compile(r'((?:\.{0,2}/)?[\w./@-]+\.(?:js|json|css))\?v=\w+')
NOTICE = '<!-- 此檔由 tools/build-forms.py 從 templates/participate-form.html 產生，請勿直接修改 -->\n'


def render(tpl, form):
    out = tpl
    for key, val in form.items():
        out = out.replace('{{' + key + '}}', val)
    left = re.findall(r'\{\{(\w+)\}\}', out)
    if left:
        sys.exit(f'✘ forms.json 的「{form.get("slug")}」缺少欄位：{", ".join(sorted(set(left)))}')
    return out.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + NOTICE, 1) if out.startswith('<!DOCTYPE html>\n') else NOTICE + out


def sort_preloads(html):
    """連續的 <link rel="modulepreload"> 依字母排序——與 stamp-assets.py 維護的順序一致，
    否則每次建置兩個工具會互相改來改去（form-clinic／form-dialysis 排在 form-engine 前面）。"""
    lines = html.split('\n')
    out, block = [], []
    for ln in lines + ['']:
        if 'rel="modulepreload"' in ln:
            block.append(ln)
            continue
        if block:
            out.extend(sorted(block)); block = []
        out.append(ln)
    return '\n'.join(out[:-1])


def keep_versions(new, old):
    """沿用舊檔對同一資產的 ?v= 雜湊，產生的頁面立即可用（內容有變時 stamp-assets 會再更新）。"""
    ver = {m.group(1): m.group(0) for m in V_RE.finditer(old or '')}
    return V_RE.sub(lambda m: ver.get(m.group(1), m.group(0)), new)


def strip_v(s):
    return V_RE.sub(lambda m: m.group(1), s)


def main():
    check = '--check' in sys.argv
    with open(TEMPLATE, encoding='utf-8') as fp:
        tpl = fp.read()
    with open(CONFIG, encoding='utf-8') as fp:
        forms = json.load(fp)['forms']
    stale, written = [], 0
    for form in forms:
        path = os.path.join(ROOT, f'participate-{form["slug"]}.html')
        old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
        new = keep_versions(sort_preloads(render(tpl, form)), old)
        if old is not None and strip_v(old) == strip_v(new):
            continue
        if check:
            stale.append(os.path.basename(path))
            continue
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write(new)
        written += 1
    if check:
        if stale:
            sys.exit('✘ 表單頁與樣板不一致：' + '、'.join(stale) + '（請跑 python tools/build-forms.py；不要直接改這些頁面）')
        print(f'✔ {len(forms)} 個表單頁是最新的')
        return
    print(f'✔ 表單頁：{len(forms)} 頁，更新 {written} 頁')


if __name__ == '__main__':
    main()
