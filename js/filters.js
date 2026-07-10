// 篩選器：縣市、機構類別、推薦指數、工時、加班費 + 機構名稱搜尋
import { COMMON_FIELDS } from './config.js?v=b9c376e5bf';
import { getShort as getHospitalShort } from './hospital-shortname.js?v=b9c376e5bf';

const INSTITUTION_TYPES = ['醫學中心', '區域醫院', '地區醫院', '診所', '其他'];
const RECOMMEND_LABELS = { 5: '非常推薦', 4: '推薦', 3: '保留', 2: '不推薦', 1: '非常不推薦' };
const OVERTIME_OPTIONS = ['一律給', '合理範圍給', '主管判斷', '一律不給'];
const HOURS_OPTIONS    = ['35-40', '40-45', '45-50', '50-55', '55-60', '60+'];

// 台灣全部縣市，照地理位置排序（北 → 南 → 東 → 離島）
const LOCATIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣',
  '澎湖縣', '金門縣', '連江縣',
];

const defaultState = () => ({
  q: '',
  location: new Set(),
  institutionType: new Set(),
  weeklyHours: new Set(),
  overtimePolicy: new Set(),
  recommendIndex: new Set(),
});

export function createFilterState() {
  return defaultState();
}

/**
 * 渲染篩選面板
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Function} onChange
 */
export function renderFilters(container, state, onChange) {
  container.innerHTML = `
    <div class="filter-panel">
      <div class="filter-section">
        <h4>關鍵字</h4>
        <input id="filter-q" type="search" placeholder="搜尋機構、單位、短評、序號 (#42)..."
          style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.92rem;font-family:inherit;color:var(--ink);"
          value="${state.q || ''}" />
      </div>

      ${chipGroup('location', '地點', LOCATIONS, state)}
      ${chipGroup('institutionType', '機構類別', INSTITUTION_TYPES, state)}
      ${chipGroup('weeklyHours', '每週工時', HOURS_OPTIONS, state)}
      ${chipGroup('overtimePolicy', '加班費合規', OVERTIME_OPTIONS, state)}
      ${chipGroup('recommendIndex', '推薦指數', [5, 4, 3, 2, 1], state, (v) => RECOMMEND_LABELS[v])}

      <button id="filter-reset" class="btn btn-ghost" style="width:100%;margin-top:8px;">清除全部條件</button>
    </div>
  `;

  // chips
  container.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.key;
      const val = chip.dataset.value;
      const set = state[key];
      // 推薦指數需數字
      const v = key === 'recommendIndex' ? Number(val) : val;
      if (set.has(v)) set.delete(v); else set.add(v);
      chip.classList.toggle('active');
      onChange();
    });
  });

  // search
  const input = container.querySelector('#filter-q');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = input.value.trim();
      onChange();
    }, 200);
  });

  // reset
  container.querySelector('#filter-reset').addEventListener('click', () => {
    Object.assign(state, defaultState());
    renderFilters(container, state, onChange);
    onChange();
  });
}

function chipGroup(key, title, values, state, labelFn) {
  return `
    <div class="filter-section">
      <h4>${title}</h4>
      <div class="filter-options">
        ${values.map((v) => {
          const isOn = state[key].has(key === 'recommendIndex' ? Number(v) : v);
          return `<span class="filter-chip ${isOn ? 'active' : ''}" data-key="${key}" data-value="${v}">${labelFn ? labelFn(v) : v}</span>`;
        }).join('')}
      </div>
    </div>
  `;
}

/** 套用篩選 */
export function applyFilters(rows, state) {
  const q = (state.q || '').toLowerCase();
  return rows.filter((r) => {
    if (state.location && state.location.size && !state.location.has(r.location)) return false;
    if (state.institutionType.size && !state.institutionType.has(r.institutionType)) return false;
    if (state.weeklyHours.size && !state.weeklyHours.has(r.weeklyHours)) return false;
    if (state.overtimePolicy.size && !state.overtimePolicy.has(r.overtimePolicy)) return false;
    if (state.recommendIndex.size && !state.recommendIndex.has(Number(r.recommendIndex))) return false;
    if (q) {
      // 序號比對：支援 "#42" / "42" / "#0042"，需完整等於該筆 _seq
      const seqQuery = q.replace(/^#/, '').trim();
      if (seqQuery && /^\d+$/.test(seqQuery) && Number(seqQuery) === r._seq) {
        return true;
      }
      const short = getHospitalShort(r.institutionName) || '';
      const hay = `${r.institutionName || ''} ${short} ${r.unitName || ''} ${r.comment || ''} ${r.location || ''} #${r._seq || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
