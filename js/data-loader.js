// CSV 載入 + 解析 + 雙層 cache（記憶體 + localStorage）
// 之後把 CATEGORIES[].csvUrl 改成 Google Sheet 發布 CSV URL 即可
import { CATEGORIES } from './config.js?v=483b4e6a5f';
import { currentMode } from './env.js?v=483b4e6a5f';
import { fetchCsvText } from './sheet-fetch.js?v=483b4e6a5f';
import { needsFreshData, isForcedFresh } from './fresh-data.js?v=483b4e6a5f';

// 記憶體 cache：同 session 內不重抓
const cache = new Map();
// 本頁「投稿後重抓」的請求：slug → Promise<rows|null>（見 fresh-data.js）
const freshFetches = new Map();

// localStorage cache 設定
const CACHE_VERSION = 'v16';                 // v16: 快取改存 CSV 原文（比解析後的 JSON 小約 5 倍，避免 localStorage 爆量）；v15: 審稿改逐欄判定＋事由欄（modComment/modCommentCode…）；v14: mock 依目前表單重新產生（欄位/選項對齊、審稿欄位中文）；v13: 新增 AI 審稿欄位 modVerdict/modCode（屏蔽短評）；v12: 加護病房班別新增「混合制」+ mock 全量重跑（ICU 160 筆）；v11: 新增第 10 類「診所」；v10: mock 資料擴充；v9: 推薦指數 1-5 + 精神科
const TTL_MS = 10 * 60 * 1000;                // 10 分鐘自動失效
// key 帶資料模式：測試資料與正式資料各自 cache，切換 ?data= 不會讀到另一邊的殘留
const STORAGE_KEY = (slug) => `nursing_csv_${CACHE_VERSION}_${currentMode()}_${slug}`;
const FETCH_TIMEOUT_MS = 12000;
const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;  // 10 分鐘自動背景刷新

// 背景刷新進行中的旗標，避免同一類別並發刷
const refreshing = new Set();

// PapaParse 動態載入（讓 about / participate 等沒掛 PapaParse <script> 的頁面也能預載資料）
const PAPA_CDN = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
let _papaLoading = null;
function ensurePapa() {
  if (typeof Papa !== 'undefined') return Promise.resolve();
  if (_papaLoading) return _papaLoading;
  _papaLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PAPA_CDN;
    s.async = true;
    s.onload = () => (typeof Papa !== 'undefined')
      ? resolve()
      : reject(new Error('Papa 未在載入後出現'));
    s.onerror = () => reject(new Error('PapaParse CDN 載入失敗'));
    document.head.appendChild(s);
  });
  return _papaLoading;
}

// 啟動時清除舊版 cache，避免使用者卡在過期資料
(function purgeOldCache() {
  try {
    if (typeof localStorage === 'undefined') return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('nursing_csv_') &&
          !k.startsWith(`nursing_csv_${CACHE_VERSION}_`)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    if (keysToRemove.length) {
      console.info('[data-loader] 已清除舊版 cache:', keysToRemove.length, '筆');
    }
  } catch {}
})();

/** 數值欄位列表（用於 normalize） */
const NUMERIC_KEYS = new Set([
  'yearsCurrent', 'yearsTotal', 'annualSalary',
  'monthlyBase', 'annualBonus', 'workAtmosphere', 'recommendIndex',
]);

function normalizeRow(row, slug) {
  const out = { _category: slug };
  for (const k in row) {
    let v = row[k];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) {
      out[k] = '';
    } else if (NUMERIC_KEYS.has(k)) {
      const n = Number(v);
      out[k] = Number.isFinite(n) ? n : '';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** CSV 原文 → 正規化後的資料列 */
async function parseCsv(text, slug) {
  await ensurePapa();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data.map((r) => normalizeRow(r, slug))),
      error: (err) => reject(err),
    });
  });
}

/**
 * localStorage 讀取。快取存的是 CSV 原文（不是解析後的 JSON）：
 * 解析後每列都重複一次欄名，3,000 筆約 260 萬字元，逼近 iOS Safari 約 5 MB 的上限，
 * 超過時寫入會靜默失敗、等於沒有快取；原文只有約 1/5 大小，讀取時再解析（數十毫秒）。
 */
async function readLocal(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(slug));
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || !item.ts || typeof item.text !== 'string') return null;
    const fresh = Date.now() - item.ts <= TTL_MS;
    return { data: await parseCsv(item.text, slug), ts: item.ts, fresh };
  } catch { return null; }
}

/** localStorage 寫入 CSV 原文；配額滿了就吞掉錯誤 */
function writeLocal(slug, text) {
  try {
    localStorage.setItem(STORAGE_KEY(slug), JSON.stringify({ ts: Date.now(), text }));
  } catch (e) {
    // QuotaExceededError 或 SecurityError（隱私模式）— 都不影響功能
    console.warn('[data-loader] localStorage write failed:', e.message);
  }
}

/**
 * 背景刷新抓到的資料比畫面上的多時，通知頁面（不自動重畫，由頁面決定要不要提示使用者）。
 * window 事件 'tn:share-data-updated'，detail = { slug, added }。
 */
function announceUpdate(slug, before, after) {
  const added = after.length - (before ? before.length : after.length);
  if (added <= 0) return;
  try { window.dispatchEvent(new CustomEvent('tn:share-data-updated', { detail: { slug, added } })); } catch {}
}

// 進行中的抓取：slug → Promise。同一類別同時被要求（頁面載入＋背景預載等）只發一個請求
const inflight = new Map();

/** 抓 CSV 並解析，回傳 { rows, text }；同一類別進行中的請求共用 */
function fetchAndParse(slug) {
  if (!inflight.has(slug)) {
    inflight.set(slug, fetchAndParseOnce(slug).finally(() => inflight.delete(slug)));
  }
  return inflight.get(slug);
}

/** 真正去抓 CSV 並解析 */
async function fetchAndParseOnce(slug) {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) throw new Error('Unknown category: ' + slug);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let text;
  try {
    // 重新整理、點推播通知進來、或剛投稿過這一類：直連 Google 拿最新（Worker 快照可能落後數分鐘）
    text = await fetchCsvText(cat.csvUrl, ctrl.signal, { preferDirect: isForcedFresh() || needsFreshData(slug) });
  } finally {
    clearTimeout(timer);
  }
  return { rows: await parseCsv(text, slug), text };
}

/** 背景靜默刷新；失敗只 console.warn，不影響 UI */
function refreshInBackground(slug) {
  if (refreshing.has(slug)) return;
  refreshing.add(slug);
  fetchAndParse(slug)
    .then(({ rows, text }) => {
      const before = cache.get(slug);
      cache.set(slug, rows);
      writeLocal(slug, text);
      announceUpdate(slug, before, rows);
    })
    .catch((e) => console.warn(`[data-loader] background refresh failed for ${slug}:`, e.message))
    .finally(() => refreshing.delete(slug));
}

/**
 * 載入單一類別（原始：未蓋 _seq）— 內部使用
 * 流程：（剛投稿過→每頁先抓一次網路）→ 記憶體 cache → localStorage (fresh 直接回；stale 回 + 背景刷) → 網路
 */
async function loadCategoryRaw(slug, opts = {}) {
  // 本裝置剛投稿過這一類：每次開頁先略過快取抓一次最新，讓投稿者看得到自己那筆；
  // 同一頁的其他呼叫（含同時發出的）共用這一次的結果。網路失敗才退回快取。
  if (!opts.forceRefresh && needsFreshData(slug)) {
    if (!freshFetches.has(slug)) {
      freshFetches.set(slug, fetchAndParse(slug)
        .then(({ rows, text }) => { cache.set(slug, rows); writeLocal(slug, text); return rows; })
        .catch((e) => { console.warn(`[data-loader] 投稿後重抓 ${slug} 失敗，改用快取：`, e.message); return null; }));
    }
    const rows = await freshFetches.get(slug);
    if (rows) return rows;
  }

  if (!opts.forceRefresh && cache.has(slug)) return cache.get(slug);

  if (!opts.forceRefresh) {
    const stored = await readLocal(slug);
    if (stored) {
      cache.set(slug, stored.data);
      if (!stored.fresh) refreshInBackground(slug);
      return stored.data;
    }
  }

  const { rows, text } = await fetchAndParse(slug);
  cache.set(slug, rows);
  writeLocal(slug, text);
  return rows;
}

/**
 * 全域穩定序號：對全部資料依 timestamp 升冪排序，最舊 = #1。
 * 直接 mutate row._seq，所以同一個 row 物件參考在哪都拿到一樣的編號，
 * 不會被切換 tab 或套用篩選影響。
 * 沒有 timestamp 或無效時間的 row 排到最後（以 institutionName + comment 當 tie-breaker 保持穩定）。
 */
function assignGlobalSeq(allRows) {
  const ts = (r) => {
    if (!r.timestamp) return Number.POSITIVE_INFINITY;
    const t = new Date(r.timestamp).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const tiebreak = (r) => `${r.institutionName || ''}|${r.unitName || ''}|${r.comment || ''}`;
  const sorted = allRows.slice().sort((a, b) => {
    const dt = ts(a) - ts(b);
    if (dt !== 0) return dt;
    return tiebreak(a).localeCompare(tiebreak(b), 'zh-Hant');
  });
  sorted.forEach((r, idx) => { r._seq = idx + 1; });
  return allRows;
}

/**
 * 載入單一類別（已蓋全域 _seq）
 * 為了拿到全域序號，必須先載入全部類別（如果 cache 都已熱，這只是一次 filter）
 */
export async function loadCategory(slug, opts = {}) {
  const all = await loadAll(opts);
  return all.filter((r) => r._category === slug);
}

/** 載入全部類別並合併、蓋上全域 _seq */
export async function loadAll(opts = {}) {
  const all = (await Promise.all(CATEGORIES.map((c) => loadCategoryRaw(c.slug, opts)))).flat();
  return assignGlobalSeq(all);
}

/**
 * 背景預載：使用瀏覽器閒置時段抓回全部類別 CSV 並寫入 localStorage。
 * 用途：在 about / participate 等不需要資料的頁面悄悄預熱，
 * 等使用者進入 platform.html 時資料已就緒，省下首次 fetch 的等待。
 *
 * 安全特性：
 * - requestIdleCallback 不會搶 main thread；不支援的瀏覽器 fallback 500ms setTimeout
 * - 失敗只 console.warn，不影響當前頁面
 * - 如果 cache 已 fresh，會走 cache hit 路徑，幾乎零成本
 */
export function preloadAll() {
  const trigger = () => {
    loadAll().catch((e) => console.warn('[preload] failed:', e.message));
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(trigger, { timeout: 3000 });
  } else {
    setTimeout(trigger, 500);
  }
}

// 「樞紐」靜態大檔：被站內各處連過去、卻每次現抓的主檔。URL 需與各頁首抓相同
// （HTTP 快取以完整 URL 為 key）：hospital.js / nurse-ratio.js 用帶 ?v= 版本（stamp-assets 維護）；
// personnel.js 首抓的 picker 清單也帶版本號（三處須一致，stamp-assets 會一起更新）。
const HUB_STATIC_URLS = [
  'data/hospitals-merged.json?v=351c442704',  // 機構總覽
  'data/nurse-ratio.json?v=040b3f83fc',       // 三班護病比
  'data/personnel-index.json?v=644925a99a',            // 人力監控 picker
];

/**
 * 背景預熱樞紐大檔，讓機構總覽 / 護病比 / 人力監控切頁近乎即開。
 * - requestIdleCallback 不搶 main thread；省流量模式（saveData）下略過，尊重行動數據。
 * - cache:'default' → 已快取走快取；失敗只忽略，絕不影響任何 UI。
 */
export function preloadStaticData() {
  if (typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData) return;
  const trigger = () => {
    HUB_STATIC_URLS.forEach((url) => { fetch(url, { cache: 'default' }).catch(() => {}); });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(trigger, { timeout: 4000 });
  } else {
    setTimeout(trigger, 800);
  }
}

/** 統計摘要：總筆數、各類別筆數、最後更新時間、涵蓋醫院數 */
export async function getStats() {
  const all = await loadAll();
  const total = all.length;
  const byCategory = {};
  CATEGORIES.forEach((c) => { byCategory[c.slug] = 0; });
  let latest = null;
  const institutions = new Set();
  for (const r of all) {
    if (r._category && byCategory[r._category] !== undefined) byCategory[r._category]++;
    if (r.institutionName) institutions.add(r.institutionName.trim());
    if (r.timestamp) {
      const d = new Date(r.timestamp);
      if (!isNaN(d) && (!latest || d > latest)) latest = d;
    }
  }
  return {
    total,
    byCategory,
    institutionCount: institutions.size,
    lastUpdated: latest,
  };
}

export function clearCache() {
  cache.clear();
  try {
    for (const c of CATEGORIES) localStorage.removeItem(STORAGE_KEY(c.slug));
  } catch {}
}

/**
 * 啟動自動定時背景刷新（10 分鐘一次）
 *
 * SWR 行為：
 * - 對全部類別觸發 `refreshInBackground`：靜默 fetch → 寫進 localStorage + memory cache
 * - **不清舊 cache、不阻塞、不觸發 UI 重畫**
 * - 用戶在「當次 session 中看到的永遠是當下開頁的 snapshot」，下次造訪才換新版
 * - 分頁在背景（document.hidden）時暫停，不為沒人在看的分頁消耗 Worker 額度；
 *   切回前景時若距上次刷新已滿 10 分鐘，立刻補刷一次
 *
 * @returns {Function} 停止函式
 */
export function startAutoRefresh() {
  let lastRun = Date.now();
  const run = () => {
    lastRun = Date.now();
    console.info('[data-loader] 背景靜默刷新所有類別...', new Date().toLocaleTimeString());
    CATEGORIES.forEach((c) => refreshInBackground(c.slug));
  };
  const intervalId = setInterval(() => {
    if (!document.hidden) run();
  }, AUTO_REFRESH_INTERVAL_MS);
  const onVisible = () => {
    if (!document.hidden && Date.now() - lastRun >= AUTO_REFRESH_INTERVAL_MS) run();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Cache 統計（除錯 / 開發者主控台用） */
export async function getCacheStats() {
  return Promise.all(CATEGORIES.map(async (c) => {
    const stored = await readLocal(c.slug);
    let chars = 0;
    try { chars = (localStorage.getItem(STORAGE_KEY(c.slug)) || '').length; } catch {}
    return {
      slug: c.slug,
      inMemory: cache.has(c.slug),
      inLocalStorage: !!stored,
      fresh: stored ? stored.fresh : null,
      cachedAt: stored ? new Date(stored.ts).toISOString() : null,
      rowCount: stored ? stored.data.length : 0,
      chars,
    };
  }));
}
