// csv-loader.js — 從公開 CSV（Google Sheet 發布）載入資料：PapaParse 動態載入＋localStorage 快取＋背景刷新。
import { isForcedFresh } from './fresh-data.js?v=b540de8f2d';
import { fetchCsvText } from './sheet-fetch.js?v=b540de8f2d';

// ============================================================
// PapaParse 動態載入（讓沒掛 <script> 的頁面也能 preload）
// ============================================================

const PAPA_CDN = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
let _papaLoading = null;
export function ensurePapa() {
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

// ============================================================
// CSV loader factory：給每個資料來源建一個 { load, preload } 實例
// ============================================================

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 天
// 超過這段時間才在背景向 tn-sheets 重抓。違規紀錄由 tn-sheets 每天台北 04:00 更新一次，
// 所以 24 小時一次就夠；更頻繁只會一直拿到同一份、白打 Worker。
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;     // 24 小時
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// localStorage 快取的 record 結構版本。改動 parseRow 產出的欄位（如新增 articles）時 +1，
// 讓舊格式快取自動失效、重新抓取，避免新程式讀到缺欄位的舊快取而崩潰（如 r.articles.forEach）。
const CACHE_SCHEMA_VERSION = 4;   // 4：改存 CSV 原文

/**
 * @param {Object} cfg
 * @param {string} cfg.csvUrl - Google Sheets 發布 CSV 網址
 * @param {string} cfg.storageKey - localStorage key
 * @param {string} cfg.logTag - console.warn / log 的 tag，例如 '[violations]'
 * @param {number} [cfg.headerRowIdx=4] - CSV 前幾行是 metadata，data 從第 headerRowIdx+1 列開始
 * @param {(row: string[]) => Object} cfg.parseRow - 把 CSV 每列轉成 record 物件
 */
export function createCsvLoader(cfg) {
  const {
    csvUrl,
    storageKey,
    logTag,
    headerRowIdx = 4,
    parseRow,
    ttlMs = DEFAULT_TTL_MS,
    staleMs = DEFAULT_STALE_MS,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = cfg;

  // 進行中的抓取共用同一個請求（load 與 preload 同時發生時不重複下載）
  let _inflight = null;
  function fetchAndParse() {
    _inflight ||= fetchAndParseOnce().finally(() => { _inflight = null; });
    return _inflight;
  }

  // CSV 原文 → record 陣列
  async function parseText(text) {
    await ensurePapa();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data || [];
          const dataRows = rows.slice(headerRowIdx + 1);
          resolve(dataRows.filter((r) => r && r[0] && String(r[0]).trim()).map(parseRow));
        },
        error: (err) => reject(err),
      });
    });
  }

  // 回傳 { rows, text }：text 存進快取，rows 給頁面用
  async function fetchAndParseOnce() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let text;
    try {
      text = await fetchCsvText(csvUrl, ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
    return { rows: await parseText(text), text };
  }

  // 快取只看時間戳記（不解析），preload 判斷要不要抓時用
  function readMeta() {
    try {
      const obj = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!obj || !obj.ts || obj.v !== CACHE_SCHEMA_VERSION || typeof obj.text !== 'string') return null;
      const age = Date.now() - obj.ts;
      return { obj, age, valid: age <= ttlMs, veryFresh: age <= staleMs };
    } catch { return null; }
  }

  // 快取存 CSV 原文（解析後的 JSON 大好幾倍，和分享資料加總會逼近 localStorage 上限），讀取時再解析
  async function readLocal() {
    const meta = readMeta();
    if (!meta) return null;
    try {
      return { data: await parseText(meta.obj.text), valid: meta.valid, veryFresh: meta.veryFresh, age: meta.age };
    } catch { return null; }
  }

  function writeLocal(text) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: CACHE_SCHEMA_VERSION, ts: Date.now(), text }));
    } catch {}
  }

  let _refreshing = false;
  function refreshInBackground() {
    if (_refreshing) return;
    _refreshing = true;
    fetchAndParse()
      .then(({ text }) => { writeLocal(text); })
      .catch((e) => console.warn(`${logTag} 背景刷新失敗:`, e.message))
      .finally(() => { _refreshing = false; });
  }

  async function load() {
    const cached = await readLocal();
    // 使用者下拉重新整理（或按瀏覽器重新整理）：不管快取多新都重抓一次，這一頁就顯示最新；抓失敗才用快取
    if (cached && isForcedFresh()) {
      try {
        const { rows, text } = await fetchAndParse();
        writeLocal(text);
        return rows;
      } catch (e) {
        console.warn(`${logTag} 重新整理時抓 CSV 失敗，使用快取:`, e.message);
        return cached.data;
      }
    }
    if (cached && cached.veryFresh) return cached.data;
    if (cached && cached.valid) {
      refreshInBackground();
      return cached.data;
    }
    try {
      const { rows, text } = await fetchAndParse();
      writeLocal(text);
      return rows;
    } catch (e) {
      if (cached) {
        console.warn(`${logTag} 抓 CSV 失敗，使用過期 cache:`, e.message);
        return cached.data;
      }
      throw e;
    }
  }

  function preload() {
    const cached = readMeta();
    if (cached && cached.valid) return;
    const trigger = () => {
      fetchAndParse()
        .then(({ text }) => writeLocal(text))
        .catch((e) => console.warn(`${logTag} preload failed:`, e.message));
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(trigger, { timeout: 3000 });
    } else {
      setTimeout(trigger, 800);
    }
  }

  return { load, preload };
}
