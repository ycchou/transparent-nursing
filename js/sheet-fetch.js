// sheet-fetch.js — 抓 Google Sheet 發布 CSV：先走 tn-sheets Worker（KV 快照，約 0.2 秒），
// Worker 失敗（網路錯誤／非 2xx）才退回直連 docs.google.com（2–6 秒）。
// 非 Google Sheet 的網址（例如 data/mock/*.csv）直接抓，不經 Worker。
// Worker 原始碼與白名單見 worker-sheets/。

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
  try {
    return await getText(SHEET_PROXY + url.slice(SHEET_ORIGIN.length), signal);
  } catch (e) {
    if (signal && signal.aborted) throw e;
    console.warn('[sheet-fetch] Worker 失敗，改直連 Google：', e.message);
    return getText(url, signal);
  }
}
