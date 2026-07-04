// 三班護病比頁面：讀 data/nurse-ratio.json → 醫院選擇 → 折線圖 + 標準虛線
//
// 資料結構 (data/nurse-ratio.json)：
//   {
//     months: ["11207", ..., "11505"],   // ROC 年月字串
//     hospitals: [{ id, name, level, history: { "11207": {day, eve, night} } }]
//   }

import { renderIcons } from './icons.js?v=26';

const DATA_URL = 'data/nurse-ratio.json?v=26';

// 三班護病比・衛福部公告標準（依醫院層級）
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
//   每一班別的判定：
//     safe   : ratio < std × 0.95         （明確低於標準 5%）
//     watch  : std × 0.95 ≤ ratio ≤ std × 1.05  （落在標準 ±5% 邊界）
//     danger : ratio > std × 1.05         （明顯超過標準 5%）
//   醫院分類（取最壞班別）：
//     A · 達標 (green)：三班全部 safe
//     B · 觀察 (amber)：至少一班 watch，且無 danger
//     C · 警戒 (red)  ：至少一班 danger
const COMPLIANCE_TOLERANCE = 0.05;  // ±5%
const COMPLIANCE_CLASSES = {
  A: { key: 'A', label: '達標', color: '#06A77D', bg: 'rgba(6,167,125,0.13)' },
  B: { key: 'B', label: '觀察', color: '#F4A261', bg: 'rgba(244,162,97,0.15)' },
  C: { key: 'C', label: '警戒', color: '#E63946', bg: 'rgba(230,57,70,0.13)' },
  N: { key: 'N', label: '未報', color: '#6B7C93', bg: 'rgba(107,124,147,0.10)' },
};

// 單一班別狀態
function shiftStatus(val, std) {
  if (val == null || std == null) return null;
  const upper = std * (1 + COMPLIANCE_TOLERANCE);
  const lower = std * (1 - COMPLIANCE_TOLERANCE);
  if (val > upper) return 'danger';
  if (val >= lower) return 'watch';
  return 'safe';
}

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
  const statuses = [
    shiftStatus(latest.day, std.day),
    shiftStatus(latest.eve, std.eve),
    shiftStatus(latest.night, std.night),
  ].filter((s) => s != null);
  if (statuses.length === 0) return 'N';
  if (statuses.includes('danger')) return 'C';
  if (statuses.includes('watch')) return 'B';
  return 'A';
}

const state = {
  data: null,       // parsed nurse-ratio.json
  currentId: null,  // 目前選中的醫院代號
  chart: null,      // Chart.js instance
  levelFilter: 'all',
  complianceFilter: 'all',
  cityFilter: 'all',
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

// 手動 city overlay（因評鑑 PDF 未收錄 74 家療養院/精神專科/軍醫分院等，
// 使用者可在 data/hospitals-manual-city.json 手動補上 { 機構代號: 縣市 } 對照）。
async function loadManualCityOverlay() {
  try {
    const r = await fetch('data/hospitals-manual-city.json?v=1', { cache: 'no-store' });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

// ===== 醫院清單渲染 =====

function renderHospitalList() {
  const container = document.getElementById('hospital-list');
  if (!container) return;

  const q = state.searchQuery.toLowerCase();
  const filtered = state.data.hospitals.filter((h) => {
    if (state.levelFilter !== 'all' && h.level !== state.levelFilter) return false;
    if (state.complianceFilter !== 'all' && state.complianceMap[h.id] !== state.complianceFilter) return false;
    if (state.cityFilter !== 'all') {
      const c = h.city || '(未知)';
      if (c !== state.cityFilter) return false;
    }
    if (q) {
      const nameL = h.name.toLowerCase();
      const fullL = (h.fullName || '').toLowerCase();
      if (!nameL.includes(q) && !fullL.includes(q) && !h.id.includes(q)) return false;
    }
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
            const tipInfo = [h.fullName, h.city, `代號 ${h.id}`].filter(Boolean).join(' · ');
            return `
              <button type="button" class="nurse-hospital-chip ${h.id === state.currentId ? 'active' : ''}" data-id="${h.id}" title="${escapeHtml(tipInfo)}">
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

  // 縣市 badge（排在層級 badge 前面；未知者顯示「未分類」灰色）
  const cityEl = document.getElementById('hosp-city');
  if (cityEl) {
    if (hosp.city) {
      cityEl.textContent = hosp.city;
      cityEl.classList.remove('unknown');
    } else {
      cityEl.textContent = '未分類';
      cityEl.classList.add('unknown');
    }
    cityEl.hidden = false;
  }

  document.getElementById('hosp-level').textContent = hosp.level;
  document.getElementById('hosp-level').className = `nurse-level-badge nurse-level-${levelSlug(hosp.level)}`;

  // 詳情：正式名稱 / 機構代號 / 地址 三行（縣市已升為 badge，此處不重複）
  const lines = [];
  if (hosp.fullName && hosp.fullName !== hosp.name) lines.push(`正式名稱：${escapeHtml(hosp.fullName)}`);
  // 共用機構代號的多院區：顯示原始代號 + 提示
  const shared = hosp.sharedCode;
  if (shared) {
    lines.push(`機構代號：${escapeHtml(shared.code)} <span class="nurse-shared-hint">（此代號共 ${shared.branchCount} 院區）</span>`);
  } else {
    lines.push(`機構代號：${escapeHtml(hosp.id)}`);
  }
  if (hosp.address) lines.push(`地址：${escapeHtml(hosp.address)}`);
  document.getElementById('hosp-code').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');

  // 各院區已有各自 VPN 護病比獨立資料，不再顯示警語（僅 code 行保留「共 N 院區」小提示）
  const sharedBanner = document.getElementById('hosp-shared-banner');
  if (sharedBanner) sharedBanner.hidden = true;

  const cls = state.complianceMap[hosp.id] || 'N';
  const compBadge = document.getElementById('hosp-compliance');
  if (compBadge) {
    compBadge.textContent = COMPLIANCE_CLASSES[cls].label;
    compBadge.className = `nurse-compliance-badge nurse-compliance-${cls}`;
  }

  const setKpi = (id, val, standard) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (val == null) { el.innerHTML = '—'; return; }
    const status = shiftStatus(val, standard);  // 'safe' | 'watch' | 'danger' | null
    const cls = status ? `status-${status}` : '';
    el.innerHTML = `<span class="${cls}">${val.toFixed(1)}</span>`;
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

  // 註冊 annotation plugin（重複註冊無害）
  if (window['chartjs-plugin-annotation'] && typeof Chart.register === 'function') {
    try { Chart.register(window['chartjs-plugin-annotation']); } catch {}
  }

  // Destroy 舊 chart
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const months = state.data.months;
  const labels = months.map(formatRocMonth);
  const dayData = months.map((m) => hosp.history[m]?.day ?? null);
  const eveData = months.map((m) => hosp.history[m]?.eve ?? null);
  const nightData = months.map((m) => hosp.history[m]?.night ?? null);

  const std = STANDARDS[hosp.level] || {};

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

  // 用 chartjs-plugin-annotation 畫 3 條標準虛線，各自帶「白班標準 1:6」等左上標籤
  const stdAnnotations = {};
  const makeStdLine = (shiftLabel, value) => ({
    type: 'line',
    yMin: value, yMax: value,
    borderColor: COLORS.std,
    borderDash: [8, 4],
    borderWidth: 1.5,
    label: {
      display: true,
      content: `${shiftLabel}標準 1:${value}`,
      position: 'end',           // 標籤放最右邊
      backgroundColor: 'rgba(255,255,255,0.85)',
      color: '#B22234',
      font: { family: "'Noto Sans TC', sans-serif", size: 10, weight: 'bold' },
      padding: { top: 2, bottom: 2, left: 6, right: 6 },
      yAdjust: -10,
      borderRadius: 4,
    },
  });
  if (std.day) stdAnnotations.stdDay = makeStdLine('白班', std.day);
  if (std.eve) stdAnnotations.stdEve = makeStdLine('小夜', std.eve);
  if (std.night) stdAnnotations.stdNight = makeStdLine('大夜', std.night);

  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // 螢幕縮放時重算 X 軸 tick 上限（每 70px 一格）
      onResize: (chart, size) => {
        const limit = Math.max(4, Math.min(months.length, Math.floor(size.width / 70)));
        chart.options.scales.x.ticks.maxTicksLimit = limit;
      },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Noto Sans TC', sans-serif", size: 12 },
            color: '#46557A',
            usePointStyle: true,
            padding: 12,
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
              const v = ctx.parsed.y;
              return v == null ? null : `${ctx.dataset.label}: ${v.toFixed(1)}`;
            },
          },
        },
        annotation: { annotations: stdAnnotations },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: '#E5E9F0' },
          ticks: {
            color: '#6B7C93',
            font: { family: "'Noto Sans TC', sans-serif", size: 10 },
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            // 依 canvas 寬度動態決定 tick 上限（每個標籤 ~70px 寬）
            maxTicksLimit: (() => {
              const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
              return Math.max(4, Math.min(months.length, Math.floor(w / 70)));
            })(),
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

function renderCityFilter() {
  const el = document.getElementById('city-filter');
  if (!el) return;
  const counts = {};
  state.data.hospitals.forEach((h) => {
    const c = h.city || '(未知)';
    counts[c] = (counts[c] || 0) + 1;
  });
  // 依醫院數 desc 排序，(未知) 排到最後
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
      el.querySelectorAll('.nurse-city-filter').forEach((b) => {
        b.classList.toggle('active', b.dataset.city === state.cityFilter);
      });
      renderHospitalList();
    });
  });
}

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

// ===== 合規總覽儀表板 =====
//   - 4 顆總覽 KPI（達標/觀察/警戒/未報 家數 + 佔全國%）
//   - 3 條各層級堆疊條（醫學中心/區域/地區，內含 A/B/C/N 分段）
function renderOverview() {
  const total = state.data.hospitals.length;
  const CLASS_KEYS = ['A', 'B', 'C', 'N'];

  // 全國總計
  const globalCounts = { A: 0, B: 0, C: 0, N: 0 };
  Object.values(state.complianceMap).forEach((k) => { globalCounts[k] = (globalCounts[k] || 0) + 1; });

  // 各層級 × 各分類
  const byLevel = {};
  ['醫學中心', '區域醫院', '地區醫院'].forEach((lv) => { byLevel[lv] = { A: 0, B: 0, C: 0, N: 0, total: 0 }; });
  state.data.hospitals.forEach((h) => {
    const lv = byLevel[h.level];
    if (!lv) return;
    const cls = state.complianceMap[h.id] || 'N';
    lv[cls] += 1;
    lv.total += 1;
  });

  // 副標
  const subEl = document.getElementById('nurse-overview-sub');
  if (subEl) {
    const monthLatest = state.data.months[state.data.months.length - 1];
    subEl.textContent = monthLatest ? `依 ${formatRocMonth(monthLatest)} 資料分類（共 ${total.toLocaleString()} 家）` : `共 ${total.toLocaleString()} 家`;
  }

  // 4 KPI
  const kpiEl = document.getElementById('nurse-overview-kpis');
  if (kpiEl) {
    kpiEl.innerHTML = CLASS_KEYS.map((k) => {
      const n = globalCounts[k] || 0;
      const pct = total ? (100 * n / total) : 0;
      const meta = COMPLIANCE_CLASSES[k];
      return `
        <div class="nurse-overview-kpi" style="border-color:${meta.color};">
          <div class="nurse-overview-kpi-label" style="color:${meta.color};">
            <span class="nurse-compliance-dot nurse-compliance-${k}"></span>
            ${meta.label}
          </div>
          <div class="nurse-overview-kpi-num" style="color:${meta.color};">${n.toLocaleString()}</div>
          <div class="nurse-overview-kpi-pct">${pct.toFixed(1)}%</div>
        </div>
      `;
    }).join('');
  }

  // 各層級堆疊條
  const matrixEl = document.getElementById('nurse-overview-matrix');
  if (matrixEl) {
    matrixEl.innerHTML = Object.entries(byLevel).map(([lv, row]) => {
      if (row.total === 0) return '';
      const segments = CLASS_KEYS.map((k) => {
        const n = row[k];
        if (!n) return '';
        const pct = 100 * n / row.total;
        const meta = COMPLIANCE_CLASSES[k];
        return `<span class="nurse-overview-seg nurse-compliance-${k}" style="width:${pct}%;background:${meta.color};" title="${meta.label} ${n} 家 (${pct.toFixed(1)}%)"></span>`;
      }).join('');
      const legend = CLASS_KEYS.map((k) => {
        const n = row[k];
        if (!n) return '';
        const pct = 100 * n / row.total;
        const meta = COMPLIANCE_CLASSES[k];
        return `<span class="nurse-overview-legend-item"><span class="nurse-compliance-dot nurse-compliance-${k}"></span>${meta.label} <strong>${n}</strong> <span class="nurse-overview-legend-pct">${pct.toFixed(1)}%</span></span>`;
      }).filter(Boolean).join('');
      return `
        <div class="nurse-overview-row">
          <div class="nurse-overview-row-header">
            <span class="nurse-level-badge nurse-level-${levelSlug(lv)}">${lv}</span>
            <span class="nurse-overview-row-total">${row.total.toLocaleString()} 家</span>
          </div>
          <div class="nurse-overview-bar">${segments}</div>
          <div class="nurse-overview-legend">${legend}</div>
        </div>
      `;
    }).join('');
  }
}

// ===== 入口 =====

export async function initNurseRatio() {
  const container = document.getElementById('hospital-list');
  if (container) {
    container.innerHTML = '<div style="padding:24px;color:var(--muted);">載入中⋯</div>';
  }

  try {
    state.data = await loadData();
    // 套用手動 city overlay（僅補 city == null 的醫院；overlay 缺檔則 no-op）
    const cityOverlay = await loadManualCityOverlay();
    if (cityOverlay && Object.keys(cityOverlay).length) {
      state.data.hospitals.forEach((h) => { if (!h.city && cityOverlay[h.id]) h.city = cityOverlay[h.id]; });
    }
    buildComplianceMap();
    renderOverview();
    renderCityFilter();
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
