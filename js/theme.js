// theme.js — JS 端的顏色單一來源。
//
// 顏色只定義在 css/styles.css 的 :root（CSS custom properties）；JS（Chart.js 設定、分享圖、
// 動態產生的 inline style）一律從這裡取，不要再寫死色碼。改主色、改類別色只需改 CSS 一處。
//
//   import { C, alpha } from './theme.js';
//   borderColor: C.primaryFill
//   backgroundColor: alpha(C.primaryFill, 0.15)      // → 'rgba(46, 134, 171, 0.15)'
//   `<span style="color:${C.muted}">`                // 模板字串內
//
// 文字色（ink / muted / primary / danger / successText…）符合 WCAG AA，可放文字；
// 填色（primaryFill / dangerFill / success / warning…）只給長條、線條、色塊，不要拿來當文字色。
// CSS 裡的色碼一律寫 6 位 hex（alpha() 與 `C.x + '22'` 這種寫法依賴它）。

const TOKENS = {
  // 文字與版面
  ink: '--ink', inkSoft: '--ink-soft', muted: '--muted', mutedLight: '--muted-light',
  primary: '--primary', primarySoft: '--primary-soft', accent: '--accent', warm: '--warm',
  surface: '--surface', border: '--border', borderSoft: '--border-soft',
  // 狀態：文字色 ／ 填色
  danger: '--danger', successText: '--success-text', warningText: '--warning-text',
  success: '--success', warning: '--warning',
  // 圖形填色
  primaryFill: '--primary-fill', dangerFill: '--danger-fill', dangerDeep: '--danger-deep',
  neutralFill: '--neutral-fill', grayFill: '--gray-fill', navyDeep: '--navy-deep', standardLine: '--standard-line',
  // 通用序列色（與類別色同值；非「工作場域」語意的圖表序列用這組名稱，讀起來不會誤解）
  purple: '--cat-outpatient', teal: '--cat-special', pink: '--cat-or', indigo: '--cat-psych',
  cyan: '--cat-clinic', slate: '--cat-other',
  // 延伸序列色
  coral: '--viz-coral', amber: '--viz-amber', yellow: '--viz-yellow', sky: '--viz-sky', lime: '--viz-lime', violet: '--viz-violet',
  // 淡色底
  tintDanger: '--tint-danger', tintWarning: '--tint-warning', tintSuccess: '--tint-success', tintMint: '--tint-mint',
};
const CATEGORY_SLUGS = ['ward', 'icu', 'er', 'or', 'outpatient', 'clinic', 'dialysis', 'psych', 'special', 'other'];

const rootStyle = getComputedStyle(document.documentElement);
function read(name) {
  const v = rootStyle.getPropertyValue(name).trim();
  if (!v) console.error(`[theme] css/styles.css 找不到 ${name}`);
  return v;
}

/** 顏色表：C.ink、C.primaryFill…；C.cat.ward / C.catSoft.ward 為類別主色／淡色 */
export const C = Object.freeze({
  ...Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, read(v)])),
  cat: Object.freeze(Object.fromEntries(CATEGORY_SLUGS.map((s) => [s, read(`--cat-${s}`)]))),
  catSoft: Object.freeze(Object.fromEntries(CATEGORY_SLUGS.map((s) => [s, read(`--cat-${s}-soft`)]))),
});

/** 6 位 hex → rgba 字串：alpha('#2E86AB', 0.15) → 'rgba(46, 134, 171, 0.15)' */
export function alpha(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
