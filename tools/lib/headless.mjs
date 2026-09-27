// headless.mjs — 用 headless Chrome 開本站頁面的共用底層（visual-snapshot.mjs、smoke-test.mjs 共用）。
//
//   const s = await openSession({ root });        // 起靜態伺服器＋Chrome＋CDP
//   await s.setViewport(VIEWPORTS[0]);
//   const page = await s.load({ name: 'index', url: 'index.html' });   // 載入並等網路、字型、圖片都靜止
//   page.errors / s.missing / s.send('Page.captureScreenshot', …)
//   s.close();
//
// 為了讓結果可重現，每頁都會：用測試資料（?data=mock）、清空 storage、固定 Math.random 與 Date、
// 擋掉線上訪客計數 API、關閉動畫與平滑捲動、圖片用最近鄰縮放。
// 需要：Node 18+（內建 WebSocket／fetch）、Google Chrome（可用 CHROME_PATH 指定路徑）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const VIEWPORTS = [
  { name: 'm', width: 390, height: 844, mobile: true, dpr: 1 },
  { name: 'd', width: 1280, height: 800, mobile: false, dpr: 1 },
];

/** 根目錄下的所有頁面（排除隱藏的 platform-full-*） */
export function allPages(root) {
  return fs.readdirSync(root)
    .filter((f) => f.endsWith('.html') && !/^platform-full-/.test(f))
    .map((f) => f.replace(/\.html$/, ''))
    .sort();
}

// 互動情境：url 為相對路徑（會自動加 data=mock）；run 在頁面載入後執行（可 await）；
// viewport 表示截圖時只截可視區（彈窗）；expect 是冒煙測試要找得到的元素
const HOSP = '1132070011';   // 林口長庚：護病比、人力、財務資料都齊全
export const SCENARIOS = [
  { name: 'hospital~chart', url: `hospital.html?code=${HOSP}`, expect: '#hospital-detail:not([hidden]) canvas' },
  { name: 'nurse-ratio~chart', url: `nurse-ratio.html?id=${HOSP}`, expect: '#ratio-chart' },
  { name: 'personnel~chart', url: `personnel.html?code=${HOSP}`, expect: '#personnel-detail:not([hidden]) canvas' },
  { name: 'financials~chart', url: `financials.html?code=${HOSP}`, expect: 'canvas' },
  { name: 'stats~official', url: 'stats.html#official', expect: '#stats-tab-official:not([hidden]) canvas' },
  { name: 'platform~calc', url: 'platform.html', viewport: true, expect: '#calc-result :is(div, span)',
    run: `click('#calc-trigger'); await wait(300); type('#calc-salary', '80'); click('#calc-go');` },
  { name: 'platform~calc-share', url: 'platform.html', viewport: true, expect: 'img[alt*="預覽"]',
    run: `click('#calc-trigger'); await wait(300); type('#calc-salary', '80'); click('#calc-go'); await wait(500); click('.calc-share-btn'); await waitFor('img[alt*="預覽"]');` },
  { name: 'platform~share', url: 'platform.html?id=1', viewport: true, expect: 'img[alt="分享圖片預覽"]',
    run: `await wait(500); click('#modal-share-btn'); await waitFor('img[alt="分享圖片預覽"]');` },
];

/** 全部目標：每頁預設畫面＋互動情境；filter 為逗號分隔的名稱（可選） */
export function targets(root, filter) {
  const all = [...allPages(root).map((p) => ({ name: p, url: `${p}.html` })), ...SCENARIOS];
  return filter ? all.filter((t) => filter.split(',').includes(t.name)) : all;
}

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

// 每個新文件載入前注入：清 storage、固定亂數與時間、關動畫
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
  // 關掉平滑捲動：網站設了 html{scroll-behavior:smooth}，否則截圖前的 scrollTo(0,0) 也會慢慢捲、截到一半
  // 圖片改最近鄰縮放：縮小顯示的 logo 用平滑縮放時，headless Chrome 每次取樣結果略有不同（純雜訊）
  const css = 'html{scroll-behavior:auto!important}img{image-rendering:pixelated!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  const add = () => { const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  return process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
}

async function launchChrome(profile) {
  const chrome = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0',
    '--font-render-hinting=none', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
    chrome.on('exit', (code) => reject(new Error(`Chrome 結束（exit ${code}）`)));
    setTimeout(() => reject(new Error('Chrome 啟動逾時')), 20000);
  });
  return { chrome, wsUrl };
}

/**
 * 開一個 session：靜態伺服器（只讀 root，綁 127.0.0.1）＋ headless Chrome ＋ 一個分頁。
 * @returns {{ base, send, setViewport, load, missing, close }}
 */
export async function openSession({ root = REPO } = {}) {
  root = path.resolve(root);
  if (!findChrome()) throw new Error('找不到 Chrome，請用 CHROME_PATH 指定');

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, p === '/' ? 'index.html' : p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  fs.mkdirSync(path.join(REPO, '.build-cache'), { recursive: true });
  const profile = fs.mkdtempSync(path.join(REPO, '.build-cache', 'chrome-'));
  let launched;
  for (let i = 1; ; i++) {   // Chrome 偶爾第一次啟動失敗，重試一次
    try { launched = await launchChrome(profile); break; } catch (e) { if (i >= 2) throw e; await sleep(1000); }
  }
  const { chrome, wsUrl } = launched;
  const close = () => { try { chrome.kill(); } catch {} server.close(); fs.rmSync(profile, { recursive: true, force: true }); };

  const port = new URL(wsUrl).port;
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });

  let seq = 0;
  const pending = new Map();
  const missing = new Map();   // 本站資源回應 ≥ 400：url → 出現的頁面
  const inflight = new Set();  // 以 requestId 追蹤；換頁時清空，被取消的舊請求不會卡住等待
  let lastNet = Date.now();
  let current = null;          // 目前頁面：{ name, errors: [] }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    const p = m.params;
    if (m.method === 'Network.requestWillBeSent') { inflight.add(p.requestId); lastNet = Date.now(); }
    if (m.method === 'Network.responseReceived' && p.response.status >= 400 && p.response.url.startsWith(base)) {
      const u = p.response.url.slice(base.length).split('?')[0];
      if (!missing.has(u)) missing.set(u, current?.name || '');
    }
    // 收到回應標頭就算結束：背景預熱快取的 fetch() 不讀 body，永遠等不到 loadingFinished
    if (['Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed'].includes(m.method)) {
      inflight.delete(p.requestId); lastNet = Date.now();
    }
    if (current && m.method === 'Runtime.exceptionThrown') {
      current.errors.push('例外：' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').split('\n')[0]);
    }
    if (current && m.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      current.errors.push('console.error：' + p.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 200));
    }
  };
  // 每個 CDP 指令最多等 30 秒：Chrome 偶爾不回應時不要整批卡死
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} 逾時`)); }, timeoutMs);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });

  async function waitQuiet(maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (inflight.size === 0 && Date.now() - lastNet > 800) break;
      await sleep(100);
    }
    // 字型載完、所有圖片解碼完才算穩定
    await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))', awaitPromise: true });
    await sleep(400);
  }

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  // 線上訪客計數與分析擋掉：結果不受網路影響，也不會在 CI 灌假流量
  await send('Network.setBlockedURLs', { urls: ['*workers.dev*', '*googletagmanager*', '*google-analytics*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: DETERMINISM });

  return {
    base,
    send,
    missing,
    close,
    async setViewport(vp) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
    },
    /** 載入目標並等穩定；有 run 則執行互動。回傳 { name, errors } */
    async load(t) {
      current = { name: t.name, errors: [] };
      inflight.clear();
      await send('Page.navigate', { url: `${base}/${withMock(t.url)}` });
      await waitQuiet();
      if (t.run) {
        const r = await send('Runtime.evaluate', { expression: `(async () => { ${SCENARIO_HELPERS} ${t.run} })()`, awaitPromise: true });
        if (r.exceptionDetails) current.errors.push('情境步驟失敗：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
        await waitQuiet();
      }
      return current;
    },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return r.result?.value;
    },
  };
}
