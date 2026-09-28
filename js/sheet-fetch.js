// sheet-fetch.js — 抓 Google Sheet 發布 CSV：先走 tn-sheets Worker（KV 快照，約 0.2 秒），
// Worker 失敗（網路錯誤／非 2xx）才退回直連 docs.google.com（2–6 秒）。
// 例外：下拉重新整理後的這一頁（fresh-data.js isForcedFresh）反過來，先直連 Google 拿最新版，
// Google 失敗才退回 Worker——Worker 的快照可能落後 Google 最多約 7 分鐘。
// 非 Google Sheet 的網址（例如 data/mock/*.csv）直接抓，不經 Worker。
// Worker 原始碼與白名單見 worker-sheets/。
import { isForcedFresh } from './fresh-data.js?v=5189b01e4d';

const SHEET_ORIGIN = 'https://docs.google.com';
const SHEET_PROXY = 'https://tn-sheets.ycchou-1005.workers.dev';

async function getText(url, signal) {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** 抓 CSV 文字；signal 逾時（abort）時不再重試，直接拋出 */
export async function fetchCsvText(url, signal) {
  if (!url.startsWith(SHEET_ORIGIN + '/')) return getText(url, signal);
  const proxied = SHEET_PROXY + url.slice(SHEET_ORIGIN.length);
  const [first, second, label] = isForcedFresh()
    ? [url, proxied, 'Google 直連失敗，改走 Worker']
    : [proxied, url, 'Worker 失敗，改直連 Google'];
  try {
    return await getText(first, signal);
  } catch (e) {
    if (signal && signal.aborted) throw e;
    console.warn(`[sheet-fetch] ${label}：`, e.message);
    return getText(second, signal);
  }
}
