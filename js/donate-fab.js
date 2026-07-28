// donate-fab.js — 分享平台右下角浮動贊助入口。
// 重用捐款鈕同款白愛心（.donate-heart：emoji 🤍 + heartbeat 跳動）。
// 可拖曳任意移動、可按關閉鍵；關閉狀態與擺放位置記在 localStorage。

const DEFAULT_LINK = 'support.html';
const POS_KEY = 'tn_fab_pos';
const CLOSED_KEY = 'tn_fab_closed';
const DRAG_THRESHOLD = 6; // px：位移超過才算拖曳，否則視為點擊 → 前往捐款頁
const MARGIN = 8;         // 距視窗邊緣最小留白

// Asia/Taipei（UTC+8）當天日期 YYYY-MM-DD：關閉只記「當天」，隔天會再跳出來
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function mountDonateFab({ link = DEFAULT_LINK, onActivate = null } = {}) {
  if (typeof document === 'undefined') return;
  try { if (localStorage.getItem(CLOSED_KEY) === taipeiToday()) return; } catch (_) {}
  if (document.querySelector('.donate-fab')) return;

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
      // 未拖曳 → 視為點擊：優先開啟彈窗，否則退回導向捐款頁
      if (typeof onActivate === 'function') onActivate();
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
