// 執行環境開關 — 正式資料 vs 測試資料。全站只有這一支要改。
//
//   MODE = 'mock' → 讀 data/mock/*.csv，表單只模擬送出（console.log），不會寫進任何地方
//   MODE = 'live' → 讀 LIVE.csvUrls 的 Google Sheet 發布 CSV，表單真的送到 tn-submit Worker
//
// 臨時切換不必改檔：網址加 ?data=live 或 ?data=mock，該分頁（sessionStorage）內持續有效，
// 關掉分頁就恢復 MODE 的設定。方便正式站上偷看測試資料、或測試站驗正式資料。

export const MODE = 'mock';   // ← 上線切成 'live'

export const LIVE = {
  // tn-submit Worker 的 /submit 網址（部署後填；見 worker-submit/README.md）
  submitEndpoint: '',

  // Cloudflare Turnstile 的 Site Key（公開值，可進版控；Secret Key 只放 Worker secret）。
  // 留空 → 表單不掛 widget。注意 Worker 端的 Turnstile 驗證是開著的，
  // 所以 live 模式沒填這個的話，送出會被 Worker 以 captcha 擋掉。
  turnstileSiteKey: '',

  // 各類別的 Google Sheet「發布到網路 → CSV」連結（見 docs/sheet-setup.md）
  // 留空的類別在 live 模式下會自動退回該類別的測試資料，並在 console 提示。
  csvUrls: {
    ward: '',
    icu: '',
    er: '',
    or: '',
    outpatient: '',
    clinic: '',
    dialysis: '',
    psych: '',
    special: '',
    other: '',
  },
};

const OVERRIDE_KEY = 'tn_data_mode';

/** 讀網址 ?data= 覆寫並記進 sessionStorage；回傳 'live' | 'mock' | null */
function readOverride() {
  try {
    const q = new URLSearchParams(location.search).get('data');
    if (q === 'live' || q === 'mock') {
      sessionStorage.setItem(OVERRIDE_KEY, q);
      return q;
    }
    const saved = sessionStorage.getItem(OVERRIDE_KEY);
    return saved === 'live' || saved === 'mock' ? saved : null;
  } catch { return null; }
}

/** 目前生效的模式。live 但沒填 submitEndpoint 與任何 csvUrl 時自動退回 mock。 */
export function currentMode() {
  const mode = readOverride() || MODE;
  if (mode !== 'live') return 'mock';
  const hasAnything = LIVE.submitEndpoint || Object.values(LIVE.csvUrls).some(Boolean);
  if (!hasAnything) {
    console.warn('[env] MODE=live 但 js/env.js 的 LIVE 還沒填任何網址 → 退回測試資料');
    return 'mock';
  }
  return 'live';
}

export function isLive() { return currentMode() === 'live'; }

/** 某類別實際要讀的 CSV：live 有填就用正式的，沒填就退回測試檔 */
export function csvUrlFor(slug, mockUrl) {
  if (!isLive()) return mockUrl;
  const live = LIVE.csvUrls[slug];
  if (live) return live;
  console.warn(`[env] live 模式但 ${slug} 沒有正式 CSV → 用測試資料 ${mockUrl}`);
  return mockUrl;
}

/** Turnstile Site Key：mock 模式一律回空字串（測試時不跳人機驗證） */
export function turnstileSiteKey() {
  return isLive() ? (LIVE.turnstileSiteKey || '') : '';
}

/** 表單送出端點：mock 模式回空字串（form-engine 收到空字串就只模擬送出） */
export function submitEndpoint() {
  if (!isLive()) return '';
  if (!LIVE.submitEndpoint) {
    console.warn('[env] live 模式但沒填 submitEndpoint → 表單改為模擬送出');
    return '';
  }
  return LIVE.submitEndpoint;
}

// 用 ?data= 臨時覆寫時，在畫面右下角留一個小標記，避免忘了自己在看哪一份資料
export function mountModeBadge() {
  if (typeof document === 'undefined' || !readOverride()) return;
  if (document.getElementById('tn-mode-badge')) return;
  const el = document.createElement('div');
  el.id = 'tn-mode-badge';
  el.className = 'tn-mode-badge';
  el.textContent = currentMode() === 'live' ? '正式資料' : '測試資料';
  el.title = '由網址 ?data= 覆寫；關閉分頁即恢復預設';
  document.body.appendChild(el);
}
