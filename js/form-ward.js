// 病房自建表單：只定義病房專屬區塊，其餘（機構基本資料 / 輪班別與津貼 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=5204f79121';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SHIFT_ALLOWANCE_SECTION,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=5204f79121';

// 護病比刻度：與 ICU／精神科相同拆「常態」「最忙時」。區間邊界大致對齊三班護病比標準
// （醫學中心 6/9/11、區域 7/11/13、地區 10/13/15，見 nurse-ratio-view.js STANDARDS）；
// 大夜常見 1:16 以上，再細分到 1:20 以上。
const WARD_RATIO = ['1:6 以下', '1:7-8', '1:9-10', '1:11-12', '1:13-15', '1:16-17', '1:18-19', '1:20 以上'];

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

// 輪班別與津貼：沿用共用區塊，但病房的班別不提供「其他」，
// 且 on call 選「是」時多一題自由描述樣態。
const WARD_SHIFT_SECTION = SHIFT_ALLOWANCE_SECTION.flatMap((f) => {
  if (f.name === 'shiftSystem') return [{ ...f, options: f.options.filter((o) => o !== '其他') }];
  if (f.name === 'hasOnCall') {
    return [f, { name: 'onCallPattern', label: 'on call 樣態', type: 'textarea', rows: 3, maxLength: 150,
      showIf: { field: 'hasOnCall', equals: '是' },
      help: '例：多久輪一次、需待命的時段、被叫回的頻率、有無 on call 費或補休' }];
  }
  return [f];
});

const WARD_FORM_SCHEMA = [
  ...buildInstitutionSection({
    unitNameHelp: '例：內科病房、一般外科病房、婦產科病房、兒科病房、安寧病房',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '病房單位資訊' },
  { name: 'wardType', label: '病房類型', type: 'radio', required: true,
    options: ['內科', '外科', '婦產科', '兒科', '安寧', '綜合（混合科）', '其他'],
    help: '精神科病房請改填「精神科」表單' },

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
  { name: 'nonNursingHelp', label: '單位有無非護理人力（護佐、照服員、病房助理）可以協助照護工作？',
    type: 'radio', options: ['有', '無'] },
  { name: 'nonNursingHelpShifts', label: '哪些班別有非護理人力協助', type: 'checkbox', required: true,
    options: ['白班（D）', '小夜（E）', '大夜（N）'], help: '可複選',
    showIf: { field: 'nonNursingHelp', equals: '有' } },
  { name: 'newbieIndependence', label: '新人多久開始獨立照護', type: 'radio',
    options: ['1 個月內', '1-2 個月', '2-3 個月', '3 個月以上', '不一定'],
    help: '從到職到不需學姊帶、自己分床的時間' },
  { name: 'newbieNightShift', label: '新人多久開始上夜班', type: 'radio',
    options: ['到職 3 個月內', '3-6 個月', '6-12 個月', '1 年以上', '不排夜班'] },

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: WARD_FORM_SCHEMA, draftKey: 'dform_draft_ward' });
