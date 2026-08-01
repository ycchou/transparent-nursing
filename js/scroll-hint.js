// scroll-hint.js — 對「可橫向捲動」的頁簽／選擇列／寬表格，在其下方顯示
// 「‹ 左右滑動看更多 ›」提示。只在真的可捲時出現；使用者一旦捲動就淡出。
// 由 mountLayout() 呼叫 initScrollHints() 全站自動啟用（含 JS 動態產生的頁簽）。

const SELECTORS = ['.tabs', '.off-subtabs', '.data-table-wrap', '.off-table-wrap'];
const SLOP = 8; // px 容差

function isScrollable(el) { return el.scrollWidth - el.clientWidth > SLOP; }

function attach(el) {
  if (el.dataset.scrollHint) return;   // 已處理過
  el.dataset.scrollHint = '1';

  const hint = document.createElement('div');
  hint.className = 'scroll-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = '<span class="scroll-hint-arrow">‹</span> 左右滑動看更多 <span class="scroll-hint-arrow">›</span>';
  el.insertAdjacentElement('afterend', hint);

  const update = () => {
    hint.style.display = isScrollable(el) ? '' : 'none';
    // 已離開最左端 → 視為使用者已理解可捲，淡出
    hint.classList.toggle('scroll-hint--done', el.scrollLeft > SLOP);
  };
  el.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(el);
  window.addEventListener('resize', update);
  update();
}

function scan(root = document) {
  SELECTORS.forEach((sel) => root.querySelectorAll(sel).forEach(attach));
}

let started = false;
export function initScrollHints() {
  if (started || typeof document === 'undefined') return;
  started = true;
  scan();
  // 頁簽等常由 JS 稍後 render → 監看 DOM 變動，補掛提示（debounce）
  if (typeof MutationObserver !== 'undefined' && document.body) {
    let t;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 200); })
      .observe(document.body, { childList: true, subtree: true });
  }
}
