// 病房自建表單：只定義病房專屬區塊，其餘（機構基本資料 / 輪班別與津貼 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=b540de8f2d';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  WARD_SHIFT_SECTION,
  NON_NURSING_HELP_FIELDS,
  NEWBIE_FIELDS,
  WARD_RATIO,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=b540de8f2d';

// 護病比刻度（WARD_RATIO）、班別與 on call、非護理人力、新人訓練皆與精神科共用，定義在 form-sections.js。

// 護病比配置引導文字：可展開查看完整法規條文
const RATIO_INTRO = `<strong>一般病房護病比標準</strong><br><br>
重點：衛福部公告的<strong>三班護病比</strong>標準——<strong>醫學中心 白班 1:6、小夜 1:9、大夜 1:11</strong>；區域醫院 1:7、1:11、1:13；地區醫院 1:10、1:13、1:15。
<details style="margin-top:12px;">
  <summary style="cursor:pointer;color:var(--primary);font-weight:600;"><span data-icon="book-open" data-size="16" class="ico-inline"></span>點此查看完整法規條文</summary>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.1);">
    <strong>1.《醫療機構設置標準》第 12-1 條（全日平均護病比）</strong><br>
    醫院應依住院病人人數配置適當之護產人員；急性一般病床之全日平均護病比（每一護產人員照護之病人人數）：<br>
    ・醫學中心：9 人以下<br>
    ・區域醫院：12 人以下<br>
    ・地區醫院：15 人以下<br>
    （因人事異動不符規定者，應自事實發生之日起 30 日內補正。）<br><br>
    <strong>2. 三班護病比標準（衛福部公告，健保署並據以加成護理費）</strong><br>
    此為分班別的照護上限，比全日平均更貼近第一線實際負荷：<br>
    ・醫學中心：白班 1:6、小夜 1:9、大夜 1:11<br>
    ・區域醫院：白班 1:7、小夜 1:11、大夜 1:13<br>
    ・地區醫院：白班 1:10、小夜 1:13、大夜 1:15<br>
    各醫院每月於健保 VPN 登錄的三班護病比，可在本站「三班護病比」頁查詢。
  </div>
</details>`;

const WARD_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：內科病房、一般外科病房、婦產科病房、兒科病房、安寧病房',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '病房單位資訊' },
  { name: 'wardType', label: '病房類型', type: 'radio', required: true,
    options: ['內科', '外科', '婦產科', '兒科', '安寧', '綜合（混合科）', '其他'],
    help: '精神科病房請改填<a href="participate-psych.html">「精神科」表單</a>（已填的內容會保留在這頁的草稿）' },

  { section: '護病比配置', intro: RATIO_INTRO },
  { name: 'dayShiftRatio', label: '白班・常態護病比', type: 'radio', required: true,
    options: WARD_RATIO, help: '平常 1 名護理師照顧幾床（例：1:8 ＝ 1 名顧 8 床）' },
  { name: 'dayPeakRatio', label: '白班・最忙時', type: 'radio', required: true,
    options: WARD_RATIO, help: '尖峰／忙的時候最多會到幾床' },
  { name: 'eveningShiftRatio', label: '小夜・常態護病比', type: 'radio', required: true,
    options: WARD_RATIO },
  { name: 'eveningPeakRatio', label: '小夜・最忙時', type: 'radio', required: true,
    options: WARD_RATIO },
  { name: 'nightShiftRatio', label: '大夜・常態護病比', type: 'radio', required: true,
    options: WARD_RATIO },
  { name: 'nightPeakRatio', label: '大夜・最忙時', type: 'radio', required: true,
    options: WARD_RATIO },

  ...WARD_SHIFT_SECTION,

  { section: '人力與支援' },
  { name: 'leaderSupport', label: 'Leader／組長', type: 'radio', layout: 'list',
    help: '選最接近你單位常態的一項',
    options: [
      '不佔床，需協助功能性護理',
      '不佔床，主責行政，少量協助功能性護理',
      '佔床（下來當主護），有空協助其他同事',
    ] },
  ...NON_NURSING_HELP_FIELDS,
  ...NEWBIE_FIELDS,

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: WARD_FORM_SCHEMA, draftKey: 'dform_draft_ward' });
