// PWA「加到主畫面」引導
// - 原生一鍵安裝（beforeinstallprompt）：Android / 桌面 Chromium 直接彈系統安裝
// - 行為意圖觸發（notePwaIntent）：送出表單 / 瀏覽多家醫院 / 用完薪資試算等高意圖時刻
// - 遞增退讓：關 1→7 天、關 2→30 天、關 3→30 天、關第 4→永久不再顯示
// - 本地埋點（trackPwa）：dispatch CustomEvent + localStorage 累計（未接外部服務）
// import { initPWAPrompt, showInstallGuide, notePwaIntent, isAppInstalled } from './pwa-prompt.js?v=...';

import { showToast } from './toast.js?v=196247a243';

const DISMISS_KEY = '__nursing_pwa_dismissed';          // 最近一次關閉/延後的時間戳
const DISMISS_COUNT_KEY = '__nursing_pwa_dismiss_count'; // 累計「主動關閉」次數
const SUPPRESS_KEY = '__nursing_pwa_suppressed';         // 關閉達上限 → 永久不再顯示
const INSTALLED_KEY = '__nursing_pwa_installed';
const FIRST_VISIT_KEY = '__nursing_pwa_first_visit';
const INTENT_KEY = '__nursing_pwa_intent';
const EVENTS_KEY = '__nursing_pwa_events';

const FIRST_VISIT_GRACE_DAYS = 7;         // 時間保底：首次造訪後冷卻 N 天才顯示
const SHOW_DELAY_MS = 10 * 1000;          // 時間保底：當次造訪延遲
const INTENT_DELAY_MS = 3 * 1000;         // 意圖觸發（下次載入讀 intent）延遲
const INTENT_SHOWNOW_DELAY_MS = 2 * 1000; // 意圖觸發（當頁 showNow）延遲
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;// intent 旗標有效期

// 遞增退讓天數：關 1→7、關 2→30、關 3→30；未列出（含第 4 次起）→ 永久 suppress
const DISMISS_COOLDOWN_DAYS = { 1: 7, 2: 30, 3: 30 };
const DISMISS_SUPPRESS_AT = 4;
const SNOOZE_DAYS = 7; // 「詳細步驟 / 原生取消」等軟性延後，不累計關閉次數

let deferredInstallPrompt = null;
let currentPlatform = 'desktop';
let bannerIsManual = false; // 目前 banner 是否為「手動教學」模式（可被 beforeinstallprompt 升級成一鍵安裝）

// ===== localStorage 安全存取 =====
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

// ===== 本地埋點 =====
// 目前僅 dispatch CustomEvent + 在 localStorage 累計次數；未接任何外部服務。
// 日後要接後端，只需在此把事件轉發出去即可。
export function trackPwa(event, detail = {}) {
  try { window.dispatchEvent(new CustomEvent('pwa:' + event, { detail })); } catch {}
  try {
    const raw = lsGet(EVENTS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[event] = (map[event] || 0) + 1;
    lsSet(EVENTS_KEY, JSON.stringify(map));
  } catch {}
}

// ===== 平台/安裝狀態 =====
function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (isStandalone()) return 'installed';
  const isIOS = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
  const isAndroid = /android/.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  if (/mobile/.test(ua)) return 'mobile-other';
  return 'desktop';
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  } catch { return false; }
}

/** standalone 顯示 或 已記錄安裝旗標 → 視為已安裝。 */
export function isAppInstalled() {
  return isStandalone() || lsGet(INSTALLED_KEY) === '1';
}

function markInstalled() { lsSet(INSTALLED_KEY, '1'); }

// ===== 遞增退讓 =====
function getDismissCount() {
  const n = parseInt(lsGet(DISMISS_COUNT_KEY) || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function isSuppressed() { return lsGet(SUPPRESS_KEY) === '1'; }

/** 仍在退讓冷卻期（依關閉次數選窗；count 0 但有時間戳＝軟性 snooze 7 天）。 */
function isInDismissCooldown() {
  if (isSuppressed()) return true;
  const ts = parseInt(lsGet(DISMISS_KEY) || '0', 10);
  if (!ts) return false;
  const count = getDismissCount();
  const days = count === 0 ? SNOOZE_DAYS : (DISMISS_COOLDOWN_DAYS[count] ?? 30);
  return Date.now() - ts < days * 24 * 60 * 60 * 1000;
}

/** 使用者主動關閉（×）：累計次數 + 記時間；達上限則永久 suppress。 */
function markDismissed() {
  const count = getDismissCount() + 1;
  lsSet(DISMISS_COUNT_KEY, String(count));
  lsSet(DISMISS_KEY, String(Date.now()));
  if (count >= DISMISS_SUPPRESS_AT) lsSet(SUPPRESS_KEY, '1');
  trackPwa('banner_dismissed', { count });
}

/** 軟性延後（點詳細步驟、原生安裝取消等）：只記時間、不累計關閉次數。 */
function snooze() { lsSet(DISMISS_KEY, String(Date.now())); }

/**
 * 首次造訪後 N 天內視為冷卻期。沒記錄 → 立刻寫時間戳並回 true（不顯示）。
 */
function isInFirstVisitGrace() {
  const raw = lsGet(FIRST_VISIT_KEY);
  if (!raw) { lsSet(FIRST_VISIT_KEY, String(Date.now())); return true; }
  const ts = parseInt(raw, 10);
  if (!ts) { lsSet(FIRST_VISIT_KEY, String(Date.now())); return true; }
  return Date.now() - ts < FIRST_VISIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

/** 目前是否有資格顯示 banner（未安裝、未 suppress、不在冷卻）。 */
function isEligibleToShow() {
  if (isAppInstalled()) return false;
  if (currentPlatform === 'installed') return false;
  if (isInDismissCooldown()) return false;
  return true;
}

// ===== 意圖旗標 =====
/**
 * 記錄一次「高意圖時刻」。之後（同頁 showNow 或下次載入）優先彈出安裝提示。
 * @param {string} reason  form_submit | hospital_browse | salary_calc ...
 * @param {{showNow?: boolean}} opts  showNow=true 時當頁即嘗試顯示
 */
export function notePwaIntent(reason, { showNow = false } = {}) {
  try { lsSet(INTENT_KEY, JSON.stringify({ ts: Date.now(), reason })); } catch {}
  trackPwa('intent', { reason });

  if (!showNow) return;
  if (!isEligibleToShow()) return;
  if (document.getElementById('pwa-prompt')) return;
  // 桌面僅在具備原生一鍵安裝時才主動彈（避免用手動教學打擾桌機使用者）
  if (currentPlatform === 'desktop' && !deferredInstallPrompt) return;
  consumeIntent();
  setTimeout(() => {
    if (isEligibleToShow() && !document.getElementById('pwa-prompt')) {
      showBanner(currentPlatform, reason);
    }
  }, INTENT_SHOWNOW_DELAY_MS);
}

function readIntent() {
  try {
    const raw = lsGet(INTENT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    if (Date.now() - obj.ts > INTENT_TTL_MS) { lsDel(INTENT_KEY); return null; }
    return obj;
  } catch { return null; }
}
function consumeIntent() { lsDel(INTENT_KEY); }

// ===== 視覺素材 =====
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>
  <path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

// iOS 分享圖示（方框＋上箭頭），取代 emoji ⬆︎；用 currentColor 隨文字色。
const IOS_SHARE_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-2px;" aria-hidden="true">
  <path d="M12 3 V14 M12 3 L8.8 6.2 M12 3 L15.2 6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7.2 10 H5.5 A1.5 1.5 0 0 0 4 11.5 V19 A1.5 1.5 0 0 0 5.5 20.5 H18.5 A1.5 1.5 0 0 0 20 19 V11.5 A1.5 1.5 0 0 0 18.5 10 H16.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// 手動安裝的平台「短提示」（無原生一鍵安裝時的副文案）
const SHORT_HINT = {
  ios: `點下方 ${IOS_SHARE_SVG} <strong>分享</strong> → 加入主畫面`,
  android: '點右上 <strong>⋮ 選單</strong> → 安裝應用程式',
  'mobile-other': '在瀏覽器選單中尋找「加入主畫面」',
  desktop: '網址列右側 <strong>⊕</strong> 圖示 → 安裝',
};

// 依意圖情境給文案（有原生一鍵安裝時採用 benefit 當副文案）
const INTENT_COPY = {
  form_submit: { title: '把平台加到主畫面', benefit: '隨時回來看有沒有新的單位分享，一鍵開啟' },
  hospital_browse: { title: '把平台加到主畫面', benefit: '加到主畫面，隨時比較各醫院的護病比與違規紀錄' },
  salary_calc: { title: '把平台加到主畫面', benefit: '加到主畫面，隨時試算你的薪資落點' },
};

function bannerHTML(platform, reason) {
  const copy = INTENT_COPY[reason] || null;
  const title = copy ? copy.title : '把護理職場透明化加到主畫面';
  const canOneTap = !!deferredInstallPrompt;
  const subtext = canOneTap
    ? (copy ? copy.benefit : '像 App 一樣一鍵開啟、全螢幕、免下載')
    : (SHORT_HINT[platform] || SHORT_HINT['mobile-other']);
  const actionBtn = canOneTap
    ? `<button id="pwa-prompt-install" class="pwa-prompt-install" type="button">立即安裝</button>`
    : `<button id="pwa-prompt-more" class="pwa-prompt-link" type="button">詳細步驟</button>`;
  return `
    <div id="pwa-prompt" class="pwa-prompt" role="region" aria-label="加到主畫面提示">
      <div class="pwa-prompt-icon">${LOGO_SVG}</div>
      <div class="pwa-prompt-body">
        <div class="pwa-prompt-title">${title}</div>
        <div class="pwa-prompt-text">${subtext}</div>
      </div>
      ${actionBtn}
      <button id="pwa-prompt-close" class="pwa-prompt-close" type="button" aria-label="關閉">×</button>
    </div>
  `;
}

function hideBanner() {
  const el = document.getElementById('pwa-prompt');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

function bindInstallBtn(btn) {
  btn?.addEventListener('click', () => {
    trackPwa('install_clicked');
    triggerNativeInstall();
  });
}

function showBanner(platform, reason = null) {
  if (document.getElementById('pwa-prompt')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = bannerHTML(platform, reason);
  document.body.appendChild(wrapper.firstElementChild);
  bannerIsManual = !deferredInstallPrompt;

  requestAnimationFrame(() => {
    document.getElementById('pwa-prompt')?.classList.add('show');
  });
  trackPwa('banner_shown', { platform, reason: reason || 'timer', oneTap: !!deferredInstallPrompt });

  document.getElementById('pwa-prompt-close')?.addEventListener('click', () => {
    markDismissed();
    hideBanner();
  });
  document.getElementById('pwa-prompt-more')?.addEventListener('click', () => {
    trackPwa('more_clicked');
    snooze();          // 軟性延後，不累計關閉次數
    hideBanner();
    showInstallGuide();
  });
  bindInstallBtn(document.getElementById('pwa-prompt-install'));
}

/** beforeinstallprompt 若在 banner 顯示後才觸發 → 把「詳細步驟」就地升級成「立即安裝」。 */
function upgradeBannerToOneTap(el) {
  const moreBtn = el.querySelector('#pwa-prompt-more');
  if (!moreBtn) return;
  const installBtn = document.createElement('button');
  installBtn.id = 'pwa-prompt-install';
  installBtn.type = 'button';
  installBtn.className = 'pwa-prompt-install';
  installBtn.textContent = '立即安裝';
  bindInstallBtn(installBtn);
  moreBtn.replaceWith(installBtn);
  bannerIsManual = false;
}

/** 觸發瀏覽器原生安裝流程（deferredInstallPrompt 只能用一次）。 */
async function triggerNativeInstall() {
  if (!deferredInstallPrompt) { showInstallGuide(); return; }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === 'accepted') {
      trackPwa('install_accepted');
      markInstalled();
      hideBanner();
    } else {
      trackPwa('install_rejected');
      snooze();
      hideBanner();
    }
  } catch {
    hideBanner();
    showInstallGuide();
  }
}

/** 詳細教學 modal（footer 入口、banner「詳細步驟」、或主動呼叫）。 */
export function showInstallGuide() {
  const platform = detectPlatform();
  if (platform === 'installed') {
    showToast('你已經把這個網站加到主畫面囉 🎉', 'info');
    return;
  }

  const lastFocused = document.activeElement;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.id = 'pwa-modal';
  modal.style.zIndex = '300';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '把護理職場透明化加到主畫面');
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">把護理職場透明化加到主畫面</h3>
          <div style="color:var(--muted);font-size:0.9rem;margin-top:4px;">
            像 App 一樣使用 — 全螢幕、開啟更快、免下載免註冊
          </div>
        </div>
        <button class="modal-close" aria-label="關閉" id="pwa-modal-close">×</button>
      </div>

      <!-- iOS -->
      <div class="install-section ${platform === 'ios' ? 'install-section-current' : ''}">
        <h4 style="margin:16px 0 8px;display:flex;align-items:center;gap:8px;">
           iPhone / iPad（Safari）
        </h4>
        <ol style="color:var(--ink-soft);line-height:1.85;padding-left:1.4rem;margin:0;">
          <li>確認你是用 <strong>Safari</strong> 瀏覽器開啟本網站</li>
          <li>點下方中間的 <strong>分享按鈕 ${IOS_SHARE_SVG}</strong></li>
          <li>向下滑動，選擇 <strong>「加入主畫面」</strong></li>
          <li>確認名稱後點 <strong>「新增」</strong></li>
        </ol>
      </div>

      <!-- Android -->
      <div class="install-section ${platform === 'android' ? 'install-section-current' : ''}">
        <h4 style="margin:20px 0 8px;display:flex;align-items:center;gap:8px;">
           Android（Chrome / Edge / Firefox）
        </h4>
        <ol style="color:var(--ink-soft);line-height:1.85;padding-left:1.4rem;margin:0;">
          <li>點右上角的 <strong>選單 ⋮</strong></li>
          <li>選擇 <strong>「安裝應用程式」</strong> 或 <strong>「加到主畫面」</strong></li>
          <li>確認安裝即可</li>
        </ol>
      </div>

      <!-- Desktop -->
      <div class="install-section ${platform === 'desktop' ? 'install-section-current' : ''}">
        <h4 style="margin:20px 0 8px;display:flex;align-items:center;gap:8px;">
           桌面（Chrome / Edge / Brave）
        </h4>
        <ol style="color:var(--ink-soft);line-height:1.85;padding-left:1.4rem;margin:0;">
          <li>網址列右側會出現 <strong>安裝圖示 ⊕</strong></li>
          <li>點它選擇 <strong>「安裝」</strong></li>
          <li>或從瀏覽器選單 → <strong>安裝「護理職場透明化」</strong></li>
        </ol>
      </div>

      <div style="margin-top:24px;padding:16px;background:var(--accent-soft);border-radius:12px;">
        <div style="font-weight:600;color:var(--ink);margin-bottom:6px;">為什麼要加到主畫面？</div>
        <ul style="color:var(--muted);font-size:0.92rem;line-height:1.7;padding-left:1.2rem;margin:0;">
          <li>像 App 一樣有自己的圖示，一鍵開啟</li>
          <li>全螢幕無瀏覽器工具列，畫面更大</li>
          <li>完全免費、不用 App Store、不佔太多空間</li>
          <li>隨時可以從主畫面長按移除</li>
        </ul>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    document.removeEventListener('keydown', esc);
    try { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus(); } catch {}
  };
  function esc(e) { if (e.key === 'Escape') close(); }

  modal.querySelector('#pwa-modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', esc);
  // 開啟時把焦點移入 modal（關閉鈕），關閉時還原
  try { modal.querySelector('#pwa-modal-close')?.focus(); } catch {}
}

/** 初始化：在 mountLayout() 之後呼叫。 */
export function initPWAPrompt() {
  // 安裝事件監聽（一律掛）
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    trackPwa('installable');
    const el = document.getElementById('pwa-prompt');
    if (el && bannerIsManual) upgradeBannerToOneTap(el);
  });
  window.addEventListener('appinstalled', () => {
    markInstalled();
    trackPwa('installed');
    hideBanner();
  });

  currentPlatform = detectPlatform();

  if (currentPlatform === 'installed') return;
  if (!isEligibleToShow()) return; // 已安裝旗標 / 永久 suppress / 退讓冷卻期

  // 意圖優先：有未過期的高意圖旗標 → 較短延遲後顯示情境化提示
  const intent = readIntent();
  if (intent) {
    consumeIntent();
    setTimeout(() => {
      if (!isEligibleToShow()) return;
      if (document.getElementById('pwa-prompt')) return;
      // 桌面僅在有原生一鍵安裝時才顯示（beforeinstallprompt 可能延遲，故此時再判定）
      if (currentPlatform === 'desktop' && !deferredInstallPrompt) return;
      showBanner(currentPlatform, intent.reason);
    }, INTENT_DELAY_MS);
    return;
  }

  // 時間保底：不對桌面主動彈手動教學
  if (currentPlatform === 'desktop') return;
  if (isInFirstVisitGrace()) return;
  setTimeout(() => {
    if (!isEligibleToShow()) return;
    if (document.getElementById('pwa-prompt')) return;
    showBanner(currentPlatform, null);
  }, SHOW_DELAY_MS);
}

// 給全域使用：footer / 任何按鈕 onclick 都可呼叫
if (typeof window !== 'undefined') {
  window.__nursingShowInstallGuide = showInstallGuide;
}
