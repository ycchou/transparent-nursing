// visits.js — 首頁匿名訪客計數（今日 / 累計）。
// 後端：Cloudflare Worker + D1（見 worker/）。UV 去重：同一裝置當天只計一次，靠 localStorage。
//
// 部署 Worker 後，把下面網址換成你的 *.workers.dev（或自訂路由）：
const VISITS_API = 'https://tn-visits.victory63225.workers.dev';

const DAY_KEY = 'tn_visit_day';

// Asia/Taipei（UTC+8）當天日期字串，與後端一致
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 回傳 { today, total }；任何錯誤都回 null（呼叫端保持顯示「—」，不影響首頁其他內容）
export async function getVisitStats() {
  const today = taipeiToday();

  let firstVisitToday = true;
  try { firstVisitToday = localStorage.getItem(DAY_KEY) !== today; } catch (_) {}

  try {
    const res = firstVisitToday
      ? await fetch(VISITS_API + '/hit', { method: 'POST' })
      : await fetch(VISITS_API + '/stats');
    if (!res.ok) return null;
    const data = await res.json();
    if (firstVisitToday) {
      try { localStorage.setItem(DAY_KEY, today); } catch (_) {}
    }
    return data;
  } catch (_) {
    return null;
  }
}
