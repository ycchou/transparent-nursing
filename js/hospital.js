// 單一機構整合檔案頁：輸入一家評鑑醫院 → 一次看護病比 / 分享平台眾包 / 違規紀錄
//
// 三源以「機構代號」為錨（只涵蓋 hospitals-merged.json 的 482 家評鑑醫院）：
//   - 護病比：data/nurse-ratio.json，以 code 對應（多院區則各分院各一張圖）
//   - 分享平台：眾包 CSV（data-loader.loadAll），以機構名稱/簡稱比對
//   - 違規紀錄：勞檢/性平/職安三支 Sheet，以 data/violations-hospital-map.json（名稱→代號）比對

import { renderIcons } from './icons.js?v=9de368a906';
import { getShort, ensureLoaded as ensureShortLoaded } from './hospital-shortname.js?v=9de368a906';

import { notePwaIntent } from './pwa-prompt.js?v=9de368a906';

import { skeletonRows } from './skeleton.js?v=9de368a906';
import { escapeHtml } from './moderation.js?v=9de368a906';
import { mountCityFilter, bindChipGroup, levelSlug } from './picker-filters.js?v=9de368a906';
import { state, loadBaseData } from './hospital-data.js?v=9de368a906';

import { readCodeParam } from './hospital-merges.js?v=9de368a906';
import {
  renderNurseSection,
  renderFinancialsSection,
  renderPersonnelSection,
  renderPlatformSection,
  renderViolationsSection,
  copyOrShare,
} from './hospital-sections.js?v=9de368a906';

// ---------- utils ----------
// 舊碼（改制換碼）會轉成新碼並改寫網址
function parseDeepLinkCode() {
  return readCodeParam('code');
}
function setDeepLinkUrl(code, replace = false) {
  const u = new URL(location.href);
  if (code == null) u.searchParams.delete('code');
  else u.searchParams.set('code', String(code));
  history[replace ? 'replaceState' : 'pushState']({ code }, '', u.toString());
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
      if ((h.formerCodes || []).some((c) => c.includes(q))) return true;   // 舊代號也搜得到
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
  if (hosp.formerCodes && hosp.formerCodes.length) {
    lines.push(`改制前代號：${hosp.formerCodes.map(escapeHtml).join('、')}（資料已合併）`);
  }
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
// 地點篩選：依醫院數由多到少，(未知) 殿後（共用 js/picker-filters.js）
function renderCityFilter() {
  mountCityFilter(document.getElementById('city-filter'), state.merged, (city) => {
    state.cityFilter = city;
    renderHospitalList();
  });
}

function setupLevelFilter() {
  bindChipGroup('.nurse-level-filter', 'level', (lv) => { state.levelFilter = lv; renderHospitalList(); });
}

// ---------- init ----------
export async function initHospital() {
  const container = document.getElementById('hospital-list');
  if (container) container.innerHTML = skeletonRows(6);
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

