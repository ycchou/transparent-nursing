// 勞檢紀錄頁面 — 使用共用的 records-common.js
// 資料來源：勞動部公開資料

import {
  parseROCDate,
  parseFine,
  extractLawArticles,
  shortenLocation,
  createCsvLoader,
  initRecordsPage,
  getCachedCount,
} from './records-common.js?v=28ce4a4ed6';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRqnLPDCLdMztF2BjdA_W6jgZNahmxLmlOEz5C5Cg67WrMcy8O05Gb3jbizDrjr03O0tu-WQ2Qv9dN/pub?gid=190468784&single=true&output=csv';
const STORAGE_KEY = 'nursing_viol_v2';
const LOG_TAG = '[violations]';

// 勞動基準法 條號 → 白話標籤
const LAW_LABELS = {
  '21': '工資', '22': '工資', '23': '工資',
  '24': '加班費',
  '30': '工時/出勤紀錄',
  '32': '延長工時',
  '34': '輪班間隔',
  '35': '休息時間',
  '36': '例假/休息日',
  '37': '國定假日',
  '38': '特休',
  '39': '假日工資',
  '46': '童工/未成年',
};
const articleLabel = (a) => LAW_LABELS[a] || `第 ${a} 條`;

// CSV 每列 → record 物件（勞檢版：10 欄，索引 0-9）
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
    note: String(r[9] || '').trim(),
    articles: extractLawArticles(r[6]),
  };
};

const loader = createCsvLoader({
  csvUrl: CSV_URL,
  storageKey: STORAGE_KEY,
  logTag: LOG_TAG,
  parseRow,
});

export const initViolations = initRecordsPage({
  loader,
  articleLabel,
  lawShort: '勞基法',
  modalTag: '勞檢紀錄',
  logTag: LOG_TAG,
  storageDomId: 'viol-detail-modal',
});

export function preloadViolations() { loader.preload(); }
export function getViolationsCount() { return getCachedCount(STORAGE_KEY); }
