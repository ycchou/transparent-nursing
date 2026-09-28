// install-guide.js — 「加到主畫面」圖解教學（由 pwa-prompt.js showInstallGuide 動態載入）。
//
// 依裝置／瀏覽器分頁（iPhone Safari、iPhone Chrome、Android、電腦），預設開啟目前環境那一頁。
// 每一步是一張用 HTML／SVG 畫的手機示意圖，脈動圓圈標出要點的按鈕（不是真實截圖；
// 各家瀏覽器改版後位置可能略有不同，文字說明會一併提到替代位置）。
// LINE／Facebook／Instagram 等 App 內建瀏覽器無法加到主畫面，另外提示先改用 Safari／Chrome 開啟。

// ===== 小圖示 =====
const SVG = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>',
  plusSquare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  dotsV: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  dotsH: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  tabs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="13" height="13" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/></svg>',
  install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M12 7v6M9 10l3 3 3-3"/><path d="M8 21h8"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.6c-5.6-3.8-9.2-8.2-9.2-13a4.6 4.6 0 0 1 9.2-1 4.6 4.6 0 0 1 9.2 1c0 4.8-3.6 9.2-9.2 13z" fill="#fff"/><path d="M5.6 10.2h3.4l1.4-2.6 2.4 5.2 1.4-3.2h5.6" stroke="#E63946" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// 被標記要點的元素外面包一圈脈動圓圈
const hl = (inner) => `<span class="ig-hl">${inner}</span>`;
// 頁面內容的示意灰條
const LINES = '<div class="ig-lines"><i></i><i></i><i style="width:70%"></i><i></i><i style="width:55%"></i></div>';
const APP_ICON = `<span class="ig-appicon">${SVG.heart}</span>`;

function phone(body, { dim = false } = {}) {
  return `<div class="ig-phone${dim ? ' ig-dim' : ''}"><div class="ig-screen">${body}</div></div>`;
}

// ===== 各畫面 =====
const safariPage = (target) => phone(`
  <div class="ig-status"></div>
  ${LINES}
  <div class="ig-urlbar ig-urlbar-bottom">${SVG.lock}<span>ycchou.github.io</span></div>
  <div class="ig-toolbar">
    <span class="ig-ico">${SVG.back}</span><span class="ig-ico">${SVG.fwd}</span>
    <span class="ig-ico">${target === 'share' ? hl(SVG.share) : SVG.share}</span>
    <span class="ig-ico">${SVG.book}</span><span class="ig-ico">${SVG.tabs}</span>
  </div>`);

const shareSheet = (items, targetIdx) => phone(`
  <div class="ig-status"></div>
  ${LINES}
  <div class="ig-sheet">
    <div class="ig-sheet-grip"></div>
    ${items.map((t, i) => {
      const row = `<span class="ig-row-txt">${t}</span><span class="ig-row-ico">${i === targetIdx ? SVG.plusSquare : ''}</span>`;
      return `<div class="ig-row${i === targetIdx ? ' ig-row-target' : ''}">${i === targetIdx ? hl(row) : row}</div>`;
    }).join('')}
  </div>`, { dim: true });

const iosAddDialog = (webAppToggle) => phone(`
  <div class="ig-status"></div>
  <div class="ig-navbar"><span>取消</span><strong>加入主畫面</strong>${hl('<span class="ig-accent">新增</span>')}</div>
  <div class="ig-add-card">${APP_ICON}<div><div class="ig-add-name">護理職場透明化</div><div class="ig-add-url">ycchou.github.io</div></div></div>
  ${webAppToggle ? '<div class="ig-toggle-row"><span>以網頁 App 開啟</span><span class="ig-toggle on"></span></div>' : ''}
  <div class="ig-keyboard"></div>`);

const homeScreen = () => phone(`
  <div class="ig-status"></div>
  <div class="ig-home">
    ${'<span class="ig-appicon ig-other"></span>'.repeat(5)}
    <span class="ig-home-app">${hl(APP_ICON)}<small>護理職場</small></span>
    ${'<span class="ig-appicon ig-other"></span>'.repeat(6)}
  </div>`);

const chromeIosPage = () => phone(`
  <div class="ig-status"></div>
  <div class="ig-urlbar ig-urlbar-top"><span class="ig-url-txt">${SVG.lock}ycchou.github.io</span>${hl(`<span class="ig-ico ig-ico-sm">${SVG.share}</span>`)}</div>
  ${LINES}
  <div class="ig-toolbar"><span class="ig-ico">${SVG.back}</span><span class="ig-ico">${SVG.fwd}</span><span class="ig-ico">${SVG.plusSquare}</span><span class="ig-ico">${SVG.tabs}</span><span class="ig-ico">${SVG.dotsH}</span></div>`);

const androidPage = () => phone(`
  <div class="ig-status"></div>
  <div class="ig-urlbar ig-urlbar-top"><span class="ig-url-txt">${SVG.lock}ycchou.github.io</span><span class="ig-ico ig-ico-sm">${SVG.tabs}</span>${hl(`<span class="ig-ico ig-ico-sm">${SVG.dotsV}</span>`)}</div>
  ${LINES}`);

const androidMenu = () => phone(`
  <div class="ig-status"></div>
  <div class="ig-urlbar ig-urlbar-top"><span class="ig-url-txt">${SVG.lock}ycchou.github.io</span></div>
  ${LINES}
  <div class="ig-menu">
    <div class="ig-row"><span class="ig-row-txt">新增分頁</span></div>
    <div class="ig-row"><span class="ig-row-txt">書籤</span></div>
    <div class="ig-row"><span class="ig-row-txt">分享…</span></div>
    <div class="ig-row ig-row-target">${hl('<span class="ig-row-txt">加到主畫面</span>')}</div>
    <div class="ig-row"><span class="ig-row-txt">設定</span></div>
  </div>`, { dim: true });

const androidDialog = () => phone(`
  <div class="ig-status"></div>
  ${LINES}
  <div class="ig-dialog">
    <div class="ig-dialog-title">安裝應用程式</div>
    <div class="ig-add-card ig-add-card-flat">${APP_ICON}<div class="ig-add-name">護理職場透明化</div></div>
    <div class="ig-dialog-actions"><span>取消</span>${hl('<span class="ig-accent">安裝</span>')}</div>
  </div>`, { dim: true });

const desktopBar = () => `
  <div class="ig-desktop">
    <div class="ig-desk-bar"><span class="ig-desk-url">${SVG.lock}ycchou.github.io/transparent-nursing</span>${hl(`<span class="ig-ico ig-ico-sm">${SVG.install}</span>`)}<span class="ig-ico ig-ico-sm">${SVG.dotsV}</span></div>
    <div class="ig-desk-body">${LINES}</div>
  </div>`;

// ===== 分頁內容 =====
const step = (n, fig, text) =>
  `<figure class="ig-step"><div class="ig-fig">${fig}</div><figcaption><span class="ig-num">${n}</span>${text}</figcaption></figure>`;

const OPEN_FROM_HOME = '之後都從主畫面的 <strong>「護理職場透明化」圖示</strong> 開啟。';
const IOS_DATA_NOTE = `<p class="ig-note"><strong>iPhone 小提醒：</strong>主畫面 App 和 Safari 的資料是分開的。
  如果你是在 Safari 裡填寫表單，第一次打開 App 時請再輸入一次解鎖碼（或點解鎖連結），之後就都在 App 裡了。</p>`;

const TABS = {
  'ios-safari': {
    label: 'iPhone（Safari）',
    body: () => `<div class="ig-steps">
      ${step(1, safariPage('share'), '點下方工具列中間的 <strong>分享</strong> 按鈕。<br><small>較新的 iOS 若沒看到，先點右下角「⋯」，再選「分享」。</small>')}
      ${step(2, shareSheet(['拷貝', '加入閱讀列表', '加入書籤', '加入主畫面', '標示'], 3), '往上滑動選單，點 <strong>「加入主畫面」</strong>。')}
      ${step(3, iosAddDialog(true), '確認「以網頁 App 開啟」是開啟的，點右上角 <strong>「新增」</strong>。')}
      ${step(4, homeScreen(), OPEN_FROM_HOME)}
    </div>${IOS_DATA_NOTE}`,
  },
  'ios-chrome': {
    label: 'iPhone（Chrome）',
    body: () => `<div class="ig-steps">
      ${step(1, chromeIosPage(), '點網址列右側的 <strong>分享</strong> 按鈕。<br><small>需 iOS 16.4 以上；沒看到就改用 Safari 開啟本網站。</small>')}
      ${step(2, shareSheet(['拷貝', '加入閱讀列表', '加入書籤', '加入主畫面', '更多…'], 3), '點 <strong>「加入主畫面」</strong>（沒看到就往下滑或點「更多」）。')}
      ${step(3, iosAddDialog(false), '點右上角 <strong>「新增」</strong>。')}
      ${step(4, homeScreen(), OPEN_FROM_HOME)}
    </div>${IOS_DATA_NOTE}`,
  },
  android: {
    label: 'Android',
    body: ({ canOneTap }) => `${canOneTap ? `<div class="ig-onetap"><div><strong>你的瀏覽器支援一鍵安裝</strong><br><small>按下後在跳出的視窗點「安裝」即可。</small></div>
        <button type="button" class="btn btn-primary" data-one-tap-install>一鍵安裝</button></div>` : ''}
      <div class="ig-steps">
      ${step(1, androidPage(), '用 <strong>Chrome</strong> 開啟本網站，點右上角的 <strong>⋮</strong> 選單。')}
      ${step(2, androidMenu(), '選 <strong>「加到主畫面」</strong>（有些版本叫「安裝應用程式」）。')}
      ${step(3, androidDialog(), '在跳出的視窗點 <strong>「安裝」</strong>（或「新增」）。')}
      ${step(4, homeScreen(), OPEN_FROM_HOME)}
    </div>`,
  },
  desktop: {
    label: '電腦',
    body: ({ canOneTap }) => `${canOneTap ? `<div class="ig-onetap"><div><strong>你的瀏覽器支援一鍵安裝</strong></div>
        <button type="button" class="btn btn-primary" data-one-tap-install>一鍵安裝</button></div>` : ''}
      <div class="ig-steps ig-steps-wide">
      ${step(1, desktopBar(), '用 <strong>Chrome</strong> 或 <strong>Edge</strong> 開啟，點網址列右側的 <strong>安裝圖示</strong>，再按「安裝」。<br><small>沒看到圖示：右上角選單 → 「投放、儲存及分享」→「安裝網頁」。</small>')}
    </div>`,
  },
};

// ===== 環境偵測 =====
export function detectEnv() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(ua);
  let tab = 'desktop';
  if (ios) tab = /CriOS/.test(ua) ? 'ios-chrome' : 'ios-safari';
  else if (android) tab = 'android';
  return { tab, inApp, ios };
}

/** 教學主體 HTML（放進 modal 裡） */
export function installGuideHtml({ canOneTap = false } = {}) {
  const env = detectEnv();
  const inAppWarn = env.inApp ? `<div class="ig-inapp"><strong>你現在是在 LINE／Facebook 等 App 裡開啟的網頁，這裡無法加到主畫面。</strong><br>
    請點右上角（或右下角）的「⋯」選單，選 <strong>「用${env.ios ? ' Safari' : '瀏覽器'}開啟」</strong>，再照下面的步驟操作。</div>` : '';
  return `${inAppWarn}
    <div class="ig-tabs" role="tablist">
      ${Object.entries(TABS).map(([k, t]) =>
        `<button type="button" role="tab" class="ig-tab${k === env.tab ? ' active' : ''}" data-ig-tab="${k}" aria-selected="${k === env.tab}">${t.label}</button>`).join('')}
    </div>
    ${Object.entries(TABS).map(([k, t]) =>
      `<div class="ig-panel" data-ig-panel="${k}" role="tabpanel"${k === env.tab ? '' : ' hidden'}>${t.body({ canOneTap })}</div>`).join('')}
    <p class="ig-footnote">示意圖依 2026 年各瀏覽器介面繪製，實際畫面可能因版本略有不同。</p>`;
}

/** 分頁切換 */
export function wireInstallGuide(root) {
  root.querySelectorAll('[data-ig-tab]').forEach((btn) => btn.addEventListener('click', () => {
    const k = btn.dataset.igTab;
    root.querySelectorAll('[data-ig-tab]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    root.querySelectorAll('[data-ig-panel]').forEach((p) => { p.hidden = p.dataset.igPanel !== k; });
  }));
}
