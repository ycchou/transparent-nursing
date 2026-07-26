// gate.js — 軟鎖總開關。同步載入於每頁 <head> 最前面（非 module），
// 鎖定期把「非公開頁」導向 coming-soon.html，並隱藏 nav/footer 中通往鎖定頁的連結。
//
// 開 / 關：改下方 GATE_LOCKED（true=鎖定 / false=全公開）→ 跑 tools/stamp-assets.py → git push。
// 要調整哪些頁公開：改 GATE_PUBLIC 白名單（不在清單者一律鎖起來）。
var GATE_LOCKED = false;

// 鎖定期「仍公開」的頁面白名單（表單＋基本頁）。以檔名比對，其餘全鎖。
var GATE_PUBLIC = [
  '', 'index.html', 'coming-soon.html',
  'participate.html', 'participate-icu.html', 'participate-dialysis.html',
  'participate-other.html', 'participate-outpatient.html', 'participate-clinic.html',
  'about.html', 'terms.html',
  // 軟鎖定期間也提前開放的資料頁：護病比、人力監控、財務、違規紀錄（含 3 個舊 URL）
  'nurse-ratio.html', 'personnel.html', 'financials.html',
  'records.html', 'violations.html', 'gender.html', 'osha.html',
];

(function () {
  // 供 components.js 讀取，過濾選單/頁尾連結
  window.__SITE_LOCKED__ = GATE_LOCKED;
  window.__GATE_PUBLIC__ = GATE_PUBLIC;

  if (!GATE_LOCKED) return;

  var page = location.pathname.split('/').pop() || 'index.html';
  if (GATE_PUBLIC.indexOf(page) !== -1) return;  // 公開頁：放行

  // 非公開頁：標記 noindex 並轉到「即將公開」。同步執行，內容不會閃出來。
  var meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex,nofollow';
  document.head.appendChild(meta);
  location.replace('coming-soon.html');
})();
