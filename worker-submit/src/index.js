// tn-submit — 表單提交防護代理。
//
// 流程：前端 →（帶 Turnstile token）→ 本 Worker → ①驗 Turnstile ②內容檢查（連結/洗版）
//        → 帶 shared secret 轉發 Apps Script（寫 Google Sheet）。
//
// 註：每日提交上限與最小間隔改由「單一裝置」在前端（js/form-engine.js, localStorage）處理，
//     本 Worker 不做 IP 限流，因此不需要 D1。
//
// 機密皆為 Worker secret（見 README）：
//   TURNSTILE_SECRET     Turnstile 的 Secret Key
//   APPS_SCRIPT_URL      Apps Script Web App /exec 網址
//   APPS_SCRIPT_SECRET   與 Apps Script 內 SHARED_SECRET 相同（擋人直接打 Apps Script）

const ALLOWED_ORIGINS = ['https://ycchou.github.io', 'http://localhost', 'http://127.0.0.1'];
const MAX_LINKS = 0;  // 自由文字允許的連結數（廣告多帶連結；0 = 不允許，可調）

function originAllowed(o) { return !!o && ALLOWED_ORIGINS.some((a) => o === a || o.startsWith(a + ':')); }
function corsHeaders(o) {
  return {
    'Access-Control-Allow-Origin': originAllowed(o) ? o : 'https://ycchou.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function json(o, c, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...c } });
}

async function verifyTurnstile(token, ip, secret) {
  const body = new URLSearchParams({ secret: secret || '', response: token || '' });
  if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const d = await r.json().catch(() => null);
  return !!(d && d.success);
}

// 自由文字偵測：明確連結（http/www/t.me/line.me/wa.me）或超長重複字元洗版
function looksLikeSpam(fields) {
  const text = Object.entries(fields)
    .filter(([k]) => !/^cf-turnstile/.test(k))
    .map(([, v]) => (Array.isArray(v) ? v.join(' ') : String(v || ''))).join(' \n ');
  const links = (text.match(/https?:\/\/|www\.|\bt\.me\/|line\.me\/|wa\.me\//gi) || []).length;
  if (links > MAX_LINKS) return 'links';
  if (/(.)\1{15,}/.test(text)) return 'repeat';
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, cors, 405);
    if (!originAllowed(origin)) return json({ error: 'forbidden' }, cors, 403);

    try {
      const form = await request.formData();
      const fields = {};
      for (const [k, v] of form.entries()) {
        fields[k] = fields[k] !== undefined ? [].concat(fields[k], v) : v;
      }
      const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';

      // ① Turnstile
      if (!(await verifyTurnstile(fields['cf-turnstile-response'], ip, env.TURNSTILE_SECRET))) {
        return json({ error: 'captcha' }, cors, 403);
      }
      // ② 內容檢查
      const spam = looksLikeSpam(fields);
      if (spam) return json({ error: 'spam', reason: spam }, cors, 422);

      // 轉發 Apps Script（移除 turnstile token、加 shared secret）
      const out = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) {
        if (/^cf-turnstile/.test(k)) continue;
        (Array.isArray(v) ? v : [v]).forEach((x) => out.append(k, x));
      }
      out.append('secret', env.APPS_SCRIPT_SECRET || '');
      const r = await fetch(env.APPS_SCRIPT_URL, { method: 'POST', body: out });
      if (!r.ok) return json({ error: 'upstream', status: r.status }, cors, 502);
      return json({ ok: true }, cors);
    } catch (e) {
      return json({ error: String(e) }, cors, 500);
    }
  },
};
