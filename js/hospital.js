// 單一機構整合檔案頁：輸入一家評鑑醫院 → 一次看護病比 / 分享平台眾包 / 違規紀錄
//
// 三源以「機構代號」為錨（只涵蓋 hospitals-merged.json 的 482 家評鑑醫院）：
//   - 護病比：data/nurse-ratio.json，以 code 對應（多院區則各分院各一張圖）
//   - 分享平台：眾包 CSV（data-loader.loadAll），以機構名稱/簡稱比對
//   - 違規紀錄：勞檢/性平/職安三支 Sheet，以 data/violations-hospital-map.json（名稱→代號）比對

import { renderIcons } from './icons.js?v=26';
import { getShort, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=26';
import { normalizeInstitutionName, institutionNameMatches } from './institution-name.js?v=26';
import {
  STANDARDS,
  COMPLIANCE_CLASSES,
  formatRocMonth,
  shiftStatus,
  classifyHospital,
  renderNurseChart,
} from './nurse-ratio-view.js?v=26';
import { loadAll } from './data-loader.js?v=26';
import { renderKpiStrip } from './stats-kpi.js?v=26';
import { renderTable, showDetailModal } from './table.js?v=26';
import {
  createCsvLoader,
  parseROCDate,
  parseFine,
  shortenLocation,
  fineToWan,
  formatROCDate,
} from './records-common.js?v=26';

const NURSE_URL = 'data/nurse-ratio.json?v=26';
const MERGED_URL = 'data/hospitals-merged.json?v=26';
const VIOL_MAP_URL = 'data/violations-hospital-map.json?v=26';

// 三支違規 Sheet（欄位 0-8 共用：id/location/publishDate/institutionName/penaltyDate/docId/lawArticle/lawDesc/fine）
const VIOL_FEEDS = [
  { key: 'labor', tag: '勞檢', lawShort: '勞基法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN/pub?gid=190468784&single=true&output=csv', storageKey: 'nursing_viol_v2' },
  { key: 'gender', tag: '性平', lawShort: '性平法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy/pub?gid=1540285352&single=true&output=csv', storageKey: 'nursing_gender_v1' },
  { key: 'osha', tag: '職安', lawShort: '職安法', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_/pub?gid=1130584206&single=true&output=csv', storageKey: 'nursing_osha_v1' },
];

const parseViolRow = (r) => ({
  id: String(r[0] || '').trim(),
  location: shortenLocation(String(r[1] || '').trim()),
  institutionName: String(r[3] || '').trim(),
  penaltyDate: parseROCDate(r[4]),
  penaltyDateRaw: String(r[4] || '').trim(),
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
  nrData: null,         // nurse-ratio.json
  nrByCode: new Map(),  // code → [nurse hospital branch, ...]
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
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
  return r.json();
}

async function loadBaseData() {
  const [merged, nrData, violMapDoc] = await Promise.all([
    fetchJson(MERGED_URL),
    fetchJson(NURSE_URL).catch(() => null),
    fetchJson(VIOL_MAP_URL).catch(() => ({ map: {} })),
  ]);

  // 去重：每個 code 保留名稱最短的 base entry（多院區時取母院）
  const byCode = new Map();
  (merged.hospitals || []).forEach((h) => {
    if (!h.code || !h.name) return;
    const prev = byCode.get(h.code);
    if (!prev || h.name.length < prev.name.length) byCode.set(h.code, h);
  });
  state.byCode = byCode;
  state.merged = [...byCode.values()];

  if (nrData) {
    state.nrData = nrData;
    (nrData.hospitals || []).forEach((h) => {
      const arr = state.nrByCode.get(h.code) || [];
      arr.push(h);
      state.nrByCode.set(h.code, arr);
    });
  }
  state.violMap = (violMapDoc && violMapDoc.map) || {};
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
      return rows.map((r) => ({ ...r, feedTag: f.tag, lawShort: f.lawShort }));
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
      請先選擇<strong>層級</strong>或<strong>地點</strong>，或輸入醫院名稱／簡稱／代號來搜尋。<br>
      <span style="font-size:0.85em;">僅收錄評鑑醫院（醫學中心／區域／地區醫院）；診所、長照等未達地區醫院層級者不會顯示。</span></div>`;
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
function selectHospital(code, updateUrl = false) {
  const hosp = state.byCode.get(code);
  if (!hosp) return;
  state.currentCode = code;
  if (updateUrl) setDeepLinkUrl(code);
  renderHospitalList();
  renderHeader(hosp);
  document.getElementById('hospital-placeholder').hidden = true;
  document.getElementById('hospital-detail').hidden = false;
  renderNurseSection(code, hosp);
  renderPlatformSection(hosp);
  renderViolationsSection(code, hosp);
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
}

// 護病比：每個 code 可能對應多院區 → 各自一張 KPI + 圖
function renderNurseSection(code, hosp) {
  const wrap = document.getElementById('nr-section-body');
  const empty = document.getElementById('nr-section-empty');
  const branches = state.nrByCode.get(code) || [];
  if (!state.nrData || branches.length === 0) {
    wrap.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const months = state.nrData.months;

  wrap.innerHTML = branches.map((b, i) => {
    const latestMonth = [...months].reverse().find((m) => b.history[m]);
    const latest = latestMonth ? b.history[latestMonth] : {};
    const std = STANDARDS[b.level] || {};
    const cls = classifyHospital(b, months);
    const meta = COMPLIANCE_CLASSES[cls];
    const branchTitle = b.branch ? `<span class="nurse-level-badge nurse-level-${levelSlug(b.level)}" style="margin-right:8px;">${escapeHtml(b.branch)}</span>` : '';
    const kpi = (val, sname, s) => {
      if (val == null) return `<div class="card stat-card"><div class="stat-num kpi-num">—</div><div class="stat-label">${sname}</div></div>`;
      const st = shiftStatus(val, s);
      return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${st ? 'status-' + st : ''}">${val.toFixed(1)}</span></div><div class="stat-label">${sname}</div></div>`;
    };
    return `
      <div style="margin-top:${i ? 28 : 8}px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          ${branchTitle}
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
            <canvas id="nr-chart-${i}"></canvas>
          </div>
        </div>
      </div>`;
  }).join('');

  branches.forEach((b, i) => {
    renderNurseChart(document.getElementById(`nr-chart-${i}`), b, months);
  });
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
    renderTable(table, matched, { slug: 'all', onRowClick: (r) => showDetailModal(r) });
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
        ${matched.map((r) => `
          <div class="record-row" style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:baseline;flex-wrap:wrap;">
            <span class="tag" style="flex:0 0 auto;">${r.feedTag}</span>
            <span style="flex:0 0 auto;color:var(--muted);font-size:0.85rem;">${r.penaltyDate ? formatROCDate(r.penaltyDate) : (r.penaltyDateRaw || '—')}</span>
            <span style="flex:1 1 260px;min-width:200px;">${escapeHtml(r.lawShort)}${escapeHtml(r.lawArticle ? '・' + r.lawArticle : '')}<br/><span style="color:var(--muted);font-size:0.86rem;">${escapeHtml(r.lawDesc)}</span></span>
            <span style="flex:0 0 auto;font-weight:600;color:var(--danger);">${r.fine ? fineToWan(r.fine) + ' 萬' : '—'}</span>
          </div>`).join('')}
      </div>`;
  });
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
