// 醫院財務・共用視圖工具
//
// 供「醫院財務」頁（financials.js）與「機構總覽」頁（hospital.js）共用：
//   - 載入 data/hospital-financials.json，以 code 索引
//   - 數值解析/格式化（値是字串，如 "7.08"、"-0.31%"）
//   - renderFinancialTrendChart：Chart.js 財務趨勢折線圖
//
// 資料結構：
//   { fields:{ F1:{title,rankTitle,unit}, ... }, hospitals:[{ code, name, shortName,
//     rows:[{ YEAR, HOSP_CNT_TYPNAM, F1Val,F1Rank, F2Val,F2Rank, F3Val,F3Rank,
//             F5Val, F6Val, F7Val, F8Val }] }] }

const DATA_URL = 'data/hospital-financials.json?v=00ef43bb8c';

let _doc = null;
let _byCode = null;
let _loading = null;

function startLoad() {
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const r = await fetch(DATA_URL, { cache: 'default' });
      if (!r.ok) return;
      _doc = await r.json();
      _byCode = new Map();
      (_doc.hospitals || []).forEach((h) => _byCode.set(h.code, h));
    } catch { /* 靜默：頁面自行處理無資料 */ }
  })();
  return _loading;
}

export function ensureFinancialsLoaded() {
  return startLoad();
}

export function getFinancials(code) {
  return (_byCode && _byCode.get(code)) || null;
}

export function getAllFinancials() {
  return (_doc && _doc.hospitals) || [];
}

export function getFinancialFields() {
  return (_doc && _doc.fields) || {};
}

// 單院財務（機構總覽用）：只載入 data/financials/{code}.json（含 fields+rows），
// 不必整包下載 hospital-financials.json。回傳 { fields, rows, … } 或 null。
const _codeCache = new Map();
export async function loadFinancialsHospital(code) {
  if (_codeCache.has(code)) return _codeCache.get(code);
  try {
    const r = await fetch(`data/financials/${code}.json?v=00ef43bb8c`, { cache: 'default' });
    const d = r.ok ? await r.json() : null;
    _codeCache.set(code, d);
    return d;
  } catch {
    _codeCache.set(code, null);
    return null;
  }
}

// "7.08" / "-0.31%" / "1,234" → number（無法解析回 null）
export function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[%,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// 依欄位單位格式化顯示字串
export function formatVal(fieldKey, val, fields) {
  if (val == null || val === '') return '—';
  const unit = (fields && fields[fieldKey] && fields[fieldKey].unit) || '';
  if (unit === '百分比') return String(val);              // F5Val 已含 "%"
  const n = parseNum(val);
  if (n == null) return String(val);
  if (unit === '億元') return `${n.toFixed(2)} 億`;
  if (unit === '人') return n.toFixed(1);                  // F8 護病比（每護理師病人數）
  if (unit === '人數') return `${Math.round(n).toLocaleString()} 人`; // 醫師數
  if (unit === '床') return `${Math.round(n).toLocaleString()} 床`;   // 病床數
  if (unit === '億點') return `${n.toFixed(2)} 億點`;      // 醫療點數
  if (unit === '萬件') return `${n.toFixed(1)} 萬件`;      // 門診/住診件數
  if (unit === '萬日') return `${n.toFixed(1)} 萬日`;      // 住院天數
  return String(val);
}

// 正負值上色 class（獲利綠、虧損紅；沿用站上 status class）
export function signClass(val) {
  const n = parseNum(val);
  if (n == null) return '';
  if (n > 0) return 'status-safe';
  if (n < 0) return 'status-danger';
  return '';
}

export function formatRocYear(y) {
  return `${y}年`;
}

const SERIES_COLORS = {
  F1: '#2E86AB', // 醫務本業
  F2: '#9D4EDD', // 非醫務
  F3: '#06A77D', // 整體獲利
  F5: '#E63946', // 醫務利益率
  F6: '#F4A261', // 醫務收入
  F7: '#6B7C93', // 醫務成本
  F8: '#14B8A6', // 護病比
  DOCTOR: '#2E86AB',  // 醫師數
  BED: '#F4A261',     // 病床數
  OPD_CNT: '#06A77D', // 門診件數
  IPD_CNT: '#9D4EDD', // 住診件數
  IPD_DAY: '#E63946', // 住院天數
  PT_ALL: '#6B7C93',  // 門住合計點數
  OPD_PT: '#14B8A6',  // 門診點數
  IPD_PT: '#E76F51',  // 住診點數
};

/**
 * 財務趨勢折線圖
 * @param {HTMLCanvasElement} canvas
 * @param {Object} hospital  財務資料的單一醫院物件（含 rows）
 * @param {Object} [opts]
 * @param {string[]} [opts.metrics=['F1','F2','F3']] 要畫的欄位（同單位為佳）
 * @param {Object} fields  欄位 metadata（getFinancialFields()）
 */
export function renderFinancialTrendChart(canvas, hospital, fields, opts = {}) {
  if (!canvas || typeof Chart === 'undefined' || !hospital) return;
  const metrics = opts.metrics || ['F1', 'F2', 'F3'];

  // annotation plugin（畫 0 基準線；沒有也無妨）
  if (window['chartjs-plugin-annotation'] && typeof Chart.register === 'function') {
    try { Chart.register(window['chartjs-plugin-annotation']); } catch {}
  }
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const rows = [...(hospital.rows || [])].sort((a, b) => Number(a.YEAR) - Number(b.YEAR));
  const labels = rows.map((r) => formatRocYear(r.YEAR));
  const datasets = metrics.map((m) => ({
    label: (fields[m] && fields[m].title) || m,
    data: rows.map((r) => parseNum(r[`${m}Val`])),
    borderColor: SERIES_COLORS[m] || '#2E86AB',
    backgroundColor: (SERIES_COLORS[m] || '#2E86AB') + '22',
    tension: 0.25,
    borderWidth: m === 'F3' ? 2.6 : 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    spanGaps: true,
  }));

  const unit = (fields[metrics[0]] && fields[metrics[0]].unit) || '';
  // tooltip 數值後綴 / y 軸標題（依單位）
  const unitSuffix = { '百分比': '%', '億元': ' 億', '人數': ' 人', '床': ' 床', '億點': ' 億點', '萬件': ' 萬件', '萬日': ' 萬日', '人': '' }[unit] || '';
  const axisTitle = unit === '百分比' ? '百分比 (%)'
    : (unit === '億元' ? '金額（億元）' : (unit ? unit : ''));
  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: "'Noto Sans TC', sans-serif", size: 12 }, color: '#46557A', usePointStyle: true, padding: 12 },
        },
        tooltip: {
          backgroundColor: '#1D3557', padding: 10, cornerRadius: 8,
          titleFont: { family: "'Noto Sans TC', sans-serif" }, bodyFont: { family: "'Noto Sans TC', sans-serif" },
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (v == null) return null;
              return `${ctx.dataset.label}: ${v}${unitSuffix}`;
            },
          },
        },
        annotation: { annotations: {
          zero: { type: 'line', yMin: 0, yMax: 0, borderColor: 'rgba(107,124,147,0.45)', borderWidth: 1, borderDash: [5, 4] },
        } },
      },
      scales: {
        x: { grid: { display: false }, border: { color: '#E5E9F0' }, ticks: { color: '#6B7C93', font: { family: "'Noto Sans TC', sans-serif", size: 11 } } },
        y: {
          title: { display: true, text: axisTitle, color: '#46557A', font: { family: "'Noto Sans TC', sans-serif", size: 12 } },
          grid: { color: '#F1F3F7' }, border: { display: false },
          ticks: { color: '#6B7C93', font: { family: "'Noto Sans TC', sans-serif", size: 11 } },
        },
      },
    },
  });
}
