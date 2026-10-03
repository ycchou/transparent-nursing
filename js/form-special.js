// 檢查/介入自建表單（心導管、電燒、內視鏡、血管攝影、介入治療、高壓氧…）：只定義專屬區塊，
// 其餘（機構基本資料 / 證照公假公費 / 休息一小時 / 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js。
// 這類單位多半只上白班、以 on call 被叫回支援急做，且常有輻射暴露——所以不問三班護病比與夜班津貼，
// 改問 on call 值班與輻射防護。

import { initDepartmentForm } from './form-engine.js?v=9c413ac48c';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
  scale,
  certFields,
  lunchBreakField,
} from './form-sections.js?v=9c413ac48c';

const SPECIAL_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：心導管室、電燒室（EP Lab）、內視鏡中心、血管攝影室、高壓氧中心',
    jobTitleHelp: '例：N1、N2、N3、專科護理師、技術員',
  }),

  { section: '單位資訊' },
  { name: 'specialType', label: '單位類型', type: 'radio', required: true,
    options: ['心導管室', '電燒室 (EP Lab)', '內視鏡室', '血管攝影室', '介入治療中心', '高壓氧', '其他'] },
  { name: 'specialRole', label: '主要負責的工作', type: 'checkbox', required: true,
    options: ['刷手', '流動', '鎮靜／麻醉監測', '術前準備與衛教', '術後恢復照護', '其他'],
    help: '可複選' },
  { name: 'dailyCases', label: '單位每日平均案件數', type: 'radio',
    options: ['10 件以下', '10-20 件', '20-40 件', '40 件以上', '不清楚'] },

  { section: '人力配置', intro: '這類單位沒有「護病比」，改問每一檯檢查／介入配置的護理人力。' },
  { name: 'staffPerCase', label: '一檯檢查／介入配置幾位護理人員', type: 'radio', required: true,
    options: ['1 位', '2 位', '3 位以上', '不固定', '不適用'],
    help: '不含醫師與放射師；高壓氧等以「艙」或「梯次」計的單位可選不適用' },
  { name: 'multiRoom', label: '是否需要同時兼顧多間檢查室／多檯', type: 'radio',
    options: ['經常', '偶爾', '不會'] },

  { section: 'On call 值班', intro: '下班後待命、需要時被叫回院支援急做（如急性心肌梗塞的緊急心導管）。' },
  { name: 'onCallRequired', label: '是否需要 on call', type: 'radio', required: true,
    options: ['需要', '不需要'] },
  { name: 'onCallFreq', label: '每月 on call 幾次', type: 'radio', required: true,
    options: ['1-4 次', '5-8 次', '9-12 次', '13 次以上'],
    showIf: { field: 'onCallRequired', equals: '需要' } },
  { name: 'onCallCallback', label: 'On call 時被叫回院的頻率', type: 'radio',
    options: ['幾乎每次都被叫回', '經常', '偶爾', '很少'],
    showIf: { field: 'onCallRequired', equals: '需要' } },
  { name: 'onCallArrival', label: '被叫回時要在幾分鐘內到院', type: 'radio',
    options: ['15 分鐘內', '30 分鐘內', '60 分鐘內', '沒有規定'],
    showIf: { field: 'onCallRequired', equals: '需要' } },
  { name: 'onCallPay', label: '未出勤（沒被叫回）的值班費', type: 'radio',
    options: ['無', '200-250 元', '250-300 元', '300 元以上', '其他'],
    showIf: { field: 'onCallRequired', equals: '需要' } },
  { name: 'restInterval11h', label: '被叫回出勤後，到下次上班之間有 11 小時間隔嗎', type: 'radio',
    options: ['有', '無'],
    showIf: { field: 'onCallRequired', equals: '需要' } },
  { name: 'nextDayAfterCall', label: '半夜被叫回後，隔天是否照常上班', type: 'radio',
    options: ['照常上班', '可晚到或補休', '隔天休假', '視情況'],
    showIf: { field: 'onCallRequired', equals: '需要' } },

  { section: '輻射與職業安全' },
  { name: 'radiationExposure', label: '工作中的輻射暴露', type: 'radio', required: true,
    options: ['幾乎每天', '每週數次', '偶爾', '無（如內視鏡、高壓氧）'] },
  { name: 'radiationProtection', label: '防護裝備是否充足（鉛衣、鉛眼鏡、甲狀腺護具）', type: 'radio',
    options: ['充足且合身', '有但不足或老舊', '幾乎沒有', '不適用'] },
  { name: 'dosimeter', label: '是否配戴劑量計並定期告知讀數', type: 'radio',
    options: ['有配戴，定期告知', '有配戴，但沒告知結果', '沒有配戴', '不適用'] },
  { name: 'radiationHealthCheck', label: '是否有輻射工作人員特殊健康檢查', type: 'radio',
    options: ['有', '無', '不清楚', '不適用'] },
  { name: 'radiationPay', label: '是否有輻射／危險加給', type: 'radio',
    options: ['有', '無', '不清楚'] },
  { name: 'leadApronBurden', label: '長時間穿鉛衣造成的身體負擔', type: 'radio',
    options: scale('幾乎沒有', '非常吃力'), help: '例如肩頸、腰背痠痛；沒有穿鉛衣的單位可不填' },

  { section: '專業訓練', intro: '心導管、電燒、內視鏡等專業護理訓練，以及急救（ACLS 等）證照。' },
  { name: 'trainingPeriod', label: '新人訓練期間（到可以獨立跟檯）', type: 'radio',
    options: ['1 個月內', '1-3 個月', '3-6 個月', '6 個月以上', '不一定'] },
  ...certFields('專業證照或訓練'),

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  lunchBreakField('檢查／介入是否常延誤到用餐與休息時間'),
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: SPECIAL_FORM_SCHEMA, draftKey: 'dform_draft_special' });
