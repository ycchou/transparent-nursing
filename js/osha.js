// 職安紀錄頁面 — 使用共用的 records-common.js
// 資料來源：勞動部職業安全衛生法違規紀錄
// CSV 比勞檢多 3 欄：職業災害之罹災人數 / 發生日期 / 發生地點（位於備註前）

import {
  parseROCDate,
  parseFine,
  extractLawArticles,
  shortenLocation,
  createCsvLoader,
  initRecordsPage,
  getCachedCount,
} from './records-common.js?v=d15f6d7c04';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9_GMqmZfaampaPKcnetc5UqhvKueTvDYBO71LhKbTY9E1sdlie-wHM0krYmEkQFSurFRh-bdevS1_/pub?gid=1130584206&single=true&output=csv';
const STORAGE_KEY = 'nursing_osha_v1';
const LOG_TAG = '[osha]';

// 職業安全衛生法 條號 → 白話標籤
const LAW_LABELS = {
  '6':  '安全設施',
  '7':  '危險機械檢查',
  '8':  '作業檢查',
  '10': '危害告知',
  '12': '作業環境監測',
  '14': '化學品管理',
  '15': '優先管理化學品',
  '16': '管制性化學品',
  '17': '新化學物質登記',
  '18': '作業場所警示',
  '19': '危險作業訓練',
  '20': '健康檢查',
  '22': '健康服務',
  '23': '職安衛管理制度',
  '24': '合格人員',
  '25': '承攬安全',
  '26': '共同作業',
  '27': '告知職業危害',
  '32': '安全衛生教育訓練',
  '34': '工作守則',
  '37': '職業災害通報',
  '38': '職業災害統計',
  '43': '罰則',
};
const articleLabel = (a) => LAW_LABELS[a] || `第 ${a} 條`;

// CSV 每列 → record 物件（職安版：13 欄）
// 欄位順序：0 編號, 1 縣市/單位別, 2 公告日期, 3 事業單位, 4 處分日期, 5 處分字號,
//          6 違反法規條款, 7 法條敘述, 8 罰鍰金額,
//          9 職業災害之罹災人數, 10 職業災害之發生日期, 11 職業災害之發生地點, 12 備註
const parseRow = (r) => {
  const locationRaw = String(r[1] || '').trim();
  return {
    id: String(r[0] || '').trim(),
    location: shortenLocation(locationRaw),
    locationRaw,
    publishDate: parseROCDate(r[2]),
    publishDateRaw: String(r[2] || '').trim(),
    institutionName: String(r[3] || '').trim(),
    penaltyDate: parseROCDate(r[4]),
    penaltyDateRaw: String(r[4] || '').trim(),
    docId: String(r[5] || '').trim(),
    lawArticle: String(r[6] || '').trim(),
    lawDesc: String(r[7] || '').trim(),
    fine: parseFine(r[8]),
    accidentCasualties: String(r[9] || '').trim(),
    accidentDate: parseROCDate(r[10]),
    accidentDateRaw: String(r[10] || '').trim(),
    accidentLocation: String(r[11] || '').trim(),
    note: String(r[12] || '').trim(),
    articles: extractLawArticles(r[6]),
  };
};

// 職安專屬：modal 內額外顯示職災 3 欄
const extraModalFields = (row) => [
  { label: '職災罹災人數', value: row.accidentCasualties },
  { label: '職災發生日期', value: row.accidentDateRaw },
  { label: '職災發生地點', value: row.accidentLocation },
];

const loader = createCsvLoader({
  csvUrl: CSV_URL,
  storageKey: STORAGE_KEY,
  logTag: LOG_TAG,
  parseRow,
});

export const initOsha = initRecordsPage({
  loader,
  articleLabel,
  lawShort: '職安法',
  modalTag: '職安紀錄',
  logTag: LOG_TAG,
  extraModalFields,
  storageDomId: 'osha-detail-modal',
});

export function preloadOsha() { loader.preload(); }
export function getOshaCount() { return getCachedCount(STORAGE_KEY); }
