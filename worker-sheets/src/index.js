// tn-sheets — Google Sheet 發布 CSV 的快取代理。
//
// 問題：docs.google.com 的發布 CSV 每次請求要 2–6 秒（違規紀錄 730KB 那份最慢），
//       分享平台一次要抓 10 份，首次造訪／快取過期時使用者得乾等。
// 做法：Cron 每 5 分鐘把白名單內的每份 CSV 抓回來存進 KV（內容有變才寫），
//       並依「群組」另存合併快照；使用者請求直接讀 KV 回傳，不再等 Google。
//
// 端點：
//   GET /bundle/<group>
//                 一次回傳整個群組：JSON { "<pubId>/<gid>": "<csv 文字>", … }，只讀 1 次 KV。
//                 share＝分享平台 10 類、viol＝違規紀錄 3 份 → 前端一般開頁只打 2 次（見 js/sheet-fetch.js）。
//   GET /spreadsheets/d/e/<pubId>/pub?gid=<gid>&single=true&output=csv
//                 單份，路徑與 Google 相同（網址的 https://docs.google.com 換成本 Worker）。
//   GET /spreadsheets/d/e/<pubId>/bundle
//                 舊版前端用的「同試算表合併包」（JSON { "<gid>": csv }）；由各分頁快照現組，過渡期保留。
//   GET /health   回各來源的快照時間（除錯用）
// 不在白名單的 (pubId, gid) 一律 404／不在包裡 → 前端會退回直連 Google，所以新增 Sheet 忘了加也不會壞。
//
// 新增／更換 Sheet：同步修改下方 SOURCES（與 js/env.js 的 LIVE.csvUrls、js/config.js 的 VIOL_FEEDS 對應）。

// [pubId, gid, 群組]
const SOURCES = [
  // 分享平台（js/env.js LIVE.csvUrls）
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1619966913', 'share'], // ward
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1085245300', 'share'], // icu
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1958504913', 'share'], // er
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1769109021', 'share'], // or
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1738656482', 'share'], // outpatient
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '572861337', 'share'],  // clinic
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '955402923', 'share'],  // dialysis
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1474979905', 'share'], // psych
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1310869433', 'share'], // special
  ['2PACX-1vRnAcUKN-H2XeRtwJNkpFKnCvYp0jT6fTcrnvfjWLLgn2BrikNJ9ou-XbNpZ4muZjCX9-MG_Km_egWD', '1127558216', 'share'], // other
  // 違規紀錄（js/config.js VIOL_FEEDS）
  ['2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN', '190468784', 'viol'],  // 勞檢
  ['2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy', '1540285352', 'viol'], // 性平
  ['2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_', '1130584206', 'viol'], // 職安
];

// 群組設定：daily＝更新頻率低，Cron 每天只在台北 04:00 那輪抓（違規紀錄一天更新一次就夠）
const GROUPS = {
  share: { daily: false },
  viol: { daily: true },
};

const UPSTREAM_TIMEOUT_MS = 20000;
const DAILY_UTC_HOUR = 20;  // 20:00 UTC = 台北 04:00
const isDailyRun = (scheduledTime) => {
  const d = new Date(scheduledTime);
  return d.getUTCHours() === DAILY_UTC_HOUR && d.getUTCMinutes() < 5;
};
// 內容沒變也每 6 小時寫一次，讓 metadata.fetchedAt 反映「最近確認過」而非停在上次變動
// （免費方案每日 1000 次寫入；每小時一次要 ~260 次，6 小時一次降到 ~45 次）
const STALE_WRITE_MS = 6 * 60 * 60 * 1000;
// 同一個 isolate 內，KV 讀到的內容在記憶體留 60 秒，減少 KV 讀取次數（免費方案每日 10 萬次）
const MEMO_MS = 60 * 1000;
const memo = new Map();     // kvKey → { body, fetchedAt, at }
// 本 isolate 所知 KV 內每份快照的 metadata（Cron 比對內容有沒有變用，省一次 KV 讀取）
const written = new Map();  // kvKey → { hash, fetchedAt }

const kvKey = (id, gid) => `csv:${id}:${gid}`;
const groupKey = (group) => `group:${group}`;
const partKey = (id, gid) => `${id}/${gid}`;
const upstreamUrl = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`;
const isKnown = (id, gid) => SOURCES.some(([i, g]) => i === id && g === gid);
const membersOf = (group) => SOURCES.filter(([, , g]) => g === group);
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

// 內容有變（或距上次寫入超過 6 小時）才寫 KV。回傳記憶體快照。
async function putIfChanged(env, key, body, hash) {
  let prevMeta = written.get(key);
  if (!prevMeta) prevMeta = (await env.SHEETS.getWithMetadata(key)).metadata;
  const fetchedAt = Date.now();
  if (!prevMeta || prevMeta.hash !== hash || fetchedAt - prevMeta.fetchedAt > STALE_WRITE_MS) {
    await env.SHEETS.put(key, body, { metadata: { hash, fetchedAt } });
    written.set(key, { hash, fetchedAt });
  } else {
    written.set(key, prevMeta);
  }
  const snap = { body, fetchedAt, at: fetchedAt };
  memo.set(key, snap);
  return snap;
}

// 重抓一份單頁 CSV。回傳 { body, hash, fetchedAt }。
async function refresh(env, id, gid) {
  const body = await fetchUpstream(id, gid);
  const hash = await sha256Hex(body);
  const snap = await putIfChanged(env, kvKey(id, gid), body, hash);
  return { body, hash, fetchedAt: snap.fetchedAt };
}

async function readKey(env, key) {
  const m = memo.get(key);
  if (m && Date.now() - m.at < MEMO_MS) return m;
  const { value, metadata } = await env.SHEETS.getWithMetadata(key);
  if (value == null) return null;
  const snap = { body: value, fetchedAt: metadata ? metadata.fetchedAt : 0, at: Date.now() };
  memo.set(key, snap);
  return snap;
}

const readSnapshot = (env, id, gid) => readKey(env, kvKey(id, gid));

// 單頁快照，KV 沒有就抓上游（剛部署、Cron 尚未跑過）
async function snapshotOrFetch(env, id, gid) {
  const snap = await readSnapshot(env, id, gid);
  return snap ? { body: snap.body, hash: await sha256Hex(snap.body) } : refresh(env, id, gid);
}

// 群組合併快照：parts 為 { "<pubId>/<gid>": { body, hash } }
async function writeGroup(env, group, parts) {
  const keys = Object.keys(parts).sort();
  const hash = await sha256Hex(keys.map((k) => `${k}:${parts[k].hash}`).join('|'));
  const body = JSON.stringify(Object.fromEntries(keys.map((k) => [k, parts[k].body])));
  return putIfChanged(env, groupKey(group), body, hash);
}

async function readGroup(env, group) {
  const snap = await readKey(env, groupKey(group));
  if (snap) return snap;
  // 合併快照還沒有 → 由各分頁快照現組一份並存起來
  const parts = {};
  await Promise.all(membersOf(group).map(async ([id, gid]) => {
    parts[partKey(id, gid)] = await snapshotOrFetch(env, id, gid);
  }));
  return writeGroup(env, group, parts);
}

// 舊版前端的同試算表合併包：由各分頁快照現組（過渡期用，不另存）
async function readLegacyPubBundle(env, id) {
  const gids = SOURCES.filter(([i]) => i === id).map(([, g]) => g);
  const out = {};
  let fetchedAt = Date.now();
  await Promise.all(gids.map(async (g) => {
    const snap = (await readSnapshot(env, id, g)) || (await refresh(env, id, g));
    out[g] = snap.body;
    fetchedAt = Math.min(fetchedAt, snap.fetchedAt);
  }));
  return { body: JSON.stringify(out), fetchedAt };
}

// workers.dev 不會自動壓縮；標上 Content-Encoding 後由 runtime 負責 gzip（730KB → 約 130KB）
function respond(snap, cacheState, request, contentType = 'text/csv; charset=utf-8') {
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

const JSON_TYPE = 'application/json; charset=utf-8';
const notFound = () => new Response('Not Found', { status: 404, headers: CORS });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const out = await Promise.all(SOURCES.map(async ([id, gid, group]) => {
        const { metadata } = await env.SHEETS.getWithMetadata(kvKey(id, gid));
        return { group, gid, fetchedAt: metadata ? new Date(metadata.fetchedAt).toISOString() : null };
      }));
      return new Response(JSON.stringify(out, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    const g = url.pathname.match(/^\/bundle\/(\w+)$/);
    if (g) {
      if (!GROUPS[g[1]]) return notFound();
      try {
        return respond(await readGroup(env, g[1]), 'GROUP', request, JSON_TYPE);
      } catch (e) {
        return new Response('Bundle Error: ' + e.message, { status: 502, headers: CORS });
      }
    }

    const b = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/bundle$/);
    if (b) {
      if (!PUB_IDS.includes(b[1])) return notFound();
      try {
        return respond(await readLegacyPubBundle(env, b[1]), 'BUNDLE', request, JSON_TYPE);
      } catch (e) {
        return new Response('Bundle Error: ' + e.message, { status: 502, headers: CORS });
      }
    }

    const m = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/pub$/);
    const gid = url.searchParams.get('gid') || '';
    if (!m || url.searchParams.get('output') !== 'csv' || !isKnown(m[1], gid)) return notFound();
    const id = m[1];

    try {
      const snap = await readSnapshot(env, id, gid);
      if (snap) return respond(snap, 'HIT', request);
    } catch (e) {
      console.warn('KV 讀取失敗，改直抓上游：', e.message);
    }
    try {
      return respond(await refresh(env, id, gid), 'MISS', request);
    } catch (e) {
      return new Response('Upstream Error: ' + e.message, { status: 502, headers: CORS });
    }
  },

  async scheduled(event, env, ctx) {
    const daily = isDailyRun(event.scheduledTime);
    const results = await Promise.allSettled(SOURCES.map(([id, gid, group]) =>
      (GROUPS[group].daily && !daily) ? Promise.resolve(null) : refresh(env, id, gid)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`刷新失敗 gid=${SOURCES[i][1]}：`, r.reason && r.reason.message);
    });
    // 群組合併快照：這輪有抓、且成員全部成功才寫；有任一失敗就保留上一份完整的
    for (const group of Object.keys(GROUPS)) {
      const idx = SOURCES.map(([, , gr], n) => (gr === group ? n : -1)).filter((n) => n >= 0);
      if (idx.some((n) => results[n].status !== 'fulfilled' || !results[n].value)) continue;
      const parts = Object.fromEntries(idx.map((n) => [partKey(SOURCES[n][0], SOURCES[n][1]), results[n].value]));
      try { await writeGroup(env, group, parts); } catch (e) { console.warn(`${group} 合併快照寫入失敗：`, e.message); }
    }
  },
};
