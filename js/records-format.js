// records-format.js — 違規紀錄（勞檢／性平／職安）與機構總覽共用的格式化工具：民國日期、罰鍰、法條、地點。
// ============================================================
// 通用工具
// ============================================================

// 民國年轉西元：'0115/1/15' → Date 物件
export function parseROCDate(str) {
  if (!str) return null;
  const cleaned = String(str).trim();
  const m = cleaned.match(/^0?(\d{1,3})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!m) return null;
  const rocYear = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!rocYear || !month || !day) return null;
  const adYear = rocYear + 1911;
  const d = new Date(adYear, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

export function formatROCDate(date) {
  if (!date) return '—';
  const rocYear = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${rocYear}/${m}/${d}`;
}

export function parseFine(str) {
  if (!str) return 0;
  const n = parseInt(String(str).replace(/[,,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

export function fmtFine(n) {
  if (!n) return '—';
  return n.toLocaleString();
}

// 從「勞動基準法第24條第1項;勞動基準法第32條...」抽出主條號 ["24", "32"]
export function extractLawArticles(str) {
  if (!str) return [];
  const matches = String(str).match(/第\s*(\d+)\s*條/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[^\d]/g, ''))));
}

// 主管機關長名稱 → 簡稱對應（科學園區/加工出口區歷年命名變更）
const LOC_ALIASES = {
  '國家科學及技術委員會新竹科學園區': '新竹科學園區',
  '國家科學及技術委員會新竹科學園區管理局': '新竹科學園區',
  '科技部新竹科學園區': '新竹科學園區',
  '科技部新竹科學園區管理局': '新竹科學園區',
  '科學工業園區管理局': '新竹科學園區',
  '國家科學及技術委員會中部科學園區': '中部科學園區',
  '國家科學及技術委員會中部科學園區管理局': '中部科學園區',
  '科技部中部科學工業園區': '中部科學園區',
  '科技部中部科學工業園區管理局': '中部科學園區',
  '國家科學及技術委員會南部科學園區': '南部科學園區',
  '國家科學及技術委員會南部科學園區管理局': '南部科學園區',
  '科技部南部科學工業園區': '南部科學園區',
  '科技部南部科學工業園區管理局': '南部科學園區',
  '經濟部加工出口區管理處': '加工出口區',
  '經濟部加工出口區管理處楠梓分處': '楠梓加工出口區',
  '經濟部加工出口區管理處臺中分處': '臺中加工出口區',
  '經濟部加工出口區管理處台中分處': '臺中加工出口區',
};

export function shortenLocation(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  if (LOC_ALIASES[t]) return LOC_ALIASES[t];
  const m = t.match(/(.*?)(新竹科學園區|中部科學園區|南部科學園區|加工出口區)$/);
  if (m && m[1]) return m[2];
  return t;
}

// 元 → 萬（給 KPI 卡用）
export function fineToWan(n) {
  if (!n) return null;
  const wan = n / 10000;
  if (wan >= 100) return Math.round(wan).toLocaleString();
  if (wan >= 10) return Math.round(wan).toString();
  return wan.toFixed(1).replace(/\.0$/, '');
}

// Debounce
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 讀 localStorage 拿目前 cache 的筆數（給 records.html 頂部 sub-tab 徽章用）
// 完全不 fetch、不解析日期，成本極低
export function getCachedCount(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.data)) return null;
    return obj.data.length;
  } catch { return null; }
}

// HTML escape（給 modal 內文字用）
// 與全站共用同一份（含引號跳脫）；其他模組仍可從這裡 import
export { escapeHtml } from './moderation.js?v=9bc2af9f89';
