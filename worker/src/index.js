// tn-visits — 首頁匿名訪客計數 Worker。
//
// 端點：
//   POST /hit            當天計數 +1（伺服器端以「雜湊 IP + 當天」去重，同 IP 一天只計一次）
//   GET  /stats          回 { today, total }
//   GET  /stats?history=30  另附 history: [{ day, count }, ...]（近 N 天，供未來畫趨勢圖）
//
// 隱私：daily 只存「日期 + 計數」；seen 只存 SHA-256(SALT|IP|day) 的雜湊，
//       「不記錄原始 IP、不可逆推」，仍屬匿名。SALT 為 Worker secret，見 README。

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

// dayStr 往前 n 天（用來清 seen 舊列）
function dayMinus(dayStr, n) {
  const d = new Date(dayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

// 回傳 true 代表「這個 IP 今天第一次」→ 才需要計數。已看過則回 false。
async function claimVisit(env, request, day) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const salt = env.SALT || 'tn-visits-fallback-salt';
  const h = await sha256Hex(salt + '|' + ip + '|' + day);
  const res = await env.DB
    .prepare('INSERT OR IGNORE INTO seen(h, day) VALUES(?, ?)')
    .bind(h, day)
    .run();
  const isNew = (res.meta && res.meta.changes) ? res.meta.changes > 0 : false;
  if (isNew) {
    // 順手清掉前天以前的雜湊（去重只需最近一兩天，跨午夜也安全）
    await env.DB.prepare('DELETE FROM seen WHERE day < ?').bind(dayMinus(day, 1)).run();
  }
  return isNew;
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
        const day = taipeiDay();
        const isNew = await claimVisit(env, request, day);
        if (isNew) {
          await env.DB.prepare(
            'INSERT INTO daily(day, count) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1'
          ).bind(day).run();
        }
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
