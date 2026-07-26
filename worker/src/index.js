// tn-visits — 首頁匿名訪客計數 Worker。
//
// 端點：
//   POST /hit            當天計數 +1（前端僅在「今天首訪」時呼叫，UV 去重靠前端 localStorage）
//   GET  /stats          回 { today, total }
//   GET  /stats?history=30  另附 history: [{ day, count }, ...]（近 N 天，供未來畫趨勢圖）
//
// 隱私：只讀寫 daily 表的「日期 + 計數」，不記錄 IP／任何可識別個資。

const ALLOWED_ORIGINS = [
  'https://ycchou.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

function corsHeaders(origin) {
  const ok = origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ':'));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://ycchou.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// Asia/Taipei（UTC+8，無日光節約）當天日期字串 YYYY-MM-DD
function taipeiDay(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

async function readStats(env) {
  const today = taipeiDay();
  const todayRow = await env.DB.prepare('SELECT count FROM daily WHERE day = ?').bind(today).first();
  const totalRow = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM daily').first();
  return { today: todayRow ? todayRow.count : 0, total: totalRow ? totalRow.total : 0 };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/hit' && request.method === 'POST') {
        await env.DB.prepare(
          'INSERT INTO daily(day, count) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1'
        ).bind(taipeiDay()).run();
        return json(await readStats(env), cors);
      }

      if (url.pathname === '/stats' && request.method === 'GET') {
        const stats = await readStats(env);
        const history = url.searchParams.get('history');
        if (history) {
          const n = Math.min(parseInt(history, 10) || 30, 365);
          const rows = await env.DB.prepare(
            'SELECT day, count FROM daily ORDER BY day DESC LIMIT ?'
          ).bind(n).all();
          stats.history = (rows.results || []).reverse();
        }
        return json(stats, cors);
      }

      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: String(e) }, cors, 500);
    }
  },
};
