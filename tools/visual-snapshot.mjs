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
 * 除了每頁預設畫面，還有 SCENARIOS：用網址參數或點擊打開「互動後才出現」的畫面
 * （單一醫院的圖表、統計頁官方分頁、薪資試算、分享圖），整理圖表／分享圖程式時也能比對到。
 *
 * 為了讓「同一份程式截兩次得到完全相同的圖」，截圖時固定所有不穩定來源：
 *   · 測試資料（?data=mock）、每頁載入前清空 localStorage／sessionStorage
 *   · Math.random 改為固定種子、Date 固定在 2026-01-15 12:00（台北）
 *   · 擋掉線上訪客計數 API（workers.dev）
 *   · 關閉所有 CSS 動畫／過場、Chart.js 動畫，等字型與網路請求都靜止後才截
 *
 * 需要：Node 18+（內建 WebSocket／fetch）、Google Chrome（可用 CHROME_PATH 指定路徑）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.VISUAL_ROOT ? path.resolve(process.env.VISUAL_ROOT) : REPO;   // 要截圖的網站根目錄
const label = process.argv[2];
if (!label) {
  console.error('用法：node tools/visual-snapshot.mjs <標籤> [頁面,頁面…]');
  process.exit(1);
}
const OUT = path.join(REPO, '.build-cache', 'visual', label);
const ALL_PAGES = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !/^platform-full-/.test(f))
  .map((f) => f.replace(/\.html$/, ''))
  .sort();
// 互動情境：url 為相對路徑（會自動加 data=mock）；run 在頁面載入後執行（可 await），viewport 表示只截可視區（彈窗）
const HOSP = '1132070011';   // 林口長庚：護病比、人力、財務資料都齊全
const SCENARIOS = [
  { name: 'hospital~chart', url: `hospital.html?code=${HOSP}` },
  { name: 'nurse-ratio~chart', url: `nurse-ratio.html?id=${HOSP}` },
  { name: 'personnel~chart', url: `personnel.html?code=${HOSP}` },
  { name: 'financials~chart', url: `financials.html?code=${HOSP}` },
  { name: 'stats~official', url: 'stats.html#official' },
  { name: 'platform~calc', url: 'platform.html', viewport: true,
    run: `click('#calc-trigger'); await wait(300); type('#calc-salary', '80'); click('#calc-go');` },
  { name: 'platform~calc-share', url: 'platform.html', viewport: true,
    run: `click('#calc-trigger'); await wait(300); type('#calc-salary', '80'); click('#calc-go'); await wait(500); click('.calc-share-btn'); await waitFor('img[alt*="預覽"]');` },
  { name: 'platform~share', url: 'platform.html?id=1', viewport: true, run: `await wait(500); click('#modal-share-btn'); await waitFor('img[alt="分享圖片預覽"]');` },
];
const SCENARIO_HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error('找不到 ' + sel); el.click(); };
  const type = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  // 等元素出現（圖片則等到載入完成）；html2canvas 產圖這類非網路的非同步工作要靠它
  const waitFor = async (sel, ms = 20000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const el = document.querySelector(sel);
      if (el && (el.tagName !== 'IMG' || (el.complete && el.naturalWidth))) return el;
      await wait(100);
    }
    throw new Error('等不到 ' + sel);
  };`;
const withMock = (u) => { const [base, hash] = u.split('#'); return `${base}${base.includes('?') ? '&' : '?'}data=mock${hash ? '#' + hash : ''}`; };
const TARGETS = [
  ...ALL_PAGES.map((p) => ({ name: p, url: `${p}.html` })),
  ...SCENARIOS,
];
const PAGES = process.argv[3]
  ? TARGETS.filter((t) => process.argv[3].split(',').includes(t.name))
  : TARGETS;
const VIEWPORTS = [
  { name: 'm', width: 390, height: 844, mobile: true, dpr: 1 },
  { name: 'd', width: 1280, height: 800, mobile: false, dpr: 1 },
];
const MAX_HEIGHT = 9000;   // 超長頁只截前段，避免單張圖過大

// ---- 靜態伺服器（只讀 repo，綁 127.0.0.1）----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- 啟動 headless Chrome ----
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe']
  .find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome，請用 CHROME_PATH 指定'); process.exit(1); }
fs.mkdirSync(path.join(REPO, '.build-cache'), { recursive: true });
const profile = fs.mkdtempSync(path.join(REPO, '.build-cache', 'chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0',
  '--font-render-hinting=none', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  setTimeout(() => reject(new Error('Chrome 啟動逾時')), 15000);
});
const cleanup = () => { try { chrome.kill(); } catch {} server.close(); fs.rmSync(profile, { recursive: true, force: true }); };

// ---- CDP ----
const browserPort = new URL(wsUrl).port;
const tab = await (await fetch(`http://127.0.0.1:${browserPort}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const inflight = new Set();   // 以 requestId 追蹤；換頁時清空，被取消的舊請求不會卡住等待
let lastNet = Date.now();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent') { inflight.add(m.params.requestId); lastNet = Date.now(); }
  // 收到回應標頭就算結束：背景預熱快取的 fetch() 不讀 body，永遠等不到 loadingFinished；
  // 本機伺服器傳 body 幾乎不花時間，後面還有 800ms 靜止期，不影響截圖時機
  if (['Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed'].includes(m.method)) {
    inflight.delete(m.params.requestId); lastNet = Date.now();
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 每個新文件載入前注入：固定亂數與時間、關動畫
const DETERMINISM = `
(() => {
  try { localStorage.clear(); sessionStorage.clear(); } catch {}   // 每頁都當第一次造訪（資料快取、已關閉的提示等全部歸零）
  let s = 20260115;
  Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const FIXED = Date.UTC(2026, 0, 15, 4, 0, 0);
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } }
  window.Date = FixedDate;
  let chartRef;
  Object.defineProperty(window, 'Chart', { configurable: true,
    get() { return chartRef; },
    set(v) { chartRef = v; try { v.defaults.animation = false; v.defaults.animations = false; v.defaults.transitions = {}; } catch {} } });
  const css = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  const add = () => { const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;

await send('Page.enable');
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*workers.dev*', '*googletagmanager*', '*google-analytics*'] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: DETERMINISM });

async function waitQuiet(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (inflight.size === 0 && Date.now() - lastNet > 800) break;
    await sleep(100);
  }
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  await sleep(400);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
try {
  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
    for (const t of PAGES) {
      inflight.clear();
      await send('Page.navigate', { url: `${BASE}/${withMock(t.url)}` });
      await waitQuiet();
      if (t.run) {
        const r = await send('Runtime.evaluate', { expression: `(async () => { ${SCENARIO_HELPERS} ${t.run} })()`, awaitPromise: true });
        if (r.exceptionDetails) console.warn(`\n⚠ ${t.name}：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
        await waitQuiet();
      }
      let shot;
      if (t.viewport) {
        shot = await send('Page.captureScreenshot', { format: 'png' });
      } else {
        const { result } = await send('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true });
        const h = Math.min(result.value, MAX_HEIGHT);
        shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: vp.width, height: h, scale: 1 } });
      }
      fs.writeFileSync(path.join(OUT, `${t.name}@${vp.name}.png`), Buffer.from(shot.data, 'base64'));
      n++;
      process.stdout.write(`\r截圖 ${n}/${PAGES.length * VIEWPORTS.length}  ${t.name}@${vp.name}        `);
    }
  }
  console.log(`\n✔ 已存到 ${path.relative(REPO, OUT)}/`);
} finally {
  cleanup();
}
process.exit(0);
