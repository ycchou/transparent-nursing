// unlock.js — 跨裝置解鎖碼：投稿後拿到的碼（例 TN-7KQ2-M9XA），在其他裝置／瀏覽器輸入或點解鎖連結，
// 就能解鎖分享平台完整內容。後端見 worker-submit（POST /unlock）。
//
// 匿名性：碼只在後端存雜湊、不與投稿資料列關聯；裝置 ID 是本瀏覽器隨機產生的字串（存 localStorage），
// 只用來計算「這組碼已解鎖幾台裝置」（每碼上限 5 台），不是裝置指紋。

import { LIVE } from './env.js?v=ad6568ae44';
import { markContributed, hasContributed } from './contribution-gate.js?v=ad6568ae44';

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

/** 本裝置投稿時拿到的解鎖碼（沒有回空字串） */
export function savedUnlockCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}

export function saveUnlockCode(code) {
  try { localStorage.setItem(CODE_KEY, code); } catch {}
}

/** 解鎖連結：點開就自動解鎖並進入分享平台 */
export function unlockLink(code) {
  return new URL(`platform.html#unlock=${encodeURIComponent(code)}`, location.href).href;
}

const ERROR_TEXT = {
  format: '解鎖碼格式不對，請確認是 TN-XXXX-XXXX 的 8 碼',
  invalid: '找不到這組解鎖碼，請確認有沒有打錯',
  limit: '這組解鎖碼已經解鎖 5 台裝置，達到上限',
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
