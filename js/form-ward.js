// 病房自建表單：只定義病房專屬區塊，其餘（機構基本資料 / 輪班別與津貼 /
// 業務與工時共用欄 / 薪資與年資 / 整體評價）沿用 form-sections.js 的共用正本。

import { initDepartmentForm } from './form-engine.js?v=c60f7b9558';
import {
  buildInstitutionSection,
  WORKHOURS_FIELDS,
  SHIFT_ALLOWANCE_SECTION,
  DAILY_OVERTIME_FIELD,
  SALARY_SECTION,
  EVALUATION_SECTION,
} from './form-sections.js?v=c60f7b9558';

// 護病比刻度：與 ICU／精神科相同拆「常態」「最忙時」。區間邊界大致對齊三班護病比標準
// （醫學中心 6/9/11、區域 7/11/13、地區 10/13/15，見 nurse-ratio-view.js STANDARDS）。
const WARD_RATIO = ['1:6 以下', '1:7-8', '1:9-10', '1:11-12', '1:13-15', '1:16 以上'];

// 1-5 分量表：一律「5 分＝負擔最重」，與精神科表單方向一致。
const scale = (low, high) => [
  { value: '1', label: `1（${low}）` },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: `5（${high}）` },
];

// 護病比配置引導文字：可展開查看完整法規條文
const RATIO_INTRO = `<strong>一般病房護病比標準</strong><br><br>
重點：衛福部公告的<strong>三班護病比</strong>標準——<strong>醫學中心 白班 1:6、小夜 1:9、大夜 1:11</strong>；區域醫院 1:7、1:11、1:13；地區醫院 1:10、1:13、1:15。<br>
請依你實際的<strong>第一線照護床數</strong>填寫（不含 Leader／組長）。
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
    unitNameHelp: '例：內科病房、一般外科病房、婦產科病房、兒科病房、安寧病房、呼吸照護病房 (RCW)',
    jobTitleHelp: '例：N0、N1、N2、N3、專科護理師',
  }),

  { section: '病房單位資訊' },
  { name: 'wardType', label: '病房類型', type: 'radio', required: true,
    options: ['內科', '外科', '婦產科', '兒科', '安寧', '呼吸照護（RCW）', '專責／隔離', '綜合（混合科）', '其他'],
    help: '精神科病房請改填「精神科」表單' },
  { name: 'bedCount', label: '單位病床數', type: 'number', min: 0, step: 1,
    help: '你所在病房的開放床數' },

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

  ...SHIFT_ALLOWANCE_SECTION,

  { section: '人力與支援' },
  { name: 'leaderSupport', label: 'Leader／組長', type: 'radio', layout: 'list',
    help: '選最接近你單位常態的一項',
    options: [
      { value: '不佔床，全班協助', label: '不佔床，全班協助', desc: '不分床，整班都能支援各床、處理突發狀況' },
      { value: '不佔床，但少協助', label: '不佔床，但少協助', desc: '不分床，但忙於行政、帳務，很少下來幫忙' },
      { value: '要佔床，有空才協助', label: '要佔床，有空才協助', desc: '自己也分床，顧好自己的病人才有餘力幫忙' },
      { value: '無 Leader', label: '無 Leader', desc: '單位沒有 Leader／組長的設置' },
    ] },
  { name: 'nonNursingStaff', label: '單位有哪些非護理人力', type: 'checkbox',
    options: ['護佐', '照服員', '書記', '傳送'], help: '可複選；皆無則不勾' },
  { name: 'floatFreq', label: '被借調（float）支援其他單位的頻率', type: 'radio',
    options: ['從不', '每月 1-2 次', '每週 1-2 次', '每週多次'] },
  { name: 'newbieIndependence', label: '新人多久開始獨立照護', type: 'radio',
    options: ['1 個月內', '1-2 個月', '2-3 個月', '3 個月以上', '不一定'],
    help: '從到職到不需學姊帶、自己分床的時間' },
  { name: 'newbieNightShift', label: '新人多久開始上夜班', type: 'radio',
    options: ['到職 3 個月內', '3-6 個月', '6-12 個月', '1 年以上', '不排夜班'] },

  { section: '業務與工時' },
  DAILY_OVERTIME_FIELD,
  ...WORKHOURS_FIELDS,
  { name: 'nonNursingDuties', label: '需要由護理師做的非護理業務', type: 'checkbox',
    options: ['傳送病人／檢體', '補貨／點班', '清潔消毒', '書記／行政', '其他'],
    help: '可複選；皆無則不勾' },
  { name: 'nonNursingBurden', label: '非護理業務負擔', type: 'radio',
    options: scale('很輕', '非常重') },

  ...SALARY_SECTION,
  ...EVALUATION_SECTION,
];

initDepartmentForm({ schema: WARD_FORM_SCHEMA, draftKey: 'dform_draft_ward' });
