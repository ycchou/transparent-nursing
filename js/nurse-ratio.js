// 三班護病比頁面：讀 data/nurse-ratio.json → 醫院選擇 → 折線圖 + 標準虛線
//
// 資料結構 (data/nurse-ratio.json)：
//   {
//     months: ["11207", ..., "11505"],   // ROC 年月字串
//     hospitals: [{ id, name, level, history: { "11207": {day, eve, night} } }]
//   }

import { renderIcons } from './icons.js?v=16';

const DATA_URL = 'data/nurse-ratio.json?v=16';

// 三班護病比法定標準（依醫院層級）
const STANDARDS = {
  '醫學中心': { day: 6, eve: 9, night: 11 },
  '區域醫院': { day: 7, eve: 11, night: 13 },
  '地區醫院': { day: 10, eve: 13, night: 15 },
};

// 三班顏色（跟參考圖對齊：白班藍 / 小夜粉 / 大夜橙）
const COLORS = {
  day:   { line: '#2E86AB', fill: 'rgba(46,134,171,0.15)' },
  eve:   { line: '#E63946', fill: 'rgba(230,57,70,0.12)' },
  night: { line: '#F4A261', fill: 'rgba(244,162,97,0.15)' },
  std:   'rgba(230, 57, 70, 0.55)',
};

// 合規分類（依最新月份對照該層級標準）
//   A (green): 三班全部 <= 標準（含小於）→「全達標」
//   B (amber): 有超標但都 <= 標準 × 1.05 → 「輕度超標」
//   C (red):   任一班超過標準 × 1.05 → 「嚴重超標」
const COMPLIANCE_TOLERANCE = 0.05;
const COMPLIANCE_CLASSES = {
  A: { key: 'A', label: '全達標', color: '#06A77D', bg: 'rgba(6,167,125,0.13)' },
  B: { key: 'B', label: '輕度超標', color: '#F4A261', bg: 'rgba(244,162,97,0.15)' },
  C: { key: 'C', label: '嚴重超標', color: '#E63946', bg: 'rgba(230,57,70,0.13)' },
  N: { key: 'N', label: '未報', color: '#6B7C93', bg: 'rgba(107,124,147,0.10)' },
};

function classifyHospital(hosp) {
  const std = STANDARDS[hosp.level];
  if (!std) return 'N';
  // 找最新有資料的月份
  const months = state.data ? state.data.months : [];
  let latest = null;
  for (let i = months.length - 1; i >= 0; i--) {
    if (hosp.history[months[i]]) { latest = hosp.history[months[i]]; break; }
  }
  if (!latest) return 'N';
  const shifts = [
    { val: latest.day,   std: std.day },
    { val: latest.eve,   std: std.eve },
    { val: latest.night, std: std.night },
  ].filter((s) => s.val != null);
  if (shifts.length === 0) return 'N';
  let anyExceedTol = false;
  let anyExceedStd = false;
  for (const s of shifts) {
    if (s.val > s.std * (1 + COMPLIANCE_TOLERANCE)) anyExceedTol = true;
    if (s.val > s.std) anyExceedStd = true;
  }
  if (anyExceedTol) return 'C';
  if (anyExceedStd) return 'B';
  return 'A';
}

const state = {
  data: null,       // parsed nurse-ratio.json
  currentId: null,  // 目前選中的醫院代號
  chart: null,      // Chart.js instance
  levelFilter: 'all',
  complianceFilter: 'all',
  searchQuery: '',
  complianceMap: {},  // { hospitalId: 'A' | 'B' | 'C' | 'N' } — 載入後計算一次快取
};

// ROC yyyymm → 顯示字串
function formatRocMonth(key) {
  const y = key.slice(0, 3);
  const m = parseInt(key.slice(3), 10);
  return `${y}年${m}月`;
}

// URL deep-link helpers
function parseDeepLinkId() {
  const raw = new URL(location.href).searchParams.get('id');
  return raw ? String(raw).trim() : null;
}
function setDeepLinkUrl(id, replace = false) {
  const u = new URL(location.href);
  if (id == null) u.searchParams.delete('id');
  else u.searchParams.set('id', String(id));
  history[replace ? 'replaceState' : 'pushState']({ id }, '', u.toString());
}

// 從 localStorage 讀 cache
const CACHE_KEY = 'nurse_ratio_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.data) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.data;
  } catch { return null; }
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

async function loadData() {
  const cached = readCache();
  if (cached) {
    // 立即用 cache，背景刷新
    fetch(DATA_URL, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((fresh) => { if (fresh) writeCache(fresh); })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  writeCache(data);
  return data;
}

// ===== 醫院清單渲染 =====

function renderHospitalList() {
  const container = document.getElementById('hospital-list');
  if (!container) return;

  const q = state.searchQuery.toLowerCase();
  const filtered = state.data.hospitals.filter((h) => {
    if (state.levelFilter !== 'all' && h.level !== state.levelFilter) return false;
    if (state.complianceFilter !== 'all' && state.complianceMap[h.id] !== state.complianceFilter) return false;
    if (q && !h.name.toLowerCase().includes(q) && !h.id.includes(q)) return false;
    return true;
  });

  // 按層級分組顯示
  const grouped = { '醫學中心': [], '區域醫院': [], '地區醫院': [] };
  filtered.forEach((h) => { if (grouped[h.level]) grouped[h.level].push(h); });

  const countEl = document.getElementById('hospital-count');
  if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} 家`;

  container.innerHTML = ['醫學中心', '區域醫院', '地區醫院']
    .filter((lv) => grouped[lv].length > 0)
    .map((lv) => `
      <div class="nurse-level-group">
        <div class="nurse-level-title">
          <span class="nurse-level-badge nurse-level-${levelSlug(lv)}">${lv}</span>
          <span class="nurse-level-count">${grouped[lv].length} 家</span>
        </div>
        <div class="nurse-hospital-grid">
          ${grouped[lv].map((h) => {
            const cls = state.complianceMap[h.id] || 'N';
            return `
              <button type="button" class="nurse-hospital-chip ${h.id === state.currentId ? 'active' : ''}" data-id="${h.id}">
                <span class="nurse-compliance-dot nurse-compliance-${cls}" title="${COMPLIANCE_CLASSES[cls].label}"></span>
                <span class="nurse-hospital-chip-name">${escapeHtml(h.name)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

  container.querySelectorAll('.nurse-hospital-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectHospital(btn.dataset.id, true));
  });
}

function levelSlug(lv) {
  return { '醫學中心': 'mc', '區域醫院': 'rg', '地區醫院': 'dt' }[lv] || 'other';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// ===== 醫院詳情渲染 =====

function selectHospital(id, updateUrl = false) {
  const hosp = state.data.hospitals.find((h) => h.id === id);
  if (!hosp) return;
  state.currentId = id;
  if (updateUrl) setDeepLinkUrl(id);
  renderHospitalList();  // 更新 active 樣式
  renderDetail(hosp);
}

function renderDetail(hosp) {
  const detail = document.getElementById('hospital-detail');
  const placeholder = document.getElementById('hospital-placeholder');
  if (placeholder) placeholder.hidden = true;
  if (detail) detail.hidden = false;

  // 找最新月份的資料
  const months = state.data.months;
  const latestMonth = [...months].reverse().find((m) => hosp.history[m]);
  const latest = latestMonth ? hosp.history[latestMonth] : { day: null, eve: null, night: null };
  const std = STANDARDS[hosp.level] || {};

  document.getElementById('hosp-name').textContent = hosp.name;
  document.getElementById('hosp-level').textContent = hosp.level;
  document.getElementById('hosp-level').className = `nurse-level-badge nurse-level-${levelSlug(hosp.level)}`;
  document.getElementById('hosp-code').textContent = `機構代號：${hosp.id}`;

  const cls = state.complianceMap[hosp.id] || 'N';
  const compBadge = document.getElementById('hosp-compliance');
  if (compBadge) {
    compBadge.textContent = COMPLIANCE_CLASSES[cls].label;
    compBadge.className = `nurse-compliance-badge nurse-compliance-${cls}`;
  }

  const setKpi = (id, val, standard) => {
    const el = document.getElementById(id);
    if (!el) return;
    const overStd = (val != null && standard != null && val > standard);
    el.innerHTML = val != null
      ? `<span class="${overStd ? 'over-std' : ''}">${val.toFixed(1)}</span>`
      : '—';
  };
  const kpiLabel = latestMonth ? formatRocMonth(latestMonth) : '';
  document.getElementById('kpi-day-label').textContent = `${kpiLabel} 白班護病比`;
  document.getElementById('kpi-eve-label').textContent = `${kpiLabel} 小夜班護病比`;
  document.getElementById('kpi-night-label').textContent = `${kpiLabel} 大夜班護病比`;
  setKpi('kpi-day', latest.day, std.day);
  setKpi('kpi-eve', latest.eve, std.eve);
  setKpi('kpi-night', latest.night, std.night);

  renderChart(hosp);
}

// ===== Chart.js 折線圖 =====

function renderChart(hosp) {
  const canvas = document.getElementById('ratio-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Destroy 舊 chart
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const months = state.data.months;
  const labels = months.map(formatRocMonth);
  const dayData = months.map((m) => hosp.history[m]?.day ?? null);
  const eveData = months.map((m) => hosp.history[m]?.eve ?? null);
  const nightData = months.map((m) => hosp.history[m]?.night ?? null);

  const std = STANDARDS[hosp.level] || {};

  // 常數水平線 = dataset 中所有值都相同 → 畫成水平線
  const stdDataset = (label, value, color) => ({
    label,
    data: months.map(() => value),
    borderColor: color,
    borderDash: [8, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0,
    fill: false,
    order: 999,  // 畫在後面（虛線在資料線後）
  });

  const datasets = [
    {
      label: '白班護病比',
      data: dayData,
      borderColor: COLORS.day.line,
      backgroundColor: COLORS.day.fill,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: COLORS.day.line,
      spanGaps: true,
    },
    {
      label: '小夜班護病比',
      data: eveData,
      borderColor: COLORS.eve.line,
      backgroundColor: COLORS.eve.fill,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: COLORS.eve.line,
      spanGaps: true,
    },
    {
      label: '大夜班護病比',
      data: nightData,
      borderColor: COLORS.night.line,
      backgroundColor: COLORS.night.fill,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: COLORS.night.line,
      spanGaps: true,
    },
  ];

  // 加入 3 條標準虛線（若層級有對應標準）
  if (std.day) datasets.push(stdDataset(`白班標準 1:${std.day}`, std.day, COLORS.std));
  if (std.eve) datasets.push(stdDataset(`小夜標準 1:${std.eve}`, std.eve, COLORS.std));
  if (std.night) datasets.push(stdDataset(`大夜標準 1:${std.night}`, std.night, COLORS.std));

  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Noto Sans TC', sans-serif", size: 12 },
            color: '#46557A',
            usePointStyle: true,
            padding: 12,
            filter: (item) => !item.text.includes('標準 1:'),  // legend 只列 3 條實線
          },
        },
        tooltip: {
          backgroundColor: '#1D3557',
          titleFont: { family: "'Noto Sans TC', sans-serif" },
          bodyFont: { family: "'Noto Sans TC', sans-serif" },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label && ctx.dataset.label.includes('標準 1:')) return null;
              const v = ctx.parsed.y;
              return v == null ? null : `${ctx.dataset.label}: ${v.toFixed(1)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: '#E5E9F0' },
          ticks: {
            color: '#6B7C93',
            font: { family: "'Noto Sans TC', sans-serif", size: 10 },
            maxRotation: 60,
            minRotation: 45,
            autoSkip: false,
          },
        },
        y: {
          title: {
            display: true,
            text: '護病比',
            color: '#46557A',
            font: { family: "'Noto Sans TC', sans-serif", size: 12 },
          },
          grid: { color: '#F1F3F7' },
          border: { display: false },
          beginAtZero: false,
          suggestedMin: 4,
          ticks: {
            color: '#6B7C93',
            font: { family: "'Noto Sans TC', sans-serif", size: 11 },
          },
        },
      },
    },
  });
}

// ===== 篩選/搜尋事件 =====

function setupFilterControls() {
  document.querySelectorAll('.nurse-level-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.levelFilter = btn.dataset.level;
      document.querySelectorAll('.nurse-level-filter').forEach((b) => {
        b.classList.toggle('active', b.dataset.level === state.levelFilter);
      });
      renderHospitalList();
    });
  });

  document.querySelectorAll('.nurse-compliance-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.complianceFilter = btn.dataset.compliance;
      document.querySelectorAll('.nurse-compliance-filter').forEach((b) => {
        b.classList.toggle('active', b.dataset.compliance === state.complianceFilter);
      });
      renderHospitalList();
    });
  });

  const search = document.getElementById('hospital-search');
  if (search) {
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.searchQuery = (search.value || '').trim();
        renderHospitalList();
      }, 200);
    });
  }
}

function buildComplianceMap() {
  const map = {};
  state.data.hospitals.forEach((h) => { map[h.id] = classifyHospital(h); });
  state.complianceMap = map;
  // 各類別統計
  const counts = { A: 0, B: 0, C: 0, N: 0 };
  Object.values(map).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  // 更新篩選按鈕上的計數
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`.nurse-compliance-filter[data-compliance="${k}"] .nurse-filter-count`);
    if (el) el.textContent = v.toLocaleString();
  });
  const totalEl = document.querySelector('.nurse-compliance-filter[data-compliance="all"] .nurse-filter-count');
  if (totalEl) totalEl.textContent = state.data.hospitals.length.toLocaleString();
}

// ===== 入口 =====

export async function initNurseRatio() {
  const container = document.getElementById('hospital-list');
  if (container) {
    container.innerHTML = '<div style="padding:24px;color:var(--muted);">載入中⋯</div>';
  }

  try {
    state.data = await loadData();
    buildComplianceMap();
    setupFilterControls();
    renderHospitalList();

    // 更新最後更新時間顯示
    const updateEl = document.getElementById('nurse-data-updated');
    if (updateEl && state.data.months.length) {
      const latest = state.data.months[state.data.months.length - 1];
      updateEl.textContent = `資料範圍：${formatRocMonth(state.data.months[0])} ~ ${formatRocMonth(latest)}（${state.data.monthCount} 個月、${state.data.hospitalCount} 家醫院）`;
    }

    // deep link
    const pendingId = parseDeepLinkId();
    if (pendingId) {
      const hosp = state.data.hospitals.find((h) => h.id === pendingId);
      if (hosp) {
        selectHospital(pendingId, false);
      } else {
        setDeepLinkUrl(null, true);
      }
    }

    // popstate: 上一頁/下一頁
    window.addEventListener('popstate', () => {
      const id = parseDeepLinkId();
      if (id) selectHospital(id, false);
    });

    renderIcons();
  } catch (e) {
    console.error(e);
    if (container) {
      container.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
    }
  }
}
