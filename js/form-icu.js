// 加護病房（ICU）自建表單：只定義 ICU 專屬區塊，其餘（機構基本資料 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=8f9cf82f88';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=8f9cf82f88';

// 護病比刻度：把「常態」與「最忙時」拆成兩個純數字維度，直觀且可統計。
// （第一線值班護理人員：照顧病人床數，例：1:2 ＝ 1 名護理師顧 2 床）
const ICU_RATIO_BASE = ['1:1', '1:2', '1:3', '1:4', '1:5 以上', '其他'];
const ICU_RATIO_PEAK = ['1:1', '1:2', '1:3', '1:4', '1:5 以上', '其他'];

// 護病比配置引導文字：可展開查看完整法規／評鑑條文全文
const RATIO_INTRO = `<strong>ICU 護病比設置標準與評鑑基準</strong><br><br>
重點：加護病房<strong>每床應有 1.5 人以上</strong>（設置標準）；醫院評鑑必要條文對<strong>區域醫院要求每床 ≧ 2.0 人</strong>、地區醫院 1.5 人；健保「加護病床病房費及護理費」則依<strong>「加護病房評定」等級分級給付</strong>。
<details style="margin-top:12px;">
  <summary style="cursor:pointer;color:var(--primary);font-weight:600;">📖 點此查看完整法規／評鑑條文全文</summary>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.1);">
    <strong>1.《醫療機構設置標準》</strong><br>
    此為醫院設立特殊病床的基本法律底線，採「總床數配置比」而非日常三班護病比。<br>
    〔條文原文摘要〕加護病房：每床應有一點五人以上。<br><br>
    <strong>2.《醫院評鑑基準》條號：必 1.3.4（必要條文，區域／地區醫院版；醫學中心版對應為必 1.3.6）</strong><br>
    列為必要條文（須完全達成，否則評鑑直接不及格），依醫院層級加嚴：<br>
    ・申請「地區醫院」評鑑者：加護病房每床應有 1.5 人以上。<br>
    ・申請「區域醫院」評鑑者：加護病房每床應有 2.0 人以上。<br>
    （註：護產人員以護理師、護士、助產師（士）並辦理執業登記者計；護佐、照顧服務員、書記等不列計。）<br><br>
    <strong>3.《醫院評鑑基準》條號：重 2.3.5（重點條文）</strong><br>
    〔條文原文〕適當的護病比。<br>
    〔目的〕合理的護理人員照護負荷，以維護照護品質。<br>
    〔符合項目〕應符合醫療機構設置標準。<br>
    （註：評鑑實地查核是以「護理紀錄」來回推三班現場的實際照護負荷。）<br><br>
    <strong>4.《全民健康保險醫療服務給付項目及支付標準》</strong><br>
    健保以給付連動 ICU 人力：加護病床之<strong>病房費與護理費，依主管機關「加護病房評定」等級（對應醫學中心／區域／地區之 A／B／C 級）分級給付</strong>，層級越高、應具備之人力與設備條件越嚴。<br>
    〔出處〕支付標準 第二部・第一章・第三節「病房費」通則。實際每班護理人力仍以上列設置標準與評鑑基準（區域每床 2 人、地區 1.5 人）為準。
  </div>
</details>`;

const ICU_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：內科加護病房 (MICU)、外科 (SICU)、心臟內科 (CCU)、心臟外科 (CVICU)、神經 (Neuro-ICU)、新生兒 (NICU)、兒童 (PICU)、綜合 ICU',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '加護病房資訊' },
  { name: 'bedbathFreq', label: 'Bedbath 頻率', type: 'radio',
    options: ['QD & PRN', 'QOD & PRN', '其他'],
    help: 'QD＝每日、QOD＝隔日、PRN＝需要時' },
  { name: 'ppCareFreq', label: 'PP care 頻率', type: 'radio',
    options: ['QD & PRN', 'QOD & PRN', '其他'],
    help: 'PP care＝Perineal Care 陰部護理；QD＝每日、QOD＝隔日、PRN＝需要時' },

  { section: '護病比配置', intro: RATIO_INTRO },
  { name: 'dayShiftRatio', label: '白班・常態護病比', type: 'radio', required: true,
    options: ICU_RATIO_BASE, help: '平常 1 名護理師照顧幾床（例：1:2 ＝ 1 名顧 2 床）' },
  { name: 'dayPeakRatio', label: '白班・最忙時', type: 'radio', required: true,
    options: ICU_RATIO_PEAK, help: '尖峰／忙的時候最多會到幾床' },
  { name: 'eveningShiftRatio', label: '小夜・常態護病比', type: 'radio', required: true,
    options: ICU_RATIO_BASE },
  { name: 'eveningPeakRatio', label: '小夜・最忙時', type: 'radio', required: true,
    options: ICU_RATIO_PEAK },
  { name: 'nightShiftRatio', label: '大夜・常態護病比', type: 'radio', required: true,
    options: ICU_RATIO_BASE },
  { name: 'nightPeakRatio', label: '大夜・最忙時', type: 'radio', required: true,
    options: ICU_RATIO_PEAK },

  { section: '輪班別與津貼',
    intro: `「包班」指固定承包該班別、不輪回白班者；「非包班」為一般三班輪值。<br>下方津貼欄若無此制度或不適用，請填「無」。` },
  { name: 'shiftSystem', label: '班別', type: 'radio', required: true,
    options: ['三班制', '兩班制', '其他'] },
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

  { section: '業務與工時' },
  { name: 'dailyOvertime', label: '每日平均加班時間', type: 'radio',
    options: ['無', '1 小時內', '1-2 小時', '2-3 小時', '4 小時'] },
  ...WORKHOURS_FIELDS,

  { section: '教育訓練與制度' },
  { name: 'icuTrainingRequired', label: '是否硬性規定需 ICU Training', type: 'radio',
    options: ['是', '否', '不清楚'] },
  { name: 'icuTrainingContract', label: 'ICU Training 是否需簽約受訓', type: 'radio',
    options: ['是', '否', '無 ICU Training'] },
  { name: 'icuTrainingPeriod', label: 'ICU Training 受訓期間', type: 'radio',
    options: ['1 個月以內', '1-3 個月', '3-6 個月', '6 個月以上', '不一定／依個人進度', '無 ICU Training'] },
  { name: 'promotionReport', label: '進階制度', type: 'radio',
    options: ['自願參加、有加給', '自願參加、無加給', '強制要求、有加給', '強制要求、無加給', '無此制度'],
    help: '晉升／進階（如 N1→N2）時的報告制度與加給情形' },
  { name: 'advancedTherapyTraining', label: 'CVVH／IABP／ECMO 是否派員受訓', type: 'checkbox',
    options: ['CVVH', 'IABP', 'ECMO'],
    help: '單位有派員受訓的高階治療（可複選；皆無則不勾）' },

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: ICU_FORM_SCHEMA, draftKey: 'dform_draft_icu' });
