// 共用輕量 toast — 各頁/模組統一使用，避免重複實作。
// import { showToast } from './toast.js?v=...';
// 樣式 .toast-host / .toast / .toast-{info,warn,error} 定義於 css/styles.css。

const AUTO_DISMISS_MS = 3000;
const FADE_OUT_MS = 250;

export function showToast(msg, kind = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), FADE_OUT_MS);
  }, AUTO_DISMISS_MS);
}
