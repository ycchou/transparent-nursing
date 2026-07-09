// 人力監控共用視圖：職類/病床折線圖與單院資料載入。
// 供「人力監控」頁(personnel.js)與「機構總覽」頁(hospital.js)共用，單一來源。
// 資料忠實呈現：未填報(null)不補值，折線圖於該月中斷(spanGaps:false)。

export const CAT_COLORS = ['#2E86AB', '#E63946', '#06A77D', '#1D3557', '#F4A261', '#9D4EDD',
  '#14B8A6', '#FF6B9D', '#F59E0B', '#4F46E5', '#0EA5E9', '#84CC16', '#A855F7'];
export const BED_COLORS = ['#2E86AB', '#E63946', '#9D4EDD', '#F4A261'];
// 預設只顯示「護產」，其餘職類由使用者點圖例自行開啟
export const DEFAULT_ON = new Set(['護產']);

// "10807" -> "108/07"
export function mLabel(m) { return `${parseInt(m.slice(0, 3), 10)}/${m.slice(3)}`; }

export function baseLineCfg(labels, datasets) {
  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, usePointStyle: true } },
        tooltip: { callbacks: { title: (items) => items.length ? `民國 ${items[0].label}` : '' } },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
        // Y 軸不從 0 起：護產等基數大的職類，自動貼合目前可見資料集範圍，讓月變化清楚可辨。
        y: { ticks: { font: { size: 10 } } },
      },
      elements: { line: { tension: 0.25, borderWidth: 2 }, point: { radius: 0, hitRadius: 8 } },
    },
  };
}

// 職類實際人數折線圖；回傳 Chart 實例（呼叫端負責保存/銷毀舊圖）。
export function renderStaffChart(canvas, h, prevChart) {
  if (prevChart) prevChart.destroy();
  const labels = h.months.map(mLabel);
  const datasets = h.categories.map((cat, i) => ({
    label: cat,
    data: h.actual.map((row) => (row ? row[i] : null)),
    borderColor: CAT_COLORS[i % CAT_COLORS.length],
    backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
    hidden: !DEFAULT_ON.has(cat),
  }));
  return new Chart(canvas, baseLineCfg(labels, datasets));
}

// 病床數量折線圖；略過整段皆 0/空的床別。全部無資料時回傳 null（呼叫端顯示提示）。
export function renderBedChart(canvas, h, prevChart) {
  if (prevChart) prevChart.destroy();
  const labels = h.months.map(mLabel);
  const datasets = h.bedTypes.map((bt, i) => {
    const data = h.beds.map((row) => (row ? row[i] : null));
    return {
      label: bt, data,
      borderColor: BED_COLORS[i % BED_COLORS.length], backgroundColor: BED_COLORS[i % BED_COLORS.length],
      _allZero: data.every((v) => v == null || v === 0),
    };
  }).filter((d) => !d._allZero);
  if (datasets.length === 0) return null;
  return new Chart(canvas, baseLineCfg(labels, datasets));
}

// 單院（或院區）資料載入（附快取）。id 可為機構代號，或多院區的 code-院區。
const cache = new Map();
export async function loadPersonnelHospital(id) {
  if (cache.has(id)) return cache.get(id);
  const r = await fetch(`data/personnel/${id}.json?v=27`);
  if (!r.ok) throw new Error(`HTTP ${r.status} personnel/${id}`);
  const d = await r.json();
  cache.set(id, d);
  return d;
}

// 全站人力監控索引：判斷某機構是否有監測資料、以及該代號有哪些院區。
// 回傳 { codes:Set<code>, byCode:Map<code,[entry…]> }（entry 含 id/branch/name/level）。
let indexCache = null;
export async function ensurePersonnelIndex() {
  if (indexCache) return indexCache;
  const r = await fetch('data/personnel-index.json?v=27');
  if (!r.ok) throw new Error(`HTTP ${r.status} personnel-index`);
  const doc = await r.json();
  const byCode = new Map();
  (doc.hospitals || []).forEach((h) => {
    const arr = byCode.get(h.code) || [];
    arr.push(h);
    byCode.set(h.code, arr);
  });
  indexCache = { codes: new Set(byCode.keys()), byCode };
  return indexCache;
}
