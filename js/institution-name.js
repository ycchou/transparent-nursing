// 機構名稱正規化 — 共用工具
//
// 違規紀錄（勞檢/性平/職安）的機構欄是勞動部「事業單位名稱(負責人)」自由格式，
// 名稱髒，例如：
//   長庚醫療財團法人高雄長庚紀念醫院(藍國忠)     → 尾端括號夾負責人
//   台南市立醫院(委託秀傳醫療社團法人經營)戴芳楟   → 括號在中間、負責人黏在尾巴（無括號）
//   陳正倫即悠適復健科診所                        → 「某人即某商號」
//   福善有限公司附設新北市私立福善居家長照機構 (陳宥羚)  → 括號前有多餘空白
//
// normalizeInstitutionName() 把這些雜訊清掉，讓名稱可與 hospitals-merged.json 的
// canonical name 對照。前端在「違規對照表（data/violations-hospital-map.json）未命中」時
// 可用它做 best-effort fallback；tools/build-violations-map.py 內有等價的 Python 版本，
// 兩者邏輯須保持一致。

// 「X即Y」的 X（負責人/自然人）通常 2~4 字；超過就不視為此格式，避免誤切真名。
const JI_MAX_OWNER_LEN = 4;

/**
 * 將機構名稱正規化為可比對的形式。
 * @param {string} raw 原始機構名稱
 * @returns {string} 正規化後名稱（去負責人、去括號、臺→台、去空白）
 */
export function normalizeInstitutionName(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return '';

  // 1. 「X即Y」→ Y（負責人 即 商號）。只在「即」出現在很前面時才切。
  const jiIdx = s.indexOf('即');
  if (jiIdx > 0 && jiIdx <= JI_MAX_OWNER_LEN) {
    s = s.slice(jiIdx + 1);
  }

  // 2. 去掉括號（半形/全形）及其內容 —— 負責人、委託經營註記等。
  s = s.replace(/[（(][^（()）]*[)）]/g, '');

  // 3. 臺→台，統一異體字。
  s = s.replace(/臺/g, '台');

  // 4. 去各種破折號（ASCII/全形/連字號等）——「委託X辦理」常出現不一致的分隔符。
  s = s.replace(/[－–—―−‐-]/g, '');

  // 5. 去掉所有空白（含全形空白）。
  s = s.replace(/[\s　]+/g, '');

  return s.trim();
}

/**
 * 兩個機構名稱是否指同一家（正規化後精確或包含關係）。
 * 供前端 fallback 比對；主要對照仍以離線 map 為準。
 * @param {string} a
 * @param {string} b
 * @param {number} [minLen=6] 包含比對的最短長度，避免短字串誤命中
 * @returns {boolean}
 */
export function institutionNameMatches(a, b, minLen = 6) {
  const na = normalizeInstitutionName(a);
  const nb = normalizeInstitutionName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= minLen && longer.includes(shorter);
}
