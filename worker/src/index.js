// tn-visits — 首頁匿名訪客計數 Worker。
//
// 端點：
//   POST /hit            當天計數 +1（伺服器端以「雜湊 IP + 當天」去重，同 IP 一天只計一次）
//   GET  /stats          回 { today, total }
//   GET  /stats?history=30  另附 history: [{ day, count }, ...]（近 N 天，供未來畫趨勢圖）
//
// 隱私：daily 只存「日期 + 計數」；seen 只存雜湊（SALT|IP|裝置桶|day 與 SALT|IP|day），
//       「不記錄原始 IP／User-Agent、不可逆推」，仍屬匿名。SALT 為 Worker secret，見 README。
//
// 防灌水：/hit 只收帶合法 Origin 的瀏覽器請求；seen 舊列由每日 Cron（scheduled）清理。

const ALLOWED_ORIGINS = [
  'https://ycchou.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

// 單一 IP 每天最多認列的「裝置類別」數。真實共用出口（診所/NAT）夠用，
// 又能把「同 IP 狂換 User-Agent 灌水」的上限鎖住。可調。
const CAP_PER_IP_PER_DAY = 50;

function originAllowed(origin) {
  return !!origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ':'));
}

function corsHeaders(origin) {
  const ok = originAllowed(origin);
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

// 把 User-Agent 壓成粗粒度「OS|瀏覽器|主版本」桶（例：iOS|Safari|17）。
// 只取大類別與主版本，丟掉次版本與雜訊：既能分辨同 IP 下不同裝置，
// 又讓可能的組合有限（配合 CAP，換 UA 灌水的空間受限）。
function uaBucket(ua) {
  ua = ua || '';
  let os = 'other';
  if (/iPhone|iPad|iPod|iOS/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let br = 'other', ver = '0', m;
  if ((m = ua.match(/Edg\/(\d+)/))) { br = 'Edge'; ver = m[1]; }
  else if ((m = ua.match(/OPR\/(\d+)/))) { br = 'Opera'; ver = m[1]; }
  else if ((m = ua.match(/Firefox\/(\d+)/))) { br = 'Firefox'; ver = m[1]; }
  else if ((m = ua.match(/Chrome\/(\d+)/))) { br = 'Chrome'; ver = m[1]; }
  else if (/Safari/.test(ua) && (m = ua.match(/Version\/(\d+)/))) { br = 'Safari'; ver = m[1]; }

  return os + '|' + br + '|' + ver;
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

// 回傳 true 代表「這個 IP×裝置類別今天第一次」→ 才需要計數。已看過或超過單 IP 上限則回 false。
async function claimVisit(env, request, day) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const salt = env.SALT || 'tn-visits-fallback-salt';
  const bucket = uaBucket(request.headers.get('User-Agent'));
  const ipday = await sha256Hex(salt + '|' + ip + '|' + day);
  const h = await sha256Hex(salt + '|' + ip + '|' + bucket + '|' + day);

  // 單 IP 每日上限（best-effort，防同 IP 狂換 UA 灌水）。ipday 已含日期，只會數到今天。
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM seen WHERE ipday = ?').bind(ipday).first();
  if (cnt && cnt.n >= CAP_PER_IP_PER_DAY) return false;

  // 以 h 為主鍵，INSERT OR IGNORE 原子判定「這個裝置類別今天是否已計過」
  const res = await env.DB
    .prepare('INSERT OR IGNORE INTO seen(h, ipday, day) VALUES(?, ?, ?)')
    .bind(h, ipday, day)
    .run();
  // seen 舊列的清理已移出熱路徑，改由每日 Cron（scheduled）處理。
  return (res.meta && res.meta.changes) ? res.meta.changes > 0 : false;
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
        // 只接受帶合法 Origin 的瀏覽器請求：擋隨手 curl／腳本灌水。
        // 真實訪客從 github.io 跨網域打 workers.dev，瀏覽器一定會帶 Origin。
        if (!originAllowed(request.headers.get('Origin'))) {
          return json({ error: 'forbidden' }, cors, 403);
        }
        const day = taipeiDay();
        const isNew = await claimVisit(env, request, day);
        if (!isNew) return json(await readStats(env), cors);
        // 把「+1」與「讀回今日/累計」放進同一個 batch（單一交易、主庫循序），
        // 確保回給前端的數字已包含這次計數，不受讀取副本延遲影響。
        const res = await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO daily(day, count) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1'
          ).bind(day),
          env.DB.prepare('SELECT count FROM daily WHERE day = ?').bind(day),
          env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM daily'),
        ]);
        const todayRow = res[1].results && res[1].results[0];
        const totalRow = res[2].results && res[2].results[0];
        return json({ today: todayRow ? todayRow.count : 0, total: totalRow ? totalRow.total : 0 }, cors);
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

  // 每日 Cron（見 wrangler.toml 的 [triggers] crons）：清掉前天以前的去重雜湊。
  // 去重只需最近一兩天，保留今天 + 昨天（跨午夜也安全）。
  async scheduled(event, env, ctx) {
    const cutoff = dayMinus(taipeiDay(), 1);
    ctx.waitUntil(env.DB.prepare('DELETE FROM seen WHERE day < ?').bind(cutoff).run());
  },
};
