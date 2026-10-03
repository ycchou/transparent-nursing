// fresh-data.js — 何時該略過瀏覽器快取、直接抓最新資料。data-loader／csv-loader 都依這裡判斷。
//
// 兩種情況：
// 1. 投稿後：送出成功時標記該類別；接下來 15 分鐘開啟該類別一律先抓網路，投稿者才看得到自己那筆。
//    不能只在送出當下清快取：Google 發布 CSV 與 tn-sheets Worker 要數分鐘才更新，
//    立刻重抓只會拿到舊資料、又被快取 10 分鐘，投稿者還是看不到自己那筆。
// 2. 從「新分享」推播通知點進來（網址帶 ?fresh=1）：比照重新整理，這一頁抓最新，
//    否則會讀到最多 10 分鐘前的快取、看不到通知說的那筆。讀到參數後從網址拿掉，之後分享或重開不受影響。
// 3. 重新整理：PWA 下拉（pull-to-refresh.js，重新載入前設標記）或瀏覽器原生重新整理
//    （Navigation Timing type='reload'）。這一頁的分享資料抓最新，而且直連 Google（不讀可能落後的
//    Worker 快照）。違規資料（csv-loader）更新頻率低、Worker 一天才抓一次，重新整理不特別處理。
//
// key 刻意不用 nursing_csv_ 前綴：data-loader 與各頁的舊快取清理會刪掉該前綴的 key。

const SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const SUBMIT_KEY = (slug) => `tn:fresh_until:${slug}`;

// 下拉重新整理的標記只給「緊接著重新載入的那一頁」用：讀到就刪；超過 10 秒視為殘留
// （例如重新載入的頁面沒有載入本模組），不讓它影響之後開的頁面。
const RELOAD_KEY = 'tn:force_fresh';
const RELOAD_VALID_MS = 10 * 1000;
const forcedByReload = (() => {
  let flagged = false;
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    if (at) sessionStorage.removeItem(RELOAD_KEY);
    flagged = !!at && Date.now() - at < RELOAD_VALID_MS;
  } catch {}
  // 瀏覽器原生的重新整理（手機下拉、重新整理鈕、F5）也一樣抓最新
  let reloaded = false;
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    reloaded = !!nav && nav.type === 'reload';
  } catch {}
  // 推播通知帶來的 ?fresh=1
  let fromPush = false;
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('fresh') === '1') {
      fromPush = true;
      u.searchParams.delete('fresh');
      history.replaceState(history.state, '', u.toString());
    }
  } catch {}
  return flagged || reloaded || fromPush;
})();

/** 送出成功後呼叫：接下來 15 分鐘該類別不讀快取 */
export function markSubmitted(slug) {
  try { localStorage.setItem(SUBMIT_KEY(slug), String(Date.now() + SUBMIT_WINDOW_MS)); } catch {}
}

/** 重新載入整頁，並讓重新載入後的這一頁所有資料都略過快取 */
export function reloadWithFreshData() {
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch {}
  location.reload();
}

/** 這一頁是否由「下拉重新整理」載入（所有資料來源都該抓最新） */
export function isForcedFresh() {
  return forcedByReload;
}

/** 某類別分享資料是否該略過快取：下拉重新整理，或仍在投稿後 15 分鐘內；過期順手清掉 key */
export function needsFreshData(slug) {
  if (forcedByReload) return true;
  try {
    const until = Number(localStorage.getItem(SUBMIT_KEY(slug)));
    if (!until) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(SUBMIT_KEY(slug));
  } catch {}
  return false;
}
