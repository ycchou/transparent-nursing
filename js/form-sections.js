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

export const INSTITUTION_TYPES = ['醫學中心', '區域醫院', '地區醫院', '診所', '其他'];

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
