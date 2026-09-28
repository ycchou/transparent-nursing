// 精神科自建表單：只定義精神科專屬區塊，其餘（機構基本資料 / 輪班別與津貼 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=7065d0fdf0';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SHIFT_ALLOWANCE_SECTION,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=7065d0fdf0';

// 護病比刻度：與 ICU 相同拆「常態」「最忙時」，但精神科一人顧的床數多（慢性大夜常 1:30 以上），改用區間。
// 日間照護等沒有小夜／大夜的單位選「無此班別」。
const PSYCH_RATIO = ['1:5 以下', '1:6-10', '1:11-15', '1:16-20', '1:21-30', '1:31 以上', '無此班別'];

// 1-5 分量表：一律「5 分＝負擔／風險最重」，方向一致才能並排比較。
const scale = (low, high) => [
  { value: '1', label: `1（${low}）` },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: `5（${high}）` },
];

// 護病比配置引導文字：可展開查看完整法規條文
const RATIO_INTRO = `<strong>精神科護病比設置標準</strong><br><br>
重點：急性一般病床的<strong>全日平均護病比</strong>，<strong>精神科教學醫院 ≦ 12 人、精神科醫院 ≦ 15 人</strong>（綜合醫院依層級：醫學中心 9、區域 12、地區 15）。這是三班平均值，小夜、大夜實際一人照顧的病人數通常遠高於此。
<details style="margin-top:12px;">
  <summary style="cursor:pointer;color:var(--primary);font-weight:600;"><span data-icon="book-open" data-size="16" class="ico-inline"></span>點此查看完整法規條文</summary>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.1);">
    <strong>1.《醫療機構設置標準》第 12-1 條（全日平均護病比）</strong><br>
    醫院及精神科醫院應依住院病人人數配置適當之護產人員；急性一般病床之全日平均護病比（每一護產人員照護之病人人數）：<br>
    ・醫學中心：9 人以下<br>
    ・區域醫院及精神科教學醫院：12 人以下<br>
    ・地區醫院及精神科醫院：15 人以下<br>
    （因人事異動不符規定者，應自事實發生之日起 30 日內補正。）<br><br>
    <strong>2.《醫療機構設置標準》附表（三）精神科醫院設置標準表（護理人員）</strong><br>
    此為「病床數 : 總護理人力」的配置底線，並非每班護病比。<br>
    ・精神急性一般病床：每 3.5 床 1 人以上（教學醫院每 2.8 床）<br>
    ・精神慢性一般病床：每 15 床 1 人以上（教學醫院每 12 床）<br>
    ・精神科日間照護單位：每 20 名服務量 1 人以上（教學醫院每 16 名）<br>
    ・精神科加護病床：每 2 床 1 人以上（教學醫院每 1.6 床）<br>
    （護理人員包括護理師及護士。）
  </div>
</details>`;

const PSYCH_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：精神科急性病房、慢性病房、兒童青少年精神科病房、成癮治療病房、日間病房',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '精神科單位資訊' },
  { name: 'psychHospitalKind', label: '醫院屬性', type: 'radio', required: true,
    options: ['綜合醫院精神科', '精神科醫院', '精神科教學醫院', '不清楚'],
    help: '精神科醫院／精神科教學醫院依衛福部「精神科醫院評鑑」結果區分，兩者護病比標準不同' },
  { name: 'psychType', label: '病房類型', type: 'radio', required: true,
    options: ['急性一般', '急性兒童青少年', '急性老年', '急性成癮', '慢性', '精神科加護', '精神科急診', '日間照護', '其他'] },
  { name: 'bedCount', label: '單位病床數', type: 'number', min: 0, step: 1,
    help: '你所在病房的開放床數（日間照護填服務量）' },
  { name: 'nursingAides', label: '是否有護佐／照服員', type: 'radio',
    options: ['有，每班都有', '有，僅白班', '無'] },
  { name: 'teamSupport', label: '跨專業團隊', type: 'radio',
    options: ['完整（心理/職能/社工/醫師）', '部分（缺 1-2 種）', '主要靠護理'] },
  { name: 'ehrLevel', label: '護理紀錄電子化程度', type: 'radio',
    options: ['全面電子化', '部分電子化', '紙本為主'] },

  { section: '護病比配置', intro: RATIO_INTRO },
  { name: 'dayShiftRatio', label: '白班・常態護病比', type: 'radio', required: true,
    options: PSYCH_RATIO, help: '平常 1 名護理師照顧幾位病人（例：1:8 ＝ 1 名顧 8 位）' },
  { name: 'dayPeakRatio', label: '白班・最忙時', type: 'radio', required: true,
    options: PSYCH_RATIO, help: '尖峰／忙的時候最多會到幾位' },
  { name: 'eveningShiftRatio', label: '小夜・常態護病比', type: 'radio', required: true,
    options: PSYCH_RATIO },
  { name: 'eveningPeakRatio', label: '小夜・最忙時', type: 'radio', required: true,
    options: PSYCH_RATIO },
  { name: 'nightShiftRatio', label: '大夜・常態護病比', type: 'radio', required: true,
    options: PSYCH_RATIO },
  { name: 'nightPeakRatio', label: '大夜・最忙時', type: 'radio', required: true,
    options: PSYCH_RATIO },

  ...SHIFT_ALLOWANCE_SECTION,
  { name: 'psychHazardPay', label: '是否有精神科危險／特殊加給', type: 'radio',
    options: ['有', '無', '不清楚'] },

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,
  { name: 'adminBurden', label: '臨床行政業務負擔', type: 'radio',
    options: scale('很輕', '非常重'), help: '評鑑資料、表單、會議等非直接照護業務' },

  { section: '共病照護', intro: '病人合併內外科問題時的照護負擔與後送資源。' },
  { name: 'medicalComorbidity', label: '收治合併內外科疾病病人的頻率', type: 'radio',
    options: ['總是', '經常', '偶爾', '很少', '幾乎沒有'] },
  { name: 'tubeCare', label: '有照護下列管路的病人', type: 'checkbox',
    options: ['鼻胃管', '導尿管', '氣切管', '其他'], help: '可複選；皆無則不勾' },
  { name: 'medicalPhysician', label: '內外科醫師支援', type: 'radio',
    options: ['院內有內外科醫師', '定期駐診', '僅能會診／轉外院', '無'] },
  { name: 'transferDifficulty', label: '病人後送困難度', type: 'radio',
    options: scale('很容易', '非常困難'), help: '病人生理狀況惡化、病房無法照顧時，轉送內外科或他院的難易程度' },

  { section: '職場安全',
    intro: '處理自傷、暴力、逃跑等事件時，自身安全是否受保障，以及事後團隊與醫院的支持。' },
  { name: 'violenceFreq', label: '過去一個月遇到病人暴力（含言語）的頻率', type: 'radio', required: true,
    options: ['完全沒有', '1-5 次', '6-10 次', '11-20 次', '幾乎每天'] },
  { name: 'incidentFreq', label: '過去三個月病房發生自傷／自殺／逃跑事件', type: 'radio',
    options: ['無', '1-2 次', '3-5 次', '6 次以上'] },
  { name: 'restraintFreq', label: '約束／隔離頻率', type: 'radio',
    options: ['每日多次', '每週數次', '偶爾', '罕見'] },
  { name: 'violenceRiskFeeling', label: '處理暴力事件時的危險感', type: 'radio',
    options: scale('很安全', '非常危險') },
  { name: 'securitySupport', label: '約束隔離時是否有防護班／警衛協助', type: 'radio',
    options: ['有，隨叫隨到', '有，但常需等待', '無，靠護理人員自己'] },
  { name: 'postIncidentSupport', label: '暴力事件後，醫院給的支持', type: 'radio', layout: 'list',
    help: '選最接近你單位實際狀況的一項',
    options: [
      { value: '非常完善', label: '非常完善', desc: '立即關懷，並有實質補償、主動檢討流程' },
      { value: '良好', label: '良好', desc: '主管及院方及時關心、提供協助' },
      { value: '普通', label: '普通', desc: '照流程通報，主管口頭關心，沒有實質資源' },
      { value: '不太足夠', label: '不太足夠', desc: '只有例行通報，沒有心理關懷或改善行動' },
      { value: '非常不足', label: '非常不足', desc: '缺乏關懷，甚至檢討護理人員、要自己承擔' },
    ] },

  { section: '硬體環境' },
  { name: 'protectionRoomCount', label: '保護室（可約束隔離空間）數量', type: 'radio',
    options: ['0', '1', '2', '3 間以上'] },
  { name: 'hasProtectionRoom', label: '保護室狀況', type: 'radio',
    options: ['良好', '堪用', '老舊／不安全', '無保護室'] },

  { section: '整體負擔' },
  { name: 'stressLevel', label: '整體壓力', type: 'radio', options: scale('很低', '非常高') },
  { name: 'careDifficulty', label: '病人照顧難度', type: 'radio', options: scale('很容易', '非常困難') },

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: PSYCH_FORM_SCHEMA, draftKey: 'dform_draft_psych' });
