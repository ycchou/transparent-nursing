// Chart.js 視覺化封裝
import { CATEGORIES } from './config.js?v=b9c376e5bf';

const FONT_FAMILY = "-apple-system,'PingFang TC','Microsoft JhengHei', 'Inter', sans-serif";
const PALETTE = ['#2E86AB', '#06A77D', '#E63946', '#F4A261', '#9D4EDD', '#A8DADC', '#1D3557', '#46557A'];

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { font: { family: FONT_FAMILY, size: 12 }, color: '#46557A', usePointStyle: true, padding: 14 },
    },
    tooltip: {
      backgroundColor: '#1D3557', titleFont: { family: FONT_FAMILY }, bodyFont: { family: FONT_FAMILY },
      padding: 10, cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false }, border: { color: '#E5E9F0' },
      ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 } },
    },
    y: {
      grid: { color: '#F1F3F7' }, border: { display: false },
      ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 } },
    },
  },
};

function freshOpts(extra = {}) {
  return JSON.parse(JSON.stringify({ ...baseOpts, ...extra }));
}

function destroyIfExists(canvas) {
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

/** 1. 各類別投稿數（甜甜圈圖） */
export function chartCategoryDistribution(canvas, byCategory) {
  destroyIfExists(canvas);
  const labels = CATEGORIES.map((c) => c.name);
  const data = CATEGORIES.map((c) => byCategory[c.slug] || 0);
  const colors = CATEGORIES.map((c) => c.color);
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: FONT_FAMILY, size: 12 }, color: '#46557A', usePointStyle: true, padding: 10 },
        },
        tooltip: baseOpts.plugins.tooltip,
      },
    },
  });
}

/** 2. 機構類別 × 類別 分布（堆疊長條） */
export function chartInstitutionStacked(canvas, rows) {
  destroyIfExists(canvas);
  const institutionTypes = ['醫學中心', '區域醫院', '地區醫院', '診所'];
  const datasets = CATEGORIES.map((cat, i) => ({
    label: cat.name,
    data: institutionTypes.map((t) => rows.filter((r) => r._category === cat.slug && r.institutionType === t).length),
    backgroundColor: cat.color,
    borderRadius: 6,
  }));
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: institutionTypes, datasets },
    options: freshOpts({
      scales: {
        x: { ...baseOpts.scales.x, stacked: true },
        y: { ...baseOpts.scales.y, stacked: true, beginAtZero: true, ticks: { ...baseOpts.scales.y.ticks, precision: 0 } },
      },
    }),
  });
}

/** 3. 工時分布（直方） */
export function chartHoursHistogram(canvas, rows) {
  destroyIfExists(canvas);
  const buckets = ['35-40', '40-45', '45-50', '50-55', '55-60', '60+'];
  const data = buckets.map((b) => rows.filter((r) => r.weeklyHours === b).length);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets,
      datasets: [{
        label: '回應數',
        data,
        backgroundColor: buckets.map((b, i) =>
          (b === '55-60' || b === '60+') ? '#E63946' : (b === '50-55' ? '#F4A261' : '#2E86AB')
        ),
        borderRadius: 6,
      }],
    },
    options: freshOpts({
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: true, ticks: { ...baseOpts.scales.y.ticks, precision: 0 } },
      },
    }),
  });
}

/** 4. 加班費合規（橫條圖） */
export function chartOvertimePolicy(canvas, rows) {
  destroyIfExists(canvas);
  const opts = ['一律給', '合理範圍給', '主管判斷', '一律不給'];
  const colorMap = ['#06A77D', '#2E86AB', '#F4A261', '#E63946'];
  const data = opts.map((o) => rows.filter((r) => r.overtimePolicy === o).length);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: opts,
      datasets: [{ label: '回應數', data, backgroundColor: colorMap, borderRadius: 6 }],
    },
    options: freshOpts({
      indexAxis: 'y',
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: { ...baseOpts.scales.x, beginAtZero: true, ticks: { ...baseOpts.scales.x.ticks, precision: 0 } },
        y: baseOpts.scales.y,
      },
    }),
  });
}

/** 5. 推薦指數分布（柱狀；1=非常不推薦 ~ 5=非常推薦） */
export function chartRecommend(canvas, rows) {
  destroyIfExists(canvas);
  const labels = ['1 非常不推薦', '2 不推薦', '3 保留', '4 推薦', '5 非常推薦'];
  const colors = ['#991B1B', '#E63946', '#F4A261', '#2E86AB', '#06A77D'];
  const data = [1, 2, 3, 4, 5].map((v) => rows.filter((r) => Number(r.recommendIndex) === v).length);
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6 }] },
    options: freshOpts({
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: true, ticks: { ...baseOpts.scales.y.ticks, precision: 0 } },
      },
    }),
  });
}

/** 7. 地點分布（橫條圖，按筆數降冪） */
export function chartLocationDistribution(canvas, rows) {
  destroyIfExists(canvas);
  const counts = {};
  rows.forEach((r) => {
    if (r.location) counts[r.location] = (counts[r.location] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([loc]) => loc);
  const data = sorted.map(([, c]) => c);

  // 漸層色：筆數最多者最深，依序變淺
  const max = Math.max(...data, 1);
  const colors = data.map((v) => {
    const ratio = v / max;
    if (ratio > 0.66) return '#2E86AB';
    if (ratio > 0.33) return '#5BA8C6';
    return '#A8DADC';
  });

  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: '筆數', data, backgroundColor: colors, borderRadius: 6 }] },
    options: freshOpts({
      indexAxis: 'y',
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: { ...baseOpts.scales.x, beginAtZero: true,
             ticks: { ...baseOpts.scales.x.ticks, precision: 0 } },
        y: baseOpts.scales.y,
      },
    }),
  });
}

/** 計算四分位數（線性插值法）*/
function computeQuartiles(sortedAsc) {
  if (!sortedAsc || !sortedAsc.length) return null;
  const n = sortedAsc.length;
  const percentile = (p) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
  };
  return {
    min: sortedAsc[0],
    q1: percentile(0.25),
    q2: percentile(0.5),
    q3: percentile(0.75),
    max: sortedAsc[n - 1],
    mean: sortedAsc.reduce((a, b) => a + b, 0) / n,
    n,
  };
}

/** 把連續數值對應到 category x-axis 的 pixel 位置 */
function bucketValueToPixel(value, xScale, buckets) {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const isLast = i === buckets.length - 1;
    const inThis = isLast ? value >= b.min : (value >= b.min && value < b.max);
    if (!inThis) continue;
    const center = xScale.getPixelForValue(i);
    const prevCenter = i > 0 ? xScale.getPixelForValue(i - 1) : center - (xScale.getPixelForValue(1) - center);
    const nextCenter = i < buckets.length - 1 ? xScale.getPixelForValue(i + 1) : center + (center - prevCenter);
    const bucketWidth = nextCenter - center;
    const bucketSpan = b.max - b.min;
    const clamped = Math.min(Math.max(value, b.min), b.max);
    const frac = (clamped - b.min) / bucketSpan;
    return center + (frac - 0.5) * bucketWidth;
  }
  return null;
}

/** 8. 年薪分布（直方圖，單位：萬元）+ 四分位虛線 + 統計面板 */
export function chartSalaryDistribution(canvas, rows, statsEl) {
  destroyIfExists(canvas);
  const buckets = [
    { label: '< 60',   min: 0,   max: 60 },
    { label: '60-70',  min: 60,  max: 70 },
    { label: '70-80',  min: 70,  max: 80 },
    { label: '80-90',  min: 80,  max: 90 },
    { label: '90-100', min: 90,  max: 100 },
    { label: '100-110', min: 100, max: 110 },
    { label: '110-120', min: 110, max: 120 },
    { label: '120+',   min: 120, max: 200 },
  ];

  // 蒐集有效薪資並排序
  const salaries = rows
    .map((r) => Number(r.annualSalary))
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  const stats = computeQuartiles(salaries);

  // 各 bucket 計數（最後一個 bucket 是 >=120）
  const data = buckets.map((b, i) => {
    const isLast = i === buckets.length - 1;
    return salaries.filter((s) => isLast ? s >= b.min : (s >= b.min && s < b.max)).length;
  });

  const colors = ['#E63946', '#F4A261', '#F4A261', '#F4C84C',
                  '#2E86AB', '#5BA8C6', '#06A77D', '#06A77D'];

  // 自訂 plugin：在 chart 上畫 Q1 / 中位數 / Q3 三條虛線
  // label 靠近時（範圍收窄）自動把 Q1 / Q3 上推到第二排避免重疊
  const quartilePlugin = {
    id: 'quartileLines',
    afterDatasetsDraw(chart) {
      if (!stats) return;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      const q1x = bucketValueToPixel(stats.q1, scales.x, buckets);
      const q2x = bucketValueToPixel(stats.q2, scales.x, buckets);
      const q3x = bucketValueToPixel(stats.q3, scales.x, buckets);

      // 標籤寬度約 50-60px，距離 < 60px 就視為會重疊
      const THRESHOLD = 60;
      const q1Close = (q1x != null && q2x != null) && (q2x - q1x) < THRESHOLD;
      const q3Close = (q2x != null && q3x != null) && (q3x - q2x) < THRESHOLD;

      const lines = [
        { label: 'Q1',    value: stats.q1, color: '#5BA8C6', x: q1x, lifted: q1Close },
        { label: '中位數', value: stats.q2, color: '#1D3557', x: q2x, lifted: false },
        { label: 'Q3',    value: stats.q3, color: '#5BA8C6', x: q3x, lifted: q3Close },
      ];

      lines.forEach(({ label, value, color, x, lifted }) => {
        if (x == null) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = label === '中位數' ? 2 : 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label 在上方；太近時 Q1/Q3 上推 14px 避免疊到中位數
        ctx.fillStyle = color;
        ctx.font = `${label === '中位數' ? '700' : '600'} 11px -apple-system,'PingFang TC','Microsoft JhengHei', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelY = lifted ? chartArea.top - 16 : chartArea.top - 2;
        ctx.fillText(`${label} ${value.toFixed(1)}`, x, labelY);
        ctx.restore();
      });
    },
  };

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: buckets.map((b) => b.label),
            datasets: [{ label: '筆數', data, backgroundColor: colors, borderRadius: 6 }] },
    options: freshOpts({
      layout: { padding: { top: 40 } }, // 給虛線標籤留空間（含上推錯位的第二排）
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: true,
             ticks: { ...baseOpts.scales.y.ticks, precision: 0 } },
      },
    }),
    plugins: [quartilePlugin],
  });

  // 更新統計面板 HTML
  if (statsEl) {
    if (stats) {
      statsEl.innerHTML = `
        <div><div class="ss-label">Q1</div><div class="ss-value">${stats.q1.toFixed(1)}<span class="ss-unit">萬</span></div></div>
        <div><div class="ss-label">中位數</div><div class="ss-value" style="color:var(--primary);">${stats.q2.toFixed(1)}<span class="ss-unit">萬</span></div></div>
        <div><div class="ss-label">Q3</div><div class="ss-value">${stats.q3.toFixed(1)}<span class="ss-unit">萬</span></div></div>
        <div><div class="ss-label">平均</div><div class="ss-value">${stats.mean.toFixed(1)}<span class="ss-unit">萬</span></div></div>
      `;
      statsEl.classList.remove('empty');
    } else {
      statsEl.innerHTML = '<div class="ss-empty">尚無有效薪資資料</div>';
      statsEl.classList.add('empty');
    }
  }

  return chart;
}

/** 9. 各類別工作氣氛平均（雷達/長條） */
export function chartAtmosphereByCategory(canvas, rows) {
  destroyIfExists(canvas);
  const data = CATEGORIES.map((cat) => {
    const set = rows.filter((r) => r._category === cat.slug && Number(r.workAtmosphere));
    if (!set.length) return 0;
    return set.reduce((a, b) => a + Number(b.workAtmosphere), 0) / set.length;
  });
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: CATEGORIES.map((c) => c.name),
      datasets: [{
        label: '平均（1-5）',
        data: data.map((v) => Number(v.toFixed(2))),
        backgroundColor: CATEGORIES.map((c) => c.color),
        borderRadius: 6,
      }],
    },
    options: freshOpts({
      plugins: { ...baseOpts.plugins, legend: { display: false } },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: true, max: 5,
             ticks: { ...baseOpts.scales.y.ticks, stepSize: 1 } },
      },
    }),
  });
}
