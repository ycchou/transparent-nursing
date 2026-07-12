// 多元護理職場（其他類別）自建表單：涵蓋職護／廠護、居家護理、長照、學校護理師、
// 月子中心、藥廠／醫材（CRA/CRC）、公共衛生等非傳統臨床場域。
// 只定義本類別專屬區塊，其餘（機構基本資料 / 業務與工時共用欄 / 薪資與年資 / 整體評價）
// 沿用 form-sections.js 的共用正本；引擎邏輯在 form-engine.js。

import { initDepartmentForm } from './form-engine.js?v=0fdcc10059';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=0fdcc10059';

// 職場類型：多元護理職涯的常見場域（選最接近者，可於短評補充）
const WORKPLACE_TYPES = [
  '職護／廠護', '居家護理', '長照機構／護理之家', '學校護理師',
  '月子中心', '診所／醫美', '藥廠／醫材（MSL/CRA/CRC）', '公共衛生／衛生所', '其他',
];

// 護理師以外的其他證書／資格（可複選；此工作實際持有或要求者）
const OTHER_CERTS = [
  '廠護／職業衛生護理', '個案管理師', 'IBCLC 國際泌乳顧問',
  '長照相關證照', 'BLS／ACLS 等急救', '無', '其他',
];

const OTHER_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：某科技廠醫護室、居家護理所、月子中心、學校保健室、衛生所',
    jobTitleHelp: '例：廠護／職護、個案管理師、學校護理師、公衛護士、N1–N4',
  }),

  { section: '職場屬性',
    intro: '本表單適用於加護病房、病房、急診等傳統臨床場域<strong>以外</strong>的多元護理職涯。請依實際情況填寫。' },
  { name: 'workplaceType', label: '職場類型', type: 'radio', required: true,
    options: WORKPLACE_TYPES, help: '選最接近的類型，細節可於下方短評補充' },
  { name: 'practiceRegistration', label: '是否需執業登記', type: 'radio', required: true,
    options: ['需要', '不需要', '不清楚'],
    help: '此職務是否要求辦理「護理人員執業登記」（部分藥廠／醫材職缺不需要）' },
  { name: 'otherCerts', label: '護理師以外的其他證書／資格', type: 'checkbox',
    options: OTHER_CERTS, help: '此工作實際持有或要求的資格（可複選；皆無則勾「無」）' },
  { name: 'certRequired', label: '上述其他資格是否為此工作必備條件', type: 'radio',
    options: ['是，必備', '否，加分用', '不適用'] },

  { section: '值班制度' },
  { name: 'scheduleSystem', label: '排班制度', type: 'radio', required: true,
    options: ['見紅休（週休二日＋國定假日）', '排班制（輪班）', '其他'],
    help: '見紅休＝比照行事曆紅字放假，多為純白班職務' },
  { name: 'shiftPattern', label: '輪班型態', type: 'radio',
    options: ['純白班', '需輪小夜', '需輪三班', '無需輪班', '其他'] },

  { section: '業務與工時' },
  { name: 'fieldWork', label: '是否需外出值勤', type: 'radio', required: true,
    options: ['是', '否'], help: '例：居家訪視、廠區／校外巡檢、外展服務' },
  { name: 'violenceRisk', label: '暴力風險', type: 'radio', required: true,
    options: ['高', '中', '低', '無'], help: '工作中面對肢體／言語暴力的風險程度' },
  { name: 'dailyOvertime', label: '每日平均加班時間', type: 'radio',
    options: ['無', '1 小時內', '1-2 小時', '2-3 小時', '3 小時以上'] },
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: OTHER_FORM_SCHEMA, draftKey: 'dform_draft_other' });
