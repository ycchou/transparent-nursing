// shell.js — 站台外框（header＋手機底部導覽列）的同步渲染。
//
// 為什麼不放在 components.js：components.js 是 ES module，要等整串 import 載完才執行，
// 瀏覽器會先畫出「沒有 header／導覽列」的第一格，再把它們插進來——換頁時就會看到兩者
// 消失再出現，加上毛玻璃重新計算背景，看起來像閃一下模糊。
// 這支是一般（非 module）script，放在 <head>：head 內的同步 script 執行完之前瀏覽器不會畫任何東西，
// 再由 #app-header 後的內嵌 TNShell.mount() 立即畫出外框——第一格畫面就是完整的。
// 互動（下拉、底部面板、自動收起）仍由 components.js 綁定。
//
// 資料（NAV_ITEMS、BOTTOM_NAV）與 gate 過濾只在這裡定義一次，components.js 透過
// window.TNShell 取用。
(function () {
  'use strict';

  var NAV_ITEMS = [
    // 首頁改用點左上 logo 回去（網站慣例），頂層不再放「首頁」以精簡導覽
    { href: 'platform.html',    label: '分享平台', match: ['platform.html'] },
    { href: 'hospital.html',    label: '機構總覽', match: ['hospital.html'] },
    // 「資料查詢」下拉群組：把瀏覽資料的頁面收在一起，精簡頂層數量
    { label: '資料查詢', children: [
      { href: 'nurse-ratio.html', label: '護病比', match: ['nurse-ratio.html'] },
      { href: 'financials.html',  label: '醫院財務', match: ['financials.html'] },
      { href: 'personnel.html',   label: '人力監控', match: ['personnel.html'] },
      // 3 個違規紀錄合併進 records.html，match 陣列同時涵蓋舊 URL 讓 nav highlight 保留
      { href: 'records.html',     label: '違規紀錄', match: ['records.html', 'violations.html', 'gender.html', 'osha.html'] },
      { href: 'stats.html',       label: '統計摘要', match: ['stats.html'] },
    ] },
    { href: 'participate.html', label: '填寫表單', match: ['participate.html'] },
    { href: 'about.html',       label: '關於我們', match: ['about.html'] },
    { href: 'support.html',     label: '支持我們', match: ['support.html'] },
    // 外部連結：RT 姊妹站（呼吸治療產業勞動環境公開平台）
    { href: 'https://trtu.org.tw/RT_platform/', label: 'RT 職場', external: true, title: '呼吸治療產業勞動環境公開平台' },
  ];

  // 手機底部導覽列（≤768px）：分享平台／機構總覽／＋填寫／資料查詢（面板）／更多（面板）。
  // 表單填寫頁（participate-*.html）不顯示，避免填到一半誤觸離開。
  var BOTTOM_NAV = {
    tabs: [
      { href: 'platform.html', label: '分享平台', icon: 'message-square', match: ['platform.html'] },
      { href: 'hospital.html', label: '機構總覽', icon: 'building', match: ['hospital.html'] },
      { href: 'participate.html', label: '填寫', icon: 'pencil-line', match: ['participate.html'], cta: true },
      { sheet: 'data', label: '資料查詢', icon: 'bar-chart-3' },
      { sheet: 'more', label: '更多', icon: 'more-horizontal' },
    ],
    sheets: {
      data: {
        title: '資料查詢',
        items: [
          { href: 'nurse-ratio.html', label: '護病比', desc: '全國醫院三班護病比逐月變化', icon: 'bed-double', match: ['nurse-ratio.html'] },
          { href: 'financials.html', label: '醫院財務', desc: '營收、利益率與同儕比較', icon: 'pie-chart', match: ['financials.html'] },
          { href: 'personnel.html', label: '人力監控', desc: '醫事人力逐月增減', icon: 'users', match: ['personnel.html'] },
          { href: 'records.html', label: '違規紀錄', desc: '勞檢／性平／職安處分', icon: 'shield-check', match: ['records.html', 'violations.html', 'gender.html', 'osha.html'] },
          { href: 'stats.html', label: '統計摘要', desc: '分享資料的整體分布', icon: 'bar-chart-3', match: ['stats.html'] },
        ],
      },
      more: {
        title: '更多',
        items: [
          { href: 'about.html', label: '關於我們', desc: '運動緣起與常見問題', icon: 'info', match: ['about.html'] },
          { href: 'support.html', label: '支持我們', desc: '小額捐款，讓平台走得更遠', icon: 'heart', match: ['support.html'] },
          { href: 'terms.html', label: '服務條款', icon: 'file-text', match: ['terms.html'] },
          { href: 'https://trtu.org.tw/RT_platform/', label: 'RT 職場', desc: '呼吸治療產業勞動環境公開平台', icon: 'arrow-up-right', external: true },
        ],
      },
    },
  };

  // 外框用到的圖示（與 js/icons.js 同一套 Lucide 路徑；這裡不能 import module）
  var ICONS = {
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    // 與首頁「我也要分享」按鈕同一支鉛筆
    'pencil-line': '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/><path d="m15 5 3 3"/>',
    'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };
  function icon(name, size) {
    size = size || 20;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }

  // Logo 標誌：白色心型 + 紅色 ECG 線（以 apple-touch-icon 為基準 1.5× 等比放大，
  // 顯示尺寸 26px 在 32px 色塊內 → 心型佔 32px 方塊約 62% 寬度）
  var HEART_PULSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style="display:block;">' +
    '<path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>' +
    '<path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</svg>';

  // 軟鎖：鎖定期只顯示公開頁的選單/頁尾連結（總開關與白名單在 js/gate.js）
  function gatePageOf(href) {
    return (href || '').split('#')[0].split('?')[0].split('/').pop() || 'index.html';
  }
  function gateAllowed(href) {
    if (!window.__SITE_LOCKED__) return true;
    return (window.__GATE_PUBLIC__ || []).indexOf(gatePageOf(href)) !== -1;
  }
  function visibleNav() {
    if (!window.__SITE_LOCKED__) return NAV_ITEMS;
    return NAV_ITEMS.map(function (it) {
      if (it.children) {
        var kids = it.children.filter(function (c) { return gateAllowed(c.href); });
        return kids.length ? Object.assign({}, it, { children: kids }) : null;
      }
      return (it.external || gateAllowed(it.href)) ? it : null;
    }).filter(Boolean);
  }
  function sheetOf(key) {
    var sh = BOTTOM_NAV.sheets[key];
    return Object.assign({}, sh, { items: sh.items.filter(function (it) { return it.external || gateAllowed(it.href); }) });
  }

  function currentPage() {
    return location.pathname.split('/').pop() || 'index.html';
  }
  function bottomNavEnabled(page) {
    return !/^participate-.+\.html$/.test(page);
  }

  // 單一導覽項目 → HTML（一般連結，或含子選單的下拉群組）
  function navItemHTML(it, page) {
    if (it.external) {
      return '<a href="' + it.href + '" class="nav-external" target="_blank" rel="noopener"' + (it.title ? ' title="' + it.title + '"' : '') + '>' +
        it.label + ' <span class="nav-external-arrow" aria-hidden="true">↗</span></a>';
    }
    if (!it.children) {
      return '<a href="' + it.href + '" class="' + (it.match.indexOf(page) !== -1 ? 'active' : '') + '">' + it.label + '</a>';
    }
    var groupActive = it.children.some(function (c) { return c.match.indexOf(page) !== -1; });
    var links = it.children.map(function (c) {
      return '<a href="' + c.href + '" class="' + (c.match.indexOf(page) !== -1 ? 'active' : '') + '">' + c.label + '</a>';
    }).join('');
    return '<div class="nav-group' + (groupActive ? ' active' : '') + '">' +
      '<button type="button" class="nav-group-trigger' + (groupActive ? ' active' : '') + '" aria-expanded="false" aria-haspopup="true">' +
      it.label + '<span class="nav-group-caret" aria-hidden="true">▾</span></button>' +
      '<div class="nav-submenu">' + links + '</div></div>';
  }

  function headerHTML(page) {
    page = page || currentPage();
    return '<header class="site-header"><div class="container"><div class="nav-wrap">' +
      '<a href="index.html" class="site-logo"><span class="site-logo-mark">' + HEART_PULSE_SVG + '</span><span>護理職場透明化</span></a>' +
      '<nav class="site-nav" id="site-nav">' + visibleNav().map(function (it) { return navItemHTML(it, page); }).join('') + '</nav>' +
      '<button class="nav-toggle" id="nav-toggle" aria-label="開啟選單">' + icon('menu') + '</button>' +
      '</div></div></header>';
  }

  // 底部導覽列本體（面板內容較大且預設隱藏，由 components.js 之後再補）
  function bottomBarHTML(page) {
    page = page || currentPage();
    var tabs = BOTTOM_NAV.tabs.filter(function (t) { return t.sheet ? sheetOf(t.sheet).items.length : gateAllowed(t.href); });
    // 每格：icon 外包一層 .bn-icon（選中時長出 pill 底色），下方 label
    var inner = function (t) { return '<span class="bn-icon">' + icon(t.icon, 22) + '</span><span class="bn-label">' + t.label + '</span>'; };
    var html = tabs.map(function (t) {
      if (t.sheet) {
        var active = sheetOf(t.sheet).items.some(function (it) { return it.match && it.match.indexOf(page) !== -1; });
        return '<button type="button" class="bn-item' + (active ? ' active' : '') + '" data-sheet="' + t.sheet + '"' +
          ' aria-haspopup="dialog" aria-expanded="false" aria-controls="bn-sheet">' + inner(t) + '</button>';
      }
      var isActive = t.match.indexOf(page) !== -1;
      return '<a href="' + t.href + '" class="bn-item' + (t.cta ? ' bn-cta' : '') + (isActive ? ' active' : '') + '"' +
        (isActive ? ' aria-current="page"' : '') + '>' + inner(t) + '</a>';
    }).join('');
    return '<nav class="bottom-nav" aria-label="主要導覽">' + html + '</nav>';
  }

  window.TNShell = {
    NAV_ITEMS: NAV_ITEMS,
    BOTTOM_NAV: BOTTOM_NAV,
    HEART_PULSE_SVG: HEART_PULSE_SVG,
    gateAllowed: gateAllowed,
    sheetOf: sheetOf,
    currentPage: currentPage,
    bottomNavEnabled: bottomNavEnabled,
    headerHTML: headerHTML,
    bottomBarHTML: bottomBarHTML,
  };

  // 由頁面在 <div id="app-header"></div> 後以內嵌 <script>TNShell.mount()</script> 呼叫：
  // 此時 <body> 已存在、#app-header 已解析完，且內嵌 script 不需下載，會在第一格畫面前執行
  window.TNShell.mount = function () {
    var page = currentPage();
    var slot = document.getElementById('app-header');
    if (slot && !slot.firstElementChild) slot.innerHTML = headerHTML(page);
    if (document.body && bottomNavEnabled(page) && !document.querySelector('.bottom-nav')) {
      document.body.insertAdjacentHTML('beforeend', bottomBarHTML(page));
      document.body.classList.add('has-bottom-nav');
    }
  };
})();
