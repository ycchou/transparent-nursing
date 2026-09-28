// tn-sheets — Google Sheet 發布 CSV 的快取代理。
//
// 問題：docs.google.com 的發布 CSV 每次請求要 2–6 秒（違規紀錄 730KB 那份最慢），
//       分享平台一次要抓 10 份，首次造訪／快取過期時使用者得乾等。
// 做法：Cron 每 5 分鐘把白名單內的每份 CSV 抓回來存進 KV（內容有變才寫；標 'daily' 的每天只抓一次），
//       使用者請求直接讀 KV 回傳，不再等 Google。
//
// 端點：路徑與 Google 相同，前端只要把網址的 https://docs.google.com 換成本 Worker 即可：
//   GET /spreadsheets/d/e/<pubId>/pub?gid=<gid>&single=true&output=csv
//   GET /spreadsheets/d/e/<pubId>/bundle
//                 一次回傳同一試算表白名單內所有分頁：JSON { "<gid>": "<csv 文字>", … }。
//                 分享平台 10 類同在一個試算表 → 前端 10 次請求併成 1 次（見 js/sheet-fetch.js）。
//                 多分頁的試算表由 Cron 另存一份合併快照，每次請求只讀 1 次 KV。
//   GET /health   回各來源的快照時間（除錯用）
// 不在白名單的 (pubId, gid) 一律 404 → 前端會退回直連 Google，所以新增 Sheet 忘了加也不會壞。
//
// 新增／更換 Sheet：同步修改下方 SOURCES（與 js/env.js 的 LIVE.csvUrls、js/config.js 的 VIOL_FEEDS 對應）。

const SOURCES = [
  // 分享平台（js/env.js LIVE.csvUrls）
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1619966913'], // ward
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1085245300'], // icu
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1958504913'], // er
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1769109021'], // or
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1738656482'], // outpatient
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '572861337'],  // clinic
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '955402923'],  // dialysis
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1474979905'], // psych
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1310869433'], // special
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1127558216'], // other
  // 違規紀錄（js/config.js VIOL_FEEDS）：更新頻率低，標 'daily' → Cron 每天只在台北 04:00 那輪抓
  ['2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN', '190468784', 'daily'],  // 勞檢
  ['2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy', '1540285352', 'daily'], // 性平
  ['2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_', '1130584206', 'daily'], // 職安
];

const UPSTREAM_TIMEOUT_MS = 20000;
// 'daily' 來源只在這個 UTC 時段的第一輪 Cron 更新（20:00 UTC = 台北 04:00）
const DAILY_UTC_HOUR = 20;
const isDailyRun = (scheduledTime) => {
  const d = new Date(scheduledTime);
  return d.getUTCHours() === DAILY_UTC_HOUR && d.getUTCMinutes() < 5;
};
// 同一個 isolate 內，KV 讀到的內容在記憶體留 60 秒，減少 KV 讀取次數（免費方案每日 10 萬次）
const MEMO_MS = 60 * 1000;
const memo = new Map();  // kvKey → { body, fetchedAt, at }
// 本 isolate 所知 KV 內每份快照的 metadata（Cron 比對內容有沒有變用）
const written = new Map();  // kvKey → { hash, fetchedAt }

const kvKey = (id, gid) => `csv:${id}:${gid}`;
const upstreamUrl = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`;
const isKnown = (id, gid) => SOURCES.some(([i, g]) => i === id && g === gid);
const gidsOf = (id) => SOURCES.filter(([i]) => i === id).map(([, g]) => g);
const bundleKey = (id) => `bundle:${id}`;
const PUB_IDS = [...new Set(SOURCES.map(([id]) => id))];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 抓 Google 原始 CSV。Sheet 若被取消發布，Google 會回 200 的 HTML 登入頁 → 以 content-type 擋掉，
// 不讓它蓋掉 KV 裡最後一份好的快照。
async function fetchUpstream(id, gid) {
  const res = await fetch(upstreamUrl(id, gid), {
    redirect: 'follow',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/csv')) throw new Error(`upstream 非 CSV（${type}）`);
  return res.text();
}

// 重抓一份並在內容有變時寫入 KV。回傳 { body, fetchedAt, changed }。
async function refresh(env, id, gid) {
  const key = kvKey(id, gid);
  const body = await fetchUpstream(id, gid);
  const hash = await sha256Hex(body);
  // Cron 定時跑：本 isolate 記得上次寫入的 metadata 就不再讀 KV 比對，省讀取額度
  let prevMeta = written.get(key);
  if (!prevMeta) prevMeta = (await env.SHEETS.getWithMetadata(key)).metadata;
  const fetchedAt = Date.now();
  const changed = !prevMeta || prevMeta.hash !== hash;
  // 內容沒變也每小時寫一次，讓 metadata.fetchedAt 反映「最近確認過」而非停在上次變動
  const stale = prevMeta && fetchedAt - prevMeta.fetchedAt > 60 * 60 * 1000;
  if (changed || stale) {
    await env.SHEETS.put(key, body, { metadata: { hash, fetchedAt } });
    written.set(key, { hash, fetchedAt });
  } else {
    written.set(key, prevMeta);
  }
  memo.set(key, { body, fetchedAt, at: fetchedAt });
  return { body, hash, fetchedAt, changed };
}

async function readSnapshot(env, id, gid) {
  const key = kvKey(id, gid);
  const m = memo.get(key);
  if (m && Date.now() - m.at < MEMO_MS) return m;
  const { value, metadata } = await env.SHEETS.getWithMetadata(key);
  if (value == null) return null;
  const snap = { body: value, fetchedAt: metadata ? metadata.fetchedAt : 0, at: Date.now() };
  memo.set(key, snap);
  return snap;
}

// 把同一試算表各分頁的內容合併存成一份（內容有變或距上次寫入超過 1 小時才寫）。
// parts：{ gid: { body, hash } }
async function writeBundle(env, id, parts) {
  const key = bundleKey(id);
  const gids = Object.keys(parts).sort();
  const hash = await sha256Hex(gids.map((g) => `${g}:${parts[g].hash}`).join('|'));
  let prevMeta = written.get(key);
  if (!prevMeta) prevMeta = (await env.SHEETS.getWithMetadata(key)).metadata;
  const fetchedAt = Date.now();
  const body = JSON.stringify(Object.fromEntries(gids.map((g) => [g, parts[g].body])));
  const stale = prevMeta && fetchedAt - prevMeta.fetchedAt > 60 * 60 * 1000;
  if (!prevMeta || prevMeta.hash !== hash || stale) {
    await env.SHEETS.put(key, body, { metadata: { hash, fetchedAt } });
    written.set(key, { hash, fetchedAt });
  } else {
    written.set(key, prevMeta);
  }
  const snap = { body, fetchedAt, at: fetchedAt };
  memo.set(key, snap);
  return snap;
}

// 讀某試算表的合併快照。只有一個分頁的試算表不另存合併檔，直接包那一份（仍只讀 1 次 KV）。
async function readBundle(env, id) {
  const gids = gidsOf(id);
  if (gids.length === 1) {
    const snap = (await readSnapshot(env, id, gids[0])) || (await refresh(env, id, gids[0]));
    return { body: JSON.stringify({ [gids[0]]: snap.body }), fetchedAt: snap.fetchedAt };
  }
  const key = bundleKey(id);
  const m = memo.get(key);
  if (m && Date.now() - m.at < MEMO_MS) return m;
  const { value, metadata } = await env.SHEETS.getWithMetadata(key);
  if (value != null) {
    const snap = { body: value, fetchedAt: metadata ? metadata.fetchedAt : 0, at: Date.now() };
    memo.set(key, snap);
    return snap;
  }
  // 合併檔還沒有（剛部署、Cron 尚未跑過）→ 由各分頁快照（沒有就抓上游）現組一份並存起來
  const parts = {};
  await Promise.all(gids.map(async (g) => {
    const snap = await readSnapshot(env, id, g);
    parts[g] = snap ? { body: snap.body, hash: await sha256Hex(snap.body) } : await refresh(env, id, g);
  }));
  return writeBundle(env, id, parts);
}

// workers.dev 不會自動壓縮 text/csv；標上 Content-Encoding 後由 runtime 負責 gzip（730KB → 約 100KB）
function csvResponse(snap, cacheState, request, contentType = 'text/csv; charset=utf-8') {
  const gzip = /\bgzip\b/.test(request.headers.get('Accept-Encoding') || '');
  return new Response(snap.body, {
    headers: {
      'Content-Type': contentType,
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      // 瀏覽器端各頁另有 localStorage 快取；這裡只給短暫的 HTTP 快取
      'Cache-Control': 'public, max-age=60',
      'X-Snapshot-At': new Date(snap.fetchedAt).toISOString(),
      'X-Cache': cacheState,
      ...CORS,
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const out = await Promise.all(SOURCES.map(async ([id, gid]) => {
        const { metadata } = await env.SHEETS.getWithMetadata(kvKey(id, gid));
        return { gid, fetchedAt: metadata ? new Date(metadata.fetchedAt).toISOString() : null };
      }));
      return new Response(JSON.stringify(out, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    const b = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/bundle$/);
    if (b) {
      if (!PUB_IDS.includes(b[1])) return new Response('Not Found', { status: 404, headers: CORS });
      try {
        return csvResponse(await readBundle(env, b[1]), 'BUNDLE', request, 'application/json; charset=utf-8');
      } catch (e) {
        return new Response('Bundle Error: ' + e.message, { status: 502, headers: CORS });
      }
    }

    const m = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/pub$/);
    const gid = url.searchParams.get('gid') || '';
    if (!m || url.searchParams.get('output') !== 'csv' || !isKnown(m[1], gid)) {
      return new Response('Not Found', { status: 404, headers: CORS });
    }
    const id = m[1];

    try {
      const snap = await readSnapshot(env, id, gid);
      if (snap) return csvResponse(snap, 'HIT', request);
    } catch (e) {
      console.warn('KV 讀取失敗，改直抓上游：', e.message);
    }

    // KV 還沒有（剛部署、Cron 尚未跑過）→ 同步抓一次並存起來
    try {
      const snap = await refresh(env, id, gid);
      return csvResponse(snap, 'MISS', request);
    } catch (e) {
      return new Response('Upstream Error: ' + e.message, { status: 502, headers: CORS });
    }
  },

  async scheduled(event, env, ctx) {
    const daily = isDailyRun(event.scheduledTime);
    const results = await Promise.allSettled(SOURCES.map(([id, gid, freq]) =>
      (freq === 'daily' && !daily) ? Promise.resolve(null) : refresh(env, id, gid)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`刷新失敗 gid=${SOURCES[i][1]}：`, r.reason && r.reason.message);
    });
    // 多分頁的試算表另存合併檔；有任一分頁這輪抓失敗就先不動，保留上一份完整的合併檔
    for (const id of PUB_IDS) {
      const idx = SOURCES.map(([i], n) => (i === id ? n : -1)).filter((n) => n >= 0);
      if (idx.length < 2 || idx.some((n) => results[n].status !== 'fulfilled' || !results[n].value)) continue;
      const parts = Object.fromEntries(idx.map((n) => [SOURCES[n][1], results[n].value]));
      try { await writeBundle(env, id, parts); } catch (e) { console.warn('合併檔寫入失敗：', e.message); }
    }
  },
};
