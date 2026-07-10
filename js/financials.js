// 醫院財務頁：健保署醫院財務資訊公開 → 全院可排序比較表 + 點入看該院多年趨勢
//
// 資料/圖表共用 js/financials-view.js；名稱↔代碼/簡稱重用 js/hospital-shortname.js

import { renderIcons, icon } from './icons.js?v=3cb29e39e7';
import { getShort, getShortByCode, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=3cb29e39e7';
import {
  ensureFinancialsLoaded, getAllFinancials, getFinancials, getFinancialFields,
  parseNum, formatVal, signClass, formatRocYear, renderFinancialTrendChart,
} from './financials-view.js?v=3cb29e39e7';

const LEVEL_ORDER = ['醫學中心', '區域醫院', '地區醫院', '精神科醫院', '診所', '其他'];

// 比較表欄位（key = 資料欄, sort = 排序用數值來源）
const COLUMNS = [
  { key: 'F3', label: '整體獲利/虧損', rank: true },
  { key: 'F5', label: '醫務利益率' },
  { key: 'F6', label: '醫務收入' },
  { key: 'F8', label: '全日平均護病比' },
];

const state = {
  fields: {},
  year: null,
  levelFilter: 'all',
  searchQuery: '',
  sortKey: 'F3',
  sortDir: 'desc',
  currentCode: null,
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function levelSlug(lv) {
  return { '醫學中心': 'mc', '區域醫院': 'rg', '地區醫院': 'dt' }[lv] || 'other';
}
function rowForYear(h, year) {
  return (h.rows || []).find((r) => r.YEAR === year) || null;
}
function latestRow(h) {
  const rows = [...(h.rows || [])].sort((a, b) => Number(b.YEAR) - Number(a.YEAR));
  return rows[0] || null;
}

// deep link
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

// ---------- 控制列 ----------
function allYears() {
  const s = new Set();
  getAllFinancials().forEach((h) => (h.rows || []).forEach((r) => s.add(r.YEAR)));
  return [...s].sort((a, b) => Number(b) - Number(a)); // desc
}
function allLevels(year) {
  const s = new Set();
  getAllFinancials().forEach((h) => {
    const r = rowForYear(h, year);
    if (r && r.HOSP_CNT_TYPNAM) s.add(r.HOSP_CNT_TYPNAM);
  });
  return [...s].sort((a, b) => {
    const ia = LEVEL_ORDER.indexOf(a), ib = LEVEL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function renderYearSelect() {
  const el = document.getElementById('fin-year');
  if (!el) return;
  el.innerHTML = allYears().map((y) => `<option value="${y}">${formatRocYear(y)}</option>`).join('');
  el.value = state.year;
  el.addEventListener('change', () => {
    state.year = el.value;
    renderLevelFilter();
    renderTable();
  });
}

function renderLevelFilter() {
  const el = document.getElementById('fin-level-filter');
  if (!el) return;
  const levels = allLevels(state.year);
  if (!levels.includes(state.levelFilter)) state.levelFilter = 'all';
  el.innerHTML = `
    <button type="button" class="nurse-level-filter ${state.levelFilter === 'all' ? 'active' : ''}" data-level="all">全部</button>
    ${levels.map((lv) => `<button type="button" class="nurse-level-filter ${state.levelFilter === lv ? 'active' : ''}" data-level="${escapeHtml(lv)}">${escapeHtml(lv)}</button>`).join('')}
  `;
  el.querySelectorAll('.nurse-level-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.levelFilter = btn.dataset.level;
      el.querySelectorAll('.nurse-level-filter').forEach((b) => b.classList.toggle('active', b.dataset.level === state.levelFilter));
      renderTable();
    });
  });
}

function setupSearch() {
  const s = document.getElementById('fin-search');
  if (!s) return;
  let t;
  s.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.searchQuery = (s.value || '').trim().toLowerCase(); renderTable(); }, 200);
  });
}

// ---------- 比較表 ----------
function filteredRows() {
  const q = state.searchQuery;
  const out = [];
  getAllFinancials().forEach((h) => {
    const r = rowForYear(h, state.year);
    if (!r) return;
    if (state.levelFilter !== 'all' && r.HOSP_CNT_TYPNAM !== state.levelFilter) return;
    if (q) {
      const short = getShortByCode(h.code) || getShort(h.name) || h.shortName || '';
      const hay = `${h.name} ${short} ${h.code}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    out.push({ h, r });
  });
  const dir = state.sortDir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    const va = parseNum(a.r[`${state.sortKey}Val`]);
    const vb = parseNum(b.r[`${state.sortKey}Val`]);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * dir;
  });
  return out;
}

function renderTable() {
  const container = document.getElementById('fin-table');
  if (!container) return;
  const rows = filteredRows();
  const countEl = document.getElementById('fin-count');
  if (countEl) countEl.textContent = `${rows.length.toLocaleString()} 家`;

  const caret = (k) => state.sortKey === k ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const head = `
    <th>醫院</th><th class="fin-lv-col">層級</th>
    ${COLUMNS.map((c) => `<th class="fin-sort" data-key="${c.key}" style="text-align:right;cursor:pointer;white-space:nowrap;">${c.label}${caret(c.key)}</th>`).join('')}
  `;
  const body = rows.map(({ h, r }) => {
    const short = getShortByCode(h.code) || getShort(h.name) || h.shortName;
    const cells = COLUMNS.map((c) => {
      const val = r[`${c.key}Val`];
      const rank = c.rank ? r[`${c.key}Rank`] : null;
      const cls = (c.key === 'F3' || c.key === 'F1' || c.key === 'F5') ? signClass(val) : '';
      const rankHtml = rank ? `<span class="fin-rank">#${rank}</span>` : '';
      return `<td style="text-align:right;white-space:nowrap;"><span class="${cls}">${formatVal(c.key, val, state.fields)}</span>${rankHtml}</td>`;
    }).join('');
    return `
      <tr class="fin-row ${h.code === state.currentCode ? 'active' : ''}" data-code="${h.code}" style="cursor:pointer;">
        <td><span class="fin-hosp-name" title="${escapeHtml(h.name)}">${escapeHtml(short || h.name)}</span></td>
        <td class="fin-lv-col"><span class="nurse-level-badge nurse-level-${levelSlug(r.HOSP_CNT_TYPNAM)}">${escapeHtml(r.HOSP_CNT_TYPNAM)}</span></td>
        ${cells}
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table fin-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows.length ? body : `<tr><td colspan="${COLUMNS.length + 2}" style="padding:40px;text-align:center;color:var(--muted);">查無符合條件的醫院</td></tr>`}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('.fin-sort').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = k; state.sortDir = 'desc'; }
      renderTable();
    });
  });
  container.querySelectorAll('.fin-row').forEach((tr) => {
    tr.addEventListener('click', () => selectHospital(tr.dataset.code, true));
  });
}

// ---------- 明細（彈出視窗）----------
function selectHospital(code, updateUrl = false) {
  const h = getFinancials(code);
  if (!h) return;
  state.currentCode = code;
  if (updateUrl) setDeepLinkUrl(code);
  renderTable();       // 更新列 active 樣式
  openModal(h);
}

function modalHtml(h) {
  const f = state.fields;
  const latest = latestRow(h);
  const short = getShortByCode(h.code) || getShort(h.name) || h.shortName;
  const card = (key, label) => {
    const val = latest ? latest[`${key}Val`] : null;
    const rank = latest ? latest[`${key}Rank`] : null;
    return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${signClass(val)}">${formatVal(key, val, f)}</span></div><div class="stat-label">${label}${rank ? ` · 全國第 ${rank}` : ''}</div></div>`;
  };
  const cols = ['F1', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8'];
  const rowsDesc = [...(h.rows || [])].sort((a, b) => Number(b.YEAR) - Number(a.YEAR));
  const yearTable = `
    <div class="data-table-wrap"><table class="data-table fin-table">
      <thead><tr><th>年度</th>${cols.map((c) => `<th style="text-align:right;white-space:nowrap;">${(f[c] && f[c].title) || c}</th>`).join('')}</tr></thead>
      <tbody>${rowsDesc.map((r) => `<tr><td>${formatRocYear(r.YEAR)}</td>${cols.map((c) => `<td style="text-align:right;white-space:nowrap;"><span class="${(c === 'F1' || c === 'F3' || c === 'F5') ? signClass(r[c + 'Val']) : ''}">${formatVal(c, r[c + 'Val'], f)}</span>${r[c + 'Rank'] ? `<span class="fin-rank">#${r[c + 'Rank']}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;

  return `
    <div class="modal" role="dialog" style="max-width:840px;">
      <div class="modal-header" style="flex-direction:row;align-items:flex-start;gap:12px;">
        <div style="min-width:0;flex:1;">
          <h3 style="margin:0 0 6px;word-break:break-word;">${escapeHtml(h.name)}</h3>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${latest ? `<span class="nurse-level-badge nurse-level-${levelSlug(latest.HOSP_CNT_TYPNAM)}">${escapeHtml(latest.HOSP_CNT_TYPNAM)}</span>` : ''}
            <span style="color:var(--muted);font-size:0.85rem;">代號 ${escapeHtml(h.code)}${short && short !== h.name ? ' · ' + escapeHtml(short) : ''}
            · <a href="hospital.html?code=${encodeURIComponent(h.code)}" style="color:var(--primary);text-decoration:underline;">機構總覽 →</a></span>
          </div>
        </div>
        <button class="modal-close" aria-label="關閉" style="flex:0 0 auto;order:0;">${icon('x', { size: 16 })}</button>
      </div>
      ${latest ? `<div style="color:var(--muted);font-size:0.85rem;margin-bottom:8px;">最新年度：${formatRocYear(latest.YEAR)}</div>
      <div class="grid grid-3">${card('F3', '整體獲利/虧損')}${card('F5', '醫務利益率')}${card('F6', '醫務收入')}</div>` : ''}
      <div class="chart-card" style="margin-top:18px;">
        <div class="chart-card-header"><div><h3 style="font-size:1rem;">逐年財務趨勢（醫務本業／非醫務／整體，單位：億元）</h3></div></div>
        <div class="chart-canvas-wrap" style="height:320px;"><canvas id="fin-modal-chart"></canvas></div>
      </div>
      <div class="chart-card" style="margin-top:18px;">
        <div class="chart-card-header"><div><h3 style="font-size:1rem;">各年度明細</h3></div></div>
        ${yearTable}
      </div>
    </div>`;
}

function openModal(h) {
  let backdrop = document.getElementById('fin-detail-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'fin-detail-modal';
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.innerHTML = modalHtml(h);
  backdrop.classList.add('open');
  backdrop.querySelector('.modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', escHandler);
  renderFinancialTrendChart(backdrop.querySelector('#fin-modal-chart'), h, state.fields, { metrics: ['F1', 'F2', 'F3'] });
}

function escHandler(e) { if (e.key === 'Escape') closeModal(); }

function closeModal() {
  const backdrop = document.getElementById('fin-detail-modal');
  if (backdrop) backdrop.classList.remove('open');
  document.removeEventListener('keydown', escHandler);
  setDeepLinkUrl(null, true);
  state.currentCode = null;
  renderTable();
}

// ---------- init ----------
export async function initFinancials() {
  const container = document.getElementById('fin-table');
  if (container) container.innerHTML = '<div style="padding:24px;color:var(--muted);">載入中⋯</div>';
  try {
    await Promise.all([ensureFinancialsLoaded(), ensureShortLoaded().catch(() => {})]);
    state.fields = getFinancialFields();
    const years = allYears();
    state.year = years[0] || null;

    renderYearSelect();
    renderLevelFilter();
    setupSearch();
    renderTable();
    window.addEventListener('hospitalShortNamesReady', () => renderTable(), { once: true });

    const code = parseDeepLinkCode();
    if (code && getFinancials(code)) selectHospital(code, false);
    else if (code) setDeepLinkUrl(null, true);
    window.addEventListener('popstate', () => {
      const c = parseDeepLinkCode();
      if (c && getFinancials(c)) selectHospital(c, false);
      else closeModal();
    });
    renderIcons();
  } catch (e) {
    console.error(e);
    if (container) container.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
  }
}
