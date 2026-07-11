// 三班護病比頁面：讀 data/nurse-ratio.json → 醫院選擇 → 折線圖 + 標準虛線
//
// 資料結構 (data/nurse-ratio.json)：
//   {
//     months: ["11207", ..., "11505"],   // ROC 年月字串
//     hospitals: [{ id, name, level, history: { "11207": {day, eve, night} } }]
//   }

import { renderIcons } from './icons.js?v=d9feff7d21';
import {
  STANDARDS,
  COMPLIANCE_CLASSES,
  formatRocMonth,
  shiftStatus,
  classifyHospital as classifyHospitalView,
  renderNurseChart,
} from './nurse-ratio-view.js?v=d9feff7d21';

const DATA_URL = 'data/nurse-ratio.json?v=1dbde60d94';

// 合規分類綁定本頁 state.data.months（共用邏輯在 nurse-ratio-view.js）
function classifyHospital(hosp) {
  return classifyHospitalView(hosp, state.data ? state.data.months : []);
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
    fetch(DATA_URL, { cache: 'default' })
      .then((r) => r.ok ? r.json() : null)
      .then((fresh) => { if (fresh) writeCache(fresh); })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(DATA_URL, { cache: 'default' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  writeCache(data);
  return data;
}

// 手動 city overlay（因評鑑 PDF 未收錄 74 家療養院/精神專科/軍醫分院等，
// 使用者可在 data/hospitals-manual-city.json 手動補上 { 機構代號: 縣市 } 對照）。
async function loadManualCityOverlay() {
  try {
    const r = await fetch('data/hospitals-manual-city.json?v=dd65ec4ace', { cache: 'default' });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

// 地址 overlay（vpn-only 醫院沒地址，用健保署開放資料以 id/代碼補上；
// 由 tools/fetch-hospital-addresses.py 產生 data/hospitals-address-overlay.json）
async function loadAddressOverlay() {
  try {
    const r = await fetch('data/hospitals-address-overlay.json?v=4f090ac4c9', { cache: 'default' });
    if (!r.ok) return {};
    const d = await r.json();
    return (d && d.overlay) || {};
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
  const profileCode = hosp.code || hosp.id;
  if (profileCode) {
    lines.push(`<a href="hospital.html?code=${encodeURIComponent(profileCode)}" style="color:var(--primary);text-decoration:underline;text-underline-offset:2px;">查看整合檔案（含眾包資料・違規紀錄）→</a>`);
  }
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

  renderNurseChart(document.getElementById('ratio-chart'), hosp, state.data.months);
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
    // 套用地址 overlay（以 id 補地址/縣市/電話，僅補原本缺的欄位）
    const addrOverlay = await loadAddressOverlay();
    if (addrOverlay && Object.keys(addrOverlay).length) {
      state.data.hospitals.forEach((h) => {
        const o = addrOverlay[h.id];
        if (!o) return;
        if (!(h.address || '').trim() && o.address) h.address = o.address;
        if (!(h.city || '').trim() && o.city) h.city = o.city;
        if (!(h.phone || '').trim() && o.phone) h.phone = o.phone;
      });
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
