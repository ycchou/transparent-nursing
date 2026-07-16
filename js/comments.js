// 留言元件（Disqus）— 可重用：任一頁把容器元素與識別資訊傳進來即可掛載。
//
// Disqus 是託管式服務，留言存在 Disqus 伺服器（非本 repo），純靜態站免後端即可用。
// 需先到 disqus.com 建站取得 shortname，填入 js/config.js 的 SITE.disqusShortname。
// shortname 未設時只顯示「設定中」提示、不載入任何外部腳本。

import { SITE } from './config.js?v=fbf38edc70';

let _scriptInjected = false;

// 該頁的規範網址（Disqus 以此對應／去重），取 <link rel="canonical">，退回目前網址。
function canonicalUrl() {
  const link = document.querySelector('link[rel="canonical"]');
  return (link && link.href) || location.href.split('#')[0];
}

// 每頁穩定識別鍵：預設用檔名（避免查詢字串造成同頁多串）。
function defaultIdentifier() {
  return location.pathname.split('/').pop() || 'index.html';
}

/**
 * 在指定容器掛載 Disqus 留言區。
 * @param {HTMLElement} mountEl  #disqus_thread 容器
 * @param {Object} [opts]
 * @param {string} [opts.identifier] 該串識別鍵（如 'about.html' 或 'hospital:1101010021'）
 * @param {string} [opts.url]        該串規範網址
 * @param {string} [opts.title]      該串標題
 */
export function mountComments(mountEl, opts = {}) {
  if (!mountEl) return;
  const shortname = (SITE.disqusShortname || '').trim();

  if (!shortname) {
    mountEl.innerHTML =
      '<p style="color:var(--muted);font-size:0.9rem;padding:16px 0;">留言功能設定中，敬請期待。</p>';
    return;
  }

  const identifier = opts.identifier || defaultIdentifier();
  const url = opts.url || canonicalUrl();
  const title = opts.title || document.title;

  // Disqus 讀取此設定決定要載入哪一串留言
  window.disqus_config = function () {
    this.page.identifier = identifier;
    this.page.url = url;
    this.page.title = title;
  };

  // 每頁全頁載入一次即可（非 SPA，無需 DISQUS.reset）
  if (_scriptInjected) return;
  _scriptInjected = true;
  const s = document.createElement('script');
  s.src = `https://${shortname}.disqus.com/embed.js`;
  s.setAttribute('data-timestamp', String(Date.now()));
  s.async = true;
  (document.head || document.body).appendChild(s);
}
