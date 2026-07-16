// 共用 header / footer 注入 + 工具函式
import { SITE, CATEGORIES } from './config.js?v=53d5d8c1e5';
import { icon, renderIcons } from './icons.js?v=53d5d8c1e5';
import { initPWAPrompt, showInstallGuide, isAppInstalled } from './pwa-prompt.js?v=53d5d8c1e5';

// 主辦/協作工會 — 共用資料（footer / hero strip / about 都引用）
export const ORGS = {
  lead: [
    { id: 'tfmu',  name: '台灣醫療工會聯合會', short: '台醫聯',  logo: 'assets/orgs/tfmu.jpg',  href: 'https://www.facebook.com/TFMU.org?locale=zh_TW' },
    { id: 'tnpiu', name: '臺灣護理產業工會',    short: '臺護產',  logo: 'assets/orgs/tnpiu.png', href: 'https://www.facebook.com/tnu.org?locale=zh_TW' },
  ],
  tech: [
    { id: 'trtu',  name: '台灣呼吸治療產業工會', short: 'RT 工會', logo: 'assets/orgs/trtu.png',  href: 'https://trtu.org.tw/' },
  ],
};

function orgChipHTML(org) {
  const inner = `<img src="${org.logo}" alt="${org.name} logo"/><span>${org.short}</span>`;
  return org.href
    ? `<a class="org-chip" href="${org.href}" target="_blank" rel="noopener" title="${org.name}">${inner}</a>`
    : `<span class="org-chip" title="${org.name}">${inner}</span>`;
}

export function orgStripHTML(opts = {}) {
  const cls = opts.className || 'org-strip';
  return `
    <div class="${cls}">
      <div class="org-strip-section">
        <span class="org-strip-role">主導製作</span>
        ${ORGS.lead.map(orgChipHTML).join('')}
      </div>
      <div class="org-strip-section">
        <span class="org-strip-role">技術支援</span>
        ${ORGS.tech.map(orgChipHTML).join('')}
      </div>
    </div>
  `;
}

const NAV_ITEMS = [
  { href: 'index.html',       label: '首頁',     match: ['index.html', ''] },
  { href: 'platform.html',    label: '分享平台', match: ['platform.html'] },
  { href: 'hospital.html',    label: '機構總覽', match: ['hospital.html'] },
  // 「資料查詢」下拉群組：把瀏覽資料的頁面收在一起，精簡頂層數量
  { label: '資料查詢', children: [
    { href: 'nurse-ratio.html', label: '護病比', match: ['nurse-ratio.html'] },
    { href: 'financials.html',  label: '醫院財務', match: ['financials.html'] },
    { href: 'personnel.html',   label: '人力監控', match: ['personnel.html'] },
    // 3 個違規紀錄合併進 records.html，match 陣列同時涵蓋舊 URL 讓 nav highlight 保留
    { href: 'records.html',     label: '違規紀錄', match: ['records.html', 'violations.html', 'gender.html', 'osha.html'] },
    { href: 'stats.html',       label: '統計摘要', match: ['stats.html'] },
  ] },
  { href: 'participate.html', label: '填寫表單', match: ['participate.html'] },
  { href: 'about.html',       label: '關於',     match: ['about.html'] },
];

// 軟鎖：鎖定期只顯示公開頁的選單/頁尾連結（總開關與白名單在 js/gate.js）
function gatePageOf(href) {
  return (href || '').split('#')[0].split('?')[0].split('/').pop() || 'index.html';
}
function gateAllowed(href) {
  if (typeof window === 'undefined' || !window.__SITE_LOCKED__) return true;
  return (window.__GATE_PUBLIC__ || []).indexOf(gatePageOf(href)) !== -1;
}
function visibleNav() {
  if (typeof window === 'undefined' || !window.__SITE_LOCKED__) return NAV_ITEMS;
  return NAV_ITEMS.map((it) => {
    if (it.children) {
      const kids = it.children.filter((c) => gateAllowed(c.href));
      return kids.length ? { ...it, children: kids } : null;
    }
    return gateAllowed(it.href) ? it : null;
  }).filter(Boolean);
}

// Logo 標誌：白色心型 + 紅色 ECG 線（以 apple-touch-icon 為基準 1.5× 等比放大，
// 顯示尺寸 26px 在 32px 色塊內 → 心型佔 32px 方塊約 62% 寬度）
const HEART_PULSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style="display:block;">
  <path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>
  <path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

function currentPage() {
  const path = location.pathname.split('/').pop() || 'index.html';
  return path;
}

// 單一導覽項目 → HTML（一般連結，或含子選單的下拉群組）
function navItemHTML(it, page) {
  if (!it.children) {
    return `<a href="${it.href}" class="${it.match.includes(page) ? 'active' : ''}">${it.label}</a>`;
  }
  const groupActive = it.children.some((c) => c.match.includes(page));
  const links = it.children
    .map((c) => `<a href="${c.href}" class="${c.match.includes(page) ? 'active' : ''}">${c.label}</a>`)
    .join('');
  return `
    <div class="nav-group${groupActive ? ' active' : ''}">
      <button type="button" class="nav-group-trigger${groupActive ? ' active' : ''}" aria-expanded="false" aria-haspopup="true">
        ${it.label}<span class="nav-group-caret" aria-hidden="true">▾</span>
      </button>
      <div class="nav-submenu">${links}</div>
    </div>`;
}

function headerHTML() {
  const page = currentPage();
  return `
    <header class="site-header">
      <div class="container">
        <div class="nav-wrap">
          <a href="index.html" class="site-logo">
            <span class="site-logo-mark">${HEART_PULSE_SVG}</span>
            <span>護理職場透明化</span>
          </a>
          <nav class="site-nav" id="site-nav">
            ${visibleNav().map((it) => navItemHTML(it, page)).join('')}
          </nav>
          <button class="nav-toggle" id="nav-toggle" aria-label="開啟選單">
            ${icon('menu')}
          </button>
        </div>
      </div>
    </header>
  `;
}

function footerHTML() {
  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="site-logo" style="color:white;margin-bottom:16px">
              <span class="site-logo-mark">${HEART_PULSE_SVG}</span>
              <span>${SITE.name}</span>
            </div>
            <p style="color:rgba(255,255,255,0.65);font-size:0.92rem;line-height:1.75;">
              ${SITE.tagline}<br/>讓護理職場的真實情境，被看見、被討論、被改變。
            </p>
          </div>
          ${(() => {
            const explore = [
              { href: 'platform.html', label: '分享平台' },
              { href: 'stats.html', label: '統計摘要' },
              { href: 'nurse-ratio.html', label: '護病比' },
              { href: 'hospital.html', label: '機構總覽' },
              { href: 'personnel.html', label: '人力監控' },
              { href: 'records.html?type=labor', label: '勞檢紀錄' },
              { href: 'records.html?type=gender', label: '性平紀錄' },
              { href: 'records.html?type=osha', label: '職安紀錄' },
              { href: 'participate.html', label: '填寫表單' },
            ].filter((l) => gateAllowed(l.href));
            const cats = gateAllowed('platform.html')
              ? CATEGORIES.map((c) => `<li><a href="platform.html#${c.slug}">${c.name}</a></li>`).join('')
              : '';
            return `
          <div>
            <h4>探索</h4>
            <ul>${explore.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join('')}</ul>
          </div>
          ${cats ? `<div>\n            <h4>類別</h4>\n            <ul>${cats}</ul>\n          </div>` : ''}`;
          })()}
          <div>
            <h4>聯絡</h4>
            <ul>
              <li><a href="mailto:${SITE.contactEmail}">${SITE.contactEmail}</a></li>
              <li><a href="about.html">運動緣起</a></li>
              <li><a href="participate.html">填寫表單</a></li>
              <li><a href="terms.html">服務條款</a></li>
              ${isAppInstalled() ? '' : `<li><a href="#" onclick="event.preventDefault();window.__nursingShowInstallGuide&&window.__nursingShowInstallGuide();">加到主畫面 (App 化)</a></li>`}
            </ul>
          </div>
        </div>
        <div class="org-strip-divider"></div>
        ${orgStripHTML()}
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} 護理職場透明化運動 · Prototype</span>
          <span>致敬 <a href="https://trtu.org.tw/RT_platform/" target="_blank" rel="noopener">呼吸治療師勞動分享平台</a></span>
        </div>
      </div>
    </footer>
  `;
}

export function mountLayout() {
  // header
  const headerSlot = document.getElementById('app-header');
  if (headerSlot) headerSlot.innerHTML = headerHTML();
  // footer
  const footerSlot = document.getElementById('app-footer');
  if (footerSlot) footerSlot.innerHTML = footerHTML();
  // toggle
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }
  // 「資料查詢」下拉：點 trigger 切換（觸控/鍵盤友善；桌機另有 CSS hover）
  const group = document.querySelector('.nav-group');
  if (group) {
    const trigger = group.querySelector('.nav-group-trigger');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = group.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!group.contains(e.target)) {
        group.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { group.classList.remove('open'); trigger?.setAttribute('aria-expanded', 'false'); }
    });
  }
  // render any remaining icons
  renderIcons();
  // PWA「加到主畫面」自動引導（10 秒後行動裝置彈出 banner）
  initPWAPrompt();

  // 背景預載 platform 資料：使用者切到分享平台時即時顯示，無需等待 fetch
  // 動態 import 避免循環依賴與初始 parse 成本
  import('./data-loader.js?v=53d5d8c1e5')
    .then(({ preloadAll }) => preloadAll && preloadAll())
    .catch(() => { /* 預載失敗不影響任何 UI */ });

  // 背景預載勞檢/性平/職安紀錄資料：同樣讓使用者切過去時即時顯示
  import('./violations.js?v=53d5d8c1e5')
    .then(({ preloadViolations }) => preloadViolations && preloadViolations())
    .catch(() => { /* 預載失敗不影響任何 UI */ });
  import('./gender.js?v=53d5d8c1e5')
    .then(({ preloadGender }) => preloadGender && preloadGender())
    .catch(() => { /* 預載失敗不影響任何 UI */ });
  import('./osha.js?v=53d5d8c1e5')
    .then(({ preloadOsha }) => preloadOsha && preloadOsha())
    .catch(() => { /* 預載失敗不影響任何 UI */ });
}

/** Format helpers */
export const fmt = {
  date: (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  },
  // 顯示到分鐘；若原始字串沒帶時間（純日期）則退回 date 格式
  datetime: (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return s;
    const hasTime = typeof s === 'string' && /\d{1,2}:\d{2}/.test(s);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    if (!hasTime && !(s instanceof Date)) return `${Y}/${M}/${D}`;
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${Y}/${M}/${D} ${h}:${m}`;
  },
  // 相對時間，e.g. "2 分鐘前"
  relative: (s) => {
    if (!s) return '—';
    const d = s instanceof Date ? s : new Date(s);
    if (isNaN(d)) return s;
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return '剛剛';
    if (min < 60) return `${min} 分鐘前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小時前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} 天前`;
    return fmt.datetime(s);
  },
  number: (n) => (n === null || n === undefined || n === '') ? '—' : Number(n).toLocaleString(),
  empty: (v) => (v === null || v === undefined || v === '' || v === '—') ? '—' : v,
};

/** Recommend index to pill (1-5) */
export function recommendPill(value) {
  const v = Number(value);
  if (!v) return '<span class="text-muted">—</span>';
  const labels = { 5: '非常推薦', 4: '推薦', 3: '保留', 2: '不推薦', 1: '非常不推薦' };
  return `<span class="pill pill-rec-${v}">${labels[v] || v}</span>`;
}

/** Category to tag */
export function categoryTag(slug) {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) return '';
  return `<span class="tag tag-${slug}">${cat.name}</span>`;
}
