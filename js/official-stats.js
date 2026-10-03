import { C } from './theme.js?v=483b4e6a5f';
// 統計摘要頁「官方參考數據」分頁的圖表與表格。
// 數字本身在 data/official-stats.json（衛福部、勞動部、護理全聯會的公開統計）——更新數字只改 JSON，不必改程式。
// ⚠️ 本檔資料皆為官方公開統計，與使用者匿名分享資料為兩個獨立來源。

// 由 loadData() 從 JSON 填入；對外的 render* 函式都會先等資料載入
let AVG_TENURE, CERT_ALLOWANCE, EDUCATION_DIST_2023, FIRST_TIME_PRACTICE, MOL_NURSE_TREND, MOL_SCOPE_CHANGE_YEAR, MOL_SOURCE, NET_GROWTH, NIGHT_SHIFT_PAY_2023, NIGHT_SHIFT_TREND, OFFICIAL_SOURCE, OFFICIAL_SOURCE_2, OFFICIAL_SOURCE_3, SALARY_BY_LEVEL_TREND, SALARY_BY_REGION_2022, SALARY_BY_TENURE, SALARY_OVERALL, SALARY_PUBLIC_PRIVATE, SALARY_RANGE_2022, TURNOVER_RATE, WORKPLACE_RATIO;
// 勞動部統計範圍在 MOL_SCOPE_CHANGE_YEAR 變更（含部分工時 → 僅全時），圖表在此之前畫虛線
let MOL_DASH_BEFORE_IDX;

let loading = null;
function loadData() {
  loading ||= fetch('data/official-stats.json?v=667755a70e')
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} data/official-stats.json`); return r.json(); })
    .then((d) => {
      ({ AVG_TENURE, CERT_ALLOWANCE, EDUCATION_DIST_2023, FIRST_TIME_PRACTICE, MOL_NURSE_TREND, MOL_SCOPE_CHANGE_YEAR, MOL_SOURCE, NET_GROWTH, NIGHT_SHIFT_PAY_2023, NIGHT_SHIFT_TREND, OFFICIAL_SOURCE, OFFICIAL_SOURCE_2, OFFICIAL_SOURCE_3, SALARY_BY_LEVEL_TREND, SALARY_BY_REGION_2022, SALARY_BY_TENURE, SALARY_OVERALL, SALARY_PUBLIC_PRIVATE, SALARY_RANGE_2022, TURNOVER_RATE, WORKPLACE_RATIO } = d);
      MOL_DASH_BEFORE_IDX = MOL_NURSE_TREND.years.indexOf(MOL_SCOPE_CHANGE_YEAR);
    });
  return loading;
}


// ============== Chart 渲染函式 ==============

const FONT_FAMILY = "'Noto Sans TC', 'Inter', sans-serif";
const COLOR_MC = C.ink;    // 醫學中心（深藍）
const COLOR_RG = C.primaryFill;    // 區域醫院
const COLOR_DT = C.primarySoft;    // 地區醫院

function destroyIfExists(canvas) {
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { font: { family: FONT_FAMILY, size: 12 }, color: C.inkSoft, usePointStyle: true, padding: 14 },
    },
    tooltip: {
      backgroundColor: C.ink,
      titleFont: { family: FONT_FAMILY },
      bodyFont: { family: FONT_FAMILY },
      padding: 10, cornerRadius: 8,
    },
  },
  scales: {
    x: { grid: { display: false }, border: { color: C.border },
         ticks: { color: C.muted, font: { family: FONT_FAMILY, size: 11 } } },
    y: { grid: { color: C.borderSoft }, border: { display: false },
         ticks: { color: C.muted, font: { family: FONT_FAMILY, size: 11 } } },
  },
};

function freshOpts(extra = {}) {
  return JSON.parse(JSON.stringify({ ...baseOpts, ...extra }));
}

const fmtTWD = (v) => 'NT$ ' + Number(v).toLocaleString();

/** 1. 平均年薪 × 年資 × 層級（112 年）— 分組長條 */
export function chartSalaryByTenure(canvas) {
  destroyIfExists(canvas);
  const d = SALARY_BY_TENURE;
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [
        { label: '醫學中心', data: d.medicalCenter, backgroundColor: COLOR_MC, borderRadius: 4 },
        { label: '區域醫院', data: d.regional,      backgroundColor: COLOR_RG, borderRadius: 4 },
        { label: '地區醫院', data: d.district,      backgroundColor: COLOR_DT, borderRadius: 4 },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTWD(ctx.parsed.y)}` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: true,
             ticks: { ...baseOpts.scales.y.ticks,
                      callback: (v) => (v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v) } },
      },
    }),
  });
}

/** 2. 護理師平均年薪歷年趨勢 × 層級 — 折線 */
export function chartSalaryTrend(canvas) {
  destroyIfExists(canvas);
  const d = SALARY_BY_LEVEL_TREND;
  const labels = d.years.map((y) => y + '年');
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '醫學中心', data: d.medicalCenter, borderColor: COLOR_MC, backgroundColor: COLOR_MC + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: COLOR_MC },
        { label: '區域醫院', data: d.regional,      borderColor: COLOR_RG, backgroundColor: COLOR_RG + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: COLOR_RG },
        { label: '地區醫院', data: d.district,      borderColor: COLOR_DT, backgroundColor: COLOR_DT + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: COLOR_DT },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTWD(ctx.parsed.y)}` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false,
             ticks: { ...baseOpts.scales.y.ticks,
                      callback: (v) => (v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v) } },
      },
    }),
  });
}

/** 3. 離職率歷年趨勢 — 折線 */
export function chartTurnoverTrend(canvas) {
  destroyIfExists(canvas);
  const d = TURNOVER_RATE;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.years.map((y) => y + '年'),
      datasets: [{
        label: '離職率',
        data: d.values,
        borderColor: C.dangerFill,
        backgroundColor: C.dangerFill + '33',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: C.dangerFill,
        fill: true,
      }],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `離職率: ${ctx.parsed.y}%` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false, suggestedMin: 8, suggestedMax: 14,
             ticks: { ...baseOpts.scales.y.ticks, callback: (v) => v + '%' } },
      },
    }),
  });
}

/** 4. 夜班費（112 年）× 層級 × 班制 — 分組長條 */
export function chartNightShiftPay(canvas) {
  destroyIfExists(canvas);
  const d = NIGHT_SHIFT_PAY_2023;
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [
        { label: '醫學中心', data: d.medicalCenter, backgroundColor: COLOR_MC, borderRadius: 4 },
        { label: '區域醫院', data: d.regional,      backgroundColor: COLOR_RG, borderRadius: 4 },
        { label: '地區醫院', data: d.district,      backgroundColor: COLOR_DT, borderRadius: 4 },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTWD(ctx.parsed.y)}` } },
      },
      scales: {
        x: { ...baseOpts.scales.x,
             ticks: { ...baseOpts.scales.x.ticks, font: { family: FONT_FAMILY, size: 10 }, maxRotation: 35 } },
        y: { ...baseOpts.scales.y, beginAtZero: true,
             ticks: { ...baseOpts.scales.y.ticks, callback: (v) => v.toLocaleString() } },
      },
    }),
  });
}

/** 5. 專業證照津貼歷年趨勢 — 折線 */
export function chartCertAllowance(canvas) {
  destroyIfExists(canvas);
  const d = CERT_ALLOWANCE;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.years.map((y) => y + '年'),
      datasets: [
        { label: '護理師', data: d.nurse,     borderColor: COLOR_RG, backgroundColor: COLOR_RG + '22',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: COLOR_RG, fill: false },
        { label: '護士',   data: d.assistant, borderColor: C.warning, backgroundColor: C.warning + '22',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: C.warning, fill: false },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTWD(ctx.parsed.y)}/月` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false, suggestedMin: 2500,
             ticks: { ...baseOpts.scales.y.ticks, callback: (v) => v.toLocaleString() } },
      },
    }),
  });
}

/** 6. 教育程度分布（甜甜圈） */
export function chartEducation(canvas) {
  destroyIfExists(canvas);
  const d = EDUCATION_DIST_2023;
  const colors = [C.grayFill, C.primarySoft, C.primaryFill, C.ink, C.navyDeep];
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: colors,
      borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right',
          labels: { font: { family: FONT_FAMILY, size: 12 }, color: C.inkSoft, usePointStyle: true, padding: 10 } },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } },
      },
    },
  });
}

/** 渲染 4 個 KPI 數值（給上方卡片用） */
export async function renderOfficialKPI() {
  await loadData();
  const lastIdx = SALARY_OVERALL.years.length - 1;
  const latest = {
    salary:    SALARY_OVERALL.nurse[lastIdx],
    nightSm:   NIGHT_SHIFT_TREND.threeShiftFixedSmall[lastIdx], // 三班固定小夜
    nightLg:   NIGHT_SHIFT_TREND.threeShiftFixedLarge[lastIdx], // 三班固定大夜
    cert:      CERT_ALLOWANCE.nurse[lastIdx],
  };
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  set('off-kpi-salary',
    `${(latest.salary / 10000).toFixed(0)}<span class="kpi-unit">萬/年</span>`);
  set('off-kpi-night-sm',
    `${latest.nightSm.toLocaleString()}<span class="kpi-unit">元/班</span>`);
  set('off-kpi-night-lg',
    `${latest.nightLg.toLocaleString()}<span class="kpi-unit">元/班</span>`);
  set('off-kpi-cert',
    `${latest.cert.toLocaleString()}<span class="kpi-unit">元/月</span>`);
}

/** 公立 vs 私立 護理師平均年薪 — 折線（兩條線） */
export function chartPublicPrivate(canvas) {
  destroyIfExists(canvas);
  const d = SALARY_PUBLIC_PRIVATE;
  const labels = d.years.map((y) => y + '年');
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '公立醫院 · 護理師', data: d.publicNurse, borderColor: C.ink, backgroundColor: C.ink + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: C.ink },
        { label: '私立醫院 · 護理師', data: d.privateNurse, borderColor: C.warning, backgroundColor: C.warning + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: C.warning },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTWD(ctx.parsed.y)}` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false, suggestedMin: 600000,
             ticks: { ...baseOpts.scales.y.ticks,
                      callback: (v) => (v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v) } },
      },
    }),
  });
}

/** 7. 新進人員 3 個月內離職率 範圍 × 層級 — 浮動橫條（min ~ max） */
export function chartNewHireTurnover(canvas) {
  destroyIfExists(canvas);
  const d = NEW_HIRE_TURNOVER_2022;
  // Chart.js floating bar：data 是 [min, max] 配對
  const ranges = d.labels.map((_, i) => [d.min[i], d.max[i]]);
  const colors = [C.ink, C.primaryFill, C.primarySoft];

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [{
        label: '範圍（min ~ max）',
        data: ranges,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.55,
      }],
    },
    options: freshOpts({
      indexAxis: 'y',
      plugins: {
        ...baseOpts.plugins,
        legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const [min, max] = ctx.parsed._custom
                ? [ctx.parsed._custom.min, ctx.parsed._custom.max]
                : [ctx.parsed.x, ctx.raw[1]];
              const mi = Array.isArray(ctx.raw) ? ctx.raw[0] : min;
              const ma = Array.isArray(ctx.raw) ? ctx.raw[1] : max;
              return `${mi}% ~ ${ma}%（差距 ${(ma - mi).toFixed(1)} %）`;
            },
          },
        },
      },
      scales: {
        x: { ...baseOpts.scales.x, beginAtZero: true, max: 85,
             ticks: { ...baseOpts.scales.x.ticks, callback: (v) => v + '%' } },
        y: baseOpts.scales.y,
      },
    }),
  });
}

/** 渲染 111 年薪資範圍表格 */
export async function renderSalaryRangeTable(containerEl) {
  await loadData();
  if (!containerEl) return;
  const data = SALARY_RANGE_2022;
  const fmtMoney = (n) => n.toLocaleString();
  const tier = (entry) => {
    const u = entry.unit === '月' ? '/月' : '/年';
    return `<div class="off-money-avg">${fmtMoney(entry.avg)}<span class="off-money-unit">${u}</span></div>
            <div class="off-money-range">${fmtMoney(entry.min)} ~ ${fmtMoney(entry.max)}</div>`;
  };
  const levels = Object.keys(data);
  containerEl.innerHTML = `
    <div class="off-table-wrap">
      <table class="off-salary-table">
        <thead>
          <tr>
            <th>醫院層級</th>
            <th>1 年以內<small>（月薪）</small></th>
            <th>1 ~ 5 年<small>（年薪）</small></th>
            <th>5 年以上<small>（年薪）</small></th>
          </tr>
        </thead>
        <tbody>
          ${levels.map((lv) => `
            <tr>
              <th>${lv}</th>
              <td>${tier(data[lv].newcomer)}</td>
              <td>${tier(data[lv].junior)}</td>
              <td>${tier(data[lv].senior)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
// 來源 3 圖表（114 年護理人力監測指標）
// ============================================================

/** 8. 護理工作職場人數分布比例 — 雙 Y 軸折線（醫院 vs 其他差距大） */
export function chartWorkplaceRatio(canvas) {
  destroyIfExists(canvas);
  const d = WORKPLACE_RATIO;
  const labels = d.years.map((y) => y + '年');
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        // 左軸 (8-20%)：其他三類
        { label: '診所',  data: d.clinic,   borderColor: C.success, backgroundColor: C.success + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: C.success,
          yAxisID: 'yLeft', fill: false },
        { label: '長照',  data: d.longTerm, borderColor: C.warning, backgroundColor: C.warning + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: C.warning,
          yAxisID: 'yLeft', fill: false },
        { label: '其他',  data: d.other,    borderColor: C.purple, backgroundColor: C.purple + '33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: C.purple,
          yAxisID: 'yLeft', fill: false },
        // 右軸 (60-70%)：醫院
        { label: '醫院',  data: d.hospital, borderColor: C.ink, backgroundColor: C.ink + '22',
          tension: 0.3, borderWidth: 3, pointRadius: 5, pointBackgroundColor: C.ink,
          yAxisID: 'yRight', fill: false, borderDash: [] },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip, mode: 'index', intersect: false,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: baseOpts.scales.x,
        yLeft:  { type: 'linear', position: 'left',
                  title: { display: true, text: '其他場域 (%)', color: C.inkSoft,
                           font: { family: FONT_FAMILY, size: 11 } },
                  beginAtZero: false, suggestedMin: 8, suggestedMax: 20,
                  grid: { color: C.borderSoft }, border: { display: false },
                  ticks: { color: C.muted, font: { family: FONT_FAMILY, size: 11 },
                           callback: (v) => v + '%' } },
        yRight: { type: 'linear', position: 'right',
                  title: { display: true, text: '醫院 (%)', color: C.ink,
                           font: { family: FONT_FAMILY, size: 11, weight: '600' } },
                  beginAtZero: false, suggestedMin: 60, suggestedMax: 68,
                  grid: { drawOnChartArea: false }, border: { display: false },
                  ticks: { color: C.ink, font: { family: FONT_FAMILY, size: 11 },
                           callback: (v) => v + '%' } },
      },
    }),
  });
}

/** 9. 執業會員平均護理工作年資 — 折線（顯示老化趨勢） */
export function chartAvgTenure(canvas) {
  destroyIfExists(canvas);
  const d = AVG_TENURE;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.years.map((y) => y + '年'),
      datasets: [{
        label: '平均年資',
        data: d.values,
        borderColor: C.purple,
        backgroundColor: C.purple + '33',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: C.purple, fill: true,
      }],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `平均年資: ${ctx.parsed.y} 年` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false, suggestedMin: 11, suggestedMax: 16,
             ticks: { ...baseOpts.scales.y.ticks, callback: (v) => v + ' 年' } },
      },
    }),
  });
}

/** 10. 近十年首次執業人數 — 折線 */
export function chartFirstTimePractice(canvas) {
  destroyIfExists(canvas);
  const d = FIRST_TIME_PRACTICE;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.years.map((y) => y + '年'),
      datasets: [{
        label: '首次執業人數',
        data: d.values,
        borderColor: C.primaryFill,
        backgroundColor: C.primaryFill + '33',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: C.primaryFill, fill: true,
      }],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins, legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString()} 人` } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false, suggestedMin: 7000, suggestedMax: 8800,
             ticks: { ...baseOpts.scales.y.ticks, callback: (v) => v.toLocaleString() } },
      },
    }),
  });
}

/** 11. 執業會員淨增加人數及成長率 — 組合圖（bar + line 雙 Y 軸） */
export function chartNetGrowth(canvas) {
  destroyIfExists(canvas);
  const d = NET_GROWTH;
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.years.map((y) => y + '年'),
      datasets: [
        // order 越小越晚畫（會在上層）：線設 0、bar 設 1，確保線不被 bar 蓋住
        { type: 'line', label: '成長率 (%)', data: d.growthRate,
          borderColor: C.dangerFill, backgroundColor: C.dangerFill + '33',
          borderWidth: 2.5, tension: 0.3, pointRadius: 4,
          pointBackgroundColor: C.dangerFill, yAxisID: 'y1', fill: false, order: 0 },
        { type: 'bar', label: '淨增加人數', data: d.netIncrease,
          backgroundColor: C.primarySoft, borderRadius: 6, yAxisID: 'y', order: 1 },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => {
            const v = ctx.parsed.y;
            return ctx.dataset.label.includes('率')
              ? `${ctx.dataset.label}: ${v}%`
              : `${ctx.dataset.label}: ${v.toLocaleString()} 人`;
          } } },
      },
      scales: {
        x: baseOpts.scales.x,
        y:  { type: 'linear', position: 'left', beginAtZero: true,
              grid: { color: C.borderSoft }, border: { display: false },
              ticks: { color: C.muted, font: { family: FONT_FAMILY, size: 11 },
                       callback: (v) => v.toLocaleString() } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, suggestedMax: 4,
              grid: { drawOnChartArea: false }, border: { display: false },
              ticks: { color: C.dangerFill, font: { family: FONT_FAMILY, size: 11 },
                       callback: (v) => v + '%' } },
      },
    }),
  });
}

/** 渲染區域薪資表格（單一地區） */
function regionTableHTML(region) {
  if (!region) return '';
  const fmt = (n) => n.toLocaleString();
  const cell = (entry) => {
    if (!entry) return '<td class="off-empty">—</td>';
    const u = entry.unit === '月' ? '/月' : '/年';
    return `<td>
      <div class="off-money-avg">${fmt(entry.avg)}<span class="off-money-unit">${u}</span></div>
      <div class="off-money-range">${fmt(entry.min)} ~ ${fmt(entry.max)}</div>
    </td>`;
  };
  const lvRow = (label, lv) => {
    if (!lv) return `<tr><th>${label}</th><td colspan="3" class="off-empty">無樣本</td></tr>`;
    return `<tr>
      <th>${label}<small>（${lv.count} 家）</small></th>
      ${cell({ ...lv.newcomer, unit: '月' })}
      ${cell({ ...lv.junior,   unit: '年' })}
      ${cell({ ...lv.senior,   unit: '年' })}
    </tr>`;
  };
  return `
    <div class="off-region-meta">${region.name}　共 ${region.totalHospitals} 家</div>
    <div class="off-table-wrap">
      <table class="off-salary-table">
        <thead>
          <tr>
            <th>醫院層級</th>
            <th>1 年以內<small>（月薪）</small></th>
            <th>1 ~ 5 年<small>（年薪）</small></th>
            <th>5 年以上<small>（年薪）</small></th>
          </tr>
        </thead>
        <tbody>
          ${lvRow('醫學中心', region.medicalCenter)}
          ${lvRow('區域醫院', region.regional)}
          ${lvRow('地區醫院', region.district)}
        </tbody>
      </table>
    </div>
  `;
}

/** 渲染區域薪資 section（含地區 chip 切換） */
export async function renderRegionalSalary(chipContainer, tableContainer) {
  await loadData();
  if (!chipContainer || !tableContainer) return;
  const regions = Object.entries(SALARY_BY_REGION_2022); // [[key, region], ...]
  let activeKey = regions[0][0];

  const renderChips = () => {
    chipContainer.innerHTML = regions.map(([key, r]) => `
      <span class="filter-chip ${key === activeKey ? 'active' : ''}" data-key="${key}">
        ${r.name} <span class="chip-count">${r.totalHospitals}</span>
      </span>
    `).join('');
    chipContainer.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeKey = chip.dataset.key;
        renderChips();
        renderTable();
      });
    });
  };
  const renderTable = () => {
    const region = SALARY_BY_REGION_2022[activeKey];
    tableContainer.innerHTML = regionTableHTML(region);
  };

  renderChips();
  renderTable();
}

/** 渲染來源 A：衛福部 112 年（含 KPI） */
export async function renderOfficialSourceA() {
  await loadData();
  if (typeof Chart === 'undefined') return;
  renderOfficialKPI();
  const byId = (id) => document.getElementById(id);
  if (byId('chart-off-salary-tenure')) chartSalaryByTenure(byId('chart-off-salary-tenure'));
  if (byId('chart-off-salary-trend'))  chartSalaryTrend(byId('chart-off-salary-trend'));
  if (byId('chart-off-pubpri'))        chartPublicPrivate(byId('chart-off-pubpri'));
  if (byId('chart-off-night'))         chartNightShiftPay(byId('chart-off-night'));
  if (byId('chart-off-cert'))          chartCertAllowance(byId('chart-off-cert'));
  if (byId('chart-off-education'))     chartEducation(byId('chart-off-education'));
  if (byId('chart-off-turnover'))      chartTurnoverTrend(byId('chart-off-turnover'));
}

/** 渲染來源 B：護理全聯會 111 年薪資（區域選單） */
export async function renderOfficialSourceB() {
  await loadData();
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  renderRegionalSalary(byId('off-region-chips'), byId('off-region-table'));
}

/** 勞動部小工具：建立單一指標的 8 年折線圖
 *  dashBeforeIdx：傳入年份索引，該索引「之前」(< idx) 的線段用虛線、之後實線 — 用來標示統計範圍變更
 */
function makeMolLineChart(canvas, { data, color, yTitle, tickFmt, tooltipFmt, dashBeforeIdx = MOL_DASH_BEFORE_IDX }) {
  destroyIfExists(canvas);
  const d = MOL_NURSE_TREND;
  const labels = d.years.map((y) => y + ' 年');
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: yTitle, data,
          borderColor: color, backgroundColor: color + '22',
          tension: 0.3, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: color,
          fill: true,
          // 統計範圍變更前的段落用虛線（含部分工時 → 僅全時）
          segment: {
            borderDash: (ctx) => (ctx.p1DataIndex <= dashBeforeIdx - 1 ? [6, 4] : undefined),
          },
        },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => tooltipFmt(ctx.parsed.y) } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false,
             title: { display: true, text: yTitle, color: C.inkSoft,
                      font: { family: FONT_FAMILY, size: 11 } },
             ticks: { ...baseOpts.scales.y.ticks, callback: tickFmt } },
      },
    }),
  });
}

/** 勞動部 — 護理人員 7 月經常性薪資 3 年趨勢 */
export function chartMolSalary(canvas) {
  return makeMolLineChart(canvas, {
    data: MOL_NURSE_TREND.monthlySalary, color: C.primaryFill,
    yTitle: '月薪 (元)',
    tickFmt: (v) => Number(v).toLocaleString(),
    tooltipFmt: (v) => fmtTWD(v) + ' / 月',
  });
}

/** 勞動部 — 護理人員上年全年薪資所得 3 年趨勢 */
export function chartMolIncome(canvas) {
  return makeMolLineChart(canvas, {
    data: MOL_NURSE_TREND.annualIncome, color: C.ink,
    yTitle: '全年所得 (萬元)',
    tickFmt: (v) => (v / 10000).toFixed(0) + ' 萬',
    tooltipFmt: (v) => (v / 10000).toFixed(1) + ' 萬元',
  });
}

/** 勞動部 — 護理人員受僱人數 3 年趨勢 */
export function chartMolHeadcount(canvas) {
  return makeMolLineChart(canvas, {
    data: MOL_NURSE_TREND.headcount, color: C.success,
    yTitle: '受僱人數',
    tickFmt: (v) => (v / 1000).toFixed(0) + ' 千',
    tooltipFmt: (v) => Number(v).toLocaleString() + ' 人',
  });
}

/** 渲染來源 D：勞動部 114 年職類別薪資調查 — 3 個 KPI + 3 條折線 */
export async function renderOfficialSourceD() {
  await loadData();
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  const d = MOL_NURSE_TREND;
  const lastIdx = d.years.length - 1;
  const setHtml = (id, html) => { const el = byId(id); if (el) el.innerHTML = html; };

  setHtml('off-mol-kpi-salary',
    `<strong>${Number(d.monthlySalary[lastIdx]).toLocaleString()}</strong> <span class="kpi-unit">元</span>`);
  setHtml('off-mol-kpi-income',
    `<strong>${(d.annualIncome[lastIdx] / 10000).toFixed(1)}</strong> <span class="kpi-unit">萬元</span>`);
  setHtml('off-mol-kpi-headcount',
    `<strong>${Number(d.headcount[lastIdx]).toLocaleString()}</strong> <span class="kpi-unit">人</span>`);

  if (byId('chart-off-mol-salary'))    chartMolSalary(byId('chart-off-mol-salary'));
  if (byId('chart-off-mol-income'))    chartMolIncome(byId('chart-off-mol-income'));
  if (byId('chart-off-mol-headcount')) chartMolHeadcount(byId('chart-off-mol-headcount'));
}

/** 渲染來源 C：護理全聯會 114 年人力監測指標 */
export async function renderOfficialSourceC() {
  await loadData();
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  if (byId('chart-off-workplace'))  chartWorkplaceRatio(byId('chart-off-workplace'));
  if (byId('chart-off-tenure'))     chartAvgTenure(byId('chart-off-tenure'));
  if (byId('chart-off-firsttime'))  chartFirstTimePractice(byId('chart-off-firsttime'));
  if (byId('chart-off-netgrowth'))  chartNetGrowth(byId('chart-off-netgrowth'));
}

/** 入口：一次渲染所有官方圖表（如果不用 sub-tab 切換） */
export async function renderAllOfficial() {
  await loadData();
  renderOfficialSourceA();
  renderOfficialSourceB();
  renderOfficialSourceC();
  renderOfficialSourceD();
}
