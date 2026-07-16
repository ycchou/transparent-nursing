// 門診自建表單：只定義門診專屬區塊，其餘（機構基本資料 / 業務與工時共用欄 /
// 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本；引擎邏輯在 form-engine.js。

import { initDepartmentForm } from './form-engine.js?v=fbf38edc70';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=fbf38edc70';

// 選擇門診工作的原因（可複選）
const CLINIC_REASONS = [
  '工時規律／少夜班', '家庭因素', '身體因素', '興趣／專長',
  '離職前緩衝', '被調動', '其他',
];

const OUTPATIENT_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：內科門診、心臟內科門診、聯合門診中心、健檢中心',
    jobTitleHelp: '例：門診護理師、跟診護理師、專科護理師、N1–N4',
  }),

  { section: '門診資訊' },
  { name: 'clinicType', label: '門診類型', type: 'text', required: true,
    help: '自由填寫，例：內科門診、心臟內科、皮膚科、聯合門診、健檢中心' },
  { name: 'clinicReason', label: '選擇門診工作的原因', type: 'checkbox',
    options: CLINIC_REASONS, help: '可複選' },
  { name: 'clinicsPerNurse', label: '一次顧幾個門診', type: 'radio', required: true,
    options: ['1 診', '2 診', '3 診', '4 診以上'],
    help: '同一時段 1 名護理師要同時支援幾個診間' },
  { name: 'weeklyPatients', label: '就診人數週平均', type: 'radio',
    options: ['300 以下', '300-600', '600-900', '900-1200', '1200 以上'],
    help: '你負責的門診每週約看多少人次' },

  { section: '班別與工時' },
  { name: 'shiftType', label: '班別', type: 'radio', required: true,
    options: ['純早診（日班）', '早診＋午診', '含夜診', '輪班制', '其他'] },
  { name: 'pShift', label: 'P 班（PRN／需要時才上班）', type: 'radio',
    options: ['是（PRN，需要時才上班）', '否（固定班表）', '部分 PRN'],
    help: 'P 班＝PRN，有需要時才來上班、不需要時放假' },
  { name: 'lunchBreak', label: '是否有休息一個小時', type: 'radio', required: true,
    options: ['有，完整 1 小時', '有，但常被中斷／縮短', '無'],
    help: '中午（或診間空檔）是否有完整休息時間' },
  { name: 'clinicOvertimeWeekly', label: '門診逾時週平均', type: 'radio',
    options: ['幾乎不', '每週 1-2 次', '每週 3-4 次', '幾乎每診都逾時'],
    help: '門診超過表定結束時間（延遲下診）的頻率' },

  { section: '業務與工時' },
  ...WORKHOURS_FIELDS,

  { section: '職業風險' },
  { name: 'patientComplaints', label: '被申訴頻率', type: 'radio', required: true,
    options: ['經常', '偶爾', '罕見', '幾乎沒有'],
    help: '被病人／家屬申訴的頻率' },
  { name: 'violenceRisk', label: '暴力風險', type: 'radio', required: true,
    options: ['高', '中', '低', '無'],
    help: '面對病人／家屬肢體或言語暴力的風險程度' },

  ...SALARY_SECTION,
  { name: 'salaryGrowth', label: '薪資是否依年資增加', type: 'radio',
    options: ['有明確調薪制度', '有但幅度小', '幾乎不調', '不清楚'] },

  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: OUTPATIENT_FORM_SCHEMA, draftKey: 'dform_draft_outpatient' });
