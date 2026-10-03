// 急診自建表單：只定義急診專屬區塊，其餘（機構基本資料 / 輪班別與津貼 / 人力與支援 /
// 業務與工時共用欄 / 職場暴力 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=b540de8f2d';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SHIFT_ALLOWANCE_SECTION,
  NON_NURSING_HELP_FIELDS,
  NEWBIE_FIELDS,
  WARD_RATIO,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
  scale,
  VIOLENCE_FREQ_FIELD,
  VIOLENCE_RISK_FIELD,
  POST_INCIDENT_SUPPORT_FIELD,
} from './form-sections.js?v=b540de8f2d';

// 急診各區負荷差很多，護病比改「依區域」問，不依白／小夜／大夜（急診三班的人力配置通常相近）。
// 重症／急救區比照加護病房的刻度；留觀／一般診療區比照病房刻度。都加「沒待過此區」。
const NOT_IN_AREA = '沒待過此區';
const CRITICAL_RATIO = ['1:1', '1:2', '1:3', '1:4', '1:5 以上', NOT_IN_AREA];
const GENERAL_RATIO = [...WARD_RATIO, NOT_IN_AREA];

const RATIO_INTRO = `<strong>急診護理人力標準</strong><br><br>
急診沒有像病房一樣的「三班護病比」公告標準，人力主要看<strong>醫院評鑑</strong>與<strong>緊急醫療能力分級（急救責任醫院）</strong>的要求，
各區負荷也差很多，所以這裡<strong>依區域</strong>問你實際照顧的病人數。沒輪過的區域選「${NOT_IN_AREA}」即可。
<details style="margin-top:12px;">
  <summary style="cursor:pointer;color:var(--primary);font-weight:600;"><span data-icon="book-open" data-size="16" class="ico-inline"></span>點此查看相關規範</summary>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.1);">
    <strong>1. 緊急醫療能力分級（急救責任醫院）</strong><br>
    依衛福部「醫院緊急醫療能力分級標準」分為<strong>重度級、中度級、一般級</strong>，等級越高，
    須具備的急診專責護理人力、急救與重症處置能力要求越高。<br><br>
    <strong>2.《醫院評鑑基準》</strong><br>
    急診應有足夠且受過訓練的護理人力（急救訓練如 ACLS、ETTC、APLS 等），並依病人量與檢傷級數調配。<br><br>
    <strong>3. 檢傷分類</strong><br>
    台灣急診檢傷分類（TTAS）分 1–5 級；第 1、2 級（復甦急救、危急）病人需立即或短時間內處置，
    照護負荷遠高於一般診療區。
  </div>
</details>`;

const ER_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：成人急診、兒童急診、急診加護病房（EICU）、急診留觀區',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '急診單位資訊' },
  { name: 'erLevel', label: '急救責任醫院等級', type: 'radio', required: true,
    options: ['重度級', '中度級', '一般級', '不清楚'],
    help: '衛福部「緊急醫療能力分級」' },
  { name: 'erArea', label: '主要輪值的區域', type: 'checkbox', required: true,
    options: ['檢傷', '急救區（復甦室）', '重症區', '一般診療區（內／外科）', '兒科急診', '留觀區', '急診加護（EICU）'],
    help: '可複選' },
  { name: 'fullBedThreshold', label: '急診通報「滿床」的門檻標準／感受', type: 'radio',
    options: ['高（極嚴格／很難報滿）', '中', '低（容易通報滿床）', '不清楚'],
    help: '院方要到多擁擠才允許向 119／區域通報滿床、請救護車改送他院' },
  { name: 'erCrowding', label: '急診壅塞程度（病人等床滯留急診）', type: 'radio',
    options: scale('很少壅塞', '天天爆滿') },

  { section: '護病比配置（依區域）', intro: RATIO_INTRO },
  { name: 'criticalRatio', label: '急救／重症區・常態', type: 'radio', required: true,
    options: CRITICAL_RATIO, help: '平常 1 名護理師照顧幾位病人（例：1:2 ＝ 1 名顧 2 位）' },
  { name: 'criticalPeakRatio', label: '急救／重症區・最忙時', type: 'radio', required: true,
    options: CRITICAL_RATIO, help: '尖峰／忙的時候最多會到幾位' },
  { name: 'observationRatio', label: '留觀／一般診療區・常態', type: 'radio', required: true,
    options: GENERAL_RATIO },
  { name: 'observationPeakRatio', label: '留觀／一般診療區・最忙時', type: 'radio', required: true,
    options: GENERAL_RATIO },
  { name: 'triageRatio', label: '檢傷站・尖峰時段每小時約檢傷幾位', type: 'radio',
    options: ['10 位以下', '10-20 位', '20-30 位', '30 位以上', NOT_IN_AREA] },

  ...SHIFT_ALLOWANCE_SECTION,
  { name: 'erHazardPay', label: '是否有急診特殊單位加給', type: 'radio',
    options: ['有', '無', '不清楚'] },

  { section: '重症處置與分工' },
  { name: 'criticalTeam', label: '特殊重症（CPR、主動脈剝離、急性心肌梗塞等）是否有專責主責人員或固定分工編組',
    type: 'radio', required: true, options: ['是', '否'],
    help: '例：急救時有固定的主責護理師、記錄、給藥、壓胸分工，而不是臨時誰有空誰上' },

  { section: '人力與支援' },
  ...NON_NURSING_HELP_FIELDS,
  ...NEWBIE_FIELDS,

  { section: '急救證照與訓練', intro: 'ACLS、ETTC、APLS、嬰兒急救（NRP／PALS）等急救證照的考照與複訓。' },
  { name: 'certLeave', label: '考取或複訓急救證照是否給公假', type: 'radio', required: true,
    options: ['全程給公假', '僅部分給假', '需用自己休假（放假天去上課）'] },
  { name: 'certFee', label: '證照考照與受訓費用是否補助', type: 'radio', required: true,
    options: ['全額公費', '部分補助', '完全自費'] },

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,

  { section: '職場安全', intro: '急診是醫療暴力最常發生的地方：病人、家屬的言語辱罵與肢體攻擊，以及事後醫院給的支持。' },
  VIOLENCE_FREQ_FIELD,
  VIOLENCE_RISK_FIELD,
  { name: 'securitySupport', label: '發生暴力或衝突時，警衛／保全是否能即時協助', type: 'radio',
    options: ['有，隨叫隨到', '有，但常需等待', '無，靠護理人員自己'] },
  POST_INCIDENT_SUPPORT_FIELD,

  { section: '整體負擔' },
  { name: 'stressLevel', label: '整體壓力', type: 'radio', options: scale('很低', '非常高') },

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: ER_FORM_SCHEMA, draftKey: 'dform_draft_er' });
