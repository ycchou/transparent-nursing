// CSV 載入 + 解析 + 雙層 cache（記憶體 + localStorage）
// 之後把 CATEGORIES[].csvUrl 改成 Google Sheet 發布 CSV URL 即可
import { CATEGORIES } from './config.js?v=c1fc9f9fa9';

// 記憶體 cache：同 session 內不重抓
const cache = new Map();

// localStorage cache 設定
const CACHE_VERSION = 'v10';                 // v10: mock 資料擴充到 600 筆；v9: 推薦指數 1-5 + 精神科
const TTL_MS = 10 * 60 * 1000;                // 10 分鐘自動失效
const STORAGE_KEY = (slug) => `nursing_csv_${CACHE_VERSION}_${slug}`;
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

/** localStorage 讀取 */
function readLocal(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(slug));
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || !item.ts || !Array.isArray(item.data)) return null;
    const fresh = Date.now() - item.ts <= TTL_MS;
    return { data: item.data, ts: item.ts, fresh };
  } catch { return null; }
}

/** localStorage 寫入；配額滿了就吞掉錯誤 */
function writeLocal(slug, rows) {
  try {
    localStorage.setItem(STORAGE_KEY(slug),
      JSON.stringify({ ts: Date.now(), data: rows }));
  } catch (e) {
    // QuotaExceededError 或 SecurityError（隱私模式）— 都不影響功能
    console.warn('[data-loader] localStorage write failed:', e.message);
  }
}

/** 真正去抓 CSV 並解析 */
async function fetchAndParse(slug) {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) throw new Error('Unknown category: ' + slug);

  // 確保 PapaParse 可用（若頁面沒掛 <script> 會自動 lazy load）
  await ensurePapa();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let text;
  try {
    const res = await fetch(cat.csvUrl, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cat.csvUrl}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data.map((r) => normalizeRow(r, slug))),
      error: (err) => reject(err),
    });
  });
}

/** 背景靜默刷新；失敗只 console.warn，不影響 UI */
function refreshInBackground(slug) {
  if (refreshing.has(slug)) return;
  refreshing.add(slug);
  fetchAndParse(slug)
    .then((rows) => {
      cache.set(slug, rows);
      writeLocal(slug, rows);
    })
    .catch((e) => console.warn(`[data-loader] background refresh failed for ${slug}:`, e.message))
    .finally(() => refreshing.delete(slug));
}

/**
 * 載入單一類別（原始：未蓋 _seq）— 內部使用
 * 流程：記憶體 cache → localStorage (fresh 直接回；stale 回 + 背景刷) → 網路
 */
async function loadCategoryRaw(slug, opts = {}) {
  if (!opts.forceRefresh && cache.has(slug)) return cache.get(slug);

  if (!opts.forceRefresh) {
    const stored = readLocal(slug);
    if (stored) {
      cache.set(slug, stored.data);
      if (!stored.fresh) refreshInBackground(slug);
      return stored.data;
    }
  }

  const rows = await fetchAndParse(slug);
  cache.set(slug, rows);
  writeLocal(slug, rows);
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
 * 背景預載：使用瀏覽器閒置時段抓回全部 9 個 CSV 並寫入 localStorage。
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
 *
 * @returns {Function} 停止函式
 */
export function startAutoRefresh() {
  const intervalId = setInterval(() => {
    console.info('[data-loader] 背景靜默刷新所有類別...', new Date().toLocaleTimeString());
    CATEGORIES.forEach((c) => refreshInBackground(c.slug));
  }, AUTO_REFRESH_INTERVAL_MS);
  return () => clearInterval(intervalId);
}

/** Cache 統計（除錯 / 開發者主控台用） */
export function getCacheStats() {
  const items = CATEGORIES.map((c) => {
    const stored = readLocal(c.slug);
    return {
      slug: c.slug,
      inMemory: cache.has(c.slug),
      inLocalStorage: !!stored,
      fresh: stored ? stored.fresh : null,
      cachedAt: stored ? new Date(stored.ts).toISOString() : null,
      rowCount: stored ? stored.data.length : 0,
    };
  });
  return items;
}
