// 人力監控頁：以醫院為單位，呈現各職類實際人數與各類病床數的逐月變化。
// 資料：data/personnel-index.json（picker 清單）＋ data/personnel/{code}.json（單院時間序列）
// 來源：衛福部「醫院醫事人力持續性監測結果」。

import { renderIcons, icon } from './icons.js?v=e32de5950a';
import { getShort, getShortByCode, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=e32de5950a';
import {
  CAT_COLORS, BED_COLORS, DEFAULT_ON, mLabel, baseLineCfg,
  renderStaffChart, renderBedChart, loadPersonnelHospital, latestMonthTable,
} from './personnel-view.js?v=e32de5950a';
import { showToast } from './toast.js?v=e32de5950a';

const INDEX_URL = 'data/personnel-index.json';
const AGG_URL = 'data/personnel-aggregate.json';

const state = {
  index: [], byId: new Map(),
  levelFilter: 'all', cityFilter: 'all', searchQuery: '',
  currentId: null,
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
      if (h.branch && h.branch.toLowerCase().includes(q)) return true;
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
            const baseShort = getShortByCode(h.code) || getShort(h.name) || h.name;
            // 多院區：簡稱後綴院區，讓同代號各院區可辨（如「北市聯醫·仁愛院區」）
            const label = h.branch ? `${baseShort}·${h.branch}` : baseShort;
            const tip = [h.name, h.city, `代號 ${h.code}`].filter(Boolean).join(' · ');
            return `<button type="button" class="nurse-hospital-chip ${h.id === state.currentId ? 'active' : ''}" data-id="${escapeHtml(h.id)}" title="${escapeHtml(tip)}">
                <span class="nurse-hospital-chip-name">${escapeHtml(label)}</span></button>`;
          }).join('')}
        </div>
      </div>`).join('');

  container.querySelectorAll('.nurse-hospital-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectHospital(btn.dataset.id, true));
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
async function selectHospital(id, updateUrl = false) {
  state.currentId = id;
  if (updateUrl) setDeepLinkUrl(id);
  document.querySelectorAll('.nurse-hospital-chip').forEach((b) => b.classList.toggle('active', b.dataset.id === id));

  let h;
  try { h = await loadPersonnelHospital(id); }
  catch (e) { showToast('資料載入失敗：' + e.message); return; }

  document.getElementById('personnel-placeholder').hidden = true;
  const detail = document.getElementById('personnel-detail');
  detail.hidden = false;

  const short = getShortByCode(h.code) || getShort(h.name);
  document.getElementById('pm-name').textContent = h.name || short || id;
  const cityBadge = document.getElementById('pm-city');
  if (h.city) { cityBadge.hidden = false; cityBadge.textContent = h.city; } else cityBadge.hidden = true;
  const lvBadge = document.getElementById('pm-level');
  lvBadge.textContent = h.level || '—';
  lvBadge.className = `nurse-level-badge nurse-level-${levelSlug(h.level)}`;
  const first = h.months[0], last = h.months[h.months.length - 1];
  const branchNote = h.branch ? ` ｜ 院區：${escapeHtml(h.branch)}` : '';
  const profileCode = h.code || h.id;
  const profileLink = profileCode
    ? `<div style="margin-top:4px;"><a href="hospital.html?code=${encodeURIComponent(profileCode)}" style="color:var(--primary);text-decoration:underline;text-underline-offset:2px;">查看機構總覽 →</a></div>`
    : '';
  document.getElementById('pm-meta').innerHTML =
    `機構代號：${escapeHtml(h.code)}${branchNote} ｜ 資料期間：${mLabel(first)}–${mLabel(last)}（${h.months.length} 個月）${profileLink}`;

  state.staffChart = renderStaffChart(document.getElementById('pm-staff-chart'), h, state.staffChart);
  renderBedWithEmpty(h);
  renderLatestTable(h);
  renderIcons(detail);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 病床圖：無登錄床數時顯示提示（不破壞 canvas，供再次選院使用）
function renderBedWithEmpty(h) {
  const canvas = document.getElementById('pm-bed-chart');
  const wrap = canvas.closest('.chart-canvas-wrap');
  state.bedChart = renderBedChart(canvas, h, state.bedChart);
  let msg = wrap.querySelector('.pm-empty-msg');
  if (!state.bedChart) {
    canvas.style.display = 'none';
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'pm-empty-msg';
      msg.style.cssText = 'padding:24px;color:var(--muted);text-align:center;';
      wrap.appendChild(msg);
    }
    msg.textContent = '此機構無登錄病床資料。';
    msg.style.display = '';
  } else {
    canvas.style.display = '';
    if (msg) msg.style.display = 'none';
  }
}

function renderLatestTable(h) {
  const { monthLabel, tableHtml } = latestMonthTable(h);
  document.getElementById('pm-latest-title').innerHTML =
    `<span data-icon="layout" data-size="16" style="color:var(--primary);vertical-align:middle;"></span> 最新月一覽（民國 ${monthLabel}）`;
  document.getElementById('pm-latest').innerHTML = tableHtml;
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
// 以 ?id= 為主（可為 code 或 code-院區）；相容舊 ?code=（單院區→id=code；
// 多院區代號→該代號第一個院區）。
function resolveDeepLinkId() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id && /^\d{10}(-.+)?$/.test(id) && state.byId.has(id)) return id;
  const code = params.get('code');
  if (code && /^\d{10}$/.test(code)) {
    if (state.byId.has(code)) return code;
    const branch = state.index.find((h) => h.code === code);
    if (branch) return branch.id;
  }
  return null;
}
function setDeepLinkUrl(id, replace = false) {
  const url = new URL(location.href);
  url.searchParams.delete('code');
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}
function setupShare() {
  const btn = document.getElementById('pm-share-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!state.currentId) return;
    const url = new URL(location.href); url.searchParams.delete('code'); url.searchParams.set('id', state.currentId);
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
    state.index.forEach((h) => state.byId.set(h.id, h));

    if (agg) { renderDashboard(agg); renderIcons(document.getElementById('pm-dash-staff')?.closest('.chart-card')); }

    setupSearch();
    setupLevelFilter();
    renderCityFilter();
    renderHospitalList();
    setupShare();
    window.addEventListener('hospitalShortNamesReady', () => renderHospitalList(), { once: true });

    const id = resolveDeepLinkId();
    if (id) selectHospital(id, false);
    else if (location.search.includes('code=') || location.search.includes('id=')) setDeepLinkUrl(null, true);
    window.addEventListener('popstate', () => {
      const rid = resolveDeepLinkId();
      if (rid) selectHospital(rid, false);
    });
    renderIcons();
  } catch (e) {
    console.error(e);
    if (container) container.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
  }
}
