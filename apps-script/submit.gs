/**
 * 護理職場透明化 — 表單提交寫入 Google Sheet。
 *
 * 部署：Apps Script 編輯器 → 部署 → 新增部署作業 → 類型「網頁應用程式」
 *   - 執行身分：我
 *   - 具有存取權：任何人
 * 取得 /exec 網址，填入 tn-submit Worker 的 APPS_SCRIPT_URL secret。
 *
 * 安全：只接受帶正確 secret 的請求（由 tn-submit Worker 轉發並附上）。
 *       直接打本 Web App 而未帶 secret 者一律拒絕。
 */
const SHEET_ID = 'REPLACE_WITH_SHEET_ID';          // 目標試算表 ID（網址 /d/<這段>/edit）
const SHEET_NAME = 'submissions';                   // 分頁名稱，不存在會自動建立
const SHARED_SECRET = 'REPLACE_WITH_SHARED_SECRET'; // 與 Worker 的 APPS_SCRIPT_SECRET 相同

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.secret !== SHARED_SECRET) {
      return _json({ error: 'forbidden' });
    }
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // 第一次寫入時建立表頭（_ts + 各欄位名，排除 secret）
    if (sh.getLastRow() === 0) {
      const keys = Object.keys(p).filter((k) => k !== 'secret').sort();
      sh.appendRow(['_ts'].concat(keys));
    }
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const row = header.map((h) => (h === '_ts' ? new Date() : (p[h] !== undefined ? p[h] : '')));
    sh.appendRow(row);

    return _json({ ok: true });
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
