// 健保署醫院財報「合併申報／合併提報」對照
// 來源頁註記：https://med.nhi.gov.tw/rgfe0000/RGFE0030S01.aspx
//
// 兩種情形性質不同，處理方式也不同：
//
//  A. FEE_MERGED（醫療費用合併申報）：子院的醫療費用、醫師數、病床數全數併入母院申報，
//     因此健保署財報中「子院無獨立財務資料」。→ 機構總覽顯示說明並連結母院。
//
//  B. REPORT_MERGED（財報合併提報）：兩個機構代號共用同一份合併財報，兩碼的財務數字
//     完全相同（＝合併總額掛在兩碼下），分院端數字會高估。→ 兩邊都標註「合併提報」，
//     並說明數字為合計；財務清單頁保留兩列但加標籤。

// A. 子院 code → 母院（子院無獨立財報）
export const FEE_MERGED = {
  '0401180023': { parent: '0401180014', parentName: '臺大醫院' },              // 臺大兒童醫院
  '1101100020': { parent: '1101100011', parentName: '馬偕紀念醫院（臺北）' },   // 馬偕兒童醫院（臺北）
  '1131100010': { parent: '1101100011', parentName: '馬偕紀念醫院（臺北）' },   // 淡水馬偕
  '1101010012': { parent: '1132070011', parentName: '林口長庚' },              // 臺北長庚
  '1137010042': { parent: '1137010024', parentName: '彰化基督教醫院' },        // 彰基兒童醫院
  '1303260014': { parent: '1317050017', parentName: '中國醫藥大學附設醫院' },   // 中國醫大兒童醫院
  '1517011112': { parent: '1517061032', parentName: '澄清綜合醫院中港分院' },   // 澄清綜合醫院
};

// B. code → 合併對象（兩碼互指）。main=true 表示合併財報主體院，false 為分院（數字為合計）
export const REPORT_MERGED = {
  '0132010014': { partner: '0132110519', partnerName: '新屋分院', main: true },              // 衛福部桃園
  '0132110519': { partner: '0132010014', partnerName: '衛福部桃園醫院', main: false },        // 新屋分院
  '0634070018': { partner: '0634030014', partnerName: '蘇澳分院', main: true },              // 北榮員山分院
  '0634030014': { partner: '0634070018', partnerName: '北榮員山分院', main: false },          // 蘇澳分院
  '0622020017': { partner: '0640140012', partnerName: '灣橋分院', main: true },              // 中榮嘉義
  '0640140012': { partner: '0622020017', partnerName: '中榮嘉義分院', main: false },          // 灣橋分院
  '0121050011': { partner: '0141060513', partnerName: '新化分院', main: true },              // 衛福部臺南
  '0141060513': { partner: '0121050011', partnerName: '衛福部臺南醫院', main: false },        // 新化分院
  '0412040012': { partner: '0433050018', partnerName: '生醫醫院', main: true },              // 新竹臺大分院
  '0433050018': { partner: '0412040012', partnerName: '新竹臺大分院', main: false },          // 生醫醫院
};

// 子院無獨立財報時，回傳其母院 { parent, parentName }，否則 null
export function feeMergedParent(code) {
  return FEE_MERGED[code] || null;
}

// 財報合併提報資訊 { partner, partnerName, main }，否則 null
export function reportMergedInfo(code) {
  return REPORT_MERGED[code] || null;
}
