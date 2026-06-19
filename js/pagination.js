// 共用分頁工具：給 platform.html 表格與 violations.html 表格使用
// 每頁預設 100 筆

export const PER_PAGE_DEFAULT = 100;

/**
 * 計算當前頁的切片
 * @param {Array} items
 * @param {number} page  1-based
 * @param {number} perPage
 * @returns {{ items, page, totalPages, total, fromIdx, toIdx, perPage }}
 */
export function pageSlice(items, page, perPage = PER_PAGE_DEFAULT) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.max(1, Math.min(page || 1, totalPages));
  const fromIdx = (safePage - 1) * perPage;
  return {
    items: items.slice(fromIdx, fromIdx + perPage),
    page: safePage,
    totalPages,
    total,
    fromIdx: total ? fromIdx + 1 : 0,
    toIdx: Math.min(fromIdx + perPage, total),
    perPage,
  };
}

/**
 * 渲染分頁列控件
 * - 只有一頁時不顯示
 * - 點上下頁觸發 onPageChange(newPage)
 */
export function renderPagination(container, info, onPageChange) {
  if (!container) return;
  if (!info || info.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="pagination">
      <button class="pg-btn pg-prev" type="button" data-page="${info.page - 1}" ${info.page <= 1 ? 'disabled' : ''}>← 上一頁</button>
      <div class="pg-info">
        <span class="pg-current">${info.page}</span>
        <span class="pg-sep">/</span>
        <span class="pg-total">${info.totalPages}</span>
        <span class="pg-range">第 ${info.fromIdx.toLocaleString()}-${info.toIdx.toLocaleString()} 筆 · 共 ${info.total.toLocaleString()} 筆</span>
      </div>
      <button class="pg-btn pg-next" type="button" data-page="${info.page + 1}" ${info.page >= info.totalPages ? 'disabled' : ''}>下一頁 →</button>
    </div>
  `;
  container.querySelectorAll('.pg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.page);
      if (target >= 1 && target <= info.totalPages) onPageChange(target);
    });
  });
}
