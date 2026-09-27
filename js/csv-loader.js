// csv-loader.js — 從公開 CSV（Google Sheet 發布）載入資料：PapaParse 動態載入＋localStorage 快取＋背景刷新。
import { extractLawArticles } from './records-format.js?v=4ba0bc5986';

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
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;      // 6 小時
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// localStorage 快取的 record 結構版本。改動 parseRow 產出的欄位（如新增 articles）時 +1，
// 讓舊格式快取自動失效、重新抓取，避免新程式讀到缺欄位的舊快取而崩潰（如 r.articles.forEach）。
const CACHE_SCHEMA_VERSION = 3;

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

  async function fetchAndParse() {
    await ensurePapa();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let text;
    try {
      const res = await fetch(csvUrl, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data || [];
          const dataRows = rows.slice(headerRowIdx + 1);
          const parsed = dataRows
            .filter((r) => r && r[0] && String(r[0]).trim())
            .map(parseRow);
          resolve(parsed);
        },
        error: (err) => reject(err),
      });
    });
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !Array.isArray(obj.data)) return null;
      // 結構版本不符（舊格式快取）→ 視為無效，強制重新抓取，避免讀到缺欄位的資料
      if (obj.v !== CACHE_SCHEMA_VERSION) return null;
      const age = Date.now() - obj.ts;
      const valid = age <= ttlMs;
      const veryFresh = age <= staleMs;
      // ISO 字串 → Date 物件（把 record 內所有含 'Date' 字尾的欄位都試著轉）
      obj.data.forEach((r) => {
        for (const k of Object.keys(r)) {
          if (k.endsWith('Date') && typeof r[k] === 'string') {
            const d = new Date(r[k]);
            if (!isNaN(d.getTime())) r[k] = d;
          }
        }
        // 自癒：舊快取若缺 articles（分類會退回原文），就從 lawArticle 重新抽條號
        if (!Array.isArray(r.articles) && typeof r.lawArticle === 'string') {
          r.articles = extractLawArticles(r.lawArticle);
        }
      });
      return { data: obj.data, valid, veryFresh, age };
    } catch { return null; }
  }

  function writeLocal(rows) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: CACHE_SCHEMA_VERSION, ts: Date.now(), data: rows }));
    } catch {}
  }

  let _refreshing = false;
  function refreshInBackground() {
    if (_refreshing) return;
    _refreshing = true;
    fetchAndParse()
      .then((rows) => { writeLocal(rows); })
      .catch((e) => console.warn(`${logTag} 背景刷新失敗:`, e.message))
      .finally(() => { _refreshing = false; });
  }

  async function load() {
    const cached = readLocal();
    if (cached && cached.veryFresh) return cached.data;
    if (cached && cached.valid) {
      refreshInBackground();
      return cached.data;
    }
    try {
      const fresh = await fetchAndParse();
      writeLocal(fresh);
      return fresh;
    } catch (e) {
      if (cached) {
        console.warn(`${logTag} 抓 CSV 失敗，使用過期 cache:`, e.message);
        return cached.data;
      }
      throw e;
    }
  }

  function preload() {
    const cached = readLocal();
    if (cached && cached.veryFresh) return;
    if (cached && cached.valid) return;
    const trigger = () => {
      fetchAndParse()
        .then((rows) => writeLocal(rows))
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
