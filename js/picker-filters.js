// picker-filters.js — 醫院挑選器的共用篩選元件（護病比、機構總覽、人力監控、財務共用）。
//
//   mountCityFilter(el, hospitals, (city) => { state.cityFilter = city; render(); });
//   bindChipGroup('.nurse-level-filter', 'level', (v) => { state.levelFilter = v; render(); });
//   levelSlug('醫學中心')  // → 'mc'（層級 badge 的 CSS class 後綴）
import { escapeHtml } from './moderation.js?v=ea7daf2bd0';

const UNKNOWN = '(未知)';

/**
 * 縣市篩選 chip：依醫院數由多到少列出，「(未知)」殿後；第一顆「全部」。
 * @param {HTMLElement|null} el        容器（#city-filter）
 * @param {{city?: string}[]} hospitals 要統計的醫院清單
 * @param {(city: string) => void} onChange  點選時回呼，'all' 代表全部
 */
export function mountCityFilter(el, hospitals, onChange) {
  if (!el) return;
  const counts = {};
  hospitals.forEach((h) => { const c = h.city || UNKNOWN; counts[c] = (counts[c] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => {
    if (a[0] === UNKNOWN) return 1;
    if (b[0] === UNKNOWN) return -1;
    return b[1] - a[1];
  });
  el.innerHTML = `
    <button type="button" class="nurse-city-filter active" data-city="all">全部</button>
    ${sorted.map(([c, n]) => `
      <button type="button" class="nurse-city-filter" data-city="${escapeHtml(c)}">${escapeHtml(c)} <span class="chip-count">${n}</span></button>
    `).join('')}
  `;
  bindChipGroup(el.querySelectorAll('.nurse-city-filter'), 'city', onChange);
}

/**
 * 單選 chip 群組：點一顆 → 它亮、其他暗 → onChange(data-<key> 的值)。
 * @param {string|NodeListOf<HTMLElement>} chips  選擇器或元素清單
 * @param {string} key  讀取的 data 屬性名（'level' → data-level）
 */
export function bindChipGroup(chips, key, onChange) {
  const list = typeof chips === 'string' ? document.querySelectorAll(chips) : chips;
  list.forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset[key];
      list.forEach((b) => b.classList.toggle('active', b.dataset[key] === v));
      onChange(v);
    });
  });
}

/** 醫院層級 → 層級 badge 的 class 後綴 */
export function levelSlug(lv) {
  return { '醫學中心': 'mc', '區域醫院': 'rg', '地區醫院': 'dt' }[lv] || 'other';
}
