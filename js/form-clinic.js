// 診所自建表單：只定義診所專屬區塊，其餘（機構基本資料 / 業務與工時共用欄 /
// 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本；引擎邏輯在 form-engine.js。

import { initDepartmentForm } from './form-engine.js?v=fa645f33b1';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=fa645f33b1';

// 診所科別（含醫美、洗腎診所等——皆為獨立基層診所）
const CLINIC_SPECIALTIES = [
  '家醫／一般內科', '小兒科', '耳鼻喉科', '皮膚科', '婦產科', '眼科',
  '骨科／復健', '身心科', '泌尿／腸胃', '醫美', '洗腎診所', '牙科', '中醫', '健檢', '其他',
];

// 主要業務（可複選）——凸顯診所「一人身兼多職」的樣態
const CLINIC_DUTIES = [
  '跟診協助', '批價／掛號／櫃檯', '給藥／藥品調劑協助', '注射／抽血',
  '傷口換藥／小手術協助', '疫苗接種', '醫美療程協助', '衛教',
  '進貨／庫存／藥械管理', '健保申報／行政', '環境清潔／消毒', '其他',
];

const CLINIC_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：XX 耳鼻喉科診所、XX 皮膚科診所、XX 醫美診所、XX 洗腎診所',
    jobTitleHelp: '例：診所護理師、跟診護理師、櫃檯護理師、護理長',
  }),

  { section: '診所資訊' },
  { name: 'clinicSpecialty', label: '診所科別', type: 'radio', required: true,
    options: CLINIC_SPECIALTIES, help: '選最接近的科別；綜合診所可選最主要的一項' },
  { name: 'clinicPayerType', label: '健保／自費', type: 'radio', required: true,
    options: ['健保特約為主', '自費為主（如醫美）', '兩者皆有'] },
  { name: 'clinicScale', label: '護理人力規模', type: 'radio', required: true,
    options: ['只有我一人', '2–3 人', '4 人以上'],
    help: '同一診所（同時段）大約有幾位護理人員' },

  { section: '業務內容' },
  { name: 'clinicDuties', label: '主要業務', type: 'checkbox',
    options: CLINIC_DUTIES, help: '可複選——診所常一人身兼多職' },

  { section: '班別與工時' },
  { name: 'clinicShift', label: '看診時段／班別', type: 'radio', required: true,
    options: ['純早診', '早＋午診', '早＋午＋晚診', '含夜診', '週末門診輪值', '其他'] },
  { name: 'dailyPatients', label: '每日看診人次', type: 'radio',
    options: ['30 以下', '30–60', '60–100', '100–150', '150 以上'],
    help: '你負責的診每天大約看多少人次' },
  { name: 'lunchBreak', label: '是否有休息一個小時', type: 'radio', required: true,
    options: ['有，完整 1 小時', '有，但常被中斷／縮短', '無'],
    help: '中午（或診間空檔）是否有完整休息時間' },

  { section: '業務與工時' },
  ...WORKHOURS_FIELDS,

  { section: '勞動權益' },
  { name: 'laborInsurance', label: '勞健保投保', type: 'radio',
    options: ['有，足額投保', '有，但以多報少', '無'],
    help: '雇主是否依實際薪資足額投保勞保／健保' },
  { name: 'holidayCompliance', label: '國定假日出勤補假／加倍', type: 'radio',
    options: ['依法給', '部分', '無／不清楚'],
    help: '國定假日上班是否依法補假或加倍給薪' },
  { name: 'annualLeave', label: '特休給假', type: 'radio',
    options: ['依法給足', '打折', '幾乎無'] },

  { section: '職業風險' },
  { name: 'patientComplaints', label: '被申訴頻率', type: 'radio',
    options: ['經常', '偶爾', '罕見', '幾乎沒有'],
    help: '被病人／家屬申訴的頻率' },
  { name: 'violenceRisk', label: '暴力風險', type: 'radio', required: true,
    options: ['高', '中', '低', '無'],
    help: '面對病人／家屬肢體或言語暴力的風險程度' },

  ...SALARY_SECTION,
  { name: 'salaryStructure', label: '薪資結構', type: 'radio',
    options: ['固定月薪', '月薪＋看診量／獎金', '時薪', '其他'] },

  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: CLINIC_FORM_SCHEMA, draftKey: 'dform_draft_clinic' });
