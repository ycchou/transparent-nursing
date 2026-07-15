// 洗腎室自建表單：只定義洗腎室專屬區塊，其餘（機構基本資料 / 業務與工時共用欄 /
// 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本；引擎邏輯在 form-engine.js。

import { initDepartmentForm } from './form-engine.js?v=17c370612b';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=17c370612b';

// 護病比刻度：常態 / 最忙時 各自的乾淨比例選擇（比照 ICU；非該類選「不適用」）
// HD＝血液透析，床護比（1 名護理師顧幾床，評鑑基準 1:4）；
// PD＝腹膜透析，個案護病比（1 名 PD 護理師顧幾位病人）
const HD_RATIO = ['1:3', '1:4', '1:5', '1:6', '1:7 以上', '不適用', '其他'];
const PD_RATIO = ['1:20 以下', '1:20-35', '1:35-55', '1:55 以上', '不適用', '其他'];

const DIALYSIS_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：腎臟科血液透析室、PD 治療中心',
    jobTitleHelp: '例：N1、N2、N3、N4、專科護理師',
  }),

  { section: '透析單位資訊' },
  { name: 'dialysisType', label: '透析類別', type: 'radio', required: true,
    options: ['血液透析', '腹膜透析', '兩者皆有'] },

  { section: '人力配置',
    intro: `<strong>114 年度醫院與腎醫學會評鑑基準及評量項目</strong><br><br>
<strong>血液透析室：</strong>每 4 床應有 1 人以上。<br><br>
<strong>腹膜透析：</strong><br>
若病人數 ≦ 20 人，應配置有兼任腹膜透析護理人員 1 人；若病人數 > 20 人但少於 35 人，設置專任腹膜透析護理人員 1 人。<br>
若病人數 > 30 人時，有 1 名腹膜透析護理人員加入。<br>
若病人數 > 35 人時，得除有 1 名正式腹膜透析護理人員外，應再增加 1 名兼任腹膜透析護理人員；當病人數 ≧ 55 人時，應配置 2 名正式人力。` },
  { name: 'hdRatio', label: 'HD・常態護病比', type: 'radio', required: true,
    options: HD_RATIO, help: '血液透析：1 名護理師照顧幾床（評鑑基準 1:4；非 HD 選「不適用」）' },
  { name: 'hdPeakRatio', label: 'HD・最忙時', type: 'radio', required: true,
    options: HD_RATIO, help: '尖峰／忙的時候最多會到幾床' },
  { name: 'pdCount', label: 'PD・常態護病比', type: 'radio', required: true,
    options: PD_RATIO, help: '腹膜透析：1 名 PD 護理師照顧幾位病人（非 PD 選「不適用」）' },
  { name: 'pdPeakRatio', label: 'PD・最忙時', type: 'radio', required: true,
    options: PD_RATIO, help: '個案量尖峰時' },

  { section: '值班制度' },
  { name: 'onCallType', label: '值班型態', type: 'radio',
    options: ['小夜值班（下班至次日早班）', '全日值班', '週末值班（六日連續）', '無需值班', '其他'] },
  { name: 'onCallRotation', label: '值班輪值方式', type: 'radio',
    options: ['一人輪 8 小時小夜', '一人 24 小時連續', '一人連續 7 天', '其他'] },
  { name: 'restInterval11h', label: '值班出勤之間有 11 小時間隔嗎', type: 'radio',
    options: ['有', '無'] },
  { name: 'onCallPay', label: '未出勤值班費', type: 'radio',
    options: ['無', '200-250 元', '250-300 元', '300 元以上', '其他'] },
  { name: 'batchShift', label: '單位有無「批班」制度', type: 'radio',
    options: ['有', '無'],
    help: '批班＝病患減少時提前下班的制度' },

  { section: '業務與工時' },
  { name: 'workDuties', label: '業務內容', type: 'checkbox',
    options: ['病人抽血', '病人輸血', '病人給藥', '搬運病人量體重', 'BCM 量測', '紅外線理療協助', '其他'],
    help: '可複選' },
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: DIALYSIS_FORM_SCHEMA, draftKey: 'dform_draft_dialysis' });
