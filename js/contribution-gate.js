// Soft Give-to-Get：未貢獻者預設看精簡版資料平台
// localStorage flag-based，刻意可被使用者繞過（清 storage / 無痕視窗）
// 不違反 README「完全匿名、不收 IP/Email/Cookie」承諾 — localStorage 不離開瀏覽器

const STORAGE_KEY = 'tn:contributed';

// Soft G2G 限筆數 — 未來想根據實際數據（訪客量 / 填表轉換率）調整就改這裡。
// 改數字不會影響已貢獻者（hasContributed() 在 getGate 早期 return、跳過 limit 計算），
// 也不會讓 tn:contributed / tn:claim_started_at 失效。
export const GATE_LIMITS = Object.freeze({
  none: 80,    // 0 個篩選：landing 預設視圖
  single: 20,  // 1 個篩選：使用者在探索
  multi: 10,   // 2+ 個篩選：鎖定具體查詢
});

export function hasContributed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

export function markContributed() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

export function clearContributed() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// filterState shape 來自 js/filters.js createFilterState():
//   { q, location:Set, institutionType:Set, weeklyHours:Set, overtimePolicy:Set, recommendIndex:Set }
// slug 是上方分頁選的工作場域，'all' 代表全部、其他值代表特定場域 — 也算縮小範圍。
// 每個獨立維度算 1 個篩選項目（同一個 chip 群組內勾多個算 1）。

const CHIP_GROUPS = ['location', 'institutionType', 'weeklyHours', 'overtimePolicy', 'recommendIndex'];

export function countActiveFilters(filterState, slug) {
  let n = 0;
  if (slug && slug !== 'all') n += 1;
  if (filterState && filterState.q) n += 1;
  if (filterState) {
    for (const k of CHIP_GROUPS) {
      if (filterState[k] && filterState[k].size > 0) n += 1;
    }
  }
  return n;
}

export function isFiltered(filterState, slug) {
  return countActiveFilters(filterState, slug) > 0;
}

// 三段式 limit — 數字定義在頂端 GATE_LIMITS
function limitForFilterCount(n) {
  if (n === 0) return GATE_LIMITS.none;
  if (n === 1) return GATE_LIMITS.single;
  return GATE_LIMITS.multi;
}

// 回傳閘門設定 — 不直接 slice，由 table.js 在 sort 後 slice，
// 這樣使用者切排序欄位時看到的是新排序的前 N 筆。
export function getGate(filterState, slug) {
  if (hasContributed()) {
    return { gated: false, limit: Infinity, isFilteredView: false, activeFilterCount: 0 };
  }
  const n = countActiveFilters(filterState, slug);
  return {
    gated: true,
    limit: limitForFilterCount(n),
    isFilteredView: n > 0,
    activeFilterCount: n,
  };
}
