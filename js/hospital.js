// 單一機構整合檔案頁：輸入一家評鑑醫院 → 一次看護病比 / 分享平台眾包 / 違規紀錄
//
// 三源以「機構代號」為錨（只涵蓋 hospitals-merged.json 的 482 家評鑑醫院）：
//   - 護病比：data/nurse-ratio.json，以 code 對應（多院區則各分院各一張圖）
//   - 分享平台：眾包 CSV（data-loader.loadAll），以機構名稱/簡稱比對
//   - 違規紀錄：勞檢/性平/職安三支 Sheet，以 data/violations-hospital-map.json（名稱→代號）比對

import { renderIcons } from './icons.js?v=5f6b6ec96e';
import { getShort, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=5f6b6ec96e';
import { normalizeInstitutionName, institutionNameMatches } from './institution-name.js?v=5f6b6ec96e';
import {
  STANDARDS,
  COMPLIANCE_CLASSES,
  formatRocMonth,
  shiftStatus,
  classifyHospital,
  renderNurseChart,
} from './nurse-ratio-view.js?v=5f6b6ec96e';
import { loadAll } from './data-loader.js?v=5f6b6ec96e';
import { renderKpiStrip } from './stats-kpi.js?v=5f6b6ec96e';
import { renderTable, showDetailModal } from './table.js?v=5f6b6ec96e';
import { hasContributed } from './contribution-gate.js?v=5f6b6ec96e';
import { notePwaIntent } from './pwa-prompt.js?v=5f6b6ec96e';
import {
  loadFinancialsHospital, getFinancialFields,
  formatVal as finFormatVal, signClass as finSignClass, formatRocYear as finRocYear,
  renderFinancialTrendChart,
} from './financials-view.js?v=5f6b6ec96e';
import { feeMergedParent, reportMergedInfo } from './hospital-merges.js?v=5f6b6ec96e';
import {
  loadPersonnelHospital, ensurePersonnelIndex,
  renderStaffChart as renderPmStaffChart, renderBedChart as renderPmBedChart,
  latestMonthTable,
} from './personnel-view.js?v=5f6b6ec96e';
import {
  createCsvLoader,
  parseROCDate,
  parseFine,
  shortenLocation,
  fineToWan,
  formatROCDate,
} from './records-common.js?v=5f6b6ec96e';

const MERGED_URL = 'data/hospitals-merged.json?v=c017631e69';
const VIOL_MAP_URL = 'data/violations-hospital-map.json?v=f3d4b868a4';
const ADDR_OVERLAY_URL = 'data/hospitals-address-overlay.json?v=4f090ac4c9';

// 三支違規 Sheet（欄位 0-8 共用：id/location/publishDate/institutionName/penaltyDate/docId/lawArticle/lawDesc/fine）
const VIOL_FEEDS = [
  { key: 'labor', tag: '勞檢', lawShort: '勞基法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN/pub?gid=190468784&single=true&output=csv', storageKey: 'nursing_viol_v2' },
  { key: 'gender', tag: '性平', lawShort: '性平法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy/pub?gid=1540285352&single=true&output=csv', storageKey: 'nursing_gender_v1' },
  { key: 'osha', tag: '職安', lawShort: '職安法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_/pub?gid=1130584206&single=true&output=csv', storageKey: 'nursing_osha_v1' },
];

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

const state = {
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
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function levelSlug(lv) {
  return { '醫學中心': 'mc', '區域醫院': 'rg', '地區醫院': 'dt' }[lv] || 'other';
}
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

async function loadBaseData() {
  // 護病比不再整包載入：改在 renderNurseSection 依 code 惰性載入小檔（見下）。
  const [merged, violMapDoc, addrDoc] = await Promise.all([
    fetchJson(MERGED_URL),
    fetchJson(VIOL_MAP_URL).catch(() => ({ map: {} })),
    fetchJson(ADDR_OVERLAY_URL).catch(() => ({ overlay: {} })),
  ]);

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
async function loadNurseByCode(code) {
  if (_nrCodeCache.has(code)) return _nrCodeCache.get(code);
  try {
    const r = await fetch(`data/nurse-ratio/by-code/${code}.json?v=1dbde60d94`, { cache: 'default' });
    const d = r.ok ? await r.json() : null;
    _nrCodeCache.set(code, d);
    return d;
  } catch {
    _nrCodeCache.set(code, null);
    return null;
  }
}

async function ensurePlatformRows() {
  if (state.platformRows) return state.platformRows;
  try {
    state.platformRows = await loadAll();
  } catch (e) {
    console.warn('[hospital] 眾包資料載入失敗:', e.message);
    state.platformRows = [];
  }
  return state.platformRows;
}

async function ensureViolRows() {
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

// ---------- picker ----------
// 是否已套用任一篩選/搜尋（未套用時預設不列出全部機構）
function hasActiveFilter() {
  return state.searchQuery !== '' || state.levelFilter !== 'all' || state.cityFilter !== 'all';
}

function renderHospitalList() {
  const container = document.getElementById('hospital-list');
  if (!container) return;
  const countEl = document.getElementById('hospital-count');

  // 預設（未篩選）：不顯示整份名單，只給提示
  if (!hasActiveFilter()) {
    if (countEl) countEl.textContent = '—';
    container.innerHTML = `<div class="nurse-picker-hint" style="padding:20px;color:var(--muted);line-height:1.7;">
      請先選擇<strong>層級</strong>或<strong>地點</strong>，或輸入醫院名稱／簡稱／代號來搜尋。</div>`;
    return;
  }

  const q = state.searchQuery.toLowerCase();
  const filtered = state.merged.filter((h) => {
    if (state.levelFilter !== 'all' && h.level !== state.levelFilter) return false;
    if (state.cityFilter !== 'all' && (h.city || '(未知)') !== state.cityFilter) return false;
    if (q) {
      if (h.name.toLowerCase().includes(q)) return true;
      if (h.code.includes(q)) return true;
      const short = h.shortName || getShort(h.name);
      return !!(short && short.toLowerCase().includes(q));
    }
    return true;
  });

  if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} 家`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="nurse-picker-hint" style="padding:20px;color:var(--muted);">找不到符合條件的醫院。</div>`;
    return;
  }

  const grouped = { '醫學中心': [], '區域醫院': [], '地區醫院': [] };
  filtered.forEach((h) => { (grouped[h.level] || (grouped['其他'] = grouped['其他'] || [])).push(h); });

  const order = ['醫學中心', '區域醫院', '地區醫院', '其他'];
  container.innerHTML = order
    .filter((lv) => grouped[lv] && grouped[lv].length)
    .map((lv) => `
      <div class="nurse-level-group">
        <div class="nurse-level-title">
          <span class="nurse-level-badge nurse-level-${levelSlug(lv)}">${lv}</span>
          <span class="nurse-level-count">${grouped[lv].length} 家</span>
        </div>
        <div class="nurse-hospital-grid">
          ${grouped[lv].map((h) => {
            const short = h.shortName || getShort(h.name);
            const tip = [h.name, h.city, `代號 ${h.code}`].filter(Boolean).join(' · ');
            return `
              <button type="button" class="nurse-hospital-chip ${h.code === state.currentCode ? 'active' : ''}" data-code="${h.code}" title="${escapeHtml(tip)}">
                <span class="nurse-hospital-chip-name">${escapeHtml(short || h.name)}</span>
              </button>`;
          }).join('')}
        </div>
      </div>`).join('');

  container.querySelectorAll('.nurse-hospital-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectHospital(btn.dataset.code, true));
  });
}

// ---------- detail ----------
// 瀏覽第 N 家醫院即視為高意圖時刻 → 觸發「加到主畫面」提示
const HOSPITAL_VIEW_INTENT_AT = 2;
function bumpHospitalViewIntent(code) {
  try {
    const KEY = '__nursing_hospital_views';
    const n = (parseInt(localStorage.getItem(KEY) || '0', 10) || 0) + 1;
    localStorage.setItem(KEY, String(n));
    if (n === HOSPITAL_VIEW_INTENT_AT) notePwaIntent('hospital_browse', { showNow: true });
  } catch { /* localStorage 不可用時忽略 */ }
}

// ---------- 子頁簽（避免整頁長捲，各整合區塊分頁切換）----------
function activateHospTab(key) {
  const bar = document.getElementById('hosp-tabs');
  if (!bar) return;
  bar.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.hosp-tab-panel').forEach((p) => {
    const on = p.dataset.panel === key;
    p.hidden = !on;
    // 面板由隱藏轉顯示時重算圖表尺寸（Chart.js 於 display:none 建立會是 0 寬）
    if (on && typeof Chart !== 'undefined') {
      p.querySelectorAll('canvas').forEach((cv) => { const ch = Chart.getChart(cv); if (ch) ch.resize(); });
    }
  });
}

function setupHospitalTabs() {
  const bar = document.getElementById('hosp-tabs');
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = '1';
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn && btn.dataset.tab) activateHospTab(btn.dataset.tab);
  });
}

function selectHospital(code, updateUrl = false) {
  const hosp = state.byCode.get(code);
  if (!hosp) return;
  if (state.currentCode !== code) bumpHospitalViewIntent(code);
  state.currentCode = code;
  if (updateUrl) setDeepLinkUrl(code);
  renderHospitalList();
  renderHeader(hosp);
  document.getElementById('hospital-placeholder').hidden = true;
  document.getElementById('hospital-detail').hidden = false;
  renderNurseSection(code, hosp);
  renderFinancialsSection(code);
  renderPersonnelSection(code);
  renderPlatformSection(hosp);
  renderViolationsSection(code, hosp);
  activateHospTab('nr');   // 每次選院回到第一個頁簽
  renderIcons();
  try { window.scrollTo({ top: document.getElementById('hospital-detail').offsetTop - 60, behavior: 'smooth' }); } catch {}
}

function renderHeader(hosp) {
  document.getElementById('hosp-name').textContent = hosp.name;
  const short = hosp.shortName || getShort(hosp.name);

  const cityEl = document.getElementById('hosp-city');
  cityEl.textContent = hosp.city || '未分類';
  cityEl.classList.toggle('unknown', !hosp.city);
  cityEl.hidden = false;

  const lvEl = document.getElementById('hosp-level');
  lvEl.textContent = hosp.level;
  lvEl.className = `nurse-level-badge nurse-level-${levelSlug(hosp.level)}`;

  const lines = [];
  if (short && short !== hosp.name) lines.push(`簡稱：${escapeHtml(short)}`);
  lines.push(`機構代號：${escapeHtml(hosp.code)}`);
  if (hosp.address) lines.push(`地址：${escapeHtml(hosp.address)}`);
  if (hosp.phone) lines.push(`電話：${escapeHtml(hosp.phone)}`);
  document.getElementById('hosp-code').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');

  // 本頁自己的分享連結（hospital.html?code=…）
  const shareBtn = document.getElementById('hosp-share-btn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const u = new URL(location.href);
      u.searchParams.set('code', hosp.code);
      copyOrShare(u.toString(), shareBtn, '分享此機構');
    };
  }
}

// 共用院區頁簽：多院區時以 .tabs 頁簽切換，內容區惰性重繪（重用 css .tabs/.tab）。
// tabs: [{ label, data }]；renderPanel(data, panelEl) 每次切換都重畫（圖表用新 canvas）。
function renderBranchTabs(host, tabs, renderPanel) {
  host.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'tabs';
  bar.style.cssText = 'margin-bottom:14px;';
  const panel = document.createElement('div');
  const activate = (i) => {
    bar.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('active', j === i));
    renderPanel(tabs[i].data, panel);
  };
  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (i === 0 ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => activate(i));
    bar.appendChild(btn);
  });
  host.appendChild(bar);
  host.appendChild(panel);
  if (tabs.length) renderPanel(tabs[0].data, panel);
}

// 護病比：依 code 惰性載入單院小檔（data/nurse-ratio/by-code/{code}.json）；
// 每個 code 可能對應多院區 → 單院區直接呈現，多院區用院區頁簽切換。
function renderNurseSection(code, hosp) {
  const wrap = document.getElementById('nr-section-body');
  const empty = document.getElementById('nr-section-empty');
  wrap.innerHTML = '<div style="padding:16px;color:var(--muted);">載入護病比資料中⋯</div>';
  empty.hidden = true;

  loadNurseByCode(code).then((data) => {
    if (state.currentCode !== code) return;
    const branches = (data && data.hospitals) || [];
    if (branches.length === 0) {
      wrap.innerHTML = '';
      empty.hidden = false;
      return;
    }
    const months = data.months;

  const renderOne = (b, panel) => {
    const latestMonth = [...months].reverse().find((m) => b.history[m]);
    const latest = latestMonth ? b.history[latestMonth] : {};
    const std = STANDARDS[b.level] || {};
    const cls = classifyHospital(b, months);
    const meta = COMPLIANCE_CLASSES[cls];
    const lvBadge = `<span class="nurse-level-badge nurse-level-${levelSlug(b.level)}">${escapeHtml(b.level)}</span>`;
    const kpi = (val, sname, s) => {
      if (val == null) return `<div class="card stat-card"><div class="stat-num kpi-num">—</div><div class="stat-label">${sname}</div></div>`;
      const st = shiftStatus(val, s);
      return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${st ? 'status-' + st : ''}">${val.toFixed(1)}</span></div><div class="stat-label">${sname}</div></div>`;
    };
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        ${lvBadge}
        <span class="nurse-compliance-badge nurse-compliance-${cls}">${meta.label}</span>
        <span style="color:var(--muted);font-size:0.82rem;">${latestMonth ? formatRocMonth(latestMonth) : ''}</span>
      </div>
      <div class="grid grid-3">
        ${kpi(latest.day, '白班護病比', std.day)}
        ${kpi(latest.eve, '小夜班護病比', std.eve)}
        ${kpi(latest.night, '大夜班護病比', std.night)}
      </div>
      <div class="chart-card" style="margin-top:16px;">
        <div class="chart-canvas-wrap" style="height:360px;">
          <canvas class="nr-branch-canvas"></canvas>
        </div>
      </div>`;
    renderNurseChart(panel.querySelector('.nr-branch-canvas'), b, months);
    renderIcons();
  };

    if (branches.length === 1) {
      wrap.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.marginTop = '8px';
      wrap.appendChild(panel);
      renderOne(branches[0], panel);
    } else {
      renderBranchTabs(wrap, branches.map((b) => ({ label: b.branch || '本院', data: b })), renderOne);
    }
  }).catch(() => {
    if (state.currentCode === code) { wrap.innerHTML = ''; empty.hidden = false; }
  });
}

// 財務概況（健保署）：依 code 惰性載入單院小檔 data/financials/{code}.json → 最新年 KPI + 趨勢圖
// 財務逐年明細表欄位（同財務頁彈窗，含營運欄位）
const FI_YEAR_COLS = ['F1', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8',
  'DOCTOR', 'BED', 'OPD_CNT', 'IPD_CNT', 'IPD_DAY', 'PT_ALL', 'OPD_PT', 'IPD_PT'];

function renderFinancialsSection(code) {
  const empty = document.getElementById('fi-section-empty');
  const kpi = document.getElementById('fi-section-kpi');
  const chartWrap = document.getElementById('fi-section-chart');
  const opsWrap = document.getElementById('fi-section-ops-chart');
  const tableWrap = document.getElementById('fi-section-yeartable');
  const tableMount = document.getElementById('fi-section-table');
  const link = document.getElementById('fi-section-link');
  kpi.innerHTML = '';
  link.innerHTML = '';
  chartWrap.hidden = true;
  opsWrap.hidden = true;
  tableWrap.hidden = true;
  tableMount.innerHTML = '';
  empty.hidden = true;

  // 直接把某份財報資料（可能是本院或母院）渲染到財務區塊；noteHtml 為合併提示、detailCode 為深連結代號
  const renderFinData = (dataHosp, noteHtml, detailCode) => {
    const fields = dataHosp.fields || getFinancialFields();
    const rowsDesc = [...dataHosp.rows].sort((a, b) => Number(b.YEAR) - Number(a.YEAR));
    const latest = rowsDesc[0];
    const card = (key, label) => {
      const val = latest[`${key}Val`]; const rank = latest[`${key}Rank`];
      return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${finSignClass(val)}">${finFormatVal(key, val, fields)}</span></div><div class="stat-label">${label}${rank ? ` · 全國第 ${rank}` : ''}</div></div>`;
    };
    const note = noteHtml ? `<div class="fin-merge-note">${noteHtml}</div>` : '';
    kpi.innerHTML = `${note}<div style="color:var(--muted);font-size:0.85rem;margin-bottom:8px;">最新年度：${finRocYear(latest.YEAR)}</div>
      <div class="grid grid-3">${card('F3', '整體獲利/虧損')}${card('F5', '醫務利益率')}${card('F6', '醫務收入')}</div>
      <div class="grid grid-3" style="margin-top:12px;">${card('DOCTOR', '醫師數')}${card('BED', '病床數')}${card('F8', '全日平均護病比')}</div>`;
    link.innerHTML = `<a href="financials.html?code=${encodeURIComponent(detailCode)}" style="color:var(--primary);text-decoration:underline;font-size:0.85rem;">在財務頁開啟 →</a>`;

    chartWrap.hidden = false;
    renderFinancialTrendChart(document.getElementById('fi-chart'), dataHosp, fields, { metrics: ['F1', 'F2', 'F3'] });
    opsWrap.hidden = false;
    renderFinancialTrendChart(document.getElementById('fi-ops-chart'), dataHosp, fields, { metrics: ['OPD_CNT', 'IPD_CNT'] });

    // 各年度明細表（同財務頁彈窗）
    const signKeys = new Set(['F1', 'F3', 'F5']);
    tableMount.innerHTML = `
      <div class="data-table-wrap"><table class="data-table fin-table">
        <thead><tr><th>年度</th>${FI_YEAR_COLS.map((c) => `<th style="text-align:right;white-space:nowrap;">${(fields[c] && fields[c].title) || c}</th>`).join('')}</tr></thead>
        <tbody>${rowsDesc.map((r) => `<tr><td>${finRocYear(r.YEAR)}</td>${FI_YEAR_COLS.map((c) => `<td style="text-align:right;white-space:nowrap;"><span class="${signKeys.has(c) ? finSignClass(r[c + 'Val']) : ''}">${finFormatVal(c, r[c + 'Val'], fields)}</span>${r[c + 'Rank'] ? `<span class="fin-rank">#${r[c + 'Rank']}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    tableWrap.hidden = false;
    renderIcons();
  };

  loadFinancialsHospital(code).then((h) => {
    if (state.currentCode !== code) return;

    // 有本院財報（含財報合併提報之兩碼）：直接顯示，合併提報者加提示
    if (h && h.rows && h.rows.length) {
      const rm = reportMergedInfo(code);
      const rmLink = rm ? ` <a href="hospital.html?code=${encodeURIComponent(rm.partner)}" style="color:var(--primary);text-decoration:underline;">查看 ${rm.partnerName} →</a>` : '';
      const note = rm
        ? (rm.main
          ? `本院財報與 <strong>${rm.partnerName}</strong> 合併提報，下列數字為兩院合計。${rmLink}`
          : `下列數字為與 <strong>${rm.partnerName}</strong> 合併提報之<strong>合計數</strong>，非本院單獨財報。${rmLink}`)
        : '';
      renderFinData(h, note, code);
      return;
    }

    // 無本院財報但屬醫療費用合併申報之子院：改載母院財報直接顯示，並提示為合併數據
    const fm = feeMergedParent(code);
    if (fm) {
      loadFinancialsHospital(fm.parent).then((ph) => {
        if (state.currentCode !== code) return;
        if (ph && ph.rows && ph.rows.length) {
          renderFinData(ph, `本院醫療費用併入 <strong>${fm.parentName}</strong> 合併申報，以下為 <strong>${fm.parentName}</strong> 之合併財報數據。 <a href="hospital.html?code=${encodeURIComponent(fm.parent)}" style="color:var(--primary);text-decoration:underline;">查看 ${fm.parentName} →</a>`, fm.parent);
        } else {
          empty.innerHTML = `本院醫療費用併入 <strong>${fm.parentName}</strong> 合併申報，健保署未單獨公開本院財務。`;
          empty.hidden = false;
        }
      });
      return;
    }

    // 其餘：確無財報
    empty.innerHTML = '查無此機構的財務公開資料（僅依法須公開財務之醫院有）。';
    empty.hidden = false;
  });
}

// 一個院區的人力監控面板（職類 + 病床折線圖），寫入 panel。
function renderPersonnelPanel(h, panel) {
  const latest = latestMonthTable(h);
  const latestBlock = latest.monthLabel ? `
    <h4 style="margin:24px 4px 4px;font-size:0.95rem;">
      <span data-icon="layout" data-size="16" style="color:var(--primary);vertical-align:middle;"></span>
      最新月一覽（民國 ${latest.monthLabel}）
    </h4>
    <div class="data-table-wrap">${latest.tableHtml}</div>` : '';
  panel.innerHTML = `
    <p style="color:var(--muted-light);font-size:0.8rem;margin:0 4px 10px;">各職類實際人數（逐月）；預設顯示護產，點圖例可加看其他職類。未填報之月份線段中斷、不補值。</p>
    <div class="chart-canvas-wrap" style="height:300px;"><canvas class="pm-staff-canvas"></canvas></div>
    <h4 style="margin:20px 4px 4px;font-size:0.95rem;">病床數量（逐月）</h4>
    <div class="chart-canvas-wrap" style="height:260px;"><canvas class="pm-bed-canvas"></canvas></div>
    ${latestBlock}`;
  renderPmStaffChart(panel.querySelector('.pm-staff-canvas'), h, null);
  // 病床圖：無登錄床數時以提示取代（renderPmBedChart 回傳 null）
  const bedCanvas = panel.querySelector('.pm-bed-canvas');
  const bedChart = renderPmBedChart(bedCanvas, h, null);
  if (!bedChart) {
    bedCanvas.style.display = 'none';
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:24px;color:var(--muted);text-align:center;';
    msg.textContent = '此機構無登錄病床資料。';
    bedCanvas.parentElement.appendChild(msg);
  }
  renderIcons();
}

// 人力監控：以機構代號查院區清單 → 單院區直接呈現，多院區用院區頁簽切換。
function renderPersonnelSection(code) {
  const empty = document.getElementById('pm-section-empty');
  const body = document.getElementById('pm-section-body');
  const link = document.getElementById('pm-section-link');
  link.innerHTML = '';
  body.hidden = true;
  empty.hidden = true;

  ensurePersonnelIndex().then((idx) => {
    if (state.currentCode !== code) return;
    const campuses = idx.byCode.get(code) || [];
    if (campuses.length === 0) { empty.hidden = false; return; }
    body.hidden = false;
    link.innerHTML = `<a href="personnel.html?id=${encodeURIComponent(campuses[0].id)}" style="color:var(--primary);text-decoration:underline;font-size:0.85rem;">查看人力監控 →</a>`;

    const loadPanel = (campus, panel) => {
      panel.innerHTML = '<div style="padding:16px;color:var(--muted);">載入中⋯</div>';
      loadPersonnelHospital(campus.id).then((h) => {
        if (state.currentCode !== code) return;
        renderPersonnelPanel(h, panel);
      }).catch(() => { panel.innerHTML = '<div style="padding:16px;color:var(--danger);">人力資料載入失敗。</div>'; });
    };

    if (campuses.length === 1) {
      body.innerHTML = '';
      const panel = document.createElement('div');
      body.appendChild(panel);
      loadPanel(campuses[0], panel);
    } else {
      renderBranchTabs(body, campuses.map((c) => ({ label: c.branch || '本院', data: c })), loadPanel);
    }
  }).catch(() => { if (state.currentCode === code) empty.hidden = false; });
}

// 分享平台眾包：以機構名稱/簡稱比對 → KPI 摘要 + 每筆可點開的表格
function renderPlatformSection(hosp) {
  const kpi = document.getElementById('pf-section-kpi');
  const table = document.getElementById('pf-section-table');
  const empty = document.getElementById('pf-section-empty');
  kpi.innerHTML = '';
  table.innerHTML = '<div style="padding:16px;color:var(--muted);">載入眾包資料中⋯</div>';
  empty.hidden = true;

  ensurePlatformRows().then((rows) => {
    if (state.currentCode !== hosp.code) return; // 已切換醫院
    const short = hosp.shortName || getShort(hosp.name);
    const matched = rows.filter((r) => {
      const nm = r.institutionName;
      if (!nm) return false;
      if (institutionNameMatches(nm, hosp.name)) return true;
      return !!(short && normalizeInstitutionName(nm) === normalizeInstitutionName(short));
    });
    if (matched.length === 0) {
      kpi.innerHTML = '';
      table.innerHTML = '';
      empty.hidden = false;
      return;
    }
    renderKpiStrip(kpi, matched);
    // 每筆資料的表格/卡片視圖，點列可開明細（重用分享平台的 modal）
    table.dataset.view = window.matchMedia('(max-width: 640px)').matches ? 'card' : 'table';
    // Soft Give-to-Get：未貢獻者鎖住排序、只顯示前 5 筆；填表分享後解鎖完整資料
    const gate = hasContributed()
      ? { gated: false, limit: Infinity, isFilteredView: false }
      : { gated: true, limit: 5, isFilteredView: false };
    renderTable(table, matched, { slug: 'all', onRowClick: (r) => showDetailModal(r), gate });
  });
}

// 違規紀錄：以離線對照表（名稱→代號）比對
function renderViolationsSection(code, hosp) {
  const body = document.getElementById('vi-section-body');
  const empty = document.getElementById('vi-section-empty');
  const sum = document.getElementById('vi-section-summary');
  body.innerHTML = '<div style="padding:16px;color:var(--muted);">載入違規資料中⋯</div>';
  sum.innerHTML = '';
  empty.hidden = true;

  ensureViolRows().then((rows) => {
    if (state.currentCode !== code) return;
    const matched = rows
      .filter((r) => state.violMap[r.institutionName] === code)
      .sort((a, b) => {
        const ta = a.penaltyDate ? a.penaltyDate.getTime() : 0;
        const tb = b.penaltyDate ? b.penaltyDate.getTime() : 0;
        return tb - ta;
      });

    if (matched.length === 0) {
      body.innerHTML = '';
      sum.innerHTML = '';
      empty.hidden = false;
      return;
    }

    const totalFine = matched.reduce((a, r) => a + (r.fine || 0), 0);
    const byTag = {};
    matched.forEach((r) => { byTag[r.feedTag] = (byTag[r.feedTag] || 0) + 1; });
    sum.innerHTML = `
      <span class="nurse-compliance-badge nurse-compliance-C">${matched.length} 筆違規</span>
      <span style="color:var(--muted);font-size:0.85rem;">累計罰鍰 <strong style="color:var(--ink);">${fineToWan(totalFine) || 0}</strong> 萬元
      · ${Object.entries(byTag).map(([t, n]) => `${t} ${n}`).join(' / ')}</span>`;

    body.innerHTML = `
      <div class="records-list">
        ${matched.map((r, i) => `
          <div class="record-row" data-idx="${i}" role="button" tabindex="0" title="點擊看詳情"
               style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:baseline;flex-wrap:wrap;cursor:pointer;">
            <span class="tag" style="flex:0 0 auto;">${r.feedTag}</span>
            <span style="flex:0 0 auto;color:var(--muted);font-size:0.85rem;">${r.penaltyDate ? formatROCDate(r.penaltyDate) : (r.penaltyDateRaw || '—')}</span>
            <span style="flex:1 1 260px;min-width:200px;">${escapeHtml(r.lawShort)}${escapeHtml(r.lawArticle ? '・' + r.lawArticle : '')}<br/><span style="color:var(--muted);font-size:0.86rem;">${escapeHtml(r.lawDesc)}</span></span>
            <span style="flex:0 0 auto;font-weight:600;color:var(--danger);">${r.fine ? fineToWan(r.fine) + ' 萬' : '—'}</span>
          </div>`).join('')}
      </div>`;

    const open = (idx) => openViolModal(matched[idx]);
    body.querySelectorAll('.record-row').forEach((el) => {
      el.addEventListener('click', () => open(+el.dataset.idx));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(+el.dataset.idx); } });
    });
  });
}

// 違規單筆明細 modal（含「複製連結」→ 連到違規紀錄頁該筆的永久連結）
function openViolModal(row) {
  const backdrop = document.getElementById('hosp-viol-modal') || (() => {
    const el = document.createElement('div');
    el.id = 'hosp-viol-modal';
    el.className = 'modal-backdrop';
    document.body.appendChild(el);
    return el;
  })();

  const dateStr = row.penaltyDate ? formatROCDate(row.penaltyDate) : (row.penaltyDateRaw || '—');
  const pubStr = row.publishDate ? formatROCDate(row.publishDate) : (row.publishDateRaw || '—');
  const fineStr = row.fine ? row.fine.toLocaleString() : '—';
  const locFull = row.locationRaw || row.location || '—';
  const recordLink = `records.html?type=${encodeURIComponent(row.feedKey)}&id=${encodeURIComponent(row.id)}`;

  backdrop.innerHTML = `
    <div class="modal viol-detail-modal" role="dialog">
      <div class="modal-header">
        <div style="min-width:0;flex:1;">
          <span class="viol-detail-tag">${escapeHtml(row.feedTag)}紀錄 · #${escapeHtml(row.id)}</span>
          <h3 style="margin:8px 0 0;word-break:break-word;">${escapeHtml(row.institutionName) || '未填寫'}</h3>
          <div style="color:var(--muted);font-size:0.88rem;margin-top:4px;">
            ${escapeHtml(locFull)}${row.penaltyDate ? ' · ' + dateStr + ' 處分' : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <a href="${recordLink}" class="btn btn-secondary" style="padding:8px 14px;font-size:0.85rem;gap:6px;text-decoration:none;" title="在違規紀錄頁開啟這一筆">在違規紀錄頁開啟 →</a>
          <button id="hosp-viol-copylink" class="btn btn-primary" style="padding:8px 14px;font-size:0.85rem;gap:6px;">複製連結</button>
          <button class="modal-close" aria-label="關閉">${escapeHtml('✕')}</button>
        </div>
      </div>
      <div class="modal-grid">
        <div><div class="key">處分日期</div><div class="val">${dateStr}</div></div>
        <div><div class="key">公告日期</div><div class="val">${pubStr}</div></div>
        <div><div class="key">主管機關</div><div class="val">${escapeHtml(locFull)}</div></div>
        <div><div class="key">處分字號</div><div class="val">${escapeHtml(row.docId) || '—'}</div></div>
        <div><div class="key">罰鍰 (元)</div><div class="val" style="font-weight:600;color:var(--danger);">${fineStr}</div></div>
        <div><div class="key">依據法規</div><div class="val">${escapeHtml(row.lawShort)}</div></div>
      </div>
      <hr class="divider" />
      <div>
        <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">違反法規條款</div>
        <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawArticle) || '—'}</p>
      </div>
      ${row.lawDesc ? `
        <hr class="divider" />
        <div>
          <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">法條敘述</div>
          <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawDesc)}</p>
        </div>` : ''}
    </div>`;

  backdrop.classList.add('open');
  const close = () => {
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', esc);
  };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', esc);

  const copyBtn = backdrop.querySelector('#hosp-viol-copylink');
  copyBtn.addEventListener('click', () => {
    const abs = new URL(recordLink, location.href).toString();
    copyOrShare(abs, copyBtn, '複製連結');
  });
}

// 複製連結 / Web Share（回饋「已複製」）
function copyOrShare(link, btn, defaultLabel) {
  const labelEl = btn.querySelector('.btn-label') || btn;
  const flash = () => {
    labelEl.textContent = '已複製';
    setTimeout(() => { labelEl.textContent = defaultLabel; }, 1600);
  };
  if (navigator.share) {
    navigator.share({ url: link }).catch(() => {});
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(flash).catch(() => window.prompt('請手動複製：', link));
  } else {
    window.prompt('請手動複製：', link);
  }
}

// ---------- search wiring ----------
function setupSearch() {
  const search = document.getElementById('hospital-search');
  if (!search) return;
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.searchQuery = (search.value || '').trim();
      renderHospitalList();
    }, 200);
  });
}

// 地點篩選：依機構數 desc 列出縣市（(未知) 殿後），mirror 護病比頁
function renderCityFilter() {
  const el = document.getElementById('city-filter');
  if (!el) return;
  const counts = {};
  state.merged.forEach((h) => {
    const c = h.city || '(未知)';
    counts[c] = (counts[c] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => {
    if (a[0] === '(未知)') return 1;
    if (b[0] === '(未知)') return -1;
    return b[1] - a[1];
  });
  el.innerHTML = `
    <button type="button" class="nurse-city-filter active" data-city="all">全部</button>
    ${sorted.map(([c, n]) => `
      <button type="button" class="nurse-city-filter" data-city="${escapeHtml(c)}">${escapeHtml(c)} <span style="opacity:.6;font-size:0.78em;">${n}</span></button>
    `).join('')}
  `;
  el.querySelectorAll('.nurse-city-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cityFilter = btn.dataset.city;
      el.querySelectorAll('.nurse-city-filter').forEach((b) => b.classList.toggle('active', b.dataset.city === state.cityFilter));
      renderHospitalList();
    });
  });
}

function setupLevelFilter() {
  document.querySelectorAll('.nurse-level-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.levelFilter = btn.dataset.level;
      document.querySelectorAll('.nurse-level-filter').forEach((b) => b.classList.toggle('active', b.dataset.level === state.levelFilter));
      renderHospitalList();
    });
  });
}

// ---------- init ----------
export async function initHospital() {
  const container = document.getElementById('hospital-list');
  if (container) container.innerHTML = '<div style="padding:24px;color:var(--muted);">載入中⋯</div>';
  try {
    await Promise.all([loadBaseData(), ensureShortLoaded().catch(() => {})]);
    setupSearch();
    setupLevelFilter();
    setupHospitalTabs();
    renderCityFilter();
    renderHospitalList();

    // 簡稱載完後重繪清單（顯示簡稱）
    window.addEventListener('hospitalShortNamesReady', () => renderHospitalList(), { once: true });

    const code = parseDeepLinkCode();
    if (code && state.byCode.has(code)) {
      selectHospital(code, false);
    } else if (code) {
      setDeepLinkUrl(null, true);
    }
    window.addEventListener('popstate', () => {
      const c = parseDeepLinkCode();
      if (c && state.byCode.has(c)) selectHospital(c, false);
    });
    renderIcons();
  } catch (e) {
    console.error(e);
    if (container) {
      container.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
    }
  }
}
