/**
 * 護理職場透明化 — 把測試資料（data/mock/*.csv）灌進 Google Sheet。
 *
 * 用途：正式 Sheet 剛建好是空的，直接切 live 會看到空白平台。這支從線上抓
 *       10 個 mock CSV 寫進各自的 sub_<類別> 分頁，讓整條線可以先跑起來。
 *
 * 使用：跟 submit.gs 放在同一個 Apps Script 專案，在編輯器選 seedAll 按執行。
 *       第一次會要求授權（存取試算表 + 外部網址）。
 *
 * ⚠ 這些是**假資料，但用的是真實醫院名稱**。灌進正式 Sheet 後，
 *   瀏覽者無法分辨哪些是真投稿。所以：
 *     · 每一列都會寫 dataSource = 'mock'（真投稿是 'form'），隨時可辨識、可清除
 *     · 正式對外開放前請執行 clearSeeded() 把它們全部刪掉
 *     · 更保險的做法是開兩份試算表：測試用的灌 mock、正式的保持乾淨
 */
// 試算表由 submit.gs 的 book_() 決定（指令碼屬性 SHEET_ID，或本專案所屬的試算表）
const SEED_BASE_URL = 'https://ycchou.github.io/transparent-nursing/data/mock/';
const SEED_CATEGORIES = ['ward', 'icu', 'er', 'or', 'outpatient', 'clinic', 'dialysis', 'psych', 'special', 'other'];
const SEED_MARK_COLUMN = 'dataSource';           // 'mock' = 本支灌的，'form' = 真投稿

/** 一次灌完 10 個類別 */
function seedAll() {
  const report = SEED_CATEGORIES.map(function (slug) { return seedCategory(slug); });
  Logger.log(report.join('\n'));
  return report.join('\n');
}

/** 灌單一類別；分頁已有測試資料時先清掉再灌，不會重複堆疊 */
function seedCategory(slug) {
  const ss = book_();
  const name = 'sub_' + slug;

  let csv;
  try {
    csv = UrlFetchApp.fetch(SEED_BASE_URL + slug + '.csv', { muteHttpExceptions: true });
  } catch (err) {
    return name + '：抓取失敗 ' + err;
  }
  if (csv.getResponseCode() !== 200) {
    return name + '：抓取失敗 HTTP ' + csv.getResponseCode();
  }

  const rows = Utilities.parseCsv(csv.getContentText());
  if (!rows || rows.length < 2) return name + '：CSV 是空的';

  const csvHeader = rows[0];
  const body = rows.slice(1);

  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  removeSeededRows_(sh);   // 先清掉舊的 mock 列，真投稿保留

  // 表頭：沿用既有的（真投稿可能已經建好），缺的欄位補在最右邊
  let header;
  if (sh.getLastRow() === 0) {
    header = csvHeader.concat([SEED_MARK_COLUMN]);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  } else {
    header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const missing = csvHeader.concat([SEED_MARK_COLUMN]).filter(function (k) {
      return header.indexOf(k) === -1;
    });
    if (missing.length) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
  }

  // 依表頭順序重排每一列（CSV 欄位順序與分頁不一定一致）
  const idx = {};
  csvHeader.forEach(function (h, i) { idx[h] = i; });
  const out = body.map(function (r) {
    return header.map(function (h) {
      if (h === SEED_MARK_COLUMN) return 'mock';
      return idx[h] !== undefined ? r[idx[h]] : '';
    });
  });

  if (out.length) {
    sh.getRange(sh.getLastRow() + 1, 1, out.length, header.length).setValues(out);
  }
  return name + '：灌入 ' + out.length + ' 列';
}

/** 刪掉所有 dataSource = 'mock' 的列（真投稿不動）。正式開放前務必執行一次。 */
function clearSeeded() {
  const ss = book_();
  const report = SEED_CATEGORIES.map(function (slug) {
    const sh = ss.getSheetByName('sub_' + slug);
    if (!sh) return 'sub_' + slug + '：分頁不存在';
    const n = removeSeededRows_(sh);
    return 'sub_' + slug + '：刪除 ' + n + ' 列';
  });
  Logger.log(report.join('\n'));
  return report.join('\n');
}

/** 由下往上刪 mock 列（由上往下刪會讓索引錯位）。回傳刪除列數。 */
function removeSeededRows_(sh) {
  if (sh.getLastRow() < 2) return 0;
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = header.indexOf(SEED_MARK_COLUMN);
  if (col === -1) return 0;

  const values = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues();
  let n = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === 'mock') { sh.deleteRow(i + 2); n++; }
  }
  return n;
}
