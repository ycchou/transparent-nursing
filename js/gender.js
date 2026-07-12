// 性平紀錄頁面 — 使用共用的 records-common.js
// 資料來源：勞動部性別平等工作法違規紀錄

import {
  parseROCDate,
  parseFine,
  extractLawArticles,
  shortenLocation,
  createCsvLoader,
  initRecordsPage,
  getCachedCount,
} from './records-common.js?v=1957ae4d1f';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpvfTkfNPgrf4dtpZrpRmign7EB9ISShRslgAhVcxRu-WO3G9I4W5efjSjMan_RnId0-rDvju4gzfy/pub?gid=1540285352&single=true&output=csv';
const STORAGE_KEY = 'nursing_gender_v1';
const LOG_TAG = '[gender]';

// 性別平等工作法 條號 → 白話標籤
const LAW_LABELS = {
  '7':  '招募雇用歧視',
  '8':  '教育訓練歧視',
  '9':  '福利歧視',
  '10': '薪資歧視',
  '11': '離職退休歧視',
  '12': '性騷擾定義',
  '13': '性騷擾防治',
  '14': '生理假',
  '15': '產假/陪產假',
  '16': '育嬰留停',
  '17': '家庭照顧假',
  '18': '哺乳時間',
  '19': '減少工時',
  '20': '育嬰留停申請',
  '21': '不利處分禁止',
  '22': '申訴保障',
  '23': '申訴管道',
  '30': '性騷擾懲戒',
  '31': '申訴回覆',
  '32': '雇主義務',
  '38': '罰則',
};
const articleLabel = (a) => LAW_LABELS[a] || `第 ${a} 條`;

// CSV 每列 → record 物件（性平版：10 欄，索引 0-9，跟勞檢同結構）
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

export const initGender = initRecordsPage({
  loader,
  articleLabel,
  lawShort: '性平法',
  modalTag: '性平紀錄',
  logTag: LOG_TAG,
  storageDomId: 'gender-detail-modal',
});

export function preloadGender() { loader.preload(); }
export function getGenderCount() { return getCachedCount(STORAGE_KEY); }
