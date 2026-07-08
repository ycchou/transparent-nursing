// 人力監控頁：以醫院為單位，呈現各職類實際人數與各類病床數的逐月變化。
// 資料：data/personnel-index.json（picker 清單）＋ data/personnel/{code}.json（單院時間序列）
// 來源：衛福部「醫院醫事人力持續性監測結果」。

import { renderIcons, icon } from './icons.js?v=26';
import { getShort, getShortByCode, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=26';

const INDEX_URL = 'data/personnel-index.json';
const AGG_URL = 'data/personnel-aggregate.json';
const hospUrl = (code) => `data/personnel/${code}.json`;

// 職類配色（13）＋病床配色（4）
const CAT_COLORS = ['#2E86AB', '#E63946', '#06A77D', '#1D3557', '#F4A261', '#9D4EDD',
  '#14B8A6', '#FF6B9D', '#F59E0B', '#4F46E5', '#0EA5E9', '#84CC16', '#A855F7'];
const BED_COLORS = ['#2E86AB', '#E63946', '#9D4EDD', '#F4A261'];
// 預設只顯示「護產」，其餘職類由使用者點圖例自行開啟
const DEFAULT_ON = new Set(['護產']);

const state = {
  index: [], byCode: new Map(),
  levelFilter: 'all', cityFilter: 'all', searchQuery: '',
  currentCode: null,
  hospCache: new Map(),
  staffChart: null, bedChart: null,
  dashStaffChart: null, dashBedChart: null,
};

// ---------- utils ----------
function fetchJson(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function levelSlug(lv) { return { '醫學中心': 'mc', '區域醫院': 'rg', '地區醫院': 'dt' }[lv] || 'other'; }
// "10807" -> "108/07"
function mLabel(m) { return `${parseInt(m.slice(0, 3), 10)}/${m.slice(3)}`; }

function showToast(msg) {
  let host = document.getElementById('toast-host');
  if (!host) { host = document.createElement('div'); host.id = 'toast-host'; host.className = 'toast-host'; document.body.appendChild(host); }
  const el = document.createElement('div'); el.className = 'toast toast-info'; el.textContent = msg;
  host.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2600);
}

// ---------- picker ----------
function hasActiveFilter() {
  return state.searchQuery !== '' || state.levelFilter !== 'all' || state.cityFilter !== 'all';
}

function renderHospitalList() {
  const container = document.getElementById('personnel-list');
  const countEl = document.getElementById('personnel-count');
  if (!container) return;

  if (!hasActiveFilter()) {
    if (countEl) countEl.textContent = '—';
    container.innerHTML = `<div class="nurse-picker-hint" style="padding:20px;color:var(--muted);line-height:1.7;">
      請先選擇<strong>層級</strong>或<strong>地點</strong>，或輸入醫院名稱／簡稱／代號來搜尋。</div>`;
    return;
  }

  const q = state.searchQuery.toLowerCase();
  const filtered = state.index.filter((h) => {
    if (state.levelFilter !== 'all' && h.level !== state.levelFilter) return false;
    if (state.cityFilter !== 'all' && (h.city || '(未知)') !== state.cityFilter) return false;
    if (q) {
      if ((h.name || '').toLowerCase().includes(q)) return true;
      if (h.code.includes(q)) return true;
      const short = getShortByCode(h.code) || getShort(h.name);
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
            const short = getShortByCode(h.code) || getShort(h.name) || h.name;
            const tip = [h.name, h.city, `代號 ${h.code}`].filter(Boolean).join(' · ');
            return `<button type="button" class="nurse-hospital-chip ${h.code === state.currentCode ? 'active' : ''}" data-code="${h.code}" title="${escapeHtml(tip)}">
                <span class="nurse-hospital-chip-name">${escapeHtml(short)}</span></button>`;
          }).join('')}
        </div>
      </div>`).join('');

  container.querySelectorAll('.nurse-hospital-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectHospital(btn.dataset.code, true));
  });
}

function renderCityFilter() {
  const el = document.getElementById('city-filter');
  if (!el) return;
  const counts = {};
  state.index.forEach((h) => { const c = h.city || '(未知)'; counts[c] = (counts[c] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => (a[0] === '(未知)') ? 1 : (b[0] === '(未知)') ? -1 : b[1] - a[1]);
  el.innerHTML = `<button type="button" class="nurse-city-filter active" data-city="all">全部</button>
    ${sorted.map(([c, n]) => `<button type="button" class="nurse-city-filter" data-city="${escapeHtml(c)}">${escapeHtml(c)} <span style="opacity:.6;font-size:0.78em;">${n}</span></button>`).join('')}`;
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

function setupSearch() {
  const input = document.getElementById('personnel-search');
  if (!input) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.searchQuery = input.value.trim(); renderHospitalList(); }, 150);
  });
}

// ---------- detail ----------
async function loadHospital(code) {
  if (state.hospCache.has(code)) return state.hospCache.get(code);
  const data = await fetchJson(hospUrl(code));
  state.hospCache.set(code, data);
  return data;
}

async function selectHospital(code, updateUrl = false) {
  state.currentCode = code;
  if (updateUrl) setDeepLinkUrl(code);
  document.querySelectorAll('.nurse-hospital-chip').forEach((b) => b.classList.toggle('active', b.dataset.code === code));

  let h;
  try { h = await loadHospital(code); }
  catch (e) { showToast('資料載入失敗：' + e.message); return; }

  document.getElementById('personnel-placeholder').hidden = true;
  const detail = document.getElementById('personnel-detail');
  detail.hidden = false;

  const short = getShortByCode(code) || getShort(h.name);
  document.getElementById('pm-name').textContent = h.name || short || code;
  const cityBadge = document.getElementById('pm-city');
  if (h.city) { cityBadge.hidden = false; cityBadge.textContent = h.city; } else cityBadge.hidden = true;
  const lvBadge = document.getElementById('pm-level');
  lvBadge.textContent = h.level || '—';
  lvBadge.className = `nurse-level-badge nurse-level-${levelSlug(h.level)}`;
  const first = h.months[0], last = h.months[h.months.length - 1];
  document.getElementById('pm-meta').textContent = `機構代號：${code} ｜ 資料期間：${mLabel(first)}–${mLabel(last)}（${h.months.length} 個月）`;

  renderStaffChart(h);
  renderBedChart(h);
  renderLatestTable(h);
  renderIcons(detail);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function baseLineCfg(labels, datasets) {
  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, usePointStyle: true } },
        tooltip: { callbacks: { title: (items) => items.length ? `民國 ${items[0].label}` : '' } },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
      },
      elements: { line: { tension: 0.25, borderWidth: 2 }, point: { radius: 0, hitRadius: 8 } },
    },
  };
}

function renderStaffChart(h) {
  const labels = h.months.map(mLabel);
  const datasets = h.categories.map((cat, i) => ({
    label: cat,
    data: h.actual.map((row) => (row ? row[i] : null)),
    borderColor: CAT_COLORS[i % CAT_COLORS.length],
    backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
    hidden: !DEFAULT_ON.has(cat),
  }));
  if (state.staffChart) state.staffChart.destroy();
  state.staffChart = new Chart(document.getElementById('pm-staff-chart'), baseLineCfg(labels, datasets));
}

function renderBedChart(h) {
  const labels = h.months.map(mLabel);
  const datasets = h.bedTypes.map((bt, i) => {
    const data = h.beds.map((row) => (row ? row[i] : null));
    return { label: bt, data, borderColor: BED_COLORS[i % BED_COLORS.length], backgroundColor: BED_COLORS[i % BED_COLORS.length],
      _allZero: data.every((v) => v == null || v === 0) };
  }).filter((d) => !d._allZero); // 略過整段皆 0 的床別
  if (state.bedChart) state.bedChart.destroy();
  const wrap = document.getElementById('pm-bed-chart').closest('.chart-card');
  if (datasets.length === 0) {
    if (state.bedChart) { state.bedChart.destroy(); state.bedChart = null; }
    document.getElementById('pm-bed-chart').closest('.chart-canvas-wrap').innerHTML =
      '<div style="padding:24px;color:var(--muted);text-align:center;">此機構無登錄病床資料。</div>';
    return;
  }
  state.bedChart = new Chart(document.getElementById('pm-bed-chart'), baseLineCfg(labels, datasets));
}

function renderLatestTable(h) {
  const li = h.months.length - 1;
  const m = h.months[li];
  const actual = h.actual[li] || [], evl = h.eval[li] || [], beds = h.beds[li] || [];
  document.getElementById('pm-latest-title').innerHTML =
    `<span data-icon="layout" data-size="16" style="color:var(--primary);vertical-align:middle;"></span> 最新月一覽（民國 ${mLabel(m)}）`;
  const fmt = (v) => (v == null ? '—' : v.toLocaleString());
  const staffRows = h.categories.map((c, i) => {
    const a = actual[i], e = evl[i];
    const meet = (a != null && e != null) ? (a >= e ? '<span class="status-safe">達標</span>' : '<span class="status-danger">未達</span>') : '';
    return `<tr><td>${escapeHtml(c)}</td><td style="text-align:right;">${fmt(a)}</td><td style="text-align:right;">${fmt(e)}</td><td style="text-align:center;">${meet}</td></tr>`;
  }).join('');
  const bedRows = h.bedTypes.map((b, i) => `<tr><td>${escapeHtml(b)}</td><td style="text-align:right;" colspan="3">${fmt(beds[i])} 床</td></tr>`).join('');
  document.getElementById('pm-latest').innerHTML = `
    <table class="data-table">
      <thead><tr><th>職類</th><th style="text-align:right;">實際人數</th><th style="text-align:right;">評鑑基準</th><th style="text-align:center;">達標</th></tr></thead>
      <tbody>${staffRows}
        <tr><td colspan="4" style="background:var(--surface-soft);font-weight:600;">病床數</td></tr>
        ${bedRows}
      </tbody>
    </table>`;
}

// ---------- 全國儀錶板 ----------
function renderDashboard(agg) {
  if (!agg || !agg.months || !agg.months.length) return;
  const labels = agg.months.map(mLabel);
  const cap = document.getElementById('pm-dash-caption');
  if (cap) {
    const last = agg.months[agg.months.length - 1];
    const n = agg.hospitalCount[agg.hospitalCount.length - 1];
    cap.textContent = `涵蓋約 ${n} 家醫院 ｜ 資料期間 ${mLabel(agg.months[0])}–${mLabel(last)}`;
  }
  // 各職類實際人數（全國加總）— 預設只顯示護產
  const staffDs = agg.categories.map((cat, i) => ({
    label: cat,
    data: agg.totalActual.map((row) => (row ? row[i] : null)),
    borderColor: CAT_COLORS[i % CAT_COLORS.length],
    backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
    hidden: !DEFAULT_ON.has(cat),
  }));
  if (state.dashStaffChart) state.dashStaffChart.destroy();
  state.dashStaffChart = new Chart(document.getElementById('pm-dash-staff'), baseLineCfg(labels, staffDs));

  // 急性一般病床（全國加總）— 單線
  const bedDs = [{
    label: '急性一般病床', data: agg.totalBeds.map((row) => (row ? row[0] : null)),
    borderColor: BED_COLORS[0], backgroundColor: BED_COLORS[0], fill: false,
  }];
  if (state.dashBedChart) state.dashBedChart.destroy();
  state.dashBedChart = new Chart(document.getElementById('pm-dash-bed'), baseLineCfg(labels, bedDs));
}

// ---------- deep link / share ----------
function parseDeepLinkCode() {
  const p = new URLSearchParams(location.search).get('code');
  return p && /^\d{10}$/.test(p) ? p : null;
}
function setDeepLinkUrl(code, replace = false) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('code', code); else url.searchParams.delete('code');
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}
function setupShare() {
  const btn = document.getElementById('pm-share-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!state.currentCode) return;
    const url = new URL(location.href); url.searchParams.set('code', state.currentCode);
    const link = url.toString();
    const name = document.getElementById('pm-name').textContent;
    try {
      if (navigator.share) await navigator.share({ title: `${name}｜人力監控`, url: link });
      else { await navigator.clipboard.writeText(link); showToast('已複製分享連結'); }
    } catch { /* 使用者取消分享 */ }
  });
}

// ---------- init ----------
export async function initPersonnel() {
  const container = document.getElementById('personnel-list');
  if (container) container.innerHTML = '<div style="padding:24px;color:var(--muted);">載入中⋯</div>';
  try {
    const [idx, agg] = await Promise.all([
      fetchJson(INDEX_URL),
      fetchJson(AGG_URL).catch(() => null),
      ensureShortLoaded().catch(() => {}),
    ]);
    state.index = idx.hospitals || [];
    state.index.forEach((h) => state.byCode.set(h.code, h));

    if (agg) { renderDashboard(agg); renderIcons(document.getElementById('pm-dash-staff')?.closest('.chart-card')); }

    setupSearch();
    setupLevelFilter();
    renderCityFilter();
    renderHospitalList();
    setupShare();
    window.addEventListener('hospitalShortNamesReady', () => renderHospitalList(), { once: true });

    const code = parseDeepLinkCode();
    if (code && state.byCode.has(code)) selectHospital(code, false);
    else if (code) setDeepLinkUrl(null, true);
    window.addEventListener('popstate', () => {
      const c = parseDeepLinkCode();
      if (c && state.byCode.has(c)) selectHospital(c, false);
    });
    renderIcons();
  } catch (e) {
    console.error(e);
    if (container) container.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
  }
}
