// fresh-after-submit.js — 投稿後讓投稿者本人盡快看到自己那筆。
//
// 送出成功時標記該類別；標記後 15 分鐘內，data-loader 載入該類別一律略過快取直接抓網路。
// 不能只在送出當下清快取：Google 發布 CSV 與 tn-sheets Worker 要數分鐘才更新，
// 立刻重抓只會拿到舊資料、又被快取 10 分鐘，投稿者還是看不到自己那筆。
// key 刻意不用 nursing_csv_ 前綴：data-loader 與各頁的舊快取清理會刪掉該前綴的 key。

const WINDOW_MS = 15 * 60 * 1000;
const KEY = (slug) => `tn:fresh_until:${slug}`;

/** 送出成功後呼叫：接下來 15 分鐘該類別不讀快取 */
export function markSubmitted(slug) {
  try { localStorage.setItem(KEY(slug), String(Date.now() + WINDOW_MS)); } catch {}
}

/** 該類別是否仍在「投稿後需抓最新」的期間；過期順手清掉 key */
export function needsFreshData(slug) {
  try {
    const until = Number(localStorage.getItem(KEY(slug)));
    if (!until) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(KEY(slug));
  } catch {}
  return false;
}
