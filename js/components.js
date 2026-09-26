// 共用 header / footer 注入 + 工具函式
import { SITE, CATEGORIES } from './config.js?v=9ae01939b6';
import { icon, renderIcons } from './icons.js?v=9ae01939b6';
import { initPWAPrompt, showInstallGuide, isAppInstalled } from './pwa-prompt.js?v=9ae01939b6';
import { initScrollHints } from './scroll-hint.js?v=9ae01939b6';
import { mountModeBadge } from './env.js?v=9ae01939b6';

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
  // 首頁改用點左上 logo 回去（網站慣例），頂層不再放「首頁」以精簡導覽
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
  { href: 'about.html',       label: '關於我們', match: ['about.html'] },
  { href: 'support.html',     label: '支持我們', match: ['support.html'] },
  // 外部連結：RT 姊妹站（呼吸治療產業勞動環境公開平台）
  { href: 'https://trtu.org.tw/RT_platform/', label: 'RT 職場', external: true, title: '呼吸治療產業勞動環境公開平台' },
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
    return (it.external || gateAllowed(it.href)) ? it : null;
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
  if (it.external) {
    return `<a href="${it.href}" class="nav-external" target="_blank" rel="noopener"${it.title ? ` title="${it.title}"` : ''}>${it.label} <span class="nav-external-arrow" aria-hidden="true">↗</span></a>`;
  }
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

// ===== 手機底部導覽列（≤768px） =====
// 5 格：分享平台／機構總覽／＋填寫（主按鈕）／資料查詢（底部面板）／更多（底部面板）。
// 手機上取代右上角漢堡選單；表單填寫頁（participate-*.html）不顯示，避免填到一半誤觸離開、
// 也不跟鍵盤與送出按鈕搶空間。
const BOTTOM_NAV = {
  tabs: [
    { href: 'platform.html', label: '分享平台', icon: 'message-square', match: ['platform.html'] },
    { href: 'hospital.html', label: '機構總覽', icon: 'building', match: ['hospital.html'] },
    { href: 'participate.html', label: '填寫', icon: 'plus', match: ['participate.html'], cta: true },
    { sheet: 'data', label: '資料查詢', icon: 'bar-chart-3' },
    { sheet: 'more', label: '更多', icon: 'more-horizontal' },
  ],
  sheets: {
    data: {
      title: '資料查詢',
      items: [
        { href: 'nurse-ratio.html', label: '護病比', desc: '全國醫院三班護病比逐月變化', icon: 'activity', match: ['nurse-ratio.html'] },
        { href: 'financials.html', label: '醫院財務', desc: '營收、利益率與同儕比較', icon: 'pie-chart', match: ['financials.html'] },
        { href: 'personnel.html', label: '人力監控', desc: '醫事人力逐月增減', icon: 'users', match: ['personnel.html'] },
        { href: 'records.html', label: '違規紀錄', desc: '勞檢／性平／職安處分', icon: 'shield-check', match: ['records.html', 'violations.html', 'gender.html', 'osha.html'] },
        { href: 'stats.html', label: '統計摘要', desc: '分享資料的整體分布', icon: 'bar-chart-3', match: ['stats.html'] },
      ],
    },
    more: {
      title: '更多',
      items: [
        { href: 'about.html', label: '關於我們', desc: '運動緣起與常見問題', icon: 'info', match: ['about.html'] },
        { href: 'support.html', label: '支持我們', desc: '小額捐款，讓平台走得更遠', icon: 'heart', match: ['support.html'] },
        { href: 'terms.html', label: '服務條款', icon: 'file-text', match: ['terms.html'] },
        { href: 'https://trtu.org.tw/RT_platform/', label: 'RT 職場', desc: '呼吸治療產業勞動環境公開平台', icon: 'arrow-up-right', external: true },
      ],
    },
  },
};

function bottomNavEnabled(page) {
  return !/^participate-.+\.html$/.test(page);
}

function bottomNavHTML(page) {
  const sheetOf = (key) => {
    const sh = BOTTOM_NAV.sheets[key];
    return { ...sh, items: sh.items.filter((it) => it.external || gateAllowed(it.href)) };
  };
  const tabs = BOTTOM_NAV.tabs.filter((t) => t.sheet ? sheetOf(t.sheet).items.length : gateAllowed(t.href));
  // 每格：icon 外包一層 .bn-icon（選中時長出 pill 底色），下方 label
  const inner = (t) => `<span class="bn-icon">${icon(t.icon, { size: 22 })}</span><span class="bn-label">${t.label}</span>`;
  const tabHTML = tabs.map((t) => {
    if (t.sheet) {
      const active = sheetOf(t.sheet).items.some((it) => it.match && it.match.includes(page));
      return `<button type="button" class="bn-item${active ? ' active' : ''}" data-sheet="${t.sheet}"
                aria-haspopup="dialog" aria-expanded="false" aria-controls="bn-sheet">${inner(t)}</button>`;
    }
    const active = t.match.includes(page);
    return `<a href="${t.href}" class="bn-item${t.cta ? ' bn-cta' : ''}${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${inner(t)}</a>`;
  }).join('');

  const panels = Object.keys(BOTTOM_NAV.sheets).map((key) => {
    const sh = sheetOf(key);
    const items = sh.items.map((it) => {
      const active = it.match && it.match.includes(page);
      const ext = it.external ? ' target="_blank" rel="noopener"' : '';
      return `<li><a href="${it.href}" class="bn-sheet-item${active ? ' active' : ''}"${ext}${active ? ' aria-current="page"' : ''}>
                <span class="bn-sheet-icon">${icon(it.icon, { size: 20 })}</span>
                <span class="bn-sheet-text"><strong>${it.label}</strong>${it.desc ? `<small>${it.desc}</small>` : ''}</span>
                <span class="bn-sheet-chev" aria-hidden="true">${icon(it.external ? 'arrow-up-right' : 'chevron-right', { size: 18 })}</span>
              </a></li>`;
    }).join('');
    return `<div class="bn-sheet-panel" data-panel="${key}" hidden>
              <div class="bn-sheet-title" id="bn-sheet-title-${key}">${sh.title}</div>
              <ul>${items}</ul>
            </div>`;
  }).join('');

  return `
    <nav class="bottom-nav" aria-label="主要導覽">${tabHTML}</nav>
    <div class="bn-sheet" id="bn-sheet" role="dialog" aria-modal="true" hidden>
      <div class="bn-sheet-backdrop" data-close></div>
      <div class="bn-sheet-body">
        <div class="bn-sheet-grab" aria-hidden="true"><span class="bn-sheet-handle"></span></div>
        ${panels}
      </div>
    </div>`;
}

function mountBottomNav() {
  const page = currentPage();
  if (!bottomNavEnabled(page) || document.querySelector('.bottom-nav')) return;
  document.body.insertAdjacentHTML('beforeend', bottomNavHTML(page));
  document.body.classList.add('has-bottom-nav');

  const sheet = document.getElementById('bn-sheet');
  const body = sheet.querySelector('.bn-sheet-body');
  const triggers = document.querySelectorAll('.bottom-nav [data-sheet]');
  let openKey = null;
  let lastTrigger = null;

  const close = () => {
    if (!openKey) return;
    sheet.classList.remove('open');
    body.style.transform = '';
    triggers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    document.body.classList.remove('bn-sheet-open');
    openKey = null;
    setTimeout(() => { if (!openKey) sheet.hidden = true; }, 260);
    lastTrigger?.focus({ preventScroll: true });
  };
  const open = (key, trigger) => {
    if (openKey === key) { close(); return; }
    sheet.hidden = false;
    sheet.querySelectorAll('.bn-sheet-panel').forEach((p) => { p.hidden = p.dataset.panel !== key; });
    sheet.setAttribute('aria-labelledby', `bn-sheet-title-${key}`);
    triggers.forEach((b) => b.setAttribute('aria-expanded', String(b === trigger)));
    document.body.classList.add('bn-sheet-open');
    openKey = key;
    lastTrigger = trigger;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.classList.add('open');
      sheet.querySelector(`.bn-sheet-panel[data-panel="${key}"] a`)?.focus({ preventScroll: true });
    }));
  };

  triggers.forEach((b) => b.addEventListener('click', () => open(b.dataset.sheet, b)));
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // 視窗放大到桌機寬度時收起面板（底部導覽列只在手機顯示）
  window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => { if (e.matches) close(); });

  // 往下拖曳關閉（跟原生 sheet 一樣）：從把手區或列表已捲到頂時往下拉
  let startY = null, dy = 0, startT = 0;
  body.addEventListener('touchstart', (e) => {
    const fromGrab = e.target.closest('.bn-sheet-grab, .bn-sheet-title');
    if (!fromGrab && body.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0; startT = Date.now();
    body.classList.add('dragging');
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0) body.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  const endDrag = () => {
    if (startY == null) return;
    body.classList.remove('dragging');
    const fast = dy > 40 && (Date.now() - startT) < 250;
    if (dy > body.offsetHeight * 0.3 || fast) close();
    else body.style.transform = '';
    startY = null;
  };
  body.addEventListener('touchend', endDrag);
  body.addEventListener('touchcancel', endDrag);

  wireNavPrefetch(document.querySelector('.bottom-nav'));
  wireNavPrefetch(sheet);
  autoHideOnScroll(document.querySelector('.bottom-nav'), () => !!openKey);
}

// 往下捲收起、往上捲出現（最大化可視面積）。
// 貼近頁首、捲到頁尾、面板開著、鍵盤焦點在導覽列上時一律顯示。
function autoHideOnScroll(nav, isSheetOpen) {
  if (!nav) return;
  const THRESHOLD = 8;      // 手指微小抖動不觸發
  const TOP_ZONE = 80;      // 頁首附近永遠顯示
  let lastY = Math.max(0, window.scrollY);
  let acc = 0;              // 同方向累積捲動量
  let hidden = false;
  let ticking = false;

  const setHidden = (h) => {
    if (h === hidden) return;
    hidden = h;
    nav.classList.toggle('is-hidden', h);
    document.body.classList.toggle('bn-hidden', h);
  };

  // 玻璃底下是深色頁尾時切成深色玻璃（跟 iOS 一樣隨背景調整），淺色字才讀得到
  const footer = document.querySelector('.site-footer');
  const updateTone = () => {
    if (!footer) return;
    const navTop = nav.getBoundingClientRect().top;
    nav.classList.toggle('on-dark', footer.getBoundingClientRect().top < navTop + nav.offsetHeight / 2);
  };

  const update = () => {
    ticking = false;
    updateTone();
    const y = Math.max(0, window.scrollY);   // iOS 回彈時 scrollY 會是負的
    const dy = y - lastY;
    lastY = y;
    const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (y < TOP_ZONE || nearBottom || isSheetOpen()) { acc = 0; setHidden(false); return; }
    // 換方向就重新累積
    if ((dy > 0 && acc < 0) || (dy < 0 && acc > 0)) acc = 0;
    acc += dy;
    if (acc > THRESHOLD) setHidden(true);
    else if (acc < -THRESHOLD) setHidden(false);
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  nav.addEventListener('focusin', () => setHidden(false));
  updateTone();
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
              <li><a href="support.html">支持我們</a></li>
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

// hover/觸控/focus 預取：滑到站內 .html 連結就以 <link rel=prefetch> 先暖目標 HTML。
// 只在使用者顯露意圖時觸發、每個網址至多一次；跨頁切換時瀏覽器直接命中快取。
const _prefetchedDocs = new Set();
function prefetchDoc(href) {
  if (!href) return;
  const clean = href.split('#')[0];
  // 僅站內 .html（含 records.html?type=… 這種帶 query 的）；略過外連 / mailto / 錨點
  if (!clean || /^(https?:)?\/\//.test(clean) || clean.startsWith('mailto:')) return;
  if (!/\.html(\?|$)/.test(clean) || _prefetchedDocs.has(clean)) return;
  _prefetchedDocs.add(clean);
  const l = document.createElement('link');
  l.rel = 'prefetch';
  l.href = clean;
  document.head.appendChild(l);
}
function wireNavPrefetch(root) {
  if (!root) return;
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || /^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || !/\.html(\?|$)/.test(href.split('#')[0])) return;
    const fire = () => prefetchDoc(href);
    a.addEventListener('mouseenter', fire, { once: true });
    a.addEventListener('touchstart', fire, { once: true, passive: true });
    a.addEventListener('focus', fire, { once: true });
  });
}

export function mountLayout() {
  initScrollHints();  // 橫向可捲動列的「左右滑動」提示（自帶 observer，處理動態頁簽）
  mountModeBadge();   // 只有用 ?data= 臨時切換資料來源時才會出現的小標記
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
  // 手機底部導覽列（表單填寫頁除外）
  mountBottomNav();
  // render any remaining icons
  renderIcons();
  // PWA「加到主畫面」自動引導（10 秒後行動裝置彈出 banner）
  initPWAPrompt();

  // 背景預載 platform 資料 + 樞紐大檔：切到分享平台/機構總覽/護病比/人力監控時即時顯示
  // 動態 import 避免循環依賴與初始 parse 成本
  import('./data-loader.js?v=9ae01939b6')
    .then(({ preloadAll, preloadStaticData }) => {
      preloadAll && preloadAll();
      preloadStaticData && preloadStaticData();
    })
    .catch(() => { /* 預載失敗不影響任何 UI */ });

  // 導覽列 hover / 觸控 / focus 時預取目標頁 HTML：跨頁切換近乎即開
  wireNavPrefetch(document.getElementById('app-header'));
  wireNavPrefetch(document.getElementById('app-footer'));

  // 背景預載勞檢/性平/職安紀錄資料：同樣讓使用者切過去時即時顯示
  import('./violations.js?v=9ae01939b6')
    .then(({ preloadViolations }) => preloadViolations && preloadViolations())
    .catch(() => { /* 預載失敗不影響任何 UI */ });
  import('./gender.js?v=9ae01939b6')
    .then(({ preloadGender }) => preloadGender && preloadGender())
    .catch(() => { /* 預載失敗不影響任何 UI */ });
  import('./osha.js?v=9ae01939b6')
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
