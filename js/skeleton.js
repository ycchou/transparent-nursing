// 載入骨架：共用 shimmer 佔位，讓資料載入中的頁面版面穩定、視覺一致。
// 樣式見 css/styles.css 的 .skeleton；供機構總覽/護病比/人力監控/財務等頁取代純文字「載入中⋯」。

// 產生 n 條等高 shimmer 橫條（清單/表格列的載入佔位）。
export function skeletonRows(n = 6, { height = 34, gap = 10, pad = 16 } = {}) {
  const bars = Array.from({ length: n })
    .map(() => `<div class="skeleton" style="height:${height}px;margin-bottom:${gap}px;"></div>`)
    .join('');
  return `<div style="padding:${pad}px;">${bars}</div>`;
}
