// sw.js — Service Worker：把網站的靜態資源存在手機上，回訪幾乎不必連網就能開頁，離線也能看已看過的頁面。
// 由 js/components.js 註冊；scope＝網站根目錄。
//
// 快取策略（只處理 GET）：
//   HTML 頁面（navigate）         網路優先；4 秒沒回應或離線才用快取 → 部署後一定拿到新版
//   本站帶 ?v= 的 js/css/json      快取優先；?v= 是內容雜湊，網址不變＝內容不變。同一檔只留最新一版
//   本站其他檔（圖片、無版號資料…）  先給快取、背景更新（stale-while-revalidate）
//   Google Fonts                   CSS 先給快取背景更新；字型檔（網址含版本）快取優先
//   jsDelivr（Chart.js、PapaParse） 網址含版本 → 快取優先
//   其餘（Worker API、Google Sheet CSV、投稿 POST…）不經本檔，照前端原本的快取邏輯
//
// 改快取策略時把 CACHE_VERSION +1：啟用時會清掉舊版的快取。

const CACHE_VERSION = 1;
const PAGES = `tn-pages-v${CACHE_VERSION}`;
const STATIC = `tn-static-v${CACHE_VERSION}`;
const NAV_TIMEOUT_MS = 4000;
const MAX_PAGES = 40;   // 頁面快取上限（含 ?query 的不同網址），超過就刪最舊的

const SCOPE = new URL(self.registration.scope);
const CDN_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.gstatic.com']);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, STATIC]);
    for (const name of await caches.keys()) {
      if (name.startsWith('tn-') && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === SCOPE.origin) {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)) {
    event.respondWith(url.searchParams.has('v') ? cacheFirstVersioned(req, url) : staleWhileRevalidate(event));
    return;
  }
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(event));
  }
  // 其他一律不攔截（Worker API、Google Sheet、Cloudflare Turnstile…）
});

// 可存的回應：成功的同源／CORS 回應；第三方 <script>／<link> 的 opaque 回應也存（狀態碼看不到，但只存 CDN）
const cacheable = (res) => res && (res.ok || res.type === 'opaque');

async function networkFirstPage(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const network = fetch(req).then(async (res) => {
    if (res.ok) {
      await cache.put(req, res.clone());
      trimPages(cache);
    }
    return res;
  });
  // 網路失敗或太慢 → 用快取；快取也沒有就只能等網路（或顯示離線頁）
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {}
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) {
    event.waitUntil(network.catch(() => {}));   // 背景繼續抓，下次開就是新版
    return cached;
  }
  try {
    return await network;
  } catch {
    return offlinePage();
  }
}

async function trimPages(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

// ?v= 是內容雜湊：命中就直接用；新版存進去時把同一路徑的舊版本刪掉，快取不會越積越多
async function cacheFirstVersioned(req, url) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    for (const old of await cache.keys()) {
      const u = new URL(old.url);
      if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(old);
    }
  }
  return res;
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) await cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    if (cacheable(res)) await cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  return network;
}

function offlinePage() {
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>目前離線</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;padding:16px;text-align:center;color:#334;background:#f7f9fb}
@media (prefers-color-scheme:dark){body{color:#dde;background:#12161c}}
button{margin-top:16px;padding:10px 20px;border:0;border-radius:999px;background:#2a7de1;color:#fff;font-size:1rem}</style>
</head><body><div><h1 style="font-size:1.3rem">目前沒有網路連線</h1>
<p>這一頁還沒有存在手機上。連上網路後再試一次。</p>
<button onclick="location.reload()">重新整理</button></div></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
