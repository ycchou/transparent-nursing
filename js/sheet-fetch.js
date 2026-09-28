// sheet-fetch.js — 抓 Google Sheet 發布 CSV。
//
// 預設走 tn-sheets Worker 的「合併包」：同一試算表所有分頁一次回傳（KV 快照，約 0.2 秒）。
// 分享平台 10 類同在一個試算表 → 10 份 CSV 只打 1 次 Worker。同一試算表 30 秒內的呼叫共用同一包。
// Worker 失敗（網路錯誤／非 2xx／包裡沒有該分頁）才退回直連 docs.google.com（2–6 秒）。
//
// preferDirect（重新整理後的分享資料，見 data-loader）：反過來先直連 Google 拿最新版，
// 失敗才退回 Worker——Worker 的快照可能落後 Google 數分鐘。
// 非 Google Sheet 的網址（例如 data/mock/*.csv）直接抓，不經 Worker。
// Worker 原始碼與白名單見 worker-sheets/。

const SHEET_ORIGIN = 'https://docs.google.com';
const SHEET_PROXY = 'https://tn-sheets.ycchou-1005.workers.dev';
const BUNDLE_SHARE_MS = 30 * 1000;
const bundles = new Map();  // pubId → { at, promise<{ gid: csv }> }

async function getText(url, signal) {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// 共用的合併包請求不綁任何一個呼叫者的 signal（一人逾時不該拖垮別人），各自另外賽跑自己的 abort
function withSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new Error('aborted'));
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
    promise.then(resolve, reject);
  });
}

async function fromBundle(pubId, gid, signal) {
  let b = bundles.get(pubId);
  if (!b || Date.now() - b.at > BUNDLE_SHARE_MS) {
    const promise = fetch(`${SHEET_PROXY}/spreadsheets/d/e/${pubId}/bundle`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for bundle ${pubId}`);
        return res.json();
      });
    b = { at: Date.now(), promise };
    bundles.set(pubId, b);
    promise.catch(() => { if (bundles.get(pubId) === b) bundles.delete(pubId); });
  }
  const data = await withSignal(b.promise, signal);
  if (typeof data[gid] !== 'string') throw new Error(`bundle 裡沒有 gid ${gid}`);
  return data[gid];
}

/**
 * 抓 CSV 文字；signal 逾時（abort）時不再重試，直接拋出。
 * @param {{ preferDirect?: boolean }} [opts] preferDirect：先直連 Google（要最新版時用）
 */
export async function fetchCsvText(url, signal, { preferDirect = false } = {}) {
  const m = url.startsWith(SHEET_ORIGIN + '/') && url.match(/\/spreadsheets\/d\/e\/([\w-]+)\/pub\?(?:.*&)?gid=(\d+)/);
  if (!m) return getText(url, signal);
  const viaWorker = () => fromBundle(m[1], m[2], signal);
  const direct = () => getText(url, signal);
  const [first, second, label] = preferDirect
    ? [direct, viaWorker, 'Google 直連失敗，改走 Worker']
    : [viaWorker, direct, 'Worker 失敗，改直連 Google'];
  try {
    return await first();
  } catch (e) {
    if (signal && signal.aborted) throw e;
    console.warn(`[sheet-fetch] ${label}：`, e.message);
    return second();
  }
}
