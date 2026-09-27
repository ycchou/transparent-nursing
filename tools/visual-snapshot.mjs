#!/usr/bin/env node
/*
 * 視覺回歸：逐頁截圖（手機 390px ＋ 桌機 1280px），供 tools/visual-diff.py 比對整理前後是否有畫面變化。
 *
 * 用法：
 *   node tools/visual-snapshot.mjs before            # 截圖存到 .build-cache/visual/before/
 *   （改程式）
 *   node tools/visual-snapshot.mjs after
 *   python tools/visual-diff.py before after         # 列出有差異的頁面、輸出差異圖
 *
 *   node tools/visual-snapshot.mjs before index,stats   # 只截指定頁（也可指定情境名，如 hospital~chart）
 *   VISUAL_ROOT=/path/to/舊版 node tools/visual-snapshot.mjs before   # 對另一份程式截圖（例如 git worktree 的舊 commit）
 *
 * 除了每頁預設畫面，還有互動情境（tools/lib/headless.mjs 的 SCENARIOS）：單一醫院的圖表、
 * 統計頁官方分頁、薪資試算、分享圖。可重現性的處理（固定亂數／時間、關動畫…）也在該模組。
 * 本站資源回應 4xx／5xx 時會列出並 exit 2（例如 build-site.py 的白名單漏了檔案）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO, VIEWPORTS, openSession, targets } from './lib/headless.mjs';

const ROOT = process.env.VISUAL_ROOT ? path.resolve(process.env.VISUAL_ROOT) : REPO;
const label = process.argv[2];
if (!label) {
  console.error('用法：node tools/visual-snapshot.mjs <標籤> [頁面,頁面…]');
  process.exit(1);
}
const OUT = path.join(REPO, '.build-cache', 'visual', label);
const PAGES = targets(ROOT, process.argv[3]);
const MAX_HEIGHT = 9000;   // 超長頁只截前段，避免單張圖過大

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const s = await openSession({ root: ROOT });
let n = 0;
try {
  for (const vp of VIEWPORTS) {
    await s.setViewport(vp);
    for (const t of PAGES) {
      for (let attempt = 1; ; attempt++) {
        try {
          const page = await s.load(t);
          for (const e of page.errors.filter((x) => x.startsWith('情境步驟失敗'))) console.warn(`\n⚠ ${t.name}：${e}`);
          let shot;
          if (t.viewport) {
            shot = await s.send('Page.captureScreenshot', { format: 'png' });
          } else {
            // 全頁截圖前捲回頂端：用網址打開醫院等情境會自動捲動，固定定位的 header 位置會隨捲動時間點而不同
            await s.evaluate('window.scrollTo(0, 0); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
            const h = Math.min(await s.evaluate('Math.ceil(document.documentElement.scrollHeight)'), MAX_HEIGHT);
            shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
              clip: { x: 0, y: 0, width: vp.width, height: h, scale: 1 } });
          }
          fs.writeFileSync(path.join(OUT, `${t.name}@${vp.name}.png`), Buffer.from(shot.data, 'base64'));
          break;
        } catch (e) {
          if (attempt >= 2) throw new Error(`${t.name}@${vp.name}：${e.message}`);
          console.warn(`\n⚠ ${t.name}@${vp.name}：${e.message}，重試`);
          await s.send('Page.navigate', { url: 'about:blank' }).catch(() => {});
        }
      }
      n++;
      process.stdout.write(`\r截圖 ${n}/${PAGES.length * VIEWPORTS.length}  ${t.name}@${vp.name}        `);
    }
  }
  console.log(`\n✔ 已存到 ${path.relative(REPO, OUT)}/`);
  if (s.missing.size) {
    console.log(`⚠ 本站資源找不到（${s.missing.size}）：`);
    for (const [u, where] of s.missing) console.log(`   ${u}  （${where}）`);
    process.exitCode = 2;
  }
} finally {
  await s.close();
}
process.exit(process.exitCode || 0);
