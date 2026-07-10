// PWA「加到主畫面」引導 — 自動 banner（行動裝置首次造訪）+ 主動觸發 modal
// import { initPWAPrompt, showInstallGuide } from './pwa-prompt.js?v=b9c376e5bf';

const DISMISS_KEY = '__nursing_pwa_dismissed';
const INSTALLED_KEY = '__nursing_pwa_installed';
const FIRST_VISIT_KEY = '__nursing_pwa_first_visit';
const DISMISS_DAYS = 7;
const FIRST_VISIT_GRACE_DAYS = 7;  // 首次造訪後冷卻 N 天才顯示「加到主畫面」提示
const SHOW_DELAY_MS = 10 * 1000;   // 過了冷卻期後，當次造訪也要等 10 秒才顯示

let deferredInstallPrompt = null;

function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (standalone) return 'installed';

  const isIOS = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
  const isAndroid = /android/.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  if (/mobile/.test(ua)) return 'mobile-other';
  return 'desktop';
}

function isDismissedRecently() {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * 首次造訪後 N 天內視為冷卻期，不顯示「加到主畫面」提示。
 * - 沒記錄 → 第一次造訪，立刻寫入 timestamp 並回傳 true（不顯示）
 * - 有記錄但 < N 天 → 仍在冷卻期，回傳 true
 * - 有記錄且 ≥ N 天 → 已通過冷卻期，回傳 false（可顯示）
 */
function isInFirstVisitGrace() {
  try {
    const raw = localStorage.getItem(FIRST_VISIT_KEY);
    if (!raw) {
      localStorage.setItem(FIRST_VISIT_KEY, String(Date.now()));
      return true;
    }
    const ts = parseInt(raw, 10);
    if (!ts) {
      // 防壞值：覆寫並重啟冷卻
      localStorage.setItem(FIRST_VISIT_KEY, String(Date.now()));
      return true;
    }
    return Date.now() - ts < FIRST_VISIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, '1'); } catch {}
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>
  <path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

// 平台對應的「短提示」（banner 內）
const SHORT_HINT = {
  ios: '點下方 <strong>分享 ⬆︎</strong> → 加入主畫面',
  android: '點右上 <strong>⋮ 選單</strong> → 安裝應用程式',
  'mobile-other': '在瀏覽器選單中尋找「加入主畫面」',
  desktop: '網址列右側 <strong>⊕</strong> 圖示 → 安裝',
};

function bannerHTML(platform) {
  const hint = SHORT_HINT[platform] || SHORT_HINT['mobile-other'];
  return `
    <div id="pwa-prompt" class="pwa-prompt" role="dialog" aria-label="加到主畫面提示">
      <div class="pwa-prompt-icon">${LOGO_SVG}</div>
      <div class="pwa-prompt-body">
        <div class="pwa-prompt-title">把護理職場透明化加到主畫面</div>
        <div class="pwa-prompt-text">${hint}</div>
      </div>
      <button id="pwa-prompt-more" class="pwa-prompt-link" type="button">詳細步驟</button>
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

function showBanner(platform) {
  if (document.getElementById('pwa-prompt')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = bannerHTML(platform);
  document.body.appendChild(wrapper.firstElementChild);

  requestAnimationFrame(() => {
    document.getElementById('pwa-prompt')?.classList.add('show');
  });

  document.getElementById('pwa-prompt-close')?.addEventListener('click', () => {
    markDismissed();
    hideBanner();
  });
  document.getElementById('pwa-prompt-more')?.addEventListener('click', () => {
    hideBanner();
    markDismissed();
    showInstallGuide();
  });
}

/** 詳細教學 modal（footer 入口、banner「詳細步驟」、或主動呼叫） */
export function showInstallGuide() {
  const platform = detectPlatform();
  if (platform === 'installed') {
    // 已安裝就直接顯示「你已加到主畫面」訊息
    alert('你已經把這個網站加到主畫面囉 🎉');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.id = 'pwa-modal';
  modal.style.zIndex = '300';
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
          <li>點下方中間的 <strong>分享按鈕 ⬆︎</strong></li>
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

  const close = () => modal.remove();
  modal.querySelector('#pwa-modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

/** 初始化：在 mountLayout() 之後呼叫 */
export function initPWAPrompt() {
  // 偵測安裝事件（Android Chrome / Edge / Desktop Chrome）
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    markInstalled();
    hideBanner();
  });

  const platform = detectPlatform();

  // 已安裝、桌面、最近 dismissed → 不主動彈
  if (platform === 'installed') return;
  if (platform === 'desktop') return;
  if (isDismissedRecently()) return;
  try {
    if (localStorage.getItem(INSTALLED_KEY) === '1') return;
  } catch {}

  // 首次造訪 7 天內 → 不打擾（記下時間戳即返回；下次造訪超過 7 天才會通過此檢查）
  if (isInFirstVisitGrace()) return;

  // 10 秒後 才顯示，避免打擾
  setTimeout(() => showBanner(platform), SHOW_DELAY_MS);
}

// 給全域使用：footer / 任何按鈕 onclick 都可呼叫
if (typeof window !== 'undefined') {
  window.__nursingShowInstallGuide = showInstallGuide;
}
