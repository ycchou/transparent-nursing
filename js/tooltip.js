// 全站共用的 hover 浮動 tooltip
// 支援兩種觸發方式：
//   1. .cell-trunc  — 只有真的被截斷時才顯示（title 或 textContent 為來源）
//   2. [data-tip]   — 不管截不截斷都顯示，內容由 data-tip 屬性提供
//
// 採用 document-level 事件委派 + 單一 tooltip 元素，初始化只一次，效能最佳。

let _tipEl = null;
let _initialized = false;

export function ensureTooltip() {
  if (_initialized) return;
  _initialized = true;

  _tipEl = document.createElement('div');
  _tipEl.className = 'cell-tip';
  document.body.appendChild(_tipEl);

  const hide = () => _tipEl.classList.remove('visible');

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.cell-trunc, [data-tip]');
    if (!el) { hide(); return; }

    // .cell-trunc 模式：只在實際被截斷時才顯示
    const isTruncMode = el.classList.contains('cell-trunc');
    if (isTruncMode && el.scrollWidth <= el.clientWidth + 1) {
      hide();
      return;
    }

    // 決定要顯示什麼字
    let text;
    if (el.hasAttribute('data-tip')) {
      text = el.getAttribute('data-tip');
    } else {
      text = el.getAttribute('title') || el.textContent;
    }
    if (!text) { hide(); return; }

    // 暫時拿掉 title，避免瀏覽器原生 tooltip 與自訂的同時出現
    if (el.hasAttribute('title')) {
      el.dataset.titleStash = el.getAttribute('title');
      el.removeAttribute('title');
    }

    _tipEl.textContent = text;
    _tipEl.classList.add('visible');

    const rect = el.getBoundingClientRect();
    const tipRect = _tipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - 8;
    // 邊界保護
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    if (top < 8) top = rect.bottom + 8;
    _tipEl.style.left = left + 'px';
    _tipEl.style.top = top + 'px';
  });

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('.cell-trunc, [data-tip]');
    if (!el) return;
    hide();
    if (el.dataset.titleStash) {
      el.setAttribute('title', el.dataset.titleStash);
      delete el.dataset.titleStash;
    }
  });

  window.addEventListener('scroll', hide, { passive: true });
}
