// 勞檢紀錄頁面 — 使用共用的 records-page.js／csv-loader.js
// 資料來源：勞動部公開資料

import { parseROCDate, parseFine, extractLawArticles, shortenLocation, getCachedCount } from './records-format.js?v=9de368a906';
import { createCsvLoader } from './csv-loader.js?v=9de368a906';
import { initRecordsPage } from './records-page.js?v=9de368a906';
import { VIOL_FEEDS } from './config.js?v=9de368a906';

const FEED = VIOL_FEEDS.find((x) => x.key === 'labor');   // Sheet 網址與快取鍵集中在 config.js
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
  csvUrl: FEED.url,
  storageKey: FEED.storageKey,
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
export function getViolationsCount() { return getCachedCount(FEED.storageKey); }
