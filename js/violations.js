// 勞檢紀錄頁面：fetch CSV → 解析 → 渲染表格 + 篩選 + KPI
// 資料來源：勞動部公開資料（透過 Google Sheets「發布到網路」CSV URL）

import { renderIcons } from './icons.js?v=16';
import { ensureTooltip } from './tooltip.js?v=16';
import { pageSlice, renderPagination } from './pagination.js?v=16';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN/pub?gid=190468784&single=true&output=csv';

const STORAGE_KEY = 'nursing_viol_v2'; // v2: 加入 locationRaw（簡稱與原始名稱分離）
const TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 天才完全失效（再之後才強制重抓）
const STALE_MS = 6 * 60 * 60 * 1000;      // 超過 6 小時即背景靜默更新（仍立即顯示 cache）
const FETCH_TIMEOUT_MS = 15000;

// CSV 結構：
//   第 1-4 行：metadata / 空行
//   第 5 行：欄位 header
//   第 6 行起：資料
// 欄位順序（從 0 開始）：
//   0: 編號
//   1: 縣市／單位別
//   2: 公告日期 (ROC: 0115/1/15)
//   3: 事業單位名稱(負責人)
//   4: 處分日期 (ROC)
//   5: 處分字號
//   6: 違反法規條款
//   7: 法條敘述
//   8: 罰鍰金額 (含 comma)
//   9: 備註
const HEADER_ROW_IDX = 4; // 第 5 行（0-indexed = 4）

// 民國年轉西元：'0115/1/15' → Date 物件
function parseROCDate(str) {
  if (!str) return null;
  const cleaned = String(str).trim();
  // 支援 0115/1/15、115/01/15、114/12/31 等多種寫法
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

function formatROCDate(date) {
  if (!date) return '—';
  const rocYear = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${rocYear}/${m}/${d}`;
}

function parseFine(str) {
  if (!str) return 0;
  const n = parseInt(String(str).replace(/[,，\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function fmtFine(n) {
  if (!n) return '—';
  return n.toLocaleString();
}

// 從「勞動基準法第24條第1項;勞動基準法第32條...」抽出主條號 ["24", "32"]
function extractLawArticles(str) {
  if (!str) return [];
  const matches = String(str).match(/第\s*(\d+)\s*條/g) || [];
  return Array.from(new Set(matches.map(m => m.replace(/[^\d]/g, ''))));
}

// 主管機關長名稱 → 簡稱對應（科學園區/加工出口區歷年命名變更）
const LOC_ALIASES = {
  // 新竹科學園區
  '國家科學及技術委員會新竹科學園區': '新竹科學園區',
  '國家科學及技術委員會新竹科學園區管理局': '新竹科學園區',
  '科技部新竹科學園區': '新竹科學園區',
  '科技部新竹科學園區管理局': '新竹科學園區',
  '科學工業園區管理局': '新竹科學園區',
  // 中部科學園區
  '國家科學及技術委員會中部科學園區': '中部科學園區',
  '國家科學及技術委員會中部科學園區管理局': '中部科學園區',
  '科技部中部科學工業園區': '中部科學園區',
  '科技部中部科學工業園區管理局': '中部科學園區',
  // 南部科學園區
  '國家科學及技術委員會南部科學園區': '南部科學園區',
  '國家科學及技術委員會南部科學園區管理局': '南部科學園區',
  '科技部南部科學工業園區': '南部科學園區',
  '科技部南部科學工業園區管理局': '南部科學園區',
  // 加工出口區
  '經濟部加工出口區管理處': '加工出口區',
  '經濟部加工出口區管理處楠梓分處': '楠梓加工出口區',
  '經濟部加工出口區管理處臺中分處': '臺中加工出口區',
  '經濟部加工出口區管理處台中分處': '臺中加工出口區',
};

function shortenLocation(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  if (LOC_ALIASES[t]) return LOC_ALIASES[t];
  // 通用 fallback：包含「科學園區」「加工出口區」等關鍵字仍想簡化
  const m = t.match(/(.*?)(新竹科學園區|中部科學園區|南部科學園區|加工出口區)$/);
  if (m && m[1]) return m[2];
  return t;
}

// 法條主條 → 白話標籤（精選常見幾條）
const LAW_LABELS = {
  '21': '工資',
  '22': '工資',
  '23': '工資',
  '24': '加班費',
  '30': '工時/出勤紀錄',
  '32': '延長工時',
  '34': '輪班間隔',
  '35': '休息時間',
  '36': '例假/休息日',
  '37': '國定假日',
  '38': '特休',
  '39': '假日工資',
  '46': '童工/未成年',
};

function articleLabel(article) {
  return LAW_LABELS[article] || `第 ${article} 條`;
}

// PapaParse 動態載入（讓 about/index 等沒掛 <script> 的頁面也能 preload）
const PAPA_CDN = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
let _papaLoading = null;
function ensurePapa() {
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

// 抓 CSV、跳過前 4 行、解析
async function fetchAndParse() {
  await ensurePapa();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let text;
  try {
    const res = await fetch(CSV_URL, { cache: 'no-store', signal: ctrl.signal });
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
        const dataRows = rows.slice(HEADER_ROW_IDX + 1);
        const parsed = dataRows
          .filter((r) => r && r[0] && String(r[0]).trim()) // 跳掉沒編號的空列
          .map((r) => {
            const penaltyDate = parseROCDate(r[4]);
            const publishDate = parseROCDate(r[2]);
            const locationRaw = String(r[1] || '').trim();
            return {
              id: String(r[0] || '').trim(),
              location: shortenLocation(locationRaw),
              locationRaw,
              publishDate,
              publishDateRaw: String(r[2] || '').trim(),
              institutionName: String(r[3] || '').trim(),
              penaltyDate,
              penaltyDateRaw: String(r[4] || '').trim(),
              docId: String(r[5] || '').trim(),
              lawArticle: String(r[6] || '').trim(),
              lawDesc: String(r[7] || '').trim(),
              fine: parseFine(r[8]),
              note: String(r[9] || '').trim(),
              articles: extractLawArticles(r[6]),
            };
          });
        resolve(parsed);
      },
      error: (err) => reject(err),
    });
  });
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !Array.isArray(obj.data)) return null;
    const age = Date.now() - obj.ts;
    const valid = age <= TTL_MS;     // 30 天內仍可用
    const veryFresh = age <= STALE_MS; // 6 小時內視為完全新鮮
    // 把 ISO 字串轉回 Date
    obj.data.forEach((r) => {
      if (r.publishDate) r.publishDate = new Date(r.publishDate);
      if (r.penaltyDate) r.penaltyDate = new Date(r.penaltyDate);
    });
    return { data: obj.data, valid, veryFresh, age };
  } catch { return null; }
}

function writeLocal(rows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), data: rows }));
  } catch {}
}

// 背景靜默刷新（不阻塞、不影響當前 UI）
let _refreshing = false;
function refreshInBackground() {
  if (_refreshing) return;
  _refreshing = true;
  fetchAndParse()
    .then((rows) => { writeLocal(rows); })
    .catch((e) => console.warn('[violations] 背景刷新失敗:', e.message))
    .finally(() => { _refreshing = false; });
}

async function load() {
  const cached = readLocal();
  // 完全新鮮（6 小時內）→ 直接用，不打網路
  if (cached && cached.veryFresh) return cached.data;
  // 30 天內但有點舊 → 立刻回傳 cache，背景靜默刷新
  if (cached && cached.valid) {
    refreshInBackground();
    return cached.data;
  }
  // 過期或無 cache → 去抓
  try {
    const fresh = await fetchAndParse();
    writeLocal(fresh);
    return fresh;
  } catch (e) {
    // 網路失敗 → 即使過期也回傳 cache（總比沒資料好）
    if (cached) {
      console.warn('[violations] 抓 CSV 失敗，使用過期 cache:', e.message);
      return cached.data;
    }
    throw e;
  }
}

// ============== UI ==============

const state = {
  rows: [],
  q: '',
  location: 'all',
  article: 'all',
  page: 1,
};

function applyFilters() {
  const q = state.q.toLowerCase();
  return state.rows.filter((r) => {
    if (state.location !== 'all' && r.location !== state.location) return false;
    if (state.article !== 'all' && !r.articles.includes(state.article)) return false;
    if (q) {
      const hay = `${r.institutionName} ${r.lawArticle} ${r.lawDesc} ${r.location} ${r.locationRaw || ''} ${r.docId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// 把元值換成「N 萬」格式：620000 → "62"；25000 → "2.5"；999999999 → "10萬+"
function fineToWan(n) {
  if (!n) return null;
  const wan = n / 10000;
  if (wan >= 100) return Math.round(wan).toLocaleString();
  if (wan >= 10) return Math.round(wan).toString();
  return wan.toFixed(1).replace(/\.0$/, '');
}

function setKpi(id, html, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  el.classList.toggle('is-text', !!opts.isText);
}

function renderKPI() {
  const all = state.rows;

  // 違規機構數（去重）
  const orgs = new Set();
  let maxFine = 0;
  let latest = null;
  all.forEach((r) => {
    const cleanName = r.institutionName.replace(/\(.*?\)$/, '').trim();
    if (cleanName) orgs.add(cleanName);
    if (r.fine > maxFine) maxFine = r.fine;
    if (r.penaltyDate && (!latest || r.penaltyDate > latest)) latest = r.penaltyDate;
  });

  setKpi('viol-kpi-total', `${all.length.toLocaleString()}<span class="kpi-unit">筆</span>`);
  setKpi('viol-kpi-orgs',  `${orgs.size.toLocaleString()}<span class="kpi-unit">家</span>`);
  setKpi('viol-kpi-fine',  maxFine
    ? `${fineToWan(maxFine)}<span class="kpi-unit">萬</span>`
    : '—');
  setKpi('viol-kpi-latest', latest ? formatROCDate(latest) : '—', { isText: true });
}

function renderLocationFilter() {
  // 蒐集每個簡稱的：筆數 + 出現過的全稱（讓 hover 能顯示完整來源）
  const groups = {}; // shortName → { n, rawSet }
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
      slug: loc,
      name: loc,
      tip: g.rawSet.size ? Array.from(g.rawSet).join(' / ') : null,
      n: g.n,
    })),
  ];
  const el = document.getElementById('viol-loc-filter');
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
  // 統計每條法規出現次數
  const counts = {};
  state.rows.forEach((r) => r.articles.forEach((a) => { counts[a] = (counts[a] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const items = [
    { slug: 'all', name: '全部', tip: null, n: state.rows.length },
    ...top.map(([a, n]) => ({ slug: a, name: articleLabel(a), tip: `勞基法第 ${a} 條`, n })),
  ];
  const el = document.getElementById('viol-law-filter');
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

function renderTable() {
  const filtered = applyFilters();
  // 預設依處分日期 desc，沒日期排到最後
  filtered.sort((a, b) => {
    if (a.penaltyDate && b.penaltyDate) return b.penaltyDate - a.penaltyDate;
    if (a.penaltyDate) return -1;
    if (b.penaltyDate) return 1;
    return 0;
  });

  document.getElementById('viol-count').textContent =
    `共 ${filtered.length.toLocaleString()} 筆${state.rows.length !== filtered.length ? `（已套用篩選 / 全部 ${state.rows.length.toLocaleString()} 筆）` : ''}`;

  // badge：是否套用篩選
  const badge = document.getElementById('viol-filter-badge');
  if (badge) badge.hidden = !(state.location !== 'all' || state.article !== 'all' || state.q);

  const c = document.getElementById('viol-table-container');
  if (filtered.length === 0) {
    c.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:48px 24px;">沒有符合條件的紀錄</div>`;
    return;
  }

  // 每頁 100 筆
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
            <th>機構名稱</th>
            <th>違反法條</th>
            <th>法條敘述</th>
            <th style="text-align:right;">罰鍰 (元)</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map((r) => `
            <tr>
              <td class="seq-col">#${r.id}</td>
              <td><span class="viol-date">${r.penaltyDate ? formatROCDate(r.penaltyDate) : r.penaltyDateRaw || '—'}</span></td>
              <td>${renderLocCell(r)}</td>
              <td><span class="cell-trunc" data-key="institutionName" title="${(r.institutionName || '').replaceAll('"','&quot;')}">${r.institutionName || '—'}</span></td>
              <td>${renderLawChips(r.articles, r.lawArticle)}</td>
              <td><span class="cell-trunc viol-desc" title="${(r.lawDesc || '').replaceAll('"','&quot;')}">${r.lawDesc || '—'}</span></td>
              <td class="viol-fine">${fmtFine(r.fine)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="pagination-mount"></div>
  `;

  renderPagination(c.querySelector('.pagination-mount'), pageInfo, (newPage) => {
    state.page = newPage;
    renderTable();
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderLawChips(articles, fallback) {
  if (!articles || !articles.length) return `<span class="cell-trunc" title="${(fallback || '').replaceAll('"','&quot;')}">${fallback || '—'}</span>`;
  return articles.map((a) => `<span class="viol-law-chip" data-tip="勞基法第 ${a} 條">${articleLabel(a)}</span>`).join(' ');
}

function renderLocCell(r) {
  if (!r.location) return '<span class="viol-loc">—</span>';
  // 若原始名稱與簡稱不同，hover 顯示完整全稱
  const needTip = r.locationRaw && r.locationRaw !== r.location;
  const tipAttr = needTip ? `data-tip="${r.locationRaw.replaceAll('"', '&quot;')}"` : '';
  return `<span class="viol-loc" ${tipAttr}>${r.location}</span>`;
}

function renderAll() {
  renderTable();
}

// Debounce
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/**
 * 背景預載：使用瀏覽器閒置時段抓回勞檢資料並寫入 localStorage。
 * 在 index/about/participate 等不需要資料的頁面悄悄預熱，
 * 等使用者進入 violations.html 時資料已就緒。
 *
 * - cache 完全新鮮（< 6h）→ 不打網路（零成本）
 * - cache 仍有效（< 30d）→ 不做任何事（會在使用者真正進頁面時才背景刷新）
 * - cache 無或過期 → 用 requestIdleCallback 在閒置時抓
 */
export function preloadViolations() {
  const cached = readLocal();
  if (cached && cached.veryFresh) return; // 6 小時內什麼都不用做
  if (cached && cached.valid) return;     // 30 天內也先不主動更新（避免在 idle 太頻繁）
  const trigger = () => {
    fetchAndParse()
      .then((rows) => writeLocal(rows))
      .catch((e) => console.warn('[viol-preload] failed:', e.message));
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(trigger, { timeout: 3000 });
  } else {
    setTimeout(trigger, 800);
  }
}

export async function initViolations() {
  const container = document.getElementById('viol-table-container');
  container.innerHTML = `
    <div class="data-table-wrap" style="padding:24px;">
      ${Array.from({length:8}).map(() => `<div class="skeleton" style="height:36px;margin-bottom:8px;"></div>`).join('')}
    </div>`;

  try {
    state.rows = await load();
    renderKPI();
    renderLocationFilter();
    renderLawFilter();
    renderAll();
    renderIcons();
    ensureTooltip();

    // search input
    const input = document.getElementById('viol-search');
    if (input) {
      input.addEventListener('input', debounce(() => {
        state.q = (input.value || '').trim();
        state.page = 1;
        renderAll();
      }, 200));
    }
  } catch (e) {
    console.error(e);
    document.getElementById('viol-table-container').innerHTML =
      `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
    document.getElementById('viol-count').textContent = '載入失敗';
  }
}
