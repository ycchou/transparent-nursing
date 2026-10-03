// unlock.js — 跨裝置解鎖碼：投稿後拿到的碼（例 TN-7KQ2-M9XA），在其他裝置／瀏覽器輸入或點解鎖連結，
// 就能解鎖分享平台完整內容。後端見 worker-submit（POST /unlock）。
//
// 匿名性：碼只在後端存雜湊、不與投稿資料列關聯；裝置 ID 是本瀏覽器隨機產生的字串（存 localStorage），
// 只用來計算「這組碼已解鎖幾台裝置」（每碼上限 5 台），不是裝置指紋。

import { LIVE } from './env.js?v=9c413ac48c';
import { markContributed, hasContributed } from './contribution-gate.js?v=9c413ac48c';
import { icon } from './icons.js?v=9c413ac48c';

const DEVICE_KEY = 'tn:device_id';
const CODE_KEY = 'tn:unlock_code';   // 本裝置投稿時拿到的碼，方便日後在填寫頁再看一次

const UNLOCK_API = LIVE.submitEndpoint.replace(/\/submit$/, '/unlock');

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (b) => b.toString(16).padStart(2, '0')).join(''));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'nostorage-' + Math.random().toString(36).slice(2).padEnd(12, '0');
  }
}

export const UNLOCK_MAX_USES = 5;   // 與 worker-submit 的 UNLOCK_MAX_DEVICES 一致

function inStandaloneApp() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}

/**
 * 解鎖碼的額度說明＋引導改用主畫面 App（感謝畫面、填寫頁共用）。
 * 重點：額度是算「瀏覽器／App」不是算手機——iPhone 的主畫面 App 與 Safari 資料分開，也各算 1 次。
 * 搭配 wireInstallGuide() 讓「看教學」按鈕生效。
 */
export function unlockNoticeHtml() {
  const pwa = inStandaloneApp()
    ? `${icon('check', { size: 14, className: 'ico-inline' })}你正在使用 App 版。之後都從主畫面的圖示開啟，就不必再用解鎖碼。`
    : `<strong>建議把網站加到主畫面，之後都從 App 開啟</strong>：資料都在同一個地方，不必重複解鎖、也更快。
       <button type="button" class="dform-unlock-guide-btn" data-install-guide>看加到主畫面教學 →</button>`;
  return `
    <div class="dform-unlock-limit" role="note">
      <div class="dform-unlock-limit-title">${icon('alert-triangle', { size: 16, className: 'ico-inline' })}每組解鎖碼最多只能解鎖 ${UNLOCK_MAX_USES} 次</div>
      <div>每一個<strong>瀏覽器</strong>、每一個<strong>加到主畫面的 App</strong> 都各算 1 次。例如同一支手機的 Safari、Chrome、主畫面 App 就會用掉 3 次；同一個瀏覽器重複解鎖不會再扣。</div>
    </div>
    <div class="dform-unlock-pwa">${pwa}</div>`;
}

export function wireInstallGuide(root) {
  root.querySelectorAll('[data-install-guide]').forEach((b) =>
    b.addEventListener('click', () => window.__nursingShowInstallGuide && window.__nursingShowInstallGuide()));
}

/** 本裝置投稿時拿到的解鎖碼（沒有回空字串） */
export function savedUnlockCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}

export function saveUnlockCode(code) {
  try { localStorage.setItem(CODE_KEY, code); } catch {}
}

/** 使用者輸入的碼 → 統一格式 TN-XXXX-XXXX（格式不對回空字串；與 worker-submit 的正規化規則一致） */
export function formatUnlockCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === 10 && s.startsWith('TN')) s = s.slice(2);
  return s.length === 8 ? `TN-${s.slice(0, 4)}-${s.slice(4)}` : '';
}

/** 複製文字到剪貼簿；成功回 true */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {   // 舊瀏覽器／非安全環境的退路
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** 解鎖連結：點開就自動解鎖並進入分享平台 */
export function unlockLink(code) {
  return new URL(`platform.html#unlock=${encodeURIComponent(code)}`, location.href).href;
}

const ERROR_TEXT = {
  format: '解鎖碼格式不對，請確認是 TN-XXXX-XXXX 的 8 碼',
  invalid: '找不到這組解鎖碼，請確認有沒有打錯',
  limit: '這組解鎖碼已經用完 5 次解鎖額度（每個瀏覽器、每個主畫面 App 各算 1 次），無法再解鎖',
  rate: '今天嘗試次數太多，請明天再試',
};

/** 兌換解鎖碼。成功會標記本裝置為已貢獻。回 { ok: true } 或 { ok: false, message } */
export async function redeemUnlockCode(code) {
  try {
    const res = await fetch(UNLOCK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, device: deviceId() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      markContributed();
      // 記住這組碼：這台裝置之後也能在填寫頁看到、複製，下次換手機時用得到
      const formatted = formatUnlockCode(code);
      if (formatted) saveUnlockCode(formatted);
      return { ok: true };
    }
    return { ok: false, message: ERROR_TEXT[data.error] || `解鎖失敗（HTTP ${res.status}），請稍後再試` };
  } catch {
    return { ok: false, message: '連線失敗，請檢查網路後再試一次' };
  }
}

/**
 * 網址帶 #unlock=碼 時自動兌換（由 components.js 在偵測到 hash 時動態載入呼叫）。
 * 成功後拿掉 hash 並重新載入，讓頁面以已解鎖狀態重畫。
 */
export async function handleUnlockHash({ toast } = {}) {
  const m = location.hash.match(/^#unlock=([^&]+)/);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (hasContributed()) { toast?.('這台裝置已經解鎖囉', 'info'); return; }
  const r = await redeemUnlockCode(code);
  if (r.ok) {
    toast?.('已解鎖分享平台完整內容', 'info');
    setTimeout(() => location.reload(), 900);
  } else {
    toast?.(r.message, 'error');
  }
}
