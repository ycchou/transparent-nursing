// donate-fab.js — 右下角固定的浮動贊助入口（分享平台、機構總覽等頁共用）。
// 重用捐款鈕同款白愛心（.donate-heart：emoji 🤍 + heartbeat 跳動）。
// 固定右下角、不可拖曳；點擊 → 開內建捐款彈窗（重用 mountDonate widget）。
// 可按關閉鍵：當天不再出現，隔天再跳出（localStorage，各頁共用同一 key）。

import { mountDonate } from './donate.js?v=611b4cb25a';

const DEFAULT_LINK = 'support.html';
const CLOSED_KEY = 'tn_fab_closed';

// Asia/Taipei（UTC+8）當天日期 YYYY-MM-DD：關閉只記「當天」，隔天會再跳出來
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// ===== 內建捐款彈窗（整站單例） =====
let modalWidgetMounted = false;
function ensureDonateModal() {
  let backdrop = document.getElementById('donate-modal');
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'donate-modal';
  backdrop.innerHTML = `
    <div class="modal donate-modal-card" role="dialog" aria-modal="true" aria-label="支持我們">
      <button type="button" class="modal-close donate-modal-close-btn" aria-label="關閉">✕</button>
      <h3 style="margin:0 0 6px;padding-right:40px;">支持平台走得更遠</h3>
      <p style="color:var(--muted);margin:0 0 18px;line-height:1.7;">選擇一個金額，用信用卡安全完成單筆捐款。</p>
      <div id="donate-widget-modal"></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.donate-modal-close-btn').addEventListener('click', closeDonateModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDonateModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) closeDonateModal();
  });
  return backdrop;
}
function openDonateModal() {
  const backdrop = ensureDonateModal();
  if (!modalWidgetMounted) {
    mountDonate(backdrop.querySelector('#donate-widget-modal'));
    modalWidgetMounted = true;
  }
  backdrop.classList.add('open');
  document.body.classList.add('donate-modal-open');
  document.body.style.overflow = 'hidden';
}
function closeDonateModal() {
  const backdrop = document.getElementById('donate-modal');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  document.body.classList.remove('donate-modal-open');
  document.body.style.overflow = '';
}

// ===== 浮動愛心（固定右下角、不可拖曳） =====
// onActivate 預設開內建捐款彈窗；傳入 false 則退回導向 link（DEFAULT_LINK）。
export function mountDonateFab({ link = DEFAULT_LINK, onActivate } = {}) {
  if (typeof document === 'undefined') return;
  try { if (localStorage.getItem(CLOSED_KEY) === taipeiToday()) return; } catch (_) {}
  if (document.querySelector('.donate-fab')) return;

  const activate = onActivate === undefined ? openDonateModal : onActivate;

  const fab = document.createElement('div');
  fab.className = 'donate-fab';
  fab.innerHTML = `
    <button type="button" class="donate-fab-btn" aria-label="支持我們（前往捐款）">
      <span class="donate-heart" aria-hidden="true">🤍</span>
    </button>
    <button type="button" class="donate-fab-close" aria-label="關閉">×</button>
  `;
  document.body.appendChild(fab);

  fab.querySelector('.donate-fab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    fab.remove();
    try { localStorage.setItem(CLOSED_KEY, taipeiToday()); } catch (_) {}
  });

  fab.querySelector('.donate-fab-btn').addEventListener('click', () => {
    if (typeof activate === 'function') activate();
    else location.href = link;
  });
}
