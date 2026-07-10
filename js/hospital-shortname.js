// 醫院對照：從 data/hospitals-merged.json 讀取
//   - { 評鑑正式名稱 → VPN 簡稱 }（getShort）
//   - { 正規化名稱 → 機構代碼 }（getHospitalCode）供各頁把評鑑醫院名稱連到機構總覽頁
//
// 用法：
//   import { getShort, getHospitalCode, ensureLoaded } from './hospital-shortname.js';
//   await ensureLoaded();                     // 等載完（或不 await，未載完時回 null）
//   getShort('臺北榮民總醫院');                 // '北榮' 或 null
//   getHospitalCode('臺北市立聯合醫院中興院區'); // '0101090517' 或 null
//
// 頁面若要在載入完成後自動 re-render，可監聽 window 'hospitalShortNamesReady' event。

import { normalizeInstitutionName } from './institution-name.js?v=3cb29e39e7';

const SHORT_MAP = new Map();       // 正式名稱 → 簡稱
const CODE_MAP = new Map();        // 正規化名稱 → 機構代碼
const CODE_TO_SHORT = new Map();   // 機構代碼 → 簡稱
let loaded = false;
let loadingPromise = null;

// 多字串最長共同前綴（多院區共用代號時，補上母院名 → 代碼）
function commonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (const s of strs) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}

function startLoad() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const r = await fetch('data/hospitals-merged.json', { cache: 'default' });
      if (!r.ok) return;
      const d = await r.json();
      const namesByCode = new Map();
      (d.hospitals || []).forEach((h) => {
        if (!h.name) return;
        if (h.shortName && h.shortName !== h.name) SHORT_MAP.set(h.name, h.shortName);
        if (h.code && h.shortName && !CODE_TO_SHORT.has(h.code)) CODE_TO_SHORT.set(h.code, h.shortName);
        if (h.code) {
          const nn = normalizeInstitutionName(h.name);
          if (nn && !CODE_MAP.has(nn)) CODE_MAP.set(nn, h.code);
          const arr = namesByCode.get(h.code) || [];
          arr.push(h.name);
          namesByCode.set(h.code, arr);
        }
      });
      // 多院區共用代號：把母院名（各院區共同前綴）也對到代碼
      namesByCode.forEach((names, code) => {
        if (names.length < 2) return;
        const base = normalizeInstitutionName(commonPrefix(names));
        if (base && base.length >= 4 && !CODE_MAP.has(base)) CODE_MAP.set(base, code);
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

// 機構代碼 → 簡稱（已去重的正式簡稱；找不到回 null）
export function getShortByCode(code) {
  if (!code) return null;
  return CODE_TO_SHORT.get(code) || null;
}

// 名稱 → 機構代碼（評鑑醫院才有；找不到回 null）
export function getHospitalCode(name) {
  if (!name) return null;
  return CODE_MAP.get(normalizeInstitutionName(name)) || null;
}

export const HOSPITAL_SHORT_MAP = SHORT_MAP;
