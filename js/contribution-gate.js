// Soft Give-to-Get：未貢獻者預設看精簡版資料平台
// localStorage flag-based，刻意可被使用者繞過（清 storage / 無痕視窗）
// 不違反 README「完全匿名、不收 IP/Email/Cookie」承諾 — localStorage 不離開瀏覽器

const STORAGE_KEY = 'tn:contributed';

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
export function isFiltered(filterState) {
  if (!filterState) return false;
  if (filterState.q) return true;
  const sets = ['location', 'institutionType', 'weeklyHours', 'overtimePolicy', 'recommendIndex'];
  return sets.some((k) => filterState[k] && filterState[k].size > 0);
}

// 回傳閘門設定 — 不直接 slice，由 table.js 在 sort 後 slice，
// 這樣使用者切排序欄位時看到的是新排序的前 N 筆。
export function getGate(filterState) {
  if (hasContributed()) {
    return { gated: false, limit: Infinity, isFilteredView: false };
  }
  const filtered = isFiltered(filterState);
  return {
    gated: true,
    limit: filtered ? 5 : 50,
    isFilteredView: filtered,
  };
}
