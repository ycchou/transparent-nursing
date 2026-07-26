// 留言元件（Disqus）— 可重用：任一頁把容器元素與識別資訊傳進來即可掛載。
//
// Disqus 是託管式服務，留言存在 Disqus 伺服器（非本 repo），純靜態站免後端即可用。
// 需先到 disqus.com 建站取得 shortname，填入 js/config.js 的 SITE.disqusShortname。
// shortname 未設時只顯示「設定中」提示、不載入任何外部腳本。
//
// 兩種用法：
//   mountComments(el, opts)  靜態頁一次性掛載（about.html 這類非 SPA）。
//   showComments(el, opts)   SPA 友善：同一頁切換不同對象時，第二次起改用 DISQUS.reset
//                            切換到新的討論串（hospital.html 逐機構切換即用此）。

import { SITE } from './config.js?v=e92508ad94';

let _loaded = false;          // embed.js 是否已注入（整頁只注入一次）
let _current = null;          // 當前討論串 meta：{ identifier, url, title }

// 該頁的規範網址（Disqus 以此對應／去重），取 <link rel="canonical">，退回目前網址。
function canonicalUrl() {
  const link = document.querySelector('link[rel="canonical"]');
  return (link && link.href) || location.href.split('#')[0];
}

// 每頁穩定識別鍵：預設用檔名（避免查詢字串造成同頁多串）。
function defaultIdentifier() {
  return location.pathname.split('/').pop() || 'index.html';
}

// disqus_config（首次載入）與 DISQUS.reset 共用同一份 config：都讀「當前 meta」，
// 確保切換對象後載入／重載都對到正確的討論串。
function disqusConfig() {
  return function () {
    if (!_current) return;
    this.page.identifier = _current.identifier;
    this.page.url = _current.url;
    this.page.title = _current.title;
  };
}

/**
 * 掛載／切換 Disqus 留言區（SPA 友善）。
 * @param {HTMLElement} mountEl  #disqus_thread 容器
 * @param {Object} [opts]
 * @param {string} [opts.identifier] 該串識別鍵（如 'about.html' 或 'hospital:1101010021'）
 * @param {string} [opts.url]        該串規範網址
 * @param {string} [opts.title]      該串標題
 */
export function showComments(mountEl, opts = {}) {
  if (!mountEl) return;
  const shortname = (SITE.disqusShortname || '').trim();

  if (!shortname) {
    mountEl.innerHTML =
      '<p style="color:var(--muted);font-size:0.9rem;padding:16px 0;">留言功能設定中，敬請期待。</p>';
    return;
  }

  _current = {
    identifier: opts.identifier || defaultIdentifier(),
    url: opts.url || canonicalUrl(),
    title: opts.title || document.title,
  };

  if (!_loaded) {
    // 首次：注入 embed.js，Disqus 讀 window.disqus_config 決定要載入哪一串
    _loaded = true;
    window.disqus_config = disqusConfig();
    const s = document.createElement('script');
    s.src = `https://${shortname}.disqus.com/embed.js`;
    s.setAttribute('data-timestamp', String(Date.now()));
    s.async = true;
    (document.head || document.body).appendChild(s);
  } else if (window.DISQUS) {
    // 已載入：SPA 切換對象 → 重載成新討論串（#disqus_thread 為常駐容器，不需重建）
    window.DISQUS.reset({ reload: true, config: disqusConfig() });
  }
}

// 靜態頁一次性掛載：語意等同首次 showComments（非 SPA，無需 reset）。
export function mountComments(mountEl, opts = {}) {
  showComments(mountEl, opts);
}
