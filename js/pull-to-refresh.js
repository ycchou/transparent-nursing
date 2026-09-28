// pull-to-refresh.js — PWA（加到主畫面、standalone 顯示）專用的下拉重新整理。
// 瀏覽器分頁本來就有原生下拉重新整理，只有 standalone 模式沒有，所以只在那裡啟用。
//
// 在頁面最頂端往下拉超過門檻後放開 → 重新載入整頁，且這一頁的資料略過瀏覽器快取抓最新
// （見 fresh-data.js）。以下情況不啟動：頁面不在頂端、有 modal／選單鎖住捲動、
// 手指落在自己可捲動且不在頂端的區塊內、手勢以橫向為主（表格、頁簽列左右滑）。

import { reloadWithFreshData } from './fresh-data.js?v=97a7aba99d';

const THRESHOLD = 64;   // 指示器位移超過這個值放開才重新整理（px）
const MAX_PULL = 96;    // 指示器最多往下拉到的位置（px）
const RESISTANCE = 0.5; // 手指位移 × 阻尼 = 指示器位移，拉起來有「重量」

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}

// modal、底部選單等打開時會把 body／html 的 overflow 設成 hidden 來鎖捲動
function scrollLocked() {
  const hidden = (el) => el && getComputedStyle(el).overflowY === 'hidden';
  return hidden(document.body) || hidden(document.documentElement);
}

// 手指落點往上找：任何一層自己捲動過（scrollTop > 0），下拉應該先捲它，不是重新整理
function insideScrolledBox(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

const ARROW_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
  stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;

export function initPullToRefresh() {
  if (!isStandalone() || !('ontouchstart' in window)) return;

  document.documentElement.classList.add('ptr-enabled');
  const el = document.createElement('div');
  el.className = 'ptr-indicator';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<span class="ptr-icon">${ARROW_SVG}</span><span class="ptr-label"></span>`;
  document.body.appendChild(el);
  const label = el.querySelector('.ptr-label');
  const iconEl = el.querySelector('.ptr-icon');

  let startX = 0, startY = 0, tracking = false, pulling = false, dist = 0, busy = false;

  const render = () => {
    const ready = dist >= THRESHOLD;
    el.style.transform = `translate(-50%, ${dist - 56}px)`;
    el.style.opacity = String(Math.min(1, dist / THRESHOLD));
    iconEl.style.transform = `rotate(${dist * 3.6}deg)`;
    el.classList.toggle('is-ready', ready);
    label.textContent = ready ? '放開以更新' : '下拉更新';
  };

  const reset = () => {
    tracking = pulling = false;
    dist = 0;
    el.classList.add('is-returning');
    el.style.transform = '';
    el.style.opacity = '0';
    setTimeout(() => el.classList.remove('is-returning'), 250);
  };

  document.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || scrollLocked() || insideScrolledBox(e.target)) {
      tracking = false;
      return;
    }
    tracking = true;
    pulling = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!pulling) {
      // 還沒判定方向：往上滑或橫向為主 → 這次手勢不是下拉重新整理
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 8 || dy < -8) tracking = false;
        return;
      }
      if (dy < 8) return;
      pulling = true;
    }
    e.preventDefault();   // 擋掉 iOS standalone 的橡皮筋回彈，讓指示器跟手
    dist = Math.max(0, Math.min(MAX_PULL, (dy - 8) * RESISTANCE));
    render();
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    if (pulling && dist >= THRESHOLD) {
      busy = true;
      tracking = false;
      el.classList.add('is-refreshing');
      el.style.transform = `translate(-50%, ${THRESHOLD - 56}px)`;
      label.textContent = '更新中…';
      reloadWithFreshData();
      return;
    }
    reset();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}
