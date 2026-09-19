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
 *
 * 分頁配置：
 *   sub_<類別>  每個類別一個分頁（sub_icu、sub_ward…），各自「發布到網路 → CSV」
 *               後填進 js/env.js 的 LIVE.csvUrls。欄位隨投稿自動長出來。
 *   audit       AI 審稿的理由原文集中在這裡，**不要**發布。公開分頁只留
 *               modVerdict / modCode 兩欄，前端靠它們決定是否打馬賽克。
 */
const SHEET_ID = 'REPLACE_WITH_SHEET_ID';          // 目標試算表 ID（網址 /d/<這段>/edit）
const SHARED_SECRET = 'REPLACE_WITH_SHARED_SECRET'; // 與 Worker 的 APPS_SCRIPT_SECRET 相同
const TIMEZONE = 'Asia/Taipei';

// 允許的類別 slug（與 js/config.js 的 CATEGORIES 一致）。不在清單內一律歸 other，
// 避免有人偽造 category 參數在試算表裡長出一堆垃圾分頁。
const CATEGORIES = ['ward', 'icu', 'er', 'or', 'outpatient', 'clinic', 'dialysis', 'psych', 'special', 'other'];

// 只存在 audit 分頁、不進公開分頁的欄位
const AUDIT_ONLY = ['modReason', 'modStatus'];

// 標記資料來源：'form' = 真投稿、'mock' = seed.gs 灌的測試資料（見 seed.gs）
const DATA_SOURCE_COLUMN = 'dataSource';

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.secret !== SHARED_SECRET) {
      return _json({ error: 'forbidden' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const slug = CATEGORIES.indexOf(String(p.category || '')) >= 0 ? String(p.category) : 'other';
    const ts = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm');

    // ① 公開分頁：sub_<類別>
    const sh = ss.getSheetByName('sub_' + slug) || ss.insertSheet('sub_' + slug);
    const publicKeys = Object.keys(p)
      .filter(function (k) { return k !== 'secret' && k !== 'category' && AUDIT_ONLY.indexOf(k) < 0; })
      .sort();

    if (sh.getLastRow() === 0) {
      sh.appendRow(['timestamp'].concat(publicKeys).concat([DATA_SOURCE_COLUMN]));
    }
    // 表頭已存在但少了新欄位（例如後來才加的 modVerdict / modCode）→ 自動補在最右邊，
    // 舊資料列該欄留空。這樣改欄位時不必手動改試算表。
    let header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const missing = publicKeys.concat([DATA_SOURCE_COLUMN])
      .filter(function (k) { return header.indexOf(k) === -1; });
    if (missing.length) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
    sh.appendRow(header.map(function (h) {
      if (h === 'timestamp') return ts;
      if (h === DATA_SOURCE_COLUMN) return 'form';   // 'mock' = seed.gs 灌的測試資料
      return p[h] !== undefined ? p[h] : '';
    }));

    // ② 稽核分頁：AI 審稿理由原文（勿發布）
    const audit = ss.getSheetByName('audit') || ss.insertSheet('audit');
    if (audit.getLastRow() === 0) {
      audit.appendRow(['timestamp', 'category', 'modVerdict', 'modCode', 'modStatus', 'modReason', 'comment']);
    }
    audit.appendRow([ts, slug, p.modVerdict || '', p.modCode || '',
                     p.modStatus || '', p.modReason || '', p.comment || '']);

    return _json({ ok: true, sheet: 'sub_' + slug });
  } catch (err) {
    return _json({ error: String(err) });
  }
}

/**
 * 健康檢查：部署完把 /exec 網址貼進瀏覽器，看到 {"ok":true,...} 就代表部署成功。
 * 不吐任何投稿內容。
 */
function doGet() {
  let sheetOk = false;
  try {
    SpreadsheetApp.openById(SHEET_ID);
    sheetOk = true;
  } catch (err) {
    sheetOk = false;
  }
  return _json({
    ok: true,
    service: 'transparent-nursing submit',
    sheetReachable: sheetOk,
    secretConfigured: SHARED_SECRET !== 'REPLACE_WITH_SHARED_SECRET',
    now: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm'),
  });
}

/**
 * 自我測試：不經 Worker，直接模擬一筆投稿寫進 sub_other 與 audit。
 * 在編輯器選這個函式按執行，確認試算表真的寫得進去。測完記得把那列刪掉。
 */
function selftest() {
  const res = doPost({ parameter: {
    secret: SHARED_SECRET,
    category: 'other',
    institutionName: '【測試】請刪除這一列',
    comment: 'selftest',
    modVerdict: 'allow',
    modCode: '',
    modStatus: 'skip',
    modReason: '',
  } });
  Logger.log(res.getContent());
  return res.getContent();
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
