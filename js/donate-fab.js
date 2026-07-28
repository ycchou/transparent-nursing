// donate-fab.js — 右下角浮動贊助入口（分享平台、機構總覽等頁共用）。
// 重用捐款鈕同款白愛心（.donate-heart：emoji 🤍 + heartbeat 跳動）。
// 可拖曳任意移動、可按關閉鍵；點擊（未拖曳）→ 開內建捐款彈窗（重用 mountDonate widget）。
// 關閉狀態與擺放位置記在 localStorage：各頁共用同一組 key → 同一天在任一頁關閉，當天各頁都不再出現。

import { mountDonate } from './donate.js?v=61fd87da63';

const DEFAULT_LINK = 'support.html';
const POS_KEY = 'tn_fab_pos';
const CLOSED_KEY = 'tn_fab_closed';
const DRAG_THRESHOLD = 6; // px：位移超過才算拖曳，否則視為點擊
const MARGIN = 8;         // 距視窗邊緣最小留白

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

// ===== 浮動愛心 =====
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

  const btn = fab.querySelector('.donate-fab-btn');
  const closeBtn = fab.querySelector('.donate-fab-close');

  // 以 left/top 定位（拖曳時才切換），夾在可視範圍內
  function applyPos(left, top) {
    const w = fab.offsetWidth, h = fab.offsetHeight;
    left = Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, left));
    top = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, top));
    fab.style.left = left + 'px';
    fab.style.top = top + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  // 還原上次擺放位置
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      applyPos(saved.left, saved.top);
    }
  } catch (_) {}

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fab.remove();
    try { localStorage.setItem(CLOSED_KEY, taipeiToday()); } catch (_) {}
  });

  // 拖曳（Pointer Events，滑鼠/觸控通用）
  let dragging = false, moved = false, startX = 0, startY = 0, originLeft = 0, originTop = 0;

  btn.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    const r = fab.getBoundingClientRect();
    originLeft = r.left; originTop = r.top;
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    fab.classList.add('dragging');
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) moved = true;
    if (moved) applyPos(originLeft + dx, originTop + dy);
  });

  btn.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove('dragging');
    try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      const r = fab.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (_) {}
    } else {
      // 未拖曳 → 視為點擊
      if (typeof activate === 'function') activate();
      else location.href = link;
    }
  });

  // 視窗縮放時把浮標拉回可視範圍
  window.addEventListener('resize', () => {
    if (!fab.style.left) return;
    const r = fab.getBoundingClientRect();
    applyPos(r.left, r.top);
  });
}
