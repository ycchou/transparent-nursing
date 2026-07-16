// 違規紀錄類頁面共用模組：CSV 抓取 / 解析 / cache / 通用工具
// 給 violations.js (勞檢)、gender.js (性平)、osha.js (職安) 共用。

import { getShort as getHospitalShort } from './hospital-shortname.js?v=53d5d8c1e5';
import { normalizeInstitutionName } from './institution-name.js?v=53d5d8c1e5';

// ============================================================
// 通用工具
// ============================================================

// 民國年轉西元：'0115/1/15' → Date 物件
export function parseROCDate(str) {
  if (!str) return null;
  const cleaned = String(str).trim();
  const m = cleaned.match(/^0?(\d{1,3})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!m) return null;
  const rocYear = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!rocYear || !month || !day) return null;
  const adYear = rocYear + 1911;
  const d = new Date(adYear, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

export function formatROCDate(date) {
  if (!date) return '—';
  const rocYear = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${rocYear}/${m}/${d}`;
}

export function parseFine(str) {
  if (!str) return 0;
  const n = parseInt(String(str).replace(/[,,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

export function fmtFine(n) {
  if (!n) return '—';
  return n.toLocaleString();
}

// 從「勞動基準法第24條第1項;勞動基準法第32條...」抽出主條號 ["24", "32"]
export function extractLawArticles(str) {
  if (!str) return [];
  const matches = String(str).match(/第\s*(\d+)\s*條/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[^\d]/g, ''))));
}

// 主管機關長名稱 → 簡稱對應（科學園區/加工出口區歷年命名變更）
const LOC_ALIASES = {
  '國家科學及技術委員會新竹科學園區': '新竹科學園區',
  '國家科學及技術委員會新竹科學園區管理局': '新竹科學園區',
  '科技部新竹科學園區': '新竹科學園區',
  '科技部新竹科學園區管理局': '新竹科學園區',
  '科學工業園區管理局': '新竹科學園區',
  '國家科學及技術委員會中部科學園區': '中部科學園區',
  '國家科學及技術委員會中部科學園區管理局': '中部科學園區',
  '科技部中部科學工業園區': '中部科學園區',
  '科技部中部科學工業園區管理局': '中部科學園區',
  '國家科學及技術委員會南部科學園區': '南部科學園區',
  '國家科學及技術委員會南部科學園區管理局': '南部科學園區',
  '科技部南部科學工業園區': '南部科學園區',
  '科技部南部科學工業園區管理局': '南部科學園區',
  '經濟部加工出口區管理處': '加工出口區',
  '經濟部加工出口區管理處楠梓分處': '楠梓加工出口區',
  '經濟部加工出口區管理處臺中分處': '臺中加工出口區',
  '經濟部加工出口區管理處台中分處': '臺中加工出口區',
};

export function shortenLocation(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  if (LOC_ALIASES[t]) return LOC_ALIASES[t];
  const m = t.match(/(.*?)(新竹科學園區|中部科學園區|南部科學園區|加工出口區)$/);
  if (m && m[1]) return m[2];
  return t;
}

// 元 → 萬（給 KPI 卡用）
export function fineToWan(n) {
  if (!n) return null;
  const wan = n / 10000;
  if (wan >= 100) return Math.round(wan).toLocaleString();
  if (wan >= 10) return Math.round(wan).toString();
  return wan.toFixed(1).replace(/\.0$/, '');
}

// Debounce
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 讀 localStorage 拿目前 cache 的筆數（給 records.html 頂部 sub-tab 徽章用）
// 完全不 fetch、不解析日期，成本極低
export function getCachedCount(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.data)) return null;
    return obj.data.length;
  } catch { return null; }
}

// HTML escape（給 modal 內文字用）
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// ============================================================
// PapaParse 動態載入（讓沒掛 <script> 的頁面也能 preload）
// ============================================================

const PAPA_CDN = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
let _papaLoading = null;
export function ensurePapa() {
  if (typeof Papa !== 'undefined') return Promise.resolve();
  if (_papaLoading) return _papaLoading;
  _papaLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PAPA_CDN;
    s.async = true;
    s.onload = () => (typeof Papa !== 'undefined')
      ? resolve()
      : reject(new Error('Papa 未在載入後出現'));
    s.onerror = () => reject(new Error('PapaParse CDN 載入失敗'));
    document.head.appendChild(s);
  });
  return _papaLoading;
}

// ============================================================
// CSV loader factory：給每個資料來源建一個 { load, preload } 實例
// ============================================================

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 天
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;      // 6 小時
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// localStorage 快取的 record 結構版本。改動 parseRow 產出的欄位（如新增 articles）時 +1，
// 讓舊格式快取自動失效、重新抓取，避免新程式讀到缺欄位的舊快取而崩潰（如 r.articles.forEach）。
const CACHE_SCHEMA_VERSION = 2;

/**
 * @param {Object} cfg
 * @param {string} cfg.csvUrl - Google Sheets 發布 CSV 網址
 * @param {string} cfg.storageKey - localStorage key
 * @param {string} cfg.logTag - console.warn / log 的 tag，例如 '[violations]'
 * @param {number} [cfg.headerRowIdx=4] - CSV 前幾行是 metadata，data 從第 headerRowIdx+1 列開始
 * @param {(row: string[]) => Object} cfg.parseRow - 把 CSV 每列轉成 record 物件
 */
export function createCsvLoader(cfg) {
  const {
    csvUrl,
    storageKey,
    logTag,
    headerRowIdx = 4,
    parseRow,
    ttlMs = DEFAULT_TTL_MS,
    staleMs = DEFAULT_STALE_MS,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = cfg;

  async function fetchAndParse() {
    await ensurePapa();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let text;
    try {
      const res = await fetch(csvUrl, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data || [];
          const dataRows = rows.slice(headerRowIdx + 1);
          const parsed = dataRows
            .filter((r) => r && r[0] && String(r[0]).trim())
            .map(parseRow);
          resolve(parsed);
        },
        error: (err) => reject(err),
      });
    });
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !Array.isArray(obj.data)) return null;
      // 結構版本不符（舊格式快取）→ 視為無效，強制重新抓取，避免讀到缺欄位的資料
      if (obj.v !== CACHE_SCHEMA_VERSION) return null;
      const age = Date.now() - obj.ts;
      const valid = age <= ttlMs;
      const veryFresh = age <= staleMs;
      // ISO 字串 → Date 物件（把 record 內所有含 'Date' 字尾的欄位都試著轉）
      obj.data.forEach((r) => {
        for (const k of Object.keys(r)) {
          if (k.endsWith('Date') && typeof r[k] === 'string') {
            const d = new Date(r[k]);
            if (!isNaN(d.getTime())) r[k] = d;
          }
        }
      });
      return { data: obj.data, valid, veryFresh, age };
    } catch { return null; }
  }

  function writeLocal(rows) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: CACHE_SCHEMA_VERSION, ts: Date.now(), data: rows }));
    } catch {}
  }

  let _refreshing = false;
  function refreshInBackground() {
    if (_refreshing) return;
    _refreshing = true;
    fetchAndParse()
      .then((rows) => { writeLocal(rows); })
      .catch((e) => console.warn(`${logTag} 背景刷新失敗:`, e.message))
      .finally(() => { _refreshing = false; });
  }

  async function load() {
    const cached = readLocal();
    if (cached && cached.veryFresh) return cached.data;
    if (cached && cached.valid) {
      refreshInBackground();
      return cached.data;
    }
    try {
      const fresh = await fetchAndParse();
      writeLocal(fresh);
      return fresh;
    } catch (e) {
      if (cached) {
        console.warn(`${logTag} 抓 CSV 失敗，使用過期 cache:`, e.message);
        return cached.data;
      }
      throw e;
    }
  }

  function preload() {
    const cached = readLocal();
    if (cached && cached.veryFresh) return;
    if (cached && cached.valid) return;
    const trigger = () => {
      fetchAndParse()
        .then((rows) => writeLocal(rows))
        .catch((e) => console.warn(`${logTag} preload failed:`, e.message));
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(trigger, { timeout: 3000 });
    } else {
      setTimeout(trigger, 800);
    }
  }

  return { load, preload };
}

// ============================================================
// UI Factory：把 violations.html 那套 UI 提煉成可組態的 initRecordsPage
// 需要 HTML 有以下 DOM ID（各頁面共用）：
//   records-kpi-total / -orgs / -fine / -latest
//   records-filter-badge
//   records-search
//   records-loc-filter / -law-filter
//   records-count
//   records-table-container
// ============================================================

import { icon, renderIcons } from './icons.js?v=53d5d8c1e5';
import { ensureTooltip } from './tooltip.js?v=53d5d8c1e5';
import { pageSlice, renderPagination } from './pagination.js?v=53d5d8c1e5';

// 違規機構名稱 → 機構代號 對照表（離線預建，供機構名稱連到整合檔案頁）
let _violHospitalMap = null;
let _violHospitalMapLoading = null;
function ensureViolHospitalMap() {
  if (_violHospitalMap) return Promise.resolve(_violHospitalMap);
  if (_violHospitalMapLoading) return _violHospitalMapLoading;
  _violHospitalMapLoading = fetch('data/violations-hospital-map.json?v=f3d4b868a4', { cache: 'default' })
    .then((r) => (r.ok ? r.json() : { map: {} }))
    .then((d) => { _violHospitalMap = (d && d.map) || {}; return _violHospitalMap; })
    .catch(() => { _violHospitalMap = {}; return _violHospitalMap; });
  return _violHospitalMapLoading;
}

/**
 * @param {Object} cfg
 * @param {{ load: Function, preload: Function }} cfg.loader - createCsvLoader() 的產物
 * @param {(article: string) => string} cfg.articleLabel - 條號 → 白話標籤
 * @param {string} cfg.lawShort - 例：'勞基法' / '性平法' / '職安法'（給 chip tooltip 用）
 * @param {string} cfg.modalTag - 例：'勞檢紀錄'（modal header 顯示）
 * @param {string} cfg.logTag - '[violations]' 等
 * @param {(row: Object) => Array<{label: string, value: string}>} [cfg.extraModalFields] - modal 額外欄位
 * @param {string} cfg.storageDomId - modal backdrop 的 id，避免多頁面殘留衝突（例 'records-detail-modal'）
 */
export function initRecordsPage(cfg) {
  const {
    loader,
    articleLabel,
    lawShort,
    modalTag,
    logTag,
    extraModalFields,
    storageDomId = 'records-detail-modal',
  } = cfg;

  const state = { rows: [], q: '', location: 'all', article: 'all', page: 1 };

  function applyFilters() {
    const q = state.q.toLowerCase();
    return state.rows.filter((r) => {
      if (state.location !== 'all' && r.location !== state.location) return false;
      if (state.article !== 'all' && !(r.articles || []).includes(state.article)) return false;
      if (q) {
        const short = getHospitalShort(r.institutionName) || '';
        const hay = `${r.institutionName} ${short} ${r.lawArticle} ${r.lawDesc} ${r.location} ${r.locationRaw || ''} ${r.docId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function setKpi(id, html, opts = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('is-text', !!opts.isText);
  }

  function renderKPI() {
    const all = state.rows;
    const orgs = new Set();
    let maxFine = 0;
    let latest = null;
    all.forEach((r) => {
      const cleanName = normalizeInstitutionName(r.institutionName);
      if (cleanName) orgs.add(cleanName);
      if (r.fine > maxFine) maxFine = r.fine;
      if (r.penaltyDate && (!latest || r.penaltyDate > latest)) latest = r.penaltyDate;
    });
    setKpi('records-kpi-total', `${all.length.toLocaleString()}<span class="kpi-unit">筆</span>`);
    setKpi('records-kpi-orgs', `${orgs.size.toLocaleString()}<span class="kpi-unit">家</span>`);
    setKpi('records-kpi-fine', maxFine
      ? `${fineToWan(maxFine)}<span class="kpi-unit">萬</span>`
      : '—');
    setKpi('records-kpi-latest', latest ? formatROCDate(latest) : '—', { isText: true });
  }

  function renderLocationFilter() {
    const groups = {};
    state.rows.forEach((r) => {
      if (!r.location) return;
      if (!groups[r.location]) groups[r.location] = { n: 0, rawSet: new Set() };
      groups[r.location].n++;
      if (r.locationRaw && r.locationRaw !== r.location) {
        groups[r.location].rawSet.add(r.locationRaw);
      }
    });
    const sorted = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
    const items = [
      { slug: 'all', name: '全部', tip: null, n: state.rows.length },
      ...sorted.map(([loc, g]) => ({
        slug: loc, name: loc,
        tip: g.rawSet.size ? Array.from(g.rawSet).join(' / ') : null,
        n: g.n,
      })),
    ];
    const el = document.getElementById('records-loc-filter');
    if (!el) return;
    el.innerHTML = items.map((it) => {
      const tipAttr = it.tip ? `data-tip="${it.tip.replaceAll('"', '&quot;')}"` : '';
      return `<span class="filter-chip ${state.location === it.slug ? 'active' : ''}" data-slug="${it.slug}" ${tipAttr}>${it.name} <span style="opacity:.6;font-size:0.78em;">${it.n}</span></span>`;
    }).join('');
    el.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.location = chip.dataset.slug;
        state.page = 1;
        renderLocationFilter();
        renderAll();
      });
    });
  }

  function renderLawFilter() {
    const counts = {};
    state.rows.forEach((r) => (r.articles || []).forEach((a) => { counts[a] = (counts[a] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const items = [
      { slug: 'all', name: '全部', tip: null, n: state.rows.length },
      ...top.map(([a, n]) => ({ slug: a, name: articleLabel(a), tip: `${lawShort}第 ${a} 條`, n })),
    ];
    const el = document.getElementById('records-law-filter');
    if (!el) return;
    el.innerHTML = items.map((it) => {
      const tipAttr = it.tip ? `data-tip="${it.tip}"` : '';
      return `<span class="filter-chip ${state.article === it.slug ? 'active' : ''}" data-slug="${it.slug}" ${tipAttr}>${it.name} <span style="opacity:.6;font-size:0.78em;">${it.n}</span></span>`;
    }).join('');
    el.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.article = chip.dataset.slug;
        state.page = 1;
        renderLawFilter();
        renderAll();
      });
    });
  }

  function renderLawChips(articles, fallback) {
    if (!articles || !articles.length) return `<span class="cell-trunc" title="${(fallback || '').replaceAll('"', '&quot;')}">${fallback || '—'}</span>`;
    return articles.map((a) => `<span class="viol-law-chip" data-tip="${lawShort}第 ${a} 條">${articleLabel(a)}</span>`).join(' ');
  }

  function renderLocCell(r) {
    if (!r.location) return '<span class="viol-loc">—</span>';
    const needTip = r.locationRaw && r.locationRaw !== r.location;
    const tipAttr = needTip ? `data-tip="${r.locationRaw.replaceAll('"', '&quot;')}"` : '';
    return `<span class="viol-loc" ${tipAttr}>${r.location}</span>`;
  }

  // 機構名稱：若違規對照表命中，連到整合檔案頁（stopPropagation 避免觸發列 modal）
  function instCell(r) {
    const name = r.institutionName || '';
    if (!name) return '—';
    const code = _violHospitalMap && _violHospitalMap[name];
    if (!code) return escapeHtml(name);
    return `<a href="hospital.html?code=${encodeURIComponent(code)}" onclick="event.stopPropagation()" title="查看整合檔案">${escapeHtml(name)}</a>`;
  }

  function renderTable() {
    const filtered = applyFilters();
    filtered.sort((a, b) => {
      if (a.penaltyDate && b.penaltyDate) return b.penaltyDate - a.penaltyDate;
      if (a.penaltyDate) return -1;
      if (b.penaltyDate) return 1;
      return 0;
    });

    const countEl = document.getElementById('records-count');
    if (countEl) countEl.textContent =
      `共 ${filtered.length.toLocaleString()} 筆${state.rows.length !== filtered.length ? `（已套用篩選 / 全部 ${state.rows.length.toLocaleString()} 筆）` : ''}`;

    const badge = document.getElementById('records-filter-badge');
    if (badge) badge.hidden = !(state.location !== 'all' || state.article !== 'all' || state.q);

    const c = document.getElementById('records-table-container');
    if (!c) return;
    if (filtered.length === 0) {
      c.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:48px 24px;">沒有符合條件的紀錄</div>`;
      return;
    }
    const pageInfo = pageSlice(filtered, state.page);
    const pageRows = pageInfo.items;

    c.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table viol-table">
          <thead>
            <tr>
              <th class="seq-col">#</th>
              <th>處分日期</th>
              <th>地點</th>
              <th class="viol-inst-col">機構名稱</th>
              <th>違反法條</th>
              <th style="text-align:right;">罰鍰 (元)</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((r) => `
              <tr class="viol-row" data-id="${r.id}">
                <td class="seq-col">#${r.id}</td>
                <td><span class="viol-date">${r.penaltyDate ? formatROCDate(r.penaltyDate) : r.penaltyDateRaw || '—'}</span></td>
                <td>${renderLocCell(r)}</td>
                <td class="viol-inst-cell">${instCell(r)}</td>
                <td>${renderLawChips(r.articles, r.lawArticle)}</td>
                <td class="viol-fine">${fmtFine(r.fine)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination-mount"></div>
    `;

    c.querySelectorAll('.viol-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = tr.dataset.id;
        const row = state.rows.find((r) => r.id === id);
        if (row) { setDeepLinkUrl(id); openDetailModal(row); }
      });
    });

    renderPagination(c.querySelector('.pagination-mount'), pageInfo, (newPage) => {
      state.page = newPage;
      renderTable();
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderAll() { renderTable(); }

  // ===== Deep link =====
  function parseDeepLinkId() {
    const raw = new URL(location.href).searchParams.get('id');
    return raw ? String(raw).trim() : null;
  }
  function setDeepLinkUrl(id, replace = false) {
    const u = new URL(location.href);
    if (id == null) u.searchParams.delete('id');
    else u.searchParams.set('id', String(id));
    history[replace ? 'replaceState' : 'pushState']({ id: id ?? null }, '', u.toString());
  }

  // ===== Detail modal =====
  function openDetailModal(row) {
    const backdrop = document.getElementById(storageDomId) || (() => {
      const el = document.createElement('div');
      el.id = storageDomId;
      el.className = 'modal-backdrop';
      document.body.appendChild(el);
      return el;
    })();

    const dateStr = row.penaltyDate ? formatROCDate(row.penaltyDate) : (row.penaltyDateRaw || '—');
    const pubStr = row.publishDate ? formatROCDate(row.publishDate) : (row.publishDateRaw || '—');
    const fineStr = row.fine ? row.fine.toLocaleString() : '—';
    const locFull = row.locationRaw || row.location || '—';
    const chipsHtml = renderLawChips(row.articles, row.lawArticle);

    const extraFields = extraModalFields ? extraModalFields(row) : [];
    const extraCoreHtml = extraFields
      .filter((f) => f.value && String(f.value).trim())
      .map((f) => `
        <div>
          <div class="key">${escapeHtml(f.label)}</div>
          <div class="val">${escapeHtml(f.value)}</div>
        </div>
      `).join('');

    backdrop.innerHTML = `
      <div class="modal viol-detail-modal" role="dialog">
        <div class="modal-header">
          <div style="min-width:0;flex:1;">
            <span class="viol-detail-tag">${escapeHtml(modalTag)} · #${row.id}</span>
            <h3 style="margin:8px 0 0;word-break:break-word;">${escapeHtml(row.institutionName) || '未填寫'}</h3>
            <div style="color:var(--muted);font-size:0.88rem;margin-top:4px;">
              ${escapeHtml(locFull)}${row.penaltyDate ? ' · ' + dateStr + ' 處分' : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
            <button id="viol-modal-copylink" class="btn btn-secondary" style="padding:8px 14px;font-size:0.85rem;gap:6px;" title="複製這筆的永久連結">
              ${icon('link', { size: 14 })}
              <span>複製連結</span>
            </button>
            <button class="modal-close" aria-label="關閉">${icon('x', { size: 16 })}</button>
          </div>
        </div>
        <div class="modal-grid">
          <div><div class="key">處分日期</div><div class="val">${dateStr}</div></div>
          <div><div class="key">公告日期</div><div class="val">${pubStr}</div></div>
          <div><div class="key">主管機關</div><div class="val">${escapeHtml(locFull)}</div></div>
          <div><div class="key">處分字號</div><div class="val">${escapeHtml(row.docId) || '—'}</div></div>
          <div><div class="key">罰鍰 (元)</div><div class="val" style="font-weight:600;color:var(--danger);">${fineStr}</div></div>
          <div><div class="key">違反法條 (標籤)</div><div class="val">${chipsHtml}</div></div>
          ${extraCoreHtml}
        </div>
        <hr class="divider" />
        <div>
          <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">違反法規條款（完整）</div>
          <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawArticle) || '—'}</p>
        </div>
        ${row.lawDesc ? `
          <hr class="divider" />
          <div>
            <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">法條敘述</div>
            <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawDesc)}</p>
          </div>
        ` : ''}
        ${row.note ? `
          <hr class="divider" />
          <div>
            <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">備註</div>
            <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.note)}</p>
          </div>
        ` : ''}
      </div>
    `;

    backdrop.classList.add('open');
    document.body.classList.add('viol-modal-open');

    const close = () => {
      backdrop.classList.remove('open');
      document.body.classList.remove('viol-modal-open');
      setDeepLinkUrl(null, true);
      document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', escHandler);

    const copyBtn = backdrop.querySelector('#viol-modal-copylink');
    const copyLabelEl = copyBtn?.querySelector('span:last-child');
    let copyResetTimer;
    copyBtn?.addEventListener('click', async () => {
      const u = new URL(location.href);
      u.searchParams.set('id', String(row.id));
      u.hash = '';
      const link = u.toString();
      const flashCopied = () => {
        copyBtn.classList.add('copied');
        if (copyLabelEl) copyLabelEl.textContent = '已複製';
        clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(() => {
          copyBtn.classList.remove('copied');
          if (copyLabelEl) copyLabelEl.textContent = '複製連結';
        }, 1800);
      };
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
          flashCopied();
        } else {
          window.prompt('請手動複製此連結：', link);
        }
      } catch {
        window.prompt('請手動複製此連結：', link);
      }
    });

    ensureTooltip();
  }

  function closeDetailModal() {
    const backdrop = document.getElementById(storageDomId);
    if (backdrop && backdrop.classList.contains('open')) {
      backdrop.classList.remove('open');
      document.body.classList.remove('viol-modal-open');
    }
  }

  // ===== 入口 =====
  return async function initPage() {
    const container = document.getElementById('records-table-container');
    if (container) {
      container.innerHTML = `
        <div class="data-table-wrap" style="padding:24px;">
          ${Array.from({ length: 8 }).map(() => `<div class="skeleton" style="height:36px;margin-bottom:8px;"></div>`).join('')}
        </div>`;
    }

    const pendingDeepLinkId = parseDeepLinkId();

    try {
      state.rows = await loader.load();
      renderKPI();
      renderLocationFilter();
      renderLawFilter();
      renderAll();
      renderIcons();
      ensureTooltip();

      // 載入違規對照表後重繪表格，讓可對應的機構名稱變成整合檔案連結
      ensureViolHospitalMap().then(() => renderAll());

      const input = document.getElementById('records-search');
      if (input) {
        input.addEventListener('input', debounce(() => {
          state.q = (input.value || '').trim();
          state.page = 1;
          renderAll();
        }, 200));
      }

      if (pendingDeepLinkId) {
        const target = state.rows.find((r) => r.id === pendingDeepLinkId);
        if (target) openDetailModal(target);
        else {
          setDeepLinkUrl(null, true);
          console.warn(`${logTag} 找不到 #${pendingDeepLinkId} 這筆資料`);
        }
      }

      window.addEventListener('popstate', () => {
        const id = parseDeepLinkId();
        if (id) {
          const row = state.rows.find((r) => r.id === id);
          if (row) openDetailModal(row);
        } else {
          closeDetailModal();
        }
      });
    } catch (e) {
      console.error(e);
      const cont = document.getElementById('records-table-container');
      if (cont) cont.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
      const cnt = document.getElementById('records-count');
      if (cnt) cnt.textContent = '載入失敗';
    }
  };
}

