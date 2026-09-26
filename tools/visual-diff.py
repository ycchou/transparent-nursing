#!/usr/bin/env python3
"""
比對兩次 visual-snapshot.mjs 的截圖，列出有畫面差異的頁面。

用法：python tools/visual-diff.py before after [--tolerance N]
  --tolerance N  忽略每個色彩通道差 ≤ N 的像素（圖表 canvas 反鋸齒偶有 ±1 的誤差；預設 0＝逐像素嚴格比對）
輸出：.build-cache/visual/diff-<before>-<after>/ 內每個有差異頁面的比對圖
      （左：前、中：後、右：差異以紅色標出）。完全相同時 exit 0，有差異時 exit 1。
需要：pip install pillow
"""
import os
import sys

from PIL import Image, ImageChops

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIS = os.path.join(ROOT, '.build-cache', 'visual')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    tol = int(sys.argv[sys.argv.index('--tolerance') + 1]) if '--tolerance' in sys.argv else 0
    if tol:
        args = [a for a in args if a != str(tol)]
    if len(args) < 2:
        sys.exit('用法：python tools/visual-diff.py <前> <後> [--tolerance N]')
    sys.argv[1:3] = args[:2]
    a_dir, b_dir = (os.path.join(VIS, x) for x in sys.argv[1:3])
    out = os.path.join(VIS, f'diff-{sys.argv[1]}-{sys.argv[2]}')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))

    names = sorted(set(os.listdir(a_dir)) | set(os.listdir(b_dir)))
    changed = []
    for name in names:
        pa, pb = os.path.join(a_dir, name), os.path.join(b_dir, name)
        if not (os.path.exists(pa) and os.path.exists(pb)):
            changed.append((name, '只存在一邊'))
            continue
        a, b = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        if a.size != b.size:
            changed.append((name, f'尺寸不同 {a.size[0]}×{a.size[1]} → {b.size[0]}×{b.size[1]}'))
            w, h = max(a.width, b.width), max(a.height, b.height)
            a2, b2 = Image.new('RGB', (w, h), 'white'), Image.new('RGB', (w, h), 'white')
            a2.paste(a); b2.paste(b); a, b = a2, b2
        diff = ImageChops.difference(a, b)
        if tol:
            diff = diff.point(lambda x: 0 if x <= tol else x)
        bbox = diff.getbbox()
        if not bbox and not (changed and changed[-1][0] == name):
            continue
        px = sum(1 for v in diff.convert('L').point(lambda x: 255 if x > 0 else 0).getdata() if v)
        if not changed or changed[-1][0] != name:
            changed.append((name, f'{px} 個像素不同，範圍 {bbox}'))
        # 比對圖：前｜後｜差異（紅）
        mask = diff.convert('L').point(lambda x: 255 if x > 0 else 0)
        red = Image.new('RGB', a.size, (230, 30, 30))
        hl = Image.composite(red, b.point(lambda x: int(x * 0.35 + 165)), mask)
        sheet = Image.new('RGB', (a.width * 3 + 20, a.height), 'white')
        for i, im in enumerate((a, b, hl)):
            sheet.paste(im, (i * (a.width + 10), 0))
        sheet.save(os.path.join(out, name.replace('.png', '.jpg')), quality=70)

    total = len(names)
    if not changed:
        print(f'✔ {total} 張截圖完全相同')
        return
    print(f'✘ {len(changed)}／{total} 張有差異（比對圖在 {os.path.relpath(out, ROOT)}/）：')
    for name, why in changed:
        print(f'  {name}：{why}')
    sys.exit(1)


if __name__ == '__main__':
    main()
