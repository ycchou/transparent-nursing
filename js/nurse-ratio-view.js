// 三班護病比・共用視圖工具
//
// 從 nurse-ratio.js 抽出，供護病比頁與單一機構整合頁（hospital.js）共用：
//   - 衛福部標準 STANDARDS / 三班顏色 COLORS / 合規分類 COMPLIANCE_CLASSES
//   - formatRocMonth / shiftStatus / classifyHospital
//   - renderNurseChart：Chart.js 折線圖 + 標準虛線
//
// 皆為純函式，需要的 months（ROC 年月字串陣列）由呼叫端傳入，不依賴任何全域 state。

// 三班護病比・衛福部公告標準（依醫院層級）
export const STANDARDS = {
  '醫學中心': { day: 6, eve: 9, night: 11 },
  '區域醫院': { day: 7, eve: 11, night: 13 },
  '地區醫院': { day: 10, eve: 13, night: 15 },
};

// 三班顏色（白班藍 / 小夜粉 / 大夜橙）
export const COLORS = {
  day:   { line: '#2E86AB', fill: 'rgba(46,134,171,0.15)' },
  eve:   { line: '#E63946', fill: 'rgba(230,57,70,0.12)' },
  night: { line: '#F4A261', fill: 'rgba(244,162,97,0.15)' },
  std:   'rgba(230, 57, 70, 0.55)',
};

// 合規分類容差 ±5% 與四類標籤/顏色
export const COMPLIANCE_TOLERANCE = 0.05;
export const COMPLIANCE_CLASSES = {
  A: { key: 'A', label: '達標', color: '#06A77D', bg: 'rgba(6,167,125,0.13)' },
  B: { key: 'B', label: '觀察', color: '#F4A261', bg: 'rgba(244,162,97,0.15)' },
  C: { key: 'C', label: '警戒', color: '#E63946', bg: 'rgba(230,57,70,0.13)' },
  N: { key: 'N', label: '未報', color: '#6B7C93', bg: 'rgba(107,124,147,0.10)' },
};

// ROC yyyymm → 顯示字串
export function formatRocMonth(key) {
  const y = key.slice(0, 3);
  const m = parseInt(key.slice(3), 10);
  return `${y}年${m}月`;
}

// 單一班別狀態：'safe' | 'watch' | 'danger' | null
export function shiftStatus(val, std) {
  if (val == null || std == null) return null;
  const upper = std * (1 + COMPLIANCE_TOLERANCE);
  const lower = std * (1 - COMPLIANCE_TOLERANCE);
  if (val > upper) return 'danger';
  if (val >= lower) return 'watch';
  return 'safe';
}

// 醫院合規分類（取最新有資料月份、最壞班別）→ 'A' | 'B' | 'C' | 'N'
export function classifyHospital(hosp, months) {
  const std = STANDARDS[hosp.level];
  if (!std) return 'N';
  let latest = null;
  for (let i = months.length - 1; i >= 0; i--) {
    if (hosp.history[months[i]]) { latest = hosp.history[months[i]]; break; }
  }
  if (!latest) return 'N';
  const statuses = [
    shiftStatus(latest.day, std.day),
    shiftStatus(latest.eve, std.eve),
    shiftStatus(latest.night, std.night),
  ].filter((s) => s != null);
  if (statuses.length === 0) return 'N';
  if (statuses.includes('danger')) return 'C';
  if (statuses.includes('watch')) return 'B';
  return 'A';
}

// Chart.js 折線圖 + 3 條標準虛線
export function renderNurseChart(canvas, hosp, months) {
  if (!canvas || typeof Chart === 'undefined') return;

  // 註冊 annotation plugin（重複註冊無害）
  if (window['chartjs-plugin-annotation'] && typeof Chart.register === 'function') {
    try { Chart.register(window['chartjs-plugin-annotation']); } catch {}
  }

  // Destroy 舊 chart
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const labels = months.map(formatRocMonth);
  const dayData = months.map((m) => hosp.history[m]?.day ?? null);
  const eveData = months.map((m) => hosp.history[m]?.eve ?? null);
  const nightData = months.map((m) => hosp.history[m]?.night ?? null);

  const std = STANDARDS[hosp.level] || {};

  const mkDataset = (label, data, c) => ({
    label,
    data,
    borderColor: c.line,
    backgroundColor: c.fill,
    tension: 0.25,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: c.line,
    spanGaps: true,
  });
  const datasets = [
    mkDataset('白班護病比', dayData, COLORS.day),
    mkDataset('小夜班護病比', eveData, COLORS.eve),
    mkDataset('大夜班護病比', nightData, COLORS.night),
  ];

  // chartjs-plugin-annotation：3 條標準虛線，各帶「白班標準 1:6」等標籤
  const stdAnnotations = {};
  const makeStdLine = (shiftLabel, value) => ({
    type: 'line',
    yMin: value, yMax: value,
    borderColor: COLORS.std,
    borderDash: [8, 4],
    borderWidth: 1.5,
    label: {
      display: true,
      content: `${shiftLabel}標準 1:${value}`,
      position: 'end',
      backgroundColor: 'rgba(255,255,255,0.85)',
      color: '#B22234',
      font: { family: "'Noto Sans TC', sans-serif", size: 10, weight: 'bold' },
      padding: { top: 2, bottom: 2, left: 6, right: 6 },
      yAdjust: -10,
      borderRadius: 4,
    },
  });
  if (std.day) stdAnnotations.stdDay = makeStdLine('白班', std.day);
  if (std.eve) stdAnnotations.stdEve = makeStdLine('小夜', std.eve);
  if (std.night) stdAnnotations.stdNight = makeStdLine('大夜', std.night);

  const tickLimit = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    return Math.max(4, Math.min(months.length, Math.floor(w / 70)));
  };

  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onResize: (chart, size) => {
        const limit = Math.max(4, Math.min(months.length, Math.floor(size.width / 70)));
        chart.options.scales.x.ticks.maxTicksLimit = limit;
      },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Noto Sans TC', sans-serif", size: 12 },
            color: '#46557A',
            usePointStyle: true,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: '#1D3557',
          titleFont: { family: "'Noto Sans TC', sans-serif" },
          bodyFont: { family: "'Noto Sans TC', sans-serif" },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              return v == null ? null : `${ctx.dataset.label}: ${v.toFixed(1)}`;
            },
          },
        },
        annotation: { annotations: stdAnnotations },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: '#E5E9F0' },
          ticks: {
            color: '#6B7C93',
            font: { family: "'Noto Sans TC', sans-serif", size: 10 },
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: tickLimit(),
          },
        },
        y: {
          title: {
            display: true,
            text: '護病比',
            color: '#46557A',
            font: { family: "'Noto Sans TC', sans-serif", size: 12 },
          },
          grid: { color: '#F1F3F7' },
          border: { display: false },
          beginAtZero: false,
          suggestedMin: 4,
          ticks: {
            color: '#6B7C93',
            font: { family: "'Noto Sans TC', sans-serif", size: 11 },
          },
        },
      },
    },
  });
}
