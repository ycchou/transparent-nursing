// follow.js — 機構追蹤＋推播訂閱（PWA Web Push）。
//
// 只在「已安裝的 App（standalone）」裡能追蹤：iOS 只有主畫面 App 收得到推播，其他平台也統一規則，
// 避免同一個人在瀏覽器與 App 各有一份追蹤清單（iOS 兩邊的儲存空間是分開的）。
// 在一般瀏覽器按「追蹤」→ 顯示加到主畫面教學（pwa-prompt.js showInstallGuide）。
//
// 追蹤清單的正本在本機 localStorage；每次變動整份同步到 tn-submit Worker 的 /push/subscribe。
// 伺服器只存推播端點＋機構代號與類型，不存 IP、不與投稿關聯（見 worker-submit/src/push.js）。

import { LIVE } from './env.js?v=b540de8f2d';
import { showToast } from './toast.js?v=b540de8f2d';

const FOLLOW_KEY = 'tn:follows';          // { 機構代號: { name, kinds: 'cfr', at } }
const ENDPOINT_KEY = 'tn:push_endpoint';  // 上次同步到伺服器的推播端點（換了就重新同步）
const CLEANUP_KEY = 'tn:push_cleanup';    // 清單已清空但伺服器刪除失敗 → 下次開 App 再刪一次

// 類型代碼與 worker-submit/src/push.js 的 KINDS 一致
export const KIND_LABELS = { c: '新分享', f: '財報', r: '護病比' };
export const ALL_KINDS = 'cfr';
export const MAX_FOLLOWS = 100;   // 與 Worker 的 MAX_FOLLOWS 一致

const API = LIVE.submitEndpoint.replace(/\/submit$/, '');

// ---------- 本機追蹤清單 ----------
export function getFollows() {
  try {
    const v = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function saveFollows(f) {
  try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(f)); } catch {}
  try { window.dispatchEvent(new CustomEvent('tn:follows-changed')); } catch {}
}
export function isFollowing(code) { return !!getFollows()[code]; }

// ---------- 環境判斷 ----------
export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function pushConfigured() { return !!(LIVE.vapidPublicKey && API); }

/** 目前狀態：'browser'（不是 App）| 'unsupported' | 'unconfigured' | 'denied' | 'ready' */
export function pushStatus() {
  if (!isStandalone()) return 'browser';
  if (!pushSupported()) return 'unsupported';
  if (!pushConfigured()) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

const STATUS_MSG = {
  unsupported: '這個裝置的瀏覽器不支援推播通知（iPhone 需 iOS 16.4 以上）',
  unconfigured: '推播通知即將開放，敬請期待',
  denied: '通知權限已被關閉，請到系統設定 → 通知，允許「護理職場」後再試',
};

// 非 App 模式：引導安裝。教學本身在 pwa-prompt.js（含 iOS／Android／桌機圖解與一鍵安裝）
export async function guideToInstall(name = '') {
  const { showInstallGuide } = await import('./pwa-prompt.js?v=b540de8f2d');
  const who = name ? `「${escapeText(name)}」` : '醫院';
  showInstallGuide({
    lead: `<strong>追蹤${who}需要先把網站加到主畫面</strong>，推播通知只能送到安裝好的 App。<br>
      安裝後從主畫面打開「護理職場」，再到這家醫院按「追蹤」即可。已經安裝過的話，直接從主畫面打開就好。`,
  });
}
function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 推播訂閱 ----------
function urlBase64ToUint8Array(s) {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getRegistration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg || navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready);
}

async function ensureSubscription() {
  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(LIVE.vapidPublicKey),
    });
  }
  return sub;
}

async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function serverFollows(f) {
  return Object.fromEntries(Object.entries(f).map(([code, v]) => [code, v.kinds || ALL_KINDS]));
}

/** 把本機追蹤清單整份同步到伺服器。清單空了就連訂閱一起刪掉。 */
async function sync(follows) {
  const reg = await getRegistration();
  if (!Object.keys(follows).length) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { localStorage.setItem(CLEANUP_KEY, '1'); } catch {}
      await post('/push/unsubscribe', { endpoint: sub.endpoint });   // 失敗會拋出，留著 CLEANUP_KEY 下次重試
      await sub.unsubscribe().catch(() => {});
    }
    try { localStorage.removeItem(ENDPOINT_KEY); localStorage.removeItem(CLEANUP_KEY); } catch {}
    return;
  }
  const sub = await ensureSubscription();
  await post('/push/subscribe', { subscription: sub.toJSON(), follows: serverFollows(follows) });
  try { localStorage.setItem(ENDPOINT_KEY, sub.endpoint); } catch {}
}

/**
 * 追蹤一家醫院（使用者點擊時呼叫，才能跳出通知權限詢問）。回傳是否成功。
 * 不在 App 模式 → 顯示安裝教學並回 false。
 */
export async function followHospital(code, name) {
  const status = pushStatus();
  if (status === 'browser') { guideToInstall(name); return false; }
  if (status !== 'ready') { showToast(STATUS_MSG[status], 'warn'); return false; }

  const before = getFollows();
  if (Object.keys(before).length >= MAX_FOLLOWS && !before[code]) {
    showToast(`最多追蹤 ${MAX_FOLLOWS} 家醫院`, 'warn');
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { showToast('需要允許通知，才能在醫院有更新時提醒你', 'warn'); return false; }

  const next = { ...before, [code]: { name, kinds: ALL_KINDS, at: Date.now() } };
  try {
    await sync(next);
  } catch (e) {
    console.warn('[follow] 訂閱失敗：', e.message);
    showToast('訂閱失敗，請確認網路後再試一次', 'error');
    return false;
  }
  saveFollows(next);
  return true;
}

export async function unfollowHospital(code) {
  const next = { ...getFollows() };
  delete next[code];
  saveFollows(next);   // 本機先移除：就算同步失敗，下次開 App 時 healthCheck 會補同步
  try { await sync(next); } catch (e) { console.warn('[follow] 取消同步失敗：', e.message); markDirty(); }
  return true;
}

/** 改某家醫院要收哪些類型（kinds 為 'cfr' 的子集；空字串＝取消追蹤） */
export async function setKinds(code, kinds) {
  if (!kinds) return unfollowHospital(code);
  const f = getFollows();
  if (!f[code]) return false;
  const next = { ...f, [code]: { ...f[code], kinds } };
  saveFollows(next);
  try { await sync(next); } catch (e) { console.warn('[follow] 同步失敗：', e.message); markDirty(); showToast('同步失敗，稍後會自動重試', 'warn'); }
  return true;
}

/** 刪除這台裝置的所有追蹤與伺服器上的訂閱資料 */
export async function deleteAll() {
  saveFollows({});
  if (pushSupported()) {
    try { await sync({}); } catch (e) { console.warn('[follow] 刪除訂閱失敗：', e.message); markDirty(); return false; }
  }
  return true;
}

function markDirty() { try { localStorage.removeItem(ENDPOINT_KEY); } catch {} }

/**
 * 開 App 時的健康檢查（components.js 在有追蹤清單、或有待補刪的訂閱時才載入本檔）：
 * 瀏覽器可能更換推播端點、使用者可能在系統設定關掉通知、上次同步可能失敗。
 * 只在端點跟上次同步的不一樣時才連伺服器，平常開頁不會呼叫 Worker。
 */
export async function healthCheck() {
  const follows = getFollows();
  if (!Object.keys(follows).length) {
    let pending = false;
    try { pending = !!localStorage.getItem(CLEANUP_KEY); } catch {}
    if (pending && pushSupported()) await sync({}).catch((e) => console.warn('[follow] 補刪訂閱失敗：', e.message));
    return;
  }
  if (pushStatus() !== 'ready' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    let synced = '';
    try { synced = localStorage.getItem(ENDPOINT_KEY) || ''; } catch {}
    if (sub && sub.endpoint === synced) return;
    await sync(follows);
  } catch (e) {
    console.warn('[follow] 健康檢查失敗：', e.message);
  }
}
