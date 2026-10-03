// 各科別自建表單的「共用區塊」——以洗腎室（dialysis）版本為正本
// 讓所有科別表單的「機構基本資料 / 業務與工時 / 薪資與年資 / 整體評價」設定一致。
// schema 物件約定：{ section } = 分區標題；其餘為欄位。
// options 可為字串陣列或 { value, label } 物件陣列（送出 value、顯示 label）。

export const LOCATIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣',
  '澎湖縣', '金門縣', '連江縣',
];

export const INSTITUTION_TYPES = ['醫學中心', '區域醫院', '地區醫院', '診所', '護理之家', '長照機構', '居護所', '其他'];

// 機構基本資料：欄位/label/type/required/options 各科別完全相同，
// 只有 unitName / jobTitle 的範例提示（help）依科別帶入。
export function buildInstitutionSection({ unitNameHelp = '', jobTitleHelp = '' } = {}) {
  return [
    { section: '機構基本資料' },
    { name: 'location', label: '工作地點（縣市）', type: 'select', required: true,
      options: LOCATIONS, placeholder: '請選擇縣市' },
    { name: 'institutionType', label: '機構類別', type: 'radio', required: true,
      options: INSTITUTION_TYPES },
    { name: 'institutionName', label: '機構名稱', type: 'text' },
    { name: 'unitName', label: '單位名稱', type: 'text', help: unitNameHelp },
    { name: 'jobTitle', label: '職稱', type: 'text', help: jobTitleHelp },
  ];
}

// 業務與工時的共用欄位（各科別放進自己的「業務與工時」段）
export const WORKHOURS_FIELDS = [
  { name: 'weeklyHours', label: '平均每週工時', type: 'radio', required: true,
    options: ['35-40', '40-45', '45-50', '50-55', '55-60', '60+'] },
  { name: 'overtimePolicy', label: '加班費合規', type: 'radio', required: true,
    options: ['一律給', '合理範圍給', '主管判斷', '一律不給'] },
];

// 輪班別與津貼（三班制單位共用：ICU、精神科…）
export const SHIFT_ALLOWANCE_SECTION = [
  { section: '輪班別與津貼',
    intro: `「包班」指固定承包該班別、不輪回白班者；「非包班」為一般三班輪值。<br>下方津貼欄若無此制度或不適用，請填「無」。` },
  { name: 'shiftSystem', label: '班別', type: 'radio', required: true,
    options: ['三班制', '兩班制', '混合制', '其他'] },
  { name: 'eveningAllowanceNonPack', label: '小夜班津貼/班（非包班）', type: 'text', required: true,
    help: '每班津貼金額（元）；無則填「無」' },
  { name: 'eveningAllowancePack', label: '小夜班津貼/班（包班）', type: 'text', required: true,
    help: '每班津貼金額（元）；無則填「無」' },
  { name: 'nightAllowanceNonPack', label: '大夜班津貼/班（非包班）', type: 'text', required: true,
    help: '每班津貼金額（元）；無則填「無」' },
  { name: 'nightAllowancePack', label: '大夜班津貼/班（包班）', type: 'text', required: true,
    help: '每班津貼金額（元）；無則填「無」' },
  { name: 'hasOnCall', label: '是否有 on call 班', type: 'radio', required: true,
    options: ['是', '否'] },
];

// 輪班別與津貼（病房版，病房／精神科共用）：班別不提供「其他」，on call 選「是」時多一題自由描述樣態
export const WARD_SHIFT_SECTION = SHIFT_ALLOWANCE_SECTION.flatMap((f) => {
  if (f.name === 'shiftSystem') return [{ ...f, options: f.options.filter((o) => o !== '其他') }];
  if (f.name === 'hasOnCall') {
    return [f, { name: 'onCallPattern', label: 'on call 樣態', type: 'textarea', rows: 3, maxLength: 150,
      showIf: { field: 'hasOnCall', equals: '是' },
      help: '例：多久輪一次、需待命的時段、被叫回的頻率、有無 on call 費或補休' }];
  }
  return [f];
});

// 非護理人力（病房／精神科共用）：有的話再問哪些班別
export const NON_NURSING_HELP_FIELDS = [
  { name: 'nonNursingHelp', label: '單位有無非護理人力（護佐、照服員、病房助理）可以協助照護工作？',
    type: 'radio', options: ['有', '無'] },
  { name: 'nonNursingHelpShifts', label: '哪些班別有非護理人力協助', type: 'checkbox', required: true,
    options: ['白班（D）', '小夜（E）', '大夜（N）'], help: '可複選',
    showIf: { field: 'nonNursingHelp', equals: '有' } },
];

// 新人訓練（病房／精神科共用）
export const NEWBIE_FIELDS = [
  { name: 'newbieIndependence', label: '新人多久開始獨立照護', type: 'radio',
    options: ['1 個月內', '1-2 個月', '2-3 個月', '3 個月以上', '不一定'],
    help: '從到職到不需學姊帶、自己分床的時間' },
  { name: 'newbieNightShift', label: '新人多久開始上夜班', type: 'radio',
    options: ['到職 3 個月內', '3-6 個月', '6-12 個月', '1 年以上', '不排夜班'] },
];

// 護病比區間刻度（病房／精神科共用）。區間邊界大致對齊三班護病比標準
// （醫學中心 6/9/11、區域 7/11/13、地區 10/13/15，見 nurse-ratio-view.js STANDARDS）；大夜常見 1:16 以上，再細分到 1:20 以上。
export const WARD_RATIO = ['1:6 以下', '1:7-8', '1:9-10', '1:11-12', '1:13-15', '1:16-17', '1:18-19', '1:20 以上'];

// 1-5 分量表：一律「5 分＝負擔／風險最重」，方向一致才能並排比較（精神科、急診共用）
export const scale = (low, high) => [
  { value: '1', label: `1（${low}）` },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: `5（${high}）` },
];

// 職場暴力（精神科、急診共用）：頻率、危險感、事後支持
export const VIOLENCE_FREQ_FIELD = { name: 'violenceFreq', label: '過去一個月遇到病人暴力（含言語）的頻率',
  type: 'radio', required: true, options: ['完全沒有', '1-5 次', '6-10 次', '11-20 次', '幾乎每天'] };
export const VIOLENCE_RISK_FIELD = { name: 'violenceRiskFeeling', label: '處理暴力事件時的危險感', type: 'radio',
  options: scale('很安全', '非常危險') };
export const POST_INCIDENT_SUPPORT_FIELD = { name: 'postIncidentSupport', label: '暴力事件後，醫院給的支持',
  type: 'radio', layout: 'list', help: '選最接近你單位實際狀況的一項',
  options: [
    { value: '非常完善', label: '非常完善', desc: '立即關懷，並有實質補償、主動檢討流程' },
    { value: '良好', label: '良好', desc: '主管及院方及時關心、提供協助' },
    { value: '普通', label: '普通', desc: '照流程通報，主管口頭關心，沒有實質資源' },
    { value: '不太足夠', label: '不太足夠', desc: '只有例行通報，沒有心理關懷或改善行動' },
    { value: '非常不足', label: '非常不足', desc: '缺乏關懷，甚至檢討護理人員、要自己承擔' },
  ] };

// 證照考照／複訓的公假與費用補助（急診、檢查/介入共用）；subject 例：「急救證照」「專業證照或訓練」
export const certFields = (subject) => [
  { name: 'certLeave', label: `考取或複訓${subject}是否給公假`, type: 'radio', required: true,
    options: ['全程給公假', '僅部分給假', '需用自己休假（放假天去上課）'] },
  { name: 'certFee', label: '證照考照與受訓費用是否補助', type: 'radio', required: true,
    options: ['全額公費', '部分補助', '完全自費'] },
];

// 是否有休息一個小時（門診、診所、檢查/介入共用欄名；help 依單位）
export const lunchBreakField = (help) => ({ name: 'lunchBreak', label: '是否有休息一個小時', type: 'radio', required: true,
  options: ['有，完整 1 小時', '有，但常被中斷／縮短', '無'], help });

// On call 值班（檢查/介入、手術房共用）：先問是否需要，選「需要」才出現後續各題
const ON_CALL_IF = { field: 'onCallRequired', equals: '需要' };
export const ON_CALL_FIELDS = [
  { name: 'onCallRequired', label: '是否需要 on call', type: 'radio', required: true,
    options: ['需要', '不需要'] },
  { name: 'onCallFreq', label: '每月 on call 幾次', type: 'radio', required: true,
    options: ['1-4 次', '5-8 次', '9-12 次', '13 次以上'],
    showIf: ON_CALL_IF },
  { name: 'onCallCallback', label: 'On call 時被叫回院的頻率', type: 'radio',
    options: ['幾乎每次都被叫回', '經常', '偶爾', '很少'],
    showIf: ON_CALL_IF },
  { name: 'onCallArrival', label: '被叫回時要在幾分鐘內到院', type: 'radio',
    options: ['15 分鐘內', '30 分鐘內', '60 分鐘內', '沒有規定'],
    showIf: ON_CALL_IF },
  { name: 'onCallPay', label: '未出勤（沒被叫回）的值班費', type: 'radio',
    options: ['無', '200-250 元', '250-300 元', '300 元以上', '其他'],
    showIf: ON_CALL_IF },
  { name: 'restInterval11h', label: '被叫回出勤後，到下次上班之間有 11 小時間隔嗎', type: 'radio',
    options: ['有', '無'],
    showIf: ON_CALL_IF },
  { name: 'nextDayAfterCall', label: '半夜被叫回後，隔天是否照常上班', type: 'radio',
    options: ['照常上班', '可晚到或補休', '隔天休假', '視情況'],
    showIf: ON_CALL_IF },

];

// 輻射防護裝備（檢查/介入、手術房共用）
export const RADIATION_PROTECTION_FIELD = { name: 'radiationProtection', label: '防護裝備是否充足（鉛衣、鉛眼鏡、甲狀腺護具）',
  type: 'radio', options: ['充足且合身', '有但不足或老舊', '幾乎沒有', '不適用'] };

// 每日平均加班時間（放在各科別「業務與工時」段）
export const DAILY_OVERTIME_FIELD = { name: 'dailyOvertime', label: '每日平均加班時間', type: 'radio',
  options: ['無', '1 小時內', '1-2 小時', '2-3 小時', '4 小時'] };

// 薪資與年資（各科別完全相同）
export const SALARY_SECTION = [
  { section: '薪資與年資' },
  { name: 'yearsCurrent',   label: '現職年資（年）',   type: 'number', min: 0, step: 1 },
  { name: 'yearsTotal',     label: '累計工作年資（年）', type: 'number', min: 0, step: 1 },
  { name: 'annualSalary',   label: '近一年年薪（萬）',  type: 'number', min: 0, step: 1 },
  { name: 'monthlyBase',    label: '月底薪+津貼（千）', type: 'number', min: 0, step: 1,
    help: '單位為「千」(例：38 表示 38,000 元)' },
  { name: 'annualBonus',    label: '全年獎金（可詳述發放形式）', type: 'textarea', rows: 2 },
  { name: 'specialBenefits', label: '特殊福利', type: 'textarea', rows: 2,
    help: '例：自費健檢、員工旅遊補助、進修補助等' },
];

// 整體評價（各科別完全相同）
export const EVALUATION_SECTION = [
  { section: '整體評價' },
  { name: 'workAtmosphere', label: '工作環境氣氛 (1-5)', type: 'radio', required: true,
    options: [
      { value: '5', label: '5（極佳）' },
      { value: '4', label: '4（良好）' },
      { value: '3', label: '3（普通）' },
      { value: '2', label: '2（稍差）' },
      { value: '1', label: '1（極差）' },
    ] },
  { name: 'promotion', label: '升遷與發展前景', type: 'radio', required: true,
    options: ['機會多', '普通', '難以升遷'] },
  { name: 'recommendIndex', label: '整體推薦指數 (1-5)', type: 'radio', required: true,
    options: [
      { value: '5', label: '5（非常推薦）' },
      { value: '4', label: '4（推薦）' },
      { value: '3', label: '3（保留）' },
      { value: '2', label: '2（不推薦）' },
      { value: '1', label: '1（非常不推薦）' },
    ] },
  { name: 'comment', label: '個人短評', type: 'textarea', rows: 3,
    help: '可描述環境氣氛、需額外協助的非醫療事務等' },
];
