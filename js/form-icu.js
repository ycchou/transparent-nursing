// 加護病房（ICU）自建表單：只定義 ICU 專屬區塊，其餘（機構基本資料 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=18';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=18';

// 各班護病比共用選項（第一線值班護理人員：照護病人數）
const ICU_RATIO_OPTIONS = ['1:1', '1:2', '1:3', '1:4', '1:5+', '其他'];

const ICU_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：內科加護病房 (MICU)、心臟內科加護病房 (CCU)、兒童加護病房 (PICU)',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '加護病房資訊' },
  { name: 'icuType', label: 'ICU 類型', type: 'radio', required: true,
    options: ['內科', '外科', '心臟', '神經', '兒童', '混合'] },

  { section: '護病比配置',
    intro: `<strong>ICU 護病比相關法規與評鑑基準</strong><br><br>
<strong>1. 醫療機構設置標準（總量下限）：</strong>加護病房每床應有 <strong>1.5 人以上</strong>（以總床數配置比計，非三班現場比）。<br><br>
<strong>2. 醫院評鑑基準 必 1.3.4（必要條文，須完全達成）：</strong>依層級加嚴——申請「地區醫院」評鑑者，ICU 每床應 <strong>≧ 1.5 人</strong>；申請「區域醫院」評鑑者，ICU 每床應 <strong>≧ 2.0 人</strong>。（總量以執照登記人數為準，不含書記、護佐、照服員）<br><br>
<strong>3. 醫院評鑑基準 重 2.3.5（重點條文）：</strong>「適當的護病比」，應符合醫療機構設置標準；實地查核以護理紀錄回推三班現場的實際照護負荷。<br><br>
<strong>4. 健保支付標準（「1:2」的法定出處）：</strong>加護病房費之申報，不論白班／小夜／大夜，每一第一線值班護理人員實質照護 <strong>至多 2 人（1:2）</strong>；若常態超標排班（如大夜 1 顧 3），健保署得依特約審查逕予核扣該病床之申報費用。<br><br>
<strong>5. 重症醫學會加護病房照護指引：</strong>ECMO（葉克膜）、CRRT（連續性腎臟替代治療）運作中之重症病人，建議核心護理人力採 <strong>1:1 專責照護</strong>。` },
  { name: 'dayShiftRatio', label: '白班護病比', type: 'radio', required: true,
    options: ICU_RATIO_OPTIONS,
    help: '第一線值班護理人員：照護病人數（法定上限 1:2）' },
  { name: 'eveningShiftRatio', label: '小夜護病比', type: 'radio', required: true,
    options: ICU_RATIO_OPTIONS },
  { name: 'nightShiftRatio', label: '大夜護病比', type: 'radio', required: true,
    options: ICU_RATIO_OPTIONS },
  { name: 'ventilatorCare', label: '呼吸器照護占比', type: 'radio', required: true,
    options: ['全部', '多數', '少數', '無'],
    help: '單位內使用呼吸器（Ventilator）病人所占比例' },

  { section: '業務與工時' },
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: ICU_FORM_SCHEMA, draftKey: 'dform_draft_icu' });
