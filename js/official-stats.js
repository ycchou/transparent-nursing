// 官方參考數據：衛福部護理及健康照護司「112 年醫院護理服務量調查」
// 資料來源 PDF：https://www.nurse.org.tw/filecenter/B/8DDC60185347C25058/...
// 公開於：社團法人臺灣護理學會（全聯會）
//
// ⚠️ 本檔案資料皆為官方公開統計，與使用者匿名分享資料為兩個獨立來源。

export const OFFICIAL_SOURCE = {
  title: '112 年醫院護理服務量調查結果',
  publisher: '衛福部護理及健康照護司',
  publishedBy: '社團法人臺灣護理學會（全聯會）',
  pdfUrl: 'https://www.nurse.org.tw/filecenter/B/8DDC60185347C25058/%e8%a1%9b%e7%a6%8f%e9%83%a8112%e5%b9%b4%e9%86%ab%e9%99%a2%e8%ad%b7%e7%90%86%e6%9c%8d%e5%8b%99%e9%87%8f%e8%aa%bf%e6%9f%a5%e7%b5%90%e6%9e%9c.pdf',
  surveyYear: 112,
  surveyedHospitals: 471,
  respondedHospitals: 456,
  responseRate: 96.82,
  surveyPeriod: '113 年 1 月 22 日 ~ 2 月 19 日',
};

// 護理人員離職率（整體）
export const TURNOVER_RATE = {
  years: [108, 110, 111, 112],
  values: [11.12, 10.13, 11.73, 12.61],
  note: '單位：%。109 年因 Covid-19 暫停資料收集。',
};

// 護理人員平均年薪（整體；護理師 vs 護士）
export const SALARY_OVERALL = {
  years: [108, 110, 111, 112],
  nurse: [710805, 676909, 696855, 725480],         // 護理師
  assistant: [639702, 625109, 635998, 661217],     // 護士
  note: '單位：元。109 年因疫情暫停資料收集。',
};

// 護理師平均年薪（依醫院層級，112 年）
export const SALARY_BY_LEVEL_TREND = {
  years: [108, 110, 111, 112],
  medicalCenter: [838053, 835371, 886063, 944621],
  regional:      [731586, 718446, 745517, 786330],
  district:      [683393, 643306, 659354, 684970],
  note: '單位：元。涵蓋護理師（不含護士）。',
};

// ===== 來源 D：勞動部 114 年職類別薪資調查 =====
// 醫療保健業（行業別）→ 護理人員（職類 222090）
// 包含 112/113/114 三年同期數據（每年 7 月底人數、7 月經常性薪資、上年全年薪資所得）
export const MOL_SOURCE = {
  title: '114 年職類別薪資調查',
  publisher: '勞動部',
  queryUrl: 'https://pswst.mol.gov.tw/PSDN/Query/wFrmQuery01.aspx',
  surveyYear: 114,
  industry: '醫療保健業',
  occupation: '護理人員 (222090)',
};

export const MOL_NURSE_TREND = {
  years: [112, 113, 114],
  headcount:    [159469, 160822, 163954],   // 7 月底全時受僱員工人數
  monthlySalary: [49880, 51391, 53882],     // 7 月經常性薪資 (元)
  annualIncome: [722000, 742000, 786000],   // 上年全年薪資所得 (元；72.2 / 74.2 / 78.6 萬)
  // 註：annualIncome 對應「調查當年的上一年」全年所得（即 111/112/113 全年）；
  // 圖表 X 軸用調查年(112-114)以方便三組指標對齊
};

// 護理師平均年薪（公立 vs 私立）— 來源衛福部 112 年調查
export const SALARY_PUBLIC_PRIVATE = {
  years: [108, 110, 111, 112],
  publicNurse:    [760708, 727277, 750904, 825386],
  publicAssist:   [641931, 632904, 666089, 732294],
  privateNurse:   [694843, 662275, 682928, 700878],
  privateAssist:  [639273, 623040, 628823, 659634],
  note: '單位：元。109 年因疫情暫停資料收集。',
};

// 112 年護理師「年資別 × 層級」平均年薪
//「未滿一年」原始為月薪，此處 × 12 估算為「未滿一年的全年化年薪」
export const SALARY_BY_TENURE = {
  labels: ['未滿1年*', '滿1-2年', '滿3-5年', '滿6-10年', '滿11-15年', '滿16-20年', '滿20年+'],
  medicalCenter: [54990 * 12, 796121, 880346, 922839, 968404, 1018009, 1082006],
  regional:      [50932 * 12, 747084, 734565, 761691, 792162, 821817, 860658],
  district:      [44574 * 12, 617881, 621343, 666749, 689774, 744237, 769835],
  note: '單位：元。＊未滿一年原始為月薪，此處以「月薪 × 12」估算為年化。',
};

// 護理人員夜班費（112 年，依層級與班制）
export const NIGHT_SHIFT_PAY_2023 = {
  // shift 對應原報告：
  //   小夜班 / 大夜班 = 三班制固定班
  //   小夜班 / 大夜班 = 三班制非固定班
  //   日班 / 夜班      = 兩班制
  labels: ['三班固定·小夜', '三班固定·大夜', '三班非固定·小夜', '三班非固定·大夜', '兩班制·日班', '兩班制·夜班'],
  medicalCenter: [718, 988, 580, 829, 436, 1026],
  regional:      [673, 936, 545, 795, 372, 1108],
  district:      [587, 864, 520, 755, 415, 961],
  note: '單位：元/班次。',
};

// 護理人員夜班費 歷年（整體）— 取「三班非固定·大夜」作為趨勢主軸（最具代表性）
export const NIGHT_SHIFT_TREND = {
  years: [108, 110, 111, 112],
  threeShiftFixedSmall:    [530, 516, 572, 595],
  threeShiftFixedLarge:    [798, 760, 831, 858],
  threeShiftFlexSmall:     [461, 442, 499, 511],
  threeShiftFlexLarge:     [678, 662, 738, 752],
  twoShiftDay:             [272, 287, 333, 378],
  twoShiftNight:           [835, 872, 973, 985],
  note: '單位：元/班次。109 年因疫情暫停。',
};

// 專業證照津貼（護理師 / 護士；月平均）
export const CERT_ALLOWANCE = {
  years: [108, 110, 111, 112],
  nurse: [3792, 3942, 3937, 4150],
  assistant: [2759, 2812, 3052, 2915],
  note: '單位：元/月。',
};

// 教育程度分布（112 年，整體）
export const EDUCATION_DIST_2023 = {
  labels: ['高職', '專科', '大學', '碩士', '博士'],
  values: [1.13, 23.35, 70.69, 4.66, 0.17],
  note: '單位：%。',
};

// ============================================================
// 來源 2：護全聯會「111 年醫院護理人員薪資及人力調查」
// ============================================================

export const OFFICIAL_SOURCE_2 = {
  title: '111 年度醫院護理人員薪資及人力調查',
  publisher: '中華民國護理師護士公會全國聯合會（護全聯會）',
  pdfUrl: 'https://www.nurse.org.tw/filecenter/B/8DC3229C9DD3514030/20230512-111%e5%b9%b4%e9%86%ab%e9%99%a2%e8%ad%b7%e7%90%86%e4%ba%ba%e5%93%a1%e8%96%aa%e8%b3%87%e5%8f%8a%e4%ba%ba%e5%8a%9b%e8%aa%bf%e6%9f%a5%e5%a0%b1%e5%91%8a(%e5%85%ac%e5%91%8a%e7%89%88).pdf',
  surveyYear: 111,
  surveyedHospitals: 259,
  respondedHospitals: 185,
  responseRate: 71.4,
  surveyPeriod: '2023 年 4 月 26 日 ~ 5 月 11 日',
};

// 111 年薪資 × 年資 × 層級（avg + min-max range）
//   1 年以內：月薪
//   1-5 年 / 5 年以上：年薪
export const SALARY_RANGE_2022 = {
  '醫學中心': {
    newcomer: { avg: 51927, min: 36349, max: 66580,  unit: '月' },
    junior:   { avg: 794784, min: 603079, max: 1027600, unit: '年' },
    senior:   { avg: 957621, min: 750000, max: 1140440, unit: '年' },
  },
  '區域醫院': {
    newcomer: { avg: 49188, min: 36364, max: 75094,  unit: '月' },
    junior:   { avg: 709907, min: 550482, max: 984150,  unit: '年' },
    senior:   { avg: 795874, min: 564509, max: 1132930, unit: '年' },
  },
  '地區醫院': {
    newcomer: { avg: 45281, min: 26800, max: 65050,  unit: '月' },
    junior:   { avg: 654815, min: 321600, max: 1114916, unit: '年' },
    senior:   { avg: 731142, min: 330000, max: 1154846, unit: '年' },
  },
};

// 111 年薪資 × 地區 × 層級 × 年資（avg + min-max range）
//   1 年以內：月薪
//   1-5 年 / 5 年以上：年薪
//   「全部」= 全國（185 家平均，等同 SALARY_RANGE_2022）
export const SALARY_BY_REGION_2022 = {
  all: {
    name: '全部', totalHospitals: 185,
    medicalCenter: { count: 17, newcomer: {avg:51927,min:36349,max:66580},  junior: {avg:794784,min:603079,max:1027600}, senior: {avg:957621,min:750000,max:1140440} },
    regional:      { count: 71, newcomer: {avg:49188,min:36364,max:75094},  junior: {avg:709907,min:550482,max:984150},  senior: {avg:795874,min:564509,max:1132930} },
    district:      { count: 97, newcomer: {avg:45281,min:26800,max:65050},  junior: {avg:654815,min:321600,max:1114916}, senior: {avg:731142,min:330000,max:1154846} },
  },
  north: {
    name: '北區', totalHospitals: 77,
    medicalCenter: { count: 8,  newcomer: {avg:57461,min:46600,max:66300},  junior: {avg:853485,min:780800,max:1027600}, senior: {avg:1007938,min:870000,max:1140440} },
    regional:      { count: 32, newcomer: {avg:50683,min:37648,max:75094},  junior: {avg:723774,min:591754,max:903880},  senior: {avg:813721,min:607500,max:1132930} },
    district:      { count: 37, newcomer: {avg:44562,min:27700,max:65000},  junior: {avg:660933,min:500000,max:1012500}, senior: {avg:767413,min:510000,max:1154846} },
  },
  central: {
    name: '中區', totalHospitals: 38,
    medicalCenter: { count: 4,  newcomer: {avg:45614,min:39500,max:51000},  junior: {avg:749304,min:632844,max:939370},  senior: {avg:864481,min:750000,max:991116} },
    regional:      { count: 16, newcomer: {avg:46522,min:36364,max:54350},  junior: {avg:720696,min:585000,max:984150},  senior: {avg:783501,min:612000,max:1034100} },
    district:      { count: 18, newcomer: {avg:46353,min:38106,max:65050},  junior: {avg:697749,min:589950,max:1114916}, senior: {avg:726843,min:563800,max:920000} },
  },
  south: {
    name: '南區', totalHospitals: 56,
    medicalCenter: { count: 4,  newcomer: {avg:48902,min:36349,max:66580},  junior: {avg:755310,min:603079,max:903880},  senior: {avg:982035,min:824425,max:1132930} },
    regional:      { count: 20, newcomer: {avg:48600,min:38000,max:60775},  junior: {avg:683462,min:550482,max:903880},  senior: {avg:780981,min:564509,max:1132930} },
    district:      { count: 32, newcomer: {avg:43764,min:26800,max:59000},  junior: {avg:606773,min:321600,max:903880},  senior: {avg:684030,min:330000,max:1132930} },
  },
  east: {
    name: '東區', totalHospitals: 11,
    medicalCenter: { count: 1,  newcomer: {avg:45000,min:45000,max:45000},  junior: {avg:665000,min:665000,max:665000},  senior: {avg:830000,min:830000,max:830000} },
    regional:      { count: 3,  newcomer: {avg:50482,min:46245,max:55600},  junior: {avg:684332,min:622000,max:755797},  senior: {avg:770785,min:665000,max:907756} },
    district:      { count: 7,  newcomer: {avg:49624,min:33000,max:64172},  junior: {avg:690491,min:459000,max:916029},  senior: {avg:729451,min:486000,max:988713} },
  },
  islands: {
    name: '離島', totalHospitals: 3,
    medicalCenter: null,
    regional:      null,
    district:      { count: 3,  newcomer: {avg:53253,min:48216,max:56570},  junior: {avg:706103,min:584248,max:778682},  senior: {avg:821677,min:636579,max:922566} },
  },
};

// ============================================================
// 來源 3：護理全聯會「114 年護理人力監測指標」（115/1/5 發布）
// 資料來源：本會護理人力雲系統
// ============================================================

export const OFFICIAL_SOURCE_3 = {
  title: '114 年護理人力監測指標',
  publisher: '護理全聯會',
  pdfUrl: 'https://www.nurse.org.tw/filecenter/B/8DE57369055FC22058/114%e5%b9%b4%e8%ad%b7%e7%90%86%e4%ba%ba%e5%8a%9b%e7%9b%a3%e6%b8%ac%e6%8c%87%e6%a8%99.pdf',
  dataSource: '護理全聯會護理人力雲系統',
  publishDate: '115 年 1 月 5 日',
};

const TUNA_YEARS = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114];

export const WORKPLACE_RATIO = {
  years: TUNA_YEARS,
  hospital: [65.5, 66.5, 66.3, 65.1, 65.0, 64.6, 64.0, 63.0, 63.0, 62.9],
  clinic:   [13.5, 13.7, 13.8, 13.9, 14.0, 14.7, 15.4, 16.2, 16.8, 17.1],
  longTerm: [9.8, 9.9, 10.1, 10.1, 10.3, 10.6, 10.7, 10.9, 10.9, 11.0],
  other:    [11.3, 9.8, 9.8, 10.9, 10.6, 10.1, 10.0, 9.9, 9.2, 9.0],
  note: '單位：%。',
};

export const AVG_TENURE = {
  years: TUNA_YEARS,
  values: [11.91, 12.23, 12.57, 12.94, 13.26, 13.62, 14.06, 14.51, 14.84, 15.09],
  note: '單位：年。',
};

export const FIRST_TIME_PRACTICE = {
  years: TUNA_YEARS,
  values: [7966, 8496, 8384, 7827, 8030, 8445, 7524, 7453, 8364, 7741],
  note: '單位：人。首次登錄於人力雲系統之執業會員人數。',
};

export const NET_GROWTH = {
  years: TUNA_YEARS,
  netIncrease: [5267, 5885, 5692, 4733, 4653, 4805, 2259, 2413, 4511, 5176],
  growthRate:  [3.40, 3.67, 3.43, 2.76, 2.64, 2.65, 1.22, 1.28, 2.37, 2.65],
  note: '淨增加人數 = 當年度 - 前一年度執業會員人數；成長率 = 淨增加 ÷ 前一年度 × 100%。',
};


// ============== Chart 渲染函式 ==============

const FONT_FAMILY = "'Noto Sans TC', 'Inter', sans-serif";
const COLOR_MC = '#1D3557';    // 醫學中心（深藍）
const COLOR_RG = '#2E86AB';    // 區域醫院
const COLOR_DT = '#5BA8C6';    // 地區醫院

function destroyIfExists(canvas) {
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { font: { family: FONT_FAMILY, size: 12 }, color: '#46557A', usePointStyle: true, padding: 14 },
    },
    tooltip: {
      backgroundColor: '#1D3557',
      titleFont: { family: FONT_FAMILY },
      bodyFont: { family: FONT_FAMILY },
      padding: 10, cornerRadius: 8,
    },
  },
  scales: {
    x: { grid: { display: false }, border: { color: '#E5E9F0' },
         ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 } } },
    y: { grid: { color: '#F1F3F7' }, border: { display: false },
         ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 } } },
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
        borderColor: '#E63946',
        backgroundColor: '#E6394633',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: '#E63946',
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
        { label: '護士',   data: d.assistant, borderColor: '#F4A261', backgroundColor: '#F4A26122',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#F4A261', fill: false },
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
  const colors = ['#9AA5B8', '#5BA8C6', '#2E86AB', '#1D3557', '#0F2541'];
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: colors,
      borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right',
          labels: { font: { family: FONT_FAMILY, size: 12 }, color: '#46557A', usePointStyle: true, padding: 10 } },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } },
      },
    },
  });
}

/** 渲染 4 個 KPI 數值（給上方卡片用） */
export function renderOfficialKPI() {
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
        { label: '公立醫院 · 護理師', data: d.publicNurse, borderColor: '#1D3557', backgroundColor: '#1D355733',
          tension: 0.3, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#1D3557' },
        { label: '私立醫院 · 護理師', data: d.privateNurse, borderColor: '#F4A261', backgroundColor: '#F4A26133',
          tension: 0.3, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#F4A261' },
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
  const colors = ['#1D3557', '#2E86AB', '#5BA8C6'];

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
export function renderSalaryRangeTable(containerEl) {
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
        { label: '診所',  data: d.clinic,   borderColor: '#06A77D', backgroundColor: '#06A77D33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#06A77D',
          yAxisID: 'yLeft', fill: false },
        { label: '長照',  data: d.longTerm, borderColor: '#F4A261', backgroundColor: '#F4A26133',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#F4A261',
          yAxisID: 'yLeft', fill: false },
        { label: '其他',  data: d.other,    borderColor: '#9D4EDD', backgroundColor: '#9D4EDD33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#9D4EDD',
          yAxisID: 'yLeft', fill: false },
        // 右軸 (60-70%)：醫院
        { label: '醫院',  data: d.hospital, borderColor: '#1D3557', backgroundColor: '#1D355722',
          tension: 0.3, borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#1D3557',
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
                  title: { display: true, text: '其他場域 (%)', color: '#46557A',
                           font: { family: FONT_FAMILY, size: 11 } },
                  beginAtZero: false, suggestedMin: 8, suggestedMax: 20,
                  grid: { color: '#F1F3F7' }, border: { display: false },
                  ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 },
                           callback: (v) => v + '%' } },
        yRight: { type: 'linear', position: 'right',
                  title: { display: true, text: '醫院 (%)', color: '#1D3557',
                           font: { family: FONT_FAMILY, size: 11, weight: '600' } },
                  beginAtZero: false, suggestedMin: 60, suggestedMax: 68,
                  grid: { drawOnChartArea: false }, border: { display: false },
                  ticks: { color: '#1D3557', font: { family: FONT_FAMILY, size: 11 },
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
        borderColor: '#9D4EDD',
        backgroundColor: '#9D4EDD33',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: '#9D4EDD', fill: true,
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
        borderColor: '#2E86AB',
        backgroundColor: '#2E86AB33',
        tension: 0.3, borderWidth: 2.5, pointRadius: 5,
        pointBackgroundColor: '#2E86AB', fill: true,
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
          borderColor: '#E63946', backgroundColor: '#E6394633',
          borderWidth: 2.5, tension: 0.3, pointRadius: 4,
          pointBackgroundColor: '#E63946', yAxisID: 'y1', fill: false, order: 0 },
        { type: 'bar', label: '淨增加人數', data: d.netIncrease,
          backgroundColor: '#5BA8C6', borderRadius: 6, yAxisID: 'y', order: 1 },
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
              grid: { color: '#F1F3F7' }, border: { display: false },
              ticks: { color: '#6B7C93', font: { family: FONT_FAMILY, size: 11 },
                       callback: (v) => v.toLocaleString() } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, suggestedMax: 4,
              grid: { drawOnChartArea: false }, border: { display: false },
              ticks: { color: '#E63946', font: { family: FONT_FAMILY, size: 11 },
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
export function renderRegionalSalary(chipContainer, tableContainer) {
  if (!chipContainer || !tableContainer) return;
  const regions = Object.entries(SALARY_BY_REGION_2022); // [[key, region], ...]
  let activeKey = regions[0][0];

  const renderChips = () => {
    chipContainer.innerHTML = regions.map(([key, r]) => `
      <span class="filter-chip ${key === activeKey ? 'active' : ''}" data-key="${key}">
        ${r.name} <span style="opacity:.6;font-size:0.78em;">${r.totalHospitals}</span>
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
export function renderOfficialSourceA() {
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
export function renderOfficialSourceB() {
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  renderRegionalSalary(byId('off-region-chips'), byId('off-region-table'));
}

/** 勞動部 — 護理人員 7 月經常性薪資 3 年趨勢（單線、實際金額） */
export function chartMolTrend(canvas) {
  destroyIfExists(canvas);
  const d = MOL_NURSE_TREND;
  const labels = d.years.map((y) => y + ' 年 7 月');
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '7 月經常性薪資', data: d.monthlySalary,
          borderColor: '#2E86AB', backgroundColor: '#2E86AB33',
          tension: 0.3, borderWidth: 2.5, pointRadius: 6, pointBackgroundColor: '#2E86AB',
          fill: true },
      ],
    },
    options: freshOpts({
      plugins: {
        ...baseOpts.plugins,
        legend: { display: false },
        tooltip: { ...baseOpts.plugins.tooltip,
          callbacks: { label: (ctx) => fmtTWD(ctx.parsed.y) + ' / 月' } },
      },
      scales: {
        x: baseOpts.scales.x,
        y: { ...baseOpts.scales.y, beginAtZero: false,
             title: { display: true, text: '月薪 (元)', color: '#46557A',
                      font: { family: FONT_FAMILY, size: 11 } },
             ticks: { ...baseOpts.scales.y.ticks,
                      callback: (v) => Number(v).toLocaleString() } },
      },
    }),
  });
}

/** 渲染來源 D：勞動部 114 年職類別薪資調查 — 護理人員月薪 KPI + 3 年趨勢 */
export function renderOfficialSourceD() {
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  const d = MOL_NURSE_TREND;
  const lastIdx = d.years.length - 1; // 114 年
  const salaryEl = byId('off-mol-kpi-salary');
  if (salaryEl) salaryEl.innerHTML =
    `<strong>${Number(d.monthlySalary[lastIdx]).toLocaleString()}</strong> <span class="kpi-unit">元</span>`;

  if (byId('chart-off-mol-trend')) chartMolTrend(byId('chart-off-mol-trend'));
}

/** 渲染來源 C：護理全聯會 114 年人力監測指標 */
export function renderOfficialSourceC() {
  if (typeof Chart === 'undefined') return;
  const byId = (id) => document.getElementById(id);
  if (byId('chart-off-workplace'))  chartWorkplaceRatio(byId('chart-off-workplace'));
  if (byId('chart-off-tenure'))     chartAvgTenure(byId('chart-off-tenure'));
  if (byId('chart-off-firsttime'))  chartFirstTimePractice(byId('chart-off-firsttime'));
  if (byId('chart-off-netgrowth'))  chartNetGrowth(byId('chart-off-netgrowth'));
}

/** 入口：一次渲染所有官方圖表（如果不用 sub-tab 切換） */
export function renderAllOfficial() {
  renderOfficialSourceA();
  renderOfficialSourceB();
  renderOfficialSourceC();
  renderOfficialSourceD();
}
