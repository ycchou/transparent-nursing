// 醫院簡稱查詢：從 data/hospitals-merged.json 讀取 { 評鑑正式名稱 → VPN 簡稱 } 對照
//
// 用法：
//   import { getShort, ensureLoaded } from './hospital-shortname.js';
//   await ensureLoaded();                   // 等載完（或直接不 await，未載完時 getShort 回 null）
//   const short = getShort('臺北榮民總醫院'); // '北榮' 或 null
//
// 頁面若要在載入完成後自動 re-render，可監聽 window 'hospitalShortNamesReady' event。

const SHORT_MAP = new Map();
let loaded = false;
let loadingPromise = null;

function startLoad() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const r = await fetch('data/hospitals-merged.json', { cache: 'default' });
      if (!r.ok) return;
      const d = await r.json();
      (d.hospitals || []).forEach((h) => {
        if (h.name && h.shortName && h.shortName !== h.name) {
          SHORT_MAP.set(h.name, h.shortName);
        }
      });
      loaded = true;
      try { window.dispatchEvent(new Event('hospitalShortNamesReady')); } catch {}
    } catch {}
  })();
  return loadingPromise;
}

// module load 就開始 fetch（fire-and-forget）
startLoad();

export function ensureLoaded() {
  return startLoad();
}

export function isLoaded() {
  return loaded;
}

export function getShort(name) {
  if (!name) return null;
  return SHORT_MAP.get(name) || null;
}

export const HOSPITAL_SHORT_MAP = SHORT_MAP;
