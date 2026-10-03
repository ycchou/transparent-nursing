// push.js — 機構追蹤推播：訂閱管理、事件 → 訂閱者彙整、排隊發送。
//
// 事件驅動，沒有輪詢：
//   · 新分享：/submit 投稿成功後，在同一次執行內呼叫 notifyNewComment（不多一次 Worker 請求）
//   · 財報／護病比：你手動上傳資料 → GitHub Actions 部署成功後 POST /notify（帶 NOTIFY_TOKEN）
//
// 發送：事件先換算成「每個訂閱者一則彙整通知」寫進 push_queue，再分批送出。
// 免費方案單次執行最多 50 個子請求，所以每批 DRAIN_CHUNK 則；剩下的由 service binding（SELF）
// 接力呼叫 /push/drain，GitHub Actions 那邊也會反覆呼叫 /push/drain 直到清空（兩者並行也安全：
// 取件用 DELETE … RETURNING，一則只會被一個執行拿到）。
//
// 匿名性：伺服器只存推播端點＋追蹤的機構代號與類型。不記 IP（限流只存雜湊）、不與投稿關聯。
// 推播內容不帶任何投稿文字，只說「有 N 則新分享」。

import { sendPush, b64urlDecode } from './webpush.js';

// 類型代碼：c 新分享、f 財報、r 護病比（與前端 js/follow.js 一致）
export const KINDS = { c: 'pf', f: 'fi', r: 'nr' };   // → 機構總覽頁的頁簽 key
const MAX_FOLLOWS = 100;
const DRAIN_CHUNK = 40;          // 每次執行最多送幾則（免費方案子請求上限 50，留餘裕）
const MAX_SELF_HOPS = 25;        // service binding 接力上限（Cloudflare 限制單一呼叫鏈的深度）
const SUBSCRIBE_PER_DAY = 200;   // 單一 IP 雜湊每日訂閱同步次數上限（每次追蹤／取消都會同步一次）
const SITE = 'https://ycchou.github.io/transparent-nursing/';

// 只接受主流瀏覽器推播服務的端點，避免本 Worker 被拿來對任意網址發 POST
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const taipeiDay = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function validSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return null;
  let u;
  try { u = new URL(s.endpoint); } catch { return null; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(u.hostname))) return null;
  const k = s.keys || {};
  try {
    if (b64urlDecode(k.p256dh).length !== 65 || b64urlDecode(k.auth).length !== 16) return null;
  } catch { return null; }
  return { endpoint: s.endpoint, p256dh: String(k.p256dh), auth: String(k.auth) };
}

function validFollows(f) {
  if (!f || typeof f !== 'object') return null;
  const out = [];
  for (const [code, kinds] of Object.entries(f)) {
    if (!/^\d{10}$/.test(code)) continue;
    const k = [...new Set(String(kinds || ''))].filter((c) => c in KINDS).sort().join('');
    if (k) out.push([code, k]);
    if (out.length >= MAX_FOLLOWS) break;
  }
  return out;
}

async function readBody(request) {
  return request.json().catch(() => ({}));
}

// POST /push/subscribe  { subscription: PushSubscription.toJSON(), follows: { 機構代號: 'cfr' } }
// 每次前端追蹤清單有變就整份覆寫（本機 localStorage 是正本，伺服器只是副本）。
export async function handleSubscribe(request, env, json) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const day = taipeiDay();
  const rk = await sha256((env.SALT || 'tn-submit-fallback-salt') + '|push|' + ip + '|' + day);
  const row = await env.DB.prepare('SELECT count FROM push_rate WHERE k = ?').bind(rk).first();
  if (row && row.count >= SUBSCRIBE_PER_DAY) return json({ error: 'rate' }, 429);
  await env.DB.prepare(
    'INSERT INTO push_rate(k, day, count) VALUES(?, ?, 1) ON CONFLICT(k) DO UPDATE SET count = count + 1'
  ).bind(rk, day).run();

  const body = await readBody(request);
  const sub = validSubscription(body.subscription);
  const follows = validFollows(body.follows);
  if (!sub) return json({ error: 'subscription' }, 400);
  if (!follows) return json({ error: 'follows' }, 400);

  const id = await sha256(sub.endpoint);
  const stmts = [
    env.DB.prepare(
      `INSERT INTO push_subs(id, endpoint, p256dh, auth, updated_day) VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, updated_day = excluded.updated_day`
    ).bind(id, sub.endpoint, sub.p256dh, sub.auth, day),
    env.DB.prepare('DELETE FROM push_follows WHERE sub_id = ?').bind(id),
    ...follows.map(([code, kinds]) =>
      env.DB.prepare('INSERT INTO push_follows(sub_id, code, kinds) VALUES(?, ?, ?)').bind(id, code, kinds)),
  ];
  // 追蹤清單清空 → 等同取消訂閱，整筆刪掉（不留空殼）
  if (!follows.length) stmts.push(env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(id));
  await env.DB.batch(stmts);
  return json({ ok: true, follows: follows.length });
}

// POST /push/unsubscribe  { endpoint }：刪除這個裝置在伺服器上的所有資料
export async function handleUnsubscribe(request, env, json) {
  const body = await readBody(request);
  if (typeof body.endpoint !== 'string') return json({ error: 'endpoint' }, 400);
  await deleteSub(env, await sha256(body.endpoint));
  return json({ ok: true });
}

function deleteSub(env, id) {
  return env.DB.batch([
    env.DB.prepare('DELETE FROM push_follows WHERE sub_id = ?').bind(id),
    env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM push_queue WHERE sub_id = ?').bind(id),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件 → 每位訂閱者一則彙整通知
// event = { code, kind: 'c'|'f'|'r', name: 醫院簡稱, label: 例「115/07 護病比」 }
// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(evs) {
  const byCode = new Map();
  for (const e of evs) {
    if (!byCode.has(e.code)) byCode.set(e.code, { name: e.name, kinds: [], labels: [] });
    const g = byCode.get(e.code);
    g.kinds.push(e.kind);
    g.labels.push(e.label);
  }
  if (byCode.size === 1) {
    const [code, g] = [...byCode][0];
    return {
      title: g.name,
      body: g.labels.join('、'),
      // 新分享：帶 fresh=1，頁面略過瀏覽器的分享資料快取（js/fresh-data.js），點進去才看得到那筆
      url: `hospital.html?code=${code}&tab=${KINDS[g.kinds[0]]}${g.kinds.includes('c') ? '&fresh=1' : ''}`,
      tag: `tn-${code}`,
    };
  }
  const lines = [...byCode.values()].map((g) => `${g.name}：${g.labels.join('、')}`);
  return {
    title: `你追蹤的 ${byCode.size} 家醫院有更新`,
    body: lines.slice(0, 4).join('\n') + (lines.length > 4 ? `\n…還有 ${lines.length - 4} 家` : ''),
    // 含新分享時一樣帶 fresh=1：我的追蹤頁背景預載會抓最新並寫回快取，再點進機構頁就看得到
    url: evs.some((e) => e.kind === 'c') ? 'follows.html?fresh=1' : 'follows.html',
    tag: 'tn-follows',
  };
}

// 事件寫進發送佇列。回傳排入幾則。
async function enqueue(env, events, ttl) {
  const codes = [...new Set(events.map((e) => e.code))];
  const perSub = new Map();
  // D1 單一查詢的參數上限 100，分段查
  for (let i = 0; i < codes.length; i += 90) {
    const part = codes.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT sub_id, code, kinds FROM push_follows WHERE code IN (${part.map(() => '?').join(',')})`
    ).bind(...part).all();
    for (const r of results) {
      const evs = events.filter((e) => e.code === r.code && r.kinds.includes(e.kind));
      if (!evs.length) continue;
      if (!perSub.has(r.sub_id)) perSub.set(r.sub_id, []);
      perSub.get(r.sub_id).push(...evs);
    }
  }
  const rows = [...perSub].map(([sub, evs]) => [sub, JSON.stringify({ ...buildPayload(evs), ttl })]);
  for (let i = 0; i < rows.length; i += 50) {
    await env.DB.batch(rows.slice(i, i + 50).map(([sub, p]) =>
      env.DB.prepare('INSERT INTO push_queue(sub_id, payload) VALUES(?, ?)').bind(sub, p)));
  }
  return rows.length;
}

// 從佇列取一批送出。回傳 { sent, gone, remaining }
export async function drain(env, ctx, hop = 0) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return { sent: 0, gone: 0, remaining: -1, error: 'no-vapid' };
  const { results: jobs } = await env.DB.prepare(
    'DELETE FROM push_queue WHERE id IN (SELECT id FROM push_queue ORDER BY id LIMIT ?) RETURNING sub_id, payload'
  ).bind(DRAIN_CHUNK).all();

  let sent = 0, gone = 0;
  if (jobs.length) {
    const ids = [...new Set(jobs.map((j) => j.sub_id))];
    const { results: subs } = await env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth FROM push_subs WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();
    const byId = new Map(subs.map((s) => [s.id, s]));
    await Promise.all(jobs.map(async (j) => {
      const sub = byId.get(j.sub_id);
      if (!sub) return;
      const { ttl, ...payload } = JSON.parse(j.payload);
      try {
        const status = await sendPush(sub, payload, env, { ttl: ttl || 86400 });
        if (status === 404 || status === 410) { gone++; await deleteSub(env, sub.id); }
        else if (status >= 200 && status < 300) sent++;
        else console.warn('推播失敗', status, new URL(sub.endpoint).hostname);
      } catch (e) {
        console.warn('推播例外', e.message);
      }
    }));
  }

  const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_queue').first();
  const remaining = left?.n || 0;
  // 還有剩：用 service binding 接力（新的一次執行，子請求額度重算）
  if (remaining && env.SELF && env.NOTIFY_TOKEN && hop < MAX_SELF_HOPS && ctx) {
    ctx.waitUntil(env.SELF.fetch('https://self/push/drain', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.NOTIFY_TOKEN}`, 'X-Hop': String(hop + 1) },
    }).catch((e) => console.warn('接力失敗', e.message)));
  }
  return { sent, gone, remaining };
}

export async function authorized(request, env) {
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.NOTIFY_TOKEN || !got) return false;
  // 比雜湊而不是直接比字串，避免逐字元比較的時間差
  return (await sha256(got)) === (await sha256(env.NOTIFY_TOKEN));
}

// POST /notify（GitHub Actions 部署後呼叫）  body = data/feed/outbox.json
// { batch: '…', events: [{ code, kind, name, label }] }。同一 batch 只處理一次。
export async function handleNotify(request, env, ctx, json) {
  const body = await readBody(request);
  const batch = String(body.batch || '');
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter((e) => e && /^\d{10}$/.test(e.code) && (e.kind === 'f' || e.kind === 'r'))
    .map((e) => ({ code: e.code, kind: e.kind, name: String(e.name || e.code).slice(0, 30), label: String(e.label || '').slice(0, 40) }));
  if (!/^[\w-]{6,64}$/.test(batch)) return json({ error: 'batch' }, 400);

  const first = await env.DB.prepare('INSERT OR IGNORE INTO push_batches(batch_id, day) VALUES(?, ?)')
    .bind(batch, taipeiDay()).run();
  if (!first.meta.changes) return json({ ok: true, duplicate: true, ...(await drain(env, ctx)) });

  const queued = await enqueue(env, events, 3 * 86400);
  return json({ ok: true, events: events.length, queued, ...(await drain(env, ctx)) });
}

// ─────────────────────────────────────────────────────────────────────────────
// 新分享：投稿的機構名稱 → 機構代號（沿用機構總覽頁 renderPlatformSection 的比對規則，
// 但完全相符優先，見 matchHospitals）
// ─────────────────────────────────────────────────────────────────────────────

// 與 js/institution-name.js 的 normalizeInstitutionName 相同邏輯
function normalizeName(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const ji = s.indexOf('即');
  if (ji > 0 && ji <= 4) s = s.slice(ji + 1);
  s = s.replace(/[（(][^（()）]*[)）]/g, '').replace(/臺/g, '台').replace(/[－–—―−‐-]/g, '').replace(/[\s　]+/g, '');
  return s.trim();
}
function namesMatch(a, b, minLen = 6) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [s, l] = na.length <= nb.length ? [na, nb] : [nb, na];
  return s.length >= minLen && l.includes(s);
}
function commonPrefix(strs) {
  let p = strs[0] || '';
  for (const s of strs) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

let hospCache = null;   // { at, list: [{ code, name, short }] }
async function loadHospitals() {
  if (hospCache && Date.now() - hospCache.at < 6 * 3600 * 1000) return hospCache.list;
  const r = await fetch(SITE + 'data/hospitals-merged.json', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error('hospitals-merged ' + r.status);
  const d = await r.json();
  // 比照 js/hospital-data.js loadBaseData：每個代號留名稱最短者，多院區改用共同前綴（母院名）
  const byCode = new Map(), names = new Map(), shortOf = new Map();
  for (const h of d.hospitals || []) {
    if (!h.code || !h.name) continue;
    if (h.shortName && h.shortName !== h.name) shortOf.set(h.name, h.shortName);
    names.set(h.code, [...(names.get(h.code) || []), h.name]);
    const prev = byCode.get(h.code);
    if (!prev || h.name.length < prev.name.length) byCode.set(h.code, { ...h });
  }
  for (const [code, ns] of names) {
    if (ns.length < 2) continue;
    const base = commonPrefix(ns).replace(/[·・\-\s]+$/, '').trim();
    if (base.length >= 4) byCode.get(code).name = base;
  }
  const list = [...byCode.values()].map((h) => ({ code: h.code, name: h.name, short: h.shortName || shortOf.get(h.name) || '' }));
  hospCache = { at: Date.now(), list };
  return list;
}

export async function matchHospitals(institutionName) {
  const nm = String(institutionName || '').trim();
  if (!nm) return [];
  const list = await loadHospitals();
  // 完全相符（全名或簡稱）優先：「臺北榮民總醫院」只通知北榮，不要因為「包含」規則連各分院一起通知。
  // 沒有完全相符才退回機構頁的包含比對（例：全名多了院區字樣）。
  const n = normalizeName(nm);
  const exact = list.filter((h) => normalizeName(h.name) === n || (h.short && normalizeName(h.short) === n));
  if (exact.length) return exact;
  return list.filter((h) => namesMatch(nm, h.name));
}

// /submit 成功後呼叫（ctx.waitUntil，不拖慢投稿回應）
export async function notifyNewComment(env, ctx, institutionName) {
  try {
    const hits = await matchHospitals(institutionName);
    if (!hits.length) return;
    const events = hits.map((h) => ({ code: h.code, kind: 'c', name: h.short || h.name, label: '有 1 則新分享' }));
    if (!(await enqueue(env, events, 86400))) return;
    // 交給新的一次執行去送：投稿這次已經用掉 Turnstile／AI 審稿／Apps Script 的子請求額度
    if (env.SELF && env.NOTIFY_TOKEN) {
      await env.SELF.fetch('https://self/push/drain', { method: 'POST', headers: { Authorization: `Bearer ${env.NOTIFY_TOKEN}` } });
    } else {
      await drain(env, ctx);
    }
  } catch (e) {
    console.warn('新分享推播失敗：', e.message);
  }
}
