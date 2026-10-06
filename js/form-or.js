// 手術房自建表單：只定義手術房專屬區塊，其餘（機構基本資料 / 夜班津貼 / on call 值班 / 輻射防護 /
// 證照公假公費 / 休息一小時 / 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js。
// 手術房沒有「護病比」，改問一間刀房的護理人力配置；另問接刀晚刀超時、上台協助手術與職業危害。

import { initDepartmentForm } from './form-engine.js?v=a4bd5c1762';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SHIFT_ALLOWANCE_SECTION,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
  scale,
  certFields,
  lunchBreakField,
  ON_CALL_FIELDS,
  RADIATION_PROTECTION_FIELD,
} from './form-sections.js?v=a4bd5c1762';

// 值班型態：三班輪值或白班＋輪值夜間刀，才問小夜／大夜津貼
const OR_SHIFTS = ['固定白班＋on call', '三班輪值', '白班＋輪值夜間刀', '固定白班，不需值班', '其他'];
const NIGHT_SHIFT_IF = { field: 'orShift', in: ['三班輪值', '白班＋輪值夜間刀'] };
const ALLOWANCE_FIELDS = SHIFT_ALLOWANCE_SECTION
  .filter((f) => /Allowance/.test(f.name || ''))
  .map((f) => ({ ...f, showIf: NIGHT_SHIFT_IF }));

const OR_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：中央手術室、門診手術室、心臟外科手術室、恢復室（PAR）',
    jobTitleHelp: '例：N1、N2、N3、專科護理師、麻醉護理師',
  }),

  { section: '單位資訊' },
  { name: 'orRole', label: '主要工作角色', type: 'checkbox', required: true,
    options: ['刷手', '流動', '恢復室', '麻醉護理'], help: '可複選' },
  { name: 'orSpecialty', label: '主要負責的科別', type: 'checkbox', required: true,
    options: ['一般外科', '心臟外科', '神經外科', '骨科', '婦產', '泌尿', '整形外科', '兒外', '眼科', '耳鼻喉', '移植', '其他'],
    help: '可複選' },
  { name: 'roomCount', label: '手術室間數', type: 'radio',
    options: ['5 間以下', '6-10 間', '11-20 間', '21 間以上', '不清楚'] },
  { name: 'dailyCases', label: '全院每日平均刀數', type: 'radio',
    options: ['20 台以下', '20-50 台', '50-100 台', '100 台以上', '不清楚'] },

  { section: '人力配置', intro: '手術房沒有「護病比」，改問一間刀房常態配置的護理人力。' },
  { name: 'orStaffing', label: '一間刀房的常態護理配置', type: 'radio', required: true, layout: 'list',
    options: ['1 刷手＋1 流動', '只有 1 位流動，兼刷手', '1 位流動同時顧 2 間以上', '大刀才有 2 位以上刷手', '其他'] },
  { name: 'crossSpecialty', label: '是否需要跨科輪刀', type: 'radio',
    options: ['固定科別', '跨 2-3 科', '全科都要會'] },
  { name: 'assistSurgery', label: '是否需在手術中擔任助手（拉鉤、縫合等）', type: 'radio',
    options: ['經常', '偶爾', '從不'], help: '外科醫師或住院醫師人力不足時，由護理人員上台協助' },

  { section: '班別與值班' },
  { name: 'orShift', label: '值班型態', type: 'radio', required: true, options: OR_SHIFTS },
  ...ALLOWANCE_FIELDS,
  ...ON_CALL_FIELDS,

  { section: '超時與休息' },
  { name: 'lateCaseFreq', label: '因接刀或晚刀而延後下班的頻率', type: 'radio', required: true,
    options: ['幾乎每天', '每週數次', '偶爾', '很少'] },
  lunchBreakField('手術是否常延誤到用餐與休息時間'),
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,

  { section: '職業安全' },
  { name: 'radiationExposure', label: '手術中的輻射暴露（C-arm、術中透視等）', type: 'radio',
    options: ['幾乎每天', '每週數次', '偶爾', '幾乎沒有'] },
  RADIATION_PROTECTION_FIELD,
  { name: 'smokeEvacuation', label: '電燒煙霧是否有排煙設備', type: 'radio',
    options: ['每間都有且有使用', '有但不常用', '沒有', '不清楚'] },
  { name: 'sharpsInjury', label: '過去一年針扎或銳器傷', type: 'radio',
    options: ['沒有', '1 次', '2-3 次', '4 次以上'] },
  { name: 'standingBurden', label: '長時間站立造成的身體負擔', type: 'radio',
    options: scale('幾乎沒有', '非常吃力'), help: '例如腰背、腿部、足底痠痛' },

  { section: '專業訓練', intro: '手術全期護理訓練，以及 ACLS 等證照的考照與複訓。' },
  { name: 'trainingPeriod', label: '新人訓練期間（到可以獨立跟刀）', type: 'radio',
    options: ['1 個月內', '1-3 個月', '3-6 個月', '6 個月以上', '不一定'] },
  ...certFields('專業證照或訓練'),

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: OR_FORM_SCHEMA, draftKey: 'dform_draft_or' });
