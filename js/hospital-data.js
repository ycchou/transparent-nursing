// hospital-data.js — 機構總覽頁的資料載入與共用狀態（醫院清單、違規對照、護病比單院小檔、眾包與違規資料）。

import { loadAll } from './data-loader.js?v=31f67186c8';

import { createCsvLoader } from './csv-loader.js?v=31f67186c8';
import { parseROCDate, parseFine, shortenLocation } from './records-format.js?v=31f67186c8';

import { registerFormerCodes } from './hospital-merges.js?v=31f67186c8';

import { VIOL_FEEDS } from './config.js?v=31f67186c8';

const MERGED_URL = 'data/hospitals-merged.json?v=351c442704';
const VIOL_MAP_URL = 'data/violations-hospital-map.json?v=bd99316e15';
const ADDR_OVERLAY_URL = 'data/hospitals-address-overlay.json?v=50f6f147a8';

const parseViolRow = (r) => ({
  id: String(r[0] || '').trim(),
  location: shortenLocation(String(r[1] || '').trim()),
  locationRaw: String(r[1] || '').trim(),
  publishDate: parseROCDate(r[2]),
  publishDateRaw: String(r[2] || '').trim(),
  institutionName: String(r[3] || '').trim(),
  penaltyDate: parseROCDate(r[4]),
  penaltyDateRaw: String(r[4] || '').trim(),
  docId: String(r[5] || '').trim(),
  lawArticle: String(r[6] || '').trim(),
  lawDesc: String(r[7] || '').trim(),
  fine: parseFine(r[8]),
});

const violLoaders = VIOL_FEEDS.map((f) => ({
  ...f,
  loader: createCsvLoader({ csvUrl: f.url, storageKey: f.storageKey, logTag: `[hospital:${f.key}]`, parseRow: parseViolRow }),
}));

export const state = {
  merged: [],          // 去重後的評鑑醫院（每個 code 一筆）
  byCode: new Map(),    // code → merged entry
  violMap: {},          // 違規名稱 → code
  platformRows: null,   // 眾包資料（lazy）
  violRows: null,       // 違規資料（lazy，已 tag feed）
  currentCode: null,
  searchQuery: '',
  levelFilter: 'all',
  cityFilter: 'all',
};

// ---------- utils ----------
// 多字串的最長共同前綴（用於多院區取母院名）
function commonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (const s of strs) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}
function parseDeepLinkCode() {
  const raw = new URL(location.href).searchParams.get('code');
  return raw ? String(raw).trim() : null;
}
function setDeepLinkUrl(code, replace = false) {
  const u = new URL(location.href);
  if (code == null) u.searchParams.delete('code');
  else u.searchParams.set('code', String(code));
  history[replace ? 'replaceState' : 'pushState']({ code }, '', u.toString());
}

// ---------- data loading ----------
async function fetchJson(url) {
  // 靜態 JSON 皆帶 ?v= 版本號破快取，故可交給瀏覽器快取（改版換 URL 才重抓），回訪更快。
  const r = await fetch(url, { cache: 'default' });
  if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
  return r.json();
}

export async function loadBaseData() {
  // 護病比不再整包載入：改在 renderNurseSection 依 code 惰性載入小檔（見下）。
  const [merged, violMapDoc, addrDoc] = await Promise.all([
    fetchJson(MERGED_URL),
    fetchJson(VIOL_MAP_URL).catch(() => ({ map: {} })),
    fetchJson(ADDR_OVERLAY_URL).catch(() => ({ overlay: {} })),
  ]);

  registerFormerCodes(merged.hospitals);

  // 地址 overlay：以代碼補 vpn-only 醫院缺的地址/縣市/電話（僅補原本缺的欄位）
  const addrOverlay = (addrDoc && addrDoc.overlay) || {};

  // 去重：每個 code 保留名稱最短的 base entry（多院區時取母院）
  const byCode = new Map();
  const namesByCode = new Map();
  (merged.hospitals || []).forEach((h) => {
    if (!h.code || !h.name) return;
    const o = addrOverlay[h.code];
    if (o) {
      if (!(h.address || '').trim() && o.address) h.address = o.address;
      if (!(h.city || '').trim() && o.city) h.city = o.city;
      if (!(h.phone || '').trim() && o.phone) h.phone = o.phone;
    }
    const arr = namesByCode.get(h.code) || [];
    arr.push(h.name);
    namesByCode.set(h.code, arr);
    const prev = byCode.get(h.code);
    if (!prev || h.name.length < prev.name.length) byCode.set(h.code, h);
  });
  // 共用代號的多院區（北市聯醫/耕莘/新竹臺大）：機構標頭顯示各院區「共同前綴」＝母院名，
  // 而非任一分院（分院明細仍在下方護病比區逐一顯示）。
  namesByCode.forEach((names, code) => {
    if (names.length < 2) return;
    const base = commonPrefix(names).replace(/[·・\-\s]+$/, '').trim();
    const entry = byCode.get(code);
    if (entry && base.length >= 4) entry.name = base;
  });
  state.byCode = byCode;
  state.merged = [...byCode.values()];
  state.violMap = (violMapDoc && violMapDoc.map) || {};
}

// 護病比單院小檔（機構總覽用）：data/nurse-ratio/by-code/{code}.json → { months, hospitals }
const _nrCodeCache = new Map();
export async function loadNurseByCode(code) {
  if (_nrCodeCache.has(code)) return _nrCodeCache.get(code);
  try {
    const r = await fetch(`data/nurse-ratio/by-code/${code}.json?v=040b3f83fc`, { cache: 'default' });
    const d = r.ok ? await r.json() : null;
    _nrCodeCache.set(code, d);
    return d;
  } catch {
    _nrCodeCache.set(code, null);
    return null;
  }
}

export async function ensurePlatformRows() {
  if (state.platformRows) return state.platformRows;
  try {
    state.platformRows = await loadAll();
  } catch (e) {
    console.warn('[hospital] 眾包資料載入失敗:', e.message);
    state.platformRows = [];
  }
  return state.platformRows;
}

export async function ensureViolRows() {
  if (state.violRows) return state.violRows;
  const results = await Promise.all(violLoaders.map(async (f) => {
    try {
      const rows = await f.loader.load();
      return rows.map((r) => ({ ...r, feedTag: f.tag, lawShort: f.lawShort, feedKey: f.key }));
    } catch (e) {
      console.warn(`[hospital] ${f.key} 違規載入失敗:`, e.message);
      return [];
    }
  }));
  state.violRows = results.flat();
  return state.violRows;
}
