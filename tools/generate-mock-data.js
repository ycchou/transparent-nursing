#!/usr/bin/env node
/**
 * 產生 10 大類別 mock CSV，輸出到 data/mock/*.csv
 * Usage: node tools/generate-mock-data.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'mock');

// ============ 真實評鑑醫院名單 ============
// 從 data/hospitals.json（衛福部醫院評鑑合格名單）讀入，讓多數測試資料掛在
// 真實醫院名稱上，機構總覽頁（hospital.html）才能以名稱對應到眾包資料。
const MIN_REAL_ROWS = 2100;  // 至少 2100 筆用真實評鑑醫院名稱
const REAL = { '醫學中心': [], '區域醫院': [], '地區醫院': [] };
try {
  const hj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hospitals.json'), 'utf8'));
  for (const h of (hj.hospitals || [])) {
    if (REAL[h.level] && h.name) REAL[h.level].push({ name: h.name, city: h.city || '' });
  }
} catch (e) {
  console.error('讀取 data/hospitals.json 失敗，無法產生真實醫院測試資料：', e.message);
  process.exit(1);
}
// 「臺北 → 台北」對齊表單/篩選用字
const normalizeCity = (s) => String(s || '').replace(/臺/g, '台');

// ============ pools ============
const HOSPITALS = {
  '醫學中心': [
    'A 醫學中心', 'B 醫學中心', 'C 醫學中心', 'D 醫學中心',
    'E 醫學中心', 'F 醫學中心', 'G 醫學中心', 'H 醫學中心',
    'I 醫學中心', 'J 醫學中心', 'K 醫學中心', 'L 醫學中心',
  ],
  '區域醫院': [
    'M 區域醫院', 'N 區域醫院', 'O 區域醫院', 'P 區域醫院',
    'Q 區域醫院', 'R 區域醫院', 'S 區域醫院', 'T 區域醫院',
    'U 區域醫院', 'V 區域醫院', 'W 區域醫院', 'X 區域醫院',
  ],
  '地區醫院': [
    'Y 地區醫院', 'Z 地區醫院', 'AA 地區醫院', 'BB 地區醫院',
    'CC 地區醫院', 'DD 地區醫院', 'EE 地區醫院', 'FF 地區醫院',
  ],
  '診所': [
    'GG 診所', 'HH 診所', 'II 診所', 'JJ 診所',
    'KK 診所', 'LL 診所', 'MM 診所', 'NN 診所',
  ],
};
const LOCATIONS = [
  '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣',
];
const JOB_TITLES = ['N0', 'N1', 'N1', 'N1', 'N2', 'N2', 'N2', 'N3', 'N3', 'N4', '專科護理師', '護理長', '副護理長'];
const WEEKLY_HOURS = ['35-40', '40-45', '40-45', '45-50', '45-50', '45-50', '50-55', '50-55', '55-60', '60+'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randint = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;

function genTimestamp() {
  // 錨在 2025-11-15，往前 0-60 天
  const anchor = new Date('2025-11-15T12:00:00');
  const daysAgo = randint(0, 60);
  anchor.setDate(anchor.getDate() - daysAgo);
  const Y = anchor.getFullYear();
  const M = String(anchor.getMonth() + 1).padStart(2, '0');
  const D = String(anchor.getDate()).padStart(2, '0');
  // 40% 帶時間
  if (Math.random() < 0.4) {
    const h = String(randint(7, 23)).padStart(2, '0');
    const m = String(randint(0, 59)).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  }
  return `${Y}-${M}-${D}`;
}

function pickInstitution(weights) {
  const r = Math.random();
  let acc = 0;
  let type = '區域醫院';
  for (const [t, w] of Object.entries(weights)) {
    acc += w;
    if (r < acc) { type = t; break; }
  }
  // 醫學中心 / 區域醫院 / 地區醫院 → 抽真實評鑑醫院（名稱＋縣市）
  if (REAL[type] && REAL[type].length) {
    const h = pick(REAL[type]);
    return { institutionType: type, institutionName: h.name, location: normalizeCity(h.city), isReal: true };
  }
  // 診所等非評鑑機構 → 用假名池，location 交給呼叫端隨機
  const pool = HOSPITALS[type] || HOSPITALS['區域醫院'];
  return { institutionType: type, institutionName: pick(pool), location: null, isReal: false };
}

function genWellbeing(institutionType, hours) {
  const hoursBad = ['55-60', '60+'].includes(hours);
  const smallHospital = ['地區醫院', '診所'].includes(institutionType);
  let recBias = 3.0;
  if (hoursBad) recBias -= 1.2;
  if (smallHospital) recBias -= 0.3;
  if (Math.random() < 0.12) recBias -= 1;
  if (Math.random() < 0.15) recBias += 1;   // 少數特別好的單位
  // 推薦指數 1-5（表單選項）：平均約 3，好單位可到 4-5
  const recommendIndex = Math.max(1, Math.min(5, Math.round(recBias + 0.3 + (Math.random() - 0.5) * 2.2)));
  let atm = 3 + Math.round((recommendIndex - 2) * 0.6 + (Math.random() - 0.5));
  atm = Math.max(1, Math.min(5, atm));
  const promotion = recommendIndex >= 3
    ? pick(['機會多', '機會多', '普通'])
    : pick(['普通', '難以升遷', '難以升遷']);
  const overtimePolicy = hoursBad
    ? pick(['主管判斷', '一律不給', '一律不給'])
    : pick(['一律給', '合理範圍給', '合理範圍給', '主管判斷']);
  return { recommendIndex, workAtmosphere: atm, promotion, overtimePolicy };
}

function genSalary(institutionType, jobTitle) {
  let base = { '醫學中心': 100, '區域醫院': 85, '地區醫院': 70, '診所': 65, '護理之家': 78, '長照機構': 78, '居護所': 78, '其他': 78 }[institutionType] || 80;
  const titleBonus = { 'N0': -5, 'N1': 0, 'N2': 5, 'N3': 15, 'N4': 30,
                       '專科護理師': 20, '護理長': 35, '副護理長': 25,
                       '個案管理師': 10, '學校護理師': 0, '廠護': 18, '督導': 30, '公衛護士': 5 }[jobTitle] || 0;
  base += titleBonus + randint(-8, 8);
  return {
    annualSalary: base,
    monthlyBase: Math.min(150, Math.max(30, Math.round(base * 0.42))),   // 表單範圍 30～150 千
    annualBonus: Math.round(base * 0.15),
    ...(() => { const cur = randint(1, 8); return { yearsCurrent: cur, yearsTotal: cur + randint(0, 6) }; })(),   // 累計 ≥ 現職
  };
}

const COMMENTS = {
  positive: [
    '團隊互助強', '主管支持度高', '訓練體系完整', '專科很強值得待', '同事關係好',
    '排班相對人性化', '資深領班受重視', '可學到很多技術', '案件多但學得快',
    '氣氛輕鬆', '薪資與制度都優', '兒科氣氛溫暖', '安寧團隊互相 support',
  ],
  neutral: [
    '工時長但待遇可', '案件量大但有規矩', '新人訓練紮實', '主管管太細', '專科氣氛 OK',
    '人力穩定但行政會議多', '夜班輪轉公平', '加班頻率可接受', '訓練體系完整',
    '中部醫院 case 量適中', '可學到很多技術', '門診作息穩定',
  ],
  negative: [
    '人力嚴重不足', '主管偏心嚴重', '加班沒給', '常被臨時調班', '工時超長',
    '人力過勞且無加班費', 'leader 形同虛設', '被當打雜', '夜班暴力事件多',
    '沒人沒錢沒尊重', '新人零保護', '主管常 stand-by 不夠', '工時長到爆', '人力極端不足',
  ],
};
function genComment(recommendIndex) {
  if (Math.random() < 0.18) return ''; // 18% empty
  let pool;
  if (recommendIndex >= 4) pool = COMMENTS.positive;
  else if (recommendIndex >= 3) pool = [...COMMENTS.positive, ...COMMENTS.neutral];
  else if (recommendIndex >= 2) pool = [...COMMENTS.neutral, ...COMMENTS.negative];
  else pool = COMMENTS.negative;
  return pick(pool);
}

// ============ Per-category generators ============

const ICU_PAIRS = [
  { unitName: '內科加護病房', icuType: '內科' },
  { unitName: 'MICU', icuType: '內科' },
  { unitName: '外科加護病房', icuType: '外科' },
  { unitName: 'SICU', icuType: '外科' },
  { unitName: '心臟內科加護病房 (CCU)', icuType: '心臟' },
  { unitName: '心臟外科加護病房 (CVICU)', icuType: '心臟' },
  { unitName: '神經外科加護病房 (NSICU)', icuType: '神經' },
  { unitName: '神經內科加護病房', icuType: '神經' },
  { unitName: '兒童加護病房 (PICU)', icuType: '兒童' },
  { unitName: '新生兒加護病房 (NICU)', icuType: '兒童' },
  { unitName: '燒燙傷加護病房', icuType: '混合' },
  { unitName: '呼吸加護病房 (RICU)', icuType: '內科' },
  { unitName: '綜合加護病房', icuType: '混合' },
  { unitName: '加護中心', icuType: '混合' },
];
function generateIcu(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.45, '區域醫院': 0.40, '地區醫院': 0.15, '診所': 0 });
    const pair = pick(ICU_PAIRS);
    const jobTitle = pick(JOB_TITLES.filter(t => t !== '專科護理師'));
    const hours = pick(WEEKLY_HOURS);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      icuType: pair.icuType,
      dayShiftRatio: pick(['1:1', '1:2', '1:2', '1:2', '1:3', '1:3', '1:4']),
      dayPeakRatio: pick(['1:2', '1:2', '1:3', '1:3', '1:4']),
      eveningShiftRatio: pick(['1:2', '1:2', '1:3', '1:3', '1:3', '1:4']),
      eveningPeakRatio: pick(['1:2', '1:3', '1:3', '1:4']),
      nightShiftRatio: pick(['1:2', '1:3', '1:3', '1:4', '1:4', '1:5 以上']),
      nightPeakRatio: pick(['1:3', '1:3', '1:4', '1:4', '1:5 以上']),
      ventilatorCare: pick(['全部', '全部', '多數', '多數', '少數', '無']),
      shiftSystem: pick(['三班制', '三班制', '三班制', '三班制', '三班制', '兩班制', '兩班制', '混合制', '混合制', '其他']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const DIALYSIS_PAIRS = [
  { unitName: '血液淨化中心', dialysisType: '血液透析' },
  { unitName: '血液透析中心', dialysisType: '血液透析' },
  { unitName: '透析中心', dialysisType: '血液透析' },
  { unitName: '透析診所', dialysisType: '血液透析' },
  { unitName: '洗腎室', dialysisType: '血液透析' },
  { unitName: '腎臟內科透析室', dialysisType: '血液透析' },
  { unitName: '腹膜透析中心', dialysisType: '腹膜透析' },
  { unitName: '腹膜透析室', dialysisType: '腹膜透析' },
  { unitName: '血液淨化中心', dialysisType: '兩者皆有' },
  { unitName: '腎臟透析中心', dialysisType: '兩者皆有' },
];
function generateDialysis(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.35, '區域醫院': 0.30, '地區醫院': 0.20, '診所': 0.15 });
    const pair = pick(DIALYSIS_PAIRS);
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(WEEKLY_HOURS);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    const isHD = pair.dialysisType !== '腹膜透析';
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      dialysisType: pair.dialysisType,
      hdRatio: isHD ? pick(['1:4', '1:4', '1:5', '1:5', '1:5', '1:6']) : '不適用',
      hdPeakRatio: isHD ? pick(['1:4', '1:5', '1:5', '1:6', '1:7 以上']) : '不適用',
      pdCount: pair.dialysisType === '血液透析' ? '不適用' : pick(['1:20 以下', '1:20-35', '1:20-35', '1:35-55']),
      pdPeakRatio: pair.dialysisType === '血液透析' ? '不適用' : pick(['1:20-35', '1:35-55', '1:55 以上']),
      batchShift: pick(['有', '有', '無']),
      onCallType: isHD ? pick(['假日值班', '下班後待命', '全天待命', '無']) : '—',
      onCallRotation: isHD ? pick(['2-3 人輪值', '固定一人', '全員輪替', '無']) : '—',
      restInterval11h: isHD ? pick(['有', '有', '無']) : '—',
      onCallPay: isHD ? pick(['都沒有', '200-250元', '250-300元', '300元以上']) : '—',
      workDuties: pick(['上機/下機/管路照護', '上下機/衛教', '管路/給藥/衛教', '上下機/緊急處置']),
      specialBenefits: pick(['', '', '透析津貼', '夜點費', '年節獎金']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const ER_UNIT_NAMES = ['急診醫學部', '急診室', '急診部', '急診中心'];
function generateEr(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.40, '區域醫院': 0.40, '地區醫院': 0.20, '診所': 0 });
    const erLevel = inst.institutionType === '醫學中心' ? pick(['重度級', '重度級', '中度級'])
                  : inst.institutionType === '區域醫院' ? pick(['中度級', '中度級', '一般級'])
                  : '一般級';
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(['45-50', '50-55', '50-55', '55-60', '60+']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pick(ER_UNIT_NAMES), location: inst.location || pick(LOCATIONS), jobTitle,
      erLevel,
      triageRatio: pick(['1:25', '1:30', '1:30', '1:35', '1:40']),
      criticalRatio: pick(['1:2', '1:2', '1:3', '1:3', '1:4']),
      observationRatio: pick(['1:5', '1:6', '1:8', '1:8', '1:10']),
      violenceFreq: pick(['每週', '每月', '每月', '每季', '罕見']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const WARD_PAIRS = [
  { unitName: '5A 內科病房', wardType: '內科' },
  { unitName: '6C 內科病房', wardType: '內科' },
  { unitName: '7A 內科病房', wardType: '內科' },
  { unitName: '10B 內科病房', wardType: '內科' },
  { unitName: '12A 內科病房', wardType: '內科' },
  { unitName: '心臟內科病房', wardType: '內科' },
  { unitName: '腎臟內科病房', wardType: '內科' },
  { unitName: '腸胃內科病房', wardType: '內科' },
  { unitName: '8B 外科病房', wardType: '外科' },
  { unitName: '9A 外科病房', wardType: '外科' },
  { unitName: '11A 外科病房', wardType: '外科' },
  { unitName: '心臟外科病房', wardType: '外科' },
  { unitName: '神經外科病房', wardType: '外科' },
  { unitName: '骨科病房', wardType: '外科' },
  { unitName: '婦產科病房', wardType: '婦產' },
  { unitName: '產後病房', wardType: '婦產' },
  { unitName: '兒科病房', wardType: '兒科' },
  { unitName: '兒童病房', wardType: '兒科' },
  { unitName: '嬰兒室', wardType: '兒科' },
  { unitName: '精神科病房', wardType: '精神' },
  { unitName: '心智科病房', wardType: '精神' },
  { unitName: '安寧病房', wardType: '安寧' },
  { unitName: '緩和醫療病房', wardType: '安寧' },
  { unitName: '綜合病房', wardType: '混合' },
  { unitName: '一般病房', wardType: '混合' },
];
function generateWard(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.30, '區域醫院': 0.40, '地區醫院': 0.25, '診所': 0.05 });
    const pair = pick(WARD_PAIRS);
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(['40-45', '45-50', '45-50', '50-55', '55-60']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      wardType: pair.wardType,
      dayShiftRatio: pick(['1:6', '1:7', '1:8', '1:8', '1:9', '1:10']),
      eveningShiftRatio: pick(['1:10', '1:11', '1:12', '1:12', '1:13', '1:14']),
      nightShiftRatio: pick(['1:12', '1:13', '1:14', '1:14', '1:15', '1:16']),
      leaderSupport: pick(['全班協助', '部分協助', '部分協助', '無']),
      invasiveDuties: pick(['給藥', '給藥/管路', '換藥/PCA', '給藥/CVP/PCA', '給藥/換藥/抽痰', '管路/PCA', '產後照護', '化療', '所有侵入性']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const OPD_PAIRS = [
  { unitName: '內科門診', clinicType: '內科系' },
  { unitName: '內科門診中心', clinicType: '內科系' },
  { unitName: '心臟內科門診', clinicType: '內科系' },
  { unitName: '腎臟內科門診', clinicType: '內科系' },
  { unitName: '腸胃內科門診', clinicType: '內科系' },
  { unitName: '外科門診', clinicType: '外科系' },
  { unitName: '心臟外科門診', clinicType: '外科系' },
  { unitName: '骨科門診', clinicType: '外科系' },
  { unitName: '皮膚科門診', clinicType: '專科' },
  { unitName: '眼科門診', clinicType: '專科' },
  { unitName: '耳鼻喉門診', clinicType: '專科' },
  { unitName: '婦產科門診', clinicType: '專科' },
  { unitName: '小兒科門診', clinicType: '專科' },
  { unitName: '聯合門診中心', clinicType: '聯合門診' },
  { unitName: '健康檢查中心', clinicType: '健檢中心' },
  { unitName: '健檢部', clinicType: '健檢中心' },
  { unitName: '內科診所', clinicType: '內科系' },
  { unitName: '皮膚診所', clinicType: '專科' },
  { unitName: '中醫診所', clinicType: '專科' },
  { unitName: '牙科診所', clinicType: '專科' },
];
function generateOutpatient(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.30, '區域醫院': 0.30, '地區醫院': 0.20, '診所': 0.20 });
    const pair = pick(OPD_PAIRS);
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(['40-45', '40-45', '40-45', '45-50', '50-55']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    const shiftType = pick(['純早診（日班）', '純早診（日班）', '早診＋午診', '含夜診', '輪班制']);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      clinicType: pair.clinicType,
      clinicsPerNurse: pick(['1 診', '1 診', '2 診', '2 診', '3 診', '4 診以上']),
      weeklyPatients: pick(['300 以下', '300-600', '600-900', '600-900', '900-1200', '1200 以上']),
      shiftType,
      pShift: pick(['否（固定班表）', '否（固定班表）', '否（固定班表）', '部分 PRN', '是（PRN，需要時才上班）']),
      lunchBreak: pick(['有，完整 1 小時', '有，但常被中斷／縮短', '有，但常被中斷／縮短', '無']),
      clinicOvertimeWeekly: pick(['幾乎不', '每週 1-2 次', '每週 1-2 次', '每週 3-4 次', '幾乎每診都逾時']),
      patientComplaints: pick(['幾乎沒有', '罕見', '罕見', '偶爾', '經常']),
      violenceRisk: pick(['無', '低', '低', '中']),
      salaryGrowth: pick(['有明確調薪制度', '有但幅度小', '有但幅度小', '幾乎不調', '不清楚']),
      clinicReason: pick(['工時規律／少夜班', '工時規律／少夜班', '家庭因素', '身體因素', '興趣／專長', '離職前緩衝']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      specialBenefits: pick(['', '', '進修補助', '年節獎金', '員工旅遊補助']),
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const OR_PAIRS = [
  { unitName: '中央手術室', orSpecialty: '混合' },
  { unitName: '中央開刀房', orSpecialty: '混合' },
  { unitName: '心臟外科手術室', orSpecialty: '心臟外科' },
  { unitName: '神經外科手術室', orSpecialty: '神經外科' },
  { unitName: '婦產手術室', orSpecialty: '婦產' },
  { unitName: '骨科手術室', orSpecialty: '骨科' },
  { unitName: '泌尿手術室', orSpecialty: '泌尿' },
  { unitName: '整形外科手術室', orSpecialty: '整形外科' },
  { unitName: '兒外手術室', orSpecialty: '兒外' },
  { unitName: '眼科手術室', orSpecialty: '眼科' },
  { unitName: '耳鼻喉手術室', orSpecialty: '耳鼻喉' },
  { unitName: '綜合手術室', orSpecialty: '混合' },
  { unitName: '門診手術室', orSpecialty: '一般外科' },
  { unitName: '恢復室', orSpecialty: '混合' },
  { unitName: 'PACU', orSpecialty: '混合' },
];
function generateOr(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.50, '區域醫院': 0.35, '地區醫院': 0.15, '診所': 0 });
    const pair = pick(OR_PAIRS);
    const isRecovery = pair.unitName.includes('恢復室') || pair.unitName === 'PACU';
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(['45-50', '50-55', '50-55', '55-60']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      orSpecialty: pair.orSpecialty,
      orRole: isRecovery ? '恢復室' : pick(['流動護理師', '刷手護理師', '麻醉護理', '混合輪替']),
      dailyCases: isRecovery ? '—' : pick(['5-8', '8-12', '12-18', '15-25', '20-30', '30-50']),
      roomCount: isRecovery ? '—' : pick(['3間', '4間', '6間', '8間', '12間', '15間', '20間']),
      dayShiftRatio: isRecovery ? '1:3病人' : pick(['1:1刀台', '1:1刀台', '1:2刀台']),
      onCallSystem: isRecovery ? '無' : pick(['有，常被 call 回', '有，常被 call 回', '有，少被 call', '無']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const SPECIAL_PAIRS = [
  { unitName: '心導管室', specialType: '心導管室', rad: '高頻率' },
  { unitName: '電燒室 (EP Lab)', specialType: '電燒室 (EP Lab)', rad: '高頻率' },
  { unitName: '介入心臟室', specialType: '心導管室', rad: '高頻率' },
  { unitName: '內視鏡室', specialType: '內視鏡室', rad: '無' },
  { unitName: '胃鏡室', specialType: '胃鏡室', rad: '無' },
  { unitName: '大腸鏡室', specialType: '內視鏡室', rad: '無' },
  { unitName: '支氣管鏡室', specialType: '內視鏡室', rad: '無' },
  { unitName: '血管攝影室', specialType: '血管攝影室', rad: '高頻率' },
  { unitName: '介入治療中心', specialType: '介入治療中心', rad: '高頻率' },
  { unitName: '高壓氧中心', specialType: '高壓氧', rad: '無' },
  { unitName: '化療室', specialType: '其他', rad: '少量' },
  { unitName: '放射治療室', specialType: '其他', rad: '高頻率' },
];
function generateSpecial(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.55, '區域醫院': 0.35, '地區醫院': 0.10, '診所': 0 });
    const pair = pick(SPECIAL_PAIRS);
    const jobTitle = pick(JOB_TITLES);
    const hours = pick(['40-45', '45-50', '45-50', '50-55']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      specialType: pair.specialType,
      dailyCases: pick(['5-8', '8-12', '12-18', '20-30', '30-50']),
      onCallRequired: pair.rad === '高頻率' ? pick(['有，常被 call', '有，少被 call']) : pick(['有，少被 call', '無', '無']),
      radiationExposure: pair.rad === '高頻率' ? pick(['高頻率', '中等']) : pair.rad,
      dayShiftRatio: pick(['1:1案件', '1:1台', '1:2案件', '1:2台', '1:3病人']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const PSYCH_TYPES = [
  '精神急性病房', '精神急性病房', '精神慢性病房', '精神慢性病房',
  '日間照護單位', '社區精神復健', '兒童青少年精神', '老年精神', '成癮戒治',
];
function generatePsych(n) {
  return Array.from({ length: n }, () => {
    const inst = pickInstitution({ '醫學中心': 0.30, '區域醫院': 0.40, '地區醫院': 0.30, '診所': 0 });
    const psychType = pick(PSYCH_TYPES);
    const jobTitle = pick(JOB_TITLES.filter((t) => t !== '專科護理師'));
    const hours = pick(['40-45', '40-45', '45-50', '45-50', '50-55']);
    const w = genWellbeing(inst.institutionType, hours);
    const s = genSalary(inst.institutionType, jobTitle);
    const acute = psychType.includes('急性') || psychType === '成癮戒治';
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: psychType, location: inst.location || pick(LOCATIONS), jobTitle,
      psychType,
      dayShiftRatio: pick(['1:6', '1:7', '1:8', '1:9', '1:10', '1:12']),
      eveningShiftRatio: pick(['1:10', '1:12', '1:15', '1:18', '1:20']),
      nightShiftRatio: pick(['1:15', '1:20', '1:25', '1:30', '1:40']),
      hasProtectionRoom: pick(['符合新規格', '較舊但堪用', '較舊但堪用', '無']),
      teamSupport: pick(['完整（心理/職能/社工/醫師）', '部分（缺 1-2 種）', '部分（缺 1-2 種）', '主要靠護理']),
      restraintFreq: acute ? pick(['每日多次', '每週數次', '每週數次', '偶爾']) : pick(['偶爾', '罕見', '罕見']),
      violenceFreq: acute ? pick(['每週', '每月', '每月', '每季']) : pick(['每季', '罕見', '罕見']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

const OTHER_PROFILES = [
  { unitName: '居家護理所', customCategory: '居家護理', serviceTarget: '居家慢性病/失能個案', mainDuties: '訪視/評估/管路照護/家屬衛教', shiftRatio: '1:25-30 個案', titles: ['個案管理師', 'N2', 'N3', '專科護理師'] },
  { unitName: '居家護理所', customCategory: '居家護理', serviceTarget: '失能/失智個案', mainDuties: '訪視/管路/壓瘡照護', shiftRatio: '1:20-30 個案', titles: ['個案管理師', 'N2'] },
  { unitName: '月子中心', customCategory: '月子中心', serviceTarget: '產婦與新生兒', mainDuties: '新生兒照護/哺乳指導', shiftRatio: '1:5 媽寶', titles: ['N1', 'N2', '督導'] },
  { unitName: '坐月子中心', customCategory: '月子中心', serviceTarget: '產婦與新生兒', mainDuties: '新生兒夜間照護', shiftRatio: '1:6 媽寶', titles: ['N1', 'N2'] },
  { unitName: '小學保健室', customCategory: '學校單位', serviceTarget: '學童', mainDuties: '健康檢查/急救/衛教', shiftRatio: '1:600 學生', titles: ['學校護理師'] },
  { unitName: '國中保健室', customCategory: '學校單位', serviceTarget: '學生', mainDuties: '健康檢查/急救/衛教', shiftRatio: '1:800 學生', titles: ['學校護理師'] },
  { unitName: '高中保健室', customCategory: '學校單位', serviceTarget: '學生', mainDuties: '健康檢查/急救/衛教', shiftRatio: '1:1000 學生', titles: ['學校護理師'] },
  { unitName: '長照機構', customCategory: '長期照護', serviceTarget: '失能長者', mainDuties: '生活照護/管路/給藥', shiftRatio: '1:8 住民', titles: ['N1', 'N2', '督導'] },
  { unitName: '日照中心', customCategory: '長期照護', serviceTarget: '失智長者', mainDuties: '日間照顧/活動帶領', shiftRatio: '1:6 住民', titles: ['N1', 'N2'] },
  { unitName: '護理之家', customCategory: '長期照護', serviceTarget: '慢性病住民', mainDuties: '管路/復健/給藥', shiftRatio: '1:10 住民', titles: ['N2', 'N3', '督導'] },
  { unitName: '某科技廠醫護室', customCategory: '產業護理', serviceTarget: '科技廠員工', mainDuties: '健檢/急救/職業病評估', shiftRatio: '1:2000 員工', titles: ['廠護', 'N3'] },
  { unitName: '某製造廠醫護室', customCategory: '產業護理', serviceTarget: '工廠員工', mainDuties: '職業健康/急救', shiftRatio: '1:1500 員工', titles: ['廠護', 'N2'] },
  { unitName: '某面板廠醫護室', customCategory: '產業護理', serviceTarget: '科技廠員工', mainDuties: '健檢/急救', shiftRatio: '1:2500 員工', titles: ['廠護'] },
  { unitName: '衛生所', customCategory: '公共衛生', serviceTarget: '社區民眾', mainDuties: '預防接種/篩檢/家訪', shiftRatio: '—', titles: ['公衛護士'] },
  { unitName: '健康服務中心', customCategory: '公共衛生', serviceTarget: '社區民眾', mainDuties: '衛教/篩檢', shiftRatio: '—', titles: ['公衛護士'] },
  { unitName: '某銀行醫護室', customCategory: '職業護理', serviceTarget: '銀行員工', mainDuties: '健檢協助/急救', shiftRatio: '1:1000 員工', titles: ['廠護', 'N2'] },
  { unitName: '某飯店醫護室', customCategory: '職業護理', serviceTarget: '旅客與員工', mainDuties: '急救/輕傷處置', shiftRatio: '1:500 客房', titles: ['N2'] },
];
const OTHER_PREFIXES = ['信安', '康健', '愛心', '安心', '長青', '幸福', '聖德', '銀光', '太陽花', '永康', '美樂蒂', '貝兒', '欣欣', '璞玉', '天恩', '康寧'];
// customCategory → 對外顯示的職場類型（config.js 'other' 的 workplaceType 選項）
const WORKPLACE_TYPE_MAP = {
  '居家護理': '居家護理',
  '月子中心': '月子中心',
  '學校單位': '學校護理師',
  '長期照護': '長照機構／護理之家',
  '產業護理': '職護／廠護',
  '職業護理': '職護／廠護',
  '公共衛生': '公共衛生／衛生所',
};
// 各 customCategory 的欄位傾向（貼近真實：職護/公衛多見紅休、居家需外出、月子輪班等）
function genOtherAttrs(cat) {
  const isIndustrial = cat === '產業護理' || cat === '職業護理';
  const isDayShiftJob = isIndustrial || cat === '公共衛生' || cat === '學校單位';
  const isHomeCare = cat === '居家護理';
  const scheduleSystem = isDayShiftJob
    ? '見紅休（週休二日＋國定假日）'
    : isHomeCare
      ? pick(['見紅休（週休二日＋國定假日）', '排班制（輪班）'])
      : '排班制（輪班）';
  const seesRedDays = scheduleSystem.startsWith('見紅休');
  const shiftPattern = seesRedDays
    ? '純白班'
    : pick(['純白班', '需輪小夜', '需輪三班']);
  const practiceRegistration = isIndustrial
    ? pick(['需要', '需要', '不需要'])
    : cat === '學校單位' ? pick(['需要', '不需要']) : '需要';
  const otherCerts = isIndustrial ? '廠護／職業衛生護理'
    : isHomeCare ? pick(['個案管理師', '長照相關證照', '無'])
    : cat === '長期照護' ? pick(['個案管理師', '長照相關證照', '無', '無'])
    : cat === '月子中心' ? pick(['IBCLC 國際泌乳顧問', '無', '無'])
    : cat === '公共衛生' ? pick(['BLS／ACLS 等急救', '無'])
    : '無';
  const certRequired = otherCerts === '無' ? '不適用'
    : isIndustrial ? pick(['是，必備', '否，加分用']) : '否，加分用';
  const fieldWork = isHomeCare || cat === '公共衛生' ? '是'
    : isIndustrial ? pick(['是', '否', '否']) : '否';
  const violenceRisk = pick(['低', '低', '低', '中', '無']);
  const dailyOvertime = pick(['無', '無', '1 小時內', '1-2 小時']);
  const specialBenefits = pick(['', '', '進修補助', '員工旅遊補助', '彈性工時', '年節獎金']);
  return { scheduleSystem, shiftPattern, practiceRegistration, otherCerts,
    certRequired, fieldWork, violenceRisk, dailyOvertime, specialBenefits };
}
function generateOther(n) {
  return Array.from({ length: n }, () => {
    const p = pick(OTHER_PROFILES);
    let institutionName;
    if (p.customCategory === '月子中心') institutionName = pick(OTHER_PREFIXES) + ' 月子中心';
    else if (p.customCategory === '居家護理') institutionName = pick(OTHER_PREFIXES) + ' 居家護理所';
    else if (p.customCategory === '長期照護') institutionName = pick(OTHER_PREFIXES) + ' 長照機構';
    else if (p.customCategory === '學校單位') institutionName = pick(['中山', '建國', '景美', '師大附中', '北一女', '南港', '永和', '中正']) + p.unitName.replace('保健室', '');
    else institutionName = p.unitName.replace('某', '');
    const institutionType =
      p.customCategory === '月子中心' ? '護理之家'      // 產後護理之家歸為護理之家
      : p.customCategory === '居家護理' ? '居護所'
      : p.unitName === '護理之家' ? '護理之家'
      : p.customCategory === '長期照護' ? '長照機構'    // 長照機構／日照中心
      : '其他';
    const jobTitle = pick(p.titles);
    const hours = pick(['35-40', '40-45', '40-45', '45-50']);
    const w = genWellbeing(institutionType, hours);
    const s = genSalary(institutionType, jobTitle);
    const a = genOtherAttrs(p.customCategory);
    return {
      timestamp: genTimestamp(),
      institutionType, institutionName,
      unitName: p.unitName, location: pick(LOCATIONS), jobTitle,
      workplaceType: WORKPLACE_TYPE_MAP[p.customCategory] || '其他',
      practiceRegistration: a.practiceRegistration,
      otherCerts: a.otherCerts,
      certRequired: a.certRequired,
      scheduleSystem: a.scheduleSystem,
      shiftPattern: a.shiftPattern,
      fieldWork: a.fieldWork,
      violenceRisk: a.violenceRisk,
      dailyOvertime: a.dailyOvertime,
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      specialBenefits: a.specialBenefits,
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

// ============ 診所（clinic）============
const CLINIC_PREFIXES = ['康仁', '明德', '安欣', '家和', '立安', '惠民', '杏一', '德安', '仁愛', '大同', '宏恩', '光華', '欣民', '康聯'];
// 科別 → 機構名稱後綴
const CLINIC_SUFFIX = {
  '家醫／一般內科': '內科診所', '小兒科': '小兒科診所', '耳鼻喉科': '耳鼻喉科診所',
  '皮膚科': '皮膚科診所', '婦產科': '婦產科診所', '眼科': '眼科診所',
  '骨科／復健': '骨科復健診所', '身心科': '身心診所', '泌尿／腸胃': '診所',
  '醫美': '醫美診所', '洗腎診所': '洗腎診所', '牙科': '牙醫診所',
  '中醫': '中醫診所', '健檢': '健檢中心', '其他': '診所',
};
const CLINIC_DUTY_COMBOS = [
  '跟診協助、批價／掛號／櫃檯', '跟診協助、注射／抽血、衛教',
  '批價／掛號／櫃檯、給藥／藥品調劑協助', '跟診協助、傷口換藥／小手術協助、疫苗接種',
  '跟診協助、健保申報／行政、環境清潔／消毒', '批價／掛號／櫃檯、注射／抽血、進貨／庫存／藥械管理',
];
const CLINIC_AESTHETIC_DUTIES = ['醫美療程協助、衛教、進貨／庫存／藥械管理', '醫美療程協助、櫃檯諮詢', '醫美療程協助、注射／抽血、衛教'];
function generateClinic(n) {
  const specialties = Object.keys(CLINIC_SUFFIX);
  return Array.from({ length: n }, () => {
    const specialty = pick(specialties);
    const isAesthetic = specialty === '醫美';
    const isScreening = specialty === '健檢';
    const institutionType = '診所';
    const institutionName = pick(CLINIC_PREFIXES) + CLINIC_SUFFIX[specialty];
    const jobTitle = pick(['診所護理師', '跟診護理師', '櫃檯護理師', '護理師', '護理長']);
    const hours = pick(['40-45', '40-45', '45-50', '35-40']);
    const w = genWellbeing(institutionType, hours);
    const s = genSalary(institutionType, jobTitle);
    const payerType = isAesthetic ? '自費為主（如醫美）'
      : isScreening ? pick(['自費為主（如醫美）', '兩者皆有'])
      : pick(['健保特約為主', '健保特約為主', '兩者皆有']);
    return {
      timestamp: genTimestamp(),
      institutionType, institutionName,
      unitName: specialty, location: pick(LOCATIONS), jobTitle,
      clinicSpecialty: specialty,
      clinicPayerType: payerType,
      clinicScale: pick(['只有我一人', '只有我一人', '2–3 人', '2–3 人', '4 人以上']),
      clinicDuties: isAesthetic ? pick(CLINIC_AESTHETIC_DUTIES) : pick(CLINIC_DUTY_COMBOS),
      clinicShift: pick(['純早診', '早＋午診', '早＋午＋晚診', '含夜診', '週末門診輪值']),
      dailyPatients: pick(['30 以下', '30–60', '60–100', '60–100', '100–150', '150 以上']),
      lunchBreak: pick(['有，完整 1 小時', '有，但常被中斷／縮短', '無']),
      laborInsurance: pick(['有，足額投保', '有，足額投保', '有，但以多報少', '無']),
      holidayCompliance: pick(['依法給', '依法給', '部分', '無／不清楚']),
      annualLeave: pick(['依法給足', '依法給足', '打折', '幾乎無']),
      patientComplaints: pick(['偶爾', '罕見', '幾乎沒有', '經常']),
      violenceRisk: pick(['低', '低', '中', '無']),
      salaryStructure: isAesthetic ? pick(['月薪＋看診量／獎金', '固定月薪'])
        : pick(['固定月薪', '固定月薪', '月薪＋看診量／獎金', '時薪']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
      specialBenefits: pick(['', '', '年節獎金', '員工旅遊補助', '彈性工時', '三節禮金']),
      workAtmosphere: w.workAtmosphere, promotion: w.promotion,
      recommendIndex: w.recommendIndex, comment: genComment(w.recommendIndex),
    };
  });
}

// ============ CSV writer ============
function escapeCsvField(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function toCsv(rows, columns) {
  return columns.join(',') + '\n' +
    rows.map(r => columns.map(c => escapeCsvField(r[c])).join(',')).join('\n') + '\n';
}

// ============ Main ============
// 各類別筆數合計 3000；多數走真實評鑑醫院（只有 診所 / other 用假名）
const CFG = [
  { slug: 'ward', n: 463, gen: generateWard,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'wardType','dayShiftRatio','eveningShiftRatio','nightShiftRatio','leaderSupport','invasiveDuties',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'icu', n: 423, gen: generateIcu,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'icuType','dayShiftRatio','dayPeakRatio','eveningShiftRatio','eveningPeakRatio','nightShiftRatio','nightPeakRatio','ventilatorCare','shiftSystem',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'er', n: 330, gen: generateEr,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'erLevel','triageRatio','criticalRatio','observationRatio','violenceFreq',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'or', n: 251, gen: generateOr,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'orSpecialty','orRole','dailyCases','roomCount','dayShiftRatio','onCallSystem',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'outpatient', n: 304, gen: generateOutpatient,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'clinicType','clinicsPerNurse','weeklyPatients','shiftType','pShift','lunchBreak','clinicOvertimeWeekly',
           'patientComplaints','violenceRisk','salaryGrowth','clinicReason',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','specialBenefits','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'clinic', n: 238, gen: generateClinic,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'clinicSpecialty','clinicPayerType','clinicScale','clinicDuties','clinicShift','dailyPatients','lunchBreak',
           'laborInsurance','holidayCompliance','annualLeave','patientComplaints','violenceRisk','salaryStructure',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','specialBenefits','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'dialysis', n: 278, gen: generateDialysis,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'dialysisType','hdRatio','hdPeakRatio','pdCount','pdPeakRatio','batchShift','onCallType','onCallRotation','restInterval11h','onCallPay','workDuties',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','specialBenefits','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'psych', n: 251, gen: generatePsych,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'psychType','dayShiftRatio','eveningShiftRatio','nightShiftRatio','hasProtectionRoom','teamSupport','restraintFreq','violenceFreq',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'special', n: 224, gen: generateSpecial,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'specialType','dailyCases','onCallRequired','radiationExposure','dayShiftRatio',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'other', n: 238, gen: generateOther,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'workplaceType','practiceRegistration','otherCerts','certRequired','scheduleSystem','shiftPattern',
           'fieldWork','violenceRisk','dailyOvertime',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','specialBenefits','workAtmosphere','promotion','recommendIndex','comment'] },
];

const REAL_LEVELS = new Set(['醫學中心', '區域醫院', '地區醫院']);

// 產生全部類別；若真實醫院筆數不足 MIN_REAL_ROWS 則重抽（最多 8 次）
function generateAll() {
  let attempt = 0;
  while (true) {
    attempt++;
    const perCat = CFG.map(({ gen, n }) => gen(n));
    const all = perCat.flat();
    const realCount = all.filter((r) => REAL_LEVELS.has(r.institutionType)).length;
    if (realCount >= MIN_REAL_ROWS || attempt >= 8) return { perCat, all, realCount };
  }
}


// ============ 對齊目前的表單（js/form-<slug>.js 的 schema）============
// 上方各類別產生器寫得早，表單之後陸續改版（新增題目、選項改成區間…）。這一步以表單 schema 為準：
//   · 欄位＝表單現有的題目（表頭跟著重新產生），表單已刪的題目不輸出
//   · 舊產生器的值若仍是合法選項就沿用（保留薪資、工時、推薦指數之間的關聯）；
//     不合法或缺的才依選項重新抽。護病比「1:9」這類舊值會換算到新的區間選項
//   · showIf 條件題：條件不成立就留空，與真實表單送出的結果一致
// 尚未上線自建表單的類別（er／or／special）維持舊產生器的欄位。
const { execFileSync } = require('child_process');
const FORM_SCHEMAS = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'lib', 'form-schemas.mjs')], { encoding: 'utf8' }));

const MULTI_SEP = '、';   // 複選題的值以「、」串接（與 apps-script/submit.gs 寫入試算表的格式一致）
const ALLOWANCES = { evening: [200, 250, 300, 400, 500, 600], night: [400, 500, 600, 800, 1000, 1200] };
const SPECIAL_BENEFITS = ['', '', '', '員工健檢自費項目補助', '員工旅遊補助', '進修學分補助、國外研討會補助',
  '員工餐廳伙食補助', '生日禮金、三節禮券', '宿舍（單人房）', '托兒補助', '年度自強活動', '醫療費用員工優惠'];
const ON_CALL_PATTERNS = ['約兩週輪一次，下班後待命到隔天早上，被叫回一個月約 1-2 次，有 on call 費',
  '假日白天待命，被叫回才算加班費', '每月輪 3-4 次，被叫回頻率低，沒有 on call 費只能補休',
  '平日夜間待命，叫回要 30 分鐘內到院'];

// 「1:6 以下」「1:7-8」「1:20 以上」「1:2」→ [下限, 上限]
function ratioRange(opt) {
  const m = String(opt).match(/^1:(\d+)(?:-(\d+))?\s*(以下|以上)?$/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  if (m[3] === '以下') return [-Infinity, a];
  if (m[3] === '以上') return [a, Infinity];
  return [a, b];
}
function isRatioOptions(opts) { return opts.filter((o) => ratioRange(o)).length >= 3; }
function ratioToOption(value, opts) {
  const m = String(value).match(/^1:(\d+)/);
  if (!m) return null;
  const n = +m[1];
  return opts.find((o) => { const r = ratioRange(o); return r && n >= r[0] && n <= r[1]; }) || null;
}
const choosable = (opts) => opts.filter((o) => o !== '其他');

function validValue(f, v) {
  if (v === '' || v == null) return false;
  if (f.type === 'checkbox') return String(v).split(MULTI_SEP).every((x) => f.options.includes(x));
  if (f.options.length) return f.options.includes(String(v));
  if (f.type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) && n >= (f.min ?? 0) && (f.max == null || n <= f.max);
  }
  return v !== '—';
}

function genField(f, row) {
  const opts = choosable(f.options);
  // 尖峰護病比：以同班別的常態值為底，往上 0-2 格
  // 對應的常態欄：dayPeakRatio → dayShiftRatio；criticalPeakRatio → criticalRatio（急診依區域）
  const peak = f.name.match(/^(\w+)PeakRatio$/);
  if (peak && isRatioOptions(f.options)) {
    const baseKey = ['day', 'evening', 'night'].includes(peak[1]) ? `${peak[1]}ShiftRatio` : `${peak[1]}Ratio`;
    const base = f.options.indexOf(row[baseKey]);
    if (base >= 0) return f.options[Math.min(f.options.length - 1, base + randint(0, 2))];
  }
  if (f.type === 'checkbox') {
    const k = randint(1, Math.min(3, opts.length));
    const chosen = new Set([...opts].sort(() => Math.random() - 0.5).slice(0, k));
    return opts.filter((o) => chosen.has(o)).join(MULTI_SEP);   // 依表單選項順序串接
  }
  if (opts.length) return pick(opts);
  if (/^(evening|night)Allowance/.test(f.name)) {
    if (Math.random() < 0.2) return '無';
    return String(pick(ALLOWANCES[f.name.startsWith('evening') ? 'evening' : 'night']));
  }
  if (f.name === 'specialBenefits') return pick(SPECIAL_BENEFITS);
  if (f.name === 'onCallPattern') return pick(ON_CALL_PATTERNS);
  if (f.type === 'number') return String(randint(f.min ?? 0, f.max ?? 6));
  return '';
}

// 各類別的合理性修正（在對齊表單之前套用，讓題目之間不互相矛盾）
const FORM_FIXUPS = {
  // 內視鏡、高壓氧沒有輻射暴露：輻射相關題目一律「無／不適用」，也不穿鉛衣
  special(row) {
    const valid = ['心導管室', '電燒室 (EP Lab)', '內視鏡室', '血管攝影室', '介入治療中心', '高壓氧', '其他'];
    if (!valid.includes(row.specialType)) row.specialType = pick(valid.slice(0, 6));
    if (['內視鏡室', '高壓氧'].includes(row.specialType)) {
      Object.assign(row, { radiationExposure: '無（如內視鏡、高壓氧）', radiationProtection: '不適用',
        dosimeter: '不適用', radiationHealthCheck: '不適用', leadApronBurden: '' });
    } else if (row.radiationExposure === '無（如內視鏡、高壓氧）') {
      row.radiationExposure = pick(['幾乎每天', '每週數次', '偶爾']);
    }
    if (row.specialType === '高壓氧') row.staffPerCase = '不適用';
  },
  // 值班型態與 on call 一致：固定白班＋on call → 需要；固定白班不需值班 → 不需要
  or(row) {
    row.orShift = pick(['固定白班＋on call', '固定白班＋on call', '三班輪值', '白班＋輪值夜間刀', '固定白班，不需值班']);
    if (row.orShift === '固定白班＋on call') row.onCallRequired = '需要';
    else if (row.orShift === '固定白班，不需值班') row.onCallRequired = '不需要';
    else row.onCallRequired = pick(['需要', '不需要']);
  },
};

function conformToForm(slug, rows) {
  const schema = FORM_SCHEMAS[slug];
  if (!schema) return null;
  for (const row of rows) {
    FORM_FIXUPS[slug]?.(row);
    for (const f of schema) {
      if (f.showIf && !(f.showIf.in ? f.showIf.in.includes(row[f.showIf.field]) : row[f.showIf.field] === f.showIf.equals)) {
        row[f.name] = ''; continue;
      }
      const v = row[f.name];
      if (validValue(f, v)) continue;
      const mapped = isRatioOptions(f.options) ? ratioToOption(v, f.options) : null;
      if (mapped) { row[f.name] = mapped; continue; }
      // 選填題：舊值是「—」（不適用）或沒有值 → 約三成留空，其餘照選項抽
      if (!f.required && (v === '—' || ((v === '' || v == null) && Math.random() < 0.3))) { row[f.name] = ''; continue; }
      row[f.name] = genField(f, row);
    }
  }
  return ['timestamp', ...schema.map((f) => f.name)];
}

// ============ AI 審稿欄位（mock）============
// 格式與正式 Sheet 相同（worker-submit/src/index.js）：每個自由文字欄位各自兩欄
//   mod<欄位>      allow／review／block
//   mod<欄位>Code  中文事由（allow 留空）
// 沒填的欄位不審、兩欄都留空。另外輸出 data/mock/audit.csv（審稿稽核分頁的 mock，只含 review／block，seed.gs 灌進 audit）。
// mock 這裡隨機讓少數幾筆呈現「屏蔽」或「待複查」，方便本機檢視馬賽克、解鎖 UI 與複查流程。
const MOD_FIELDS = ['comment', 'specialBenefits', 'onCallPattern'];
const MOD_FIELD_LABELS = { comment: '短評', specialBenefits: '特殊福利', onCallPattern: 'on call 樣態' };
const modKey = (k) => 'mod' + k[0].toUpperCase() + k.slice(1);
const MOD_COLUMNS = MOD_FIELDS.flatMap((k) => [modKey(k), modKey(k) + 'Code']);
const AUDIT_COLUMNS = ['timestamp', 'category', ...MOD_COLUMNS, 'modStatus', 'modReason', ...MOD_FIELDS];

// 與 worker-submit/src/index.js 的 CODE_TEXT 一致
const CODE_TEXT = { A: '不實指控', B: '揭露第三人身分', C: '病人個案資訊', F: '人身攻擊或威脅', G: '廣告或招攬', J: '亂填或無關' };
const VERDICT_TEXT = { allow: '通過', review: '待複查', block: '屏蔽' };

// 示範用的違規文字：field＝出現在哪一欄、reason＝AI 理由（只進 audit）
const MOD_SAMPLES = [
  { field: 'comment', verdict: 'block', code: 'B', reason: '提及護理長姓名',
    text: '護理長王〇〇每天在交班時點名罵人，副護理長也不敢講話。' },
  { field: 'comment', verdict: 'block', code: 'F', reason: '針對特定同事的人身攻擊',
    text: '那個資深的〇姐超級機車，看到她就想吐，真的很垃圾。' },
  { field: 'comment', verdict: 'block', code: 'G', reason: '徵才招攬並留聯絡方式',
    text: '我們單位缺人快來，加 LINE 問我，介紹有獎金。' },
  { field: 'comment', verdict: 'block', code: 'C', reason: '描述床號與病情',
    text: '上次那個 32 床肝癌末期的阿伯家屬一直來吵，護理師被罵到哭。' },
  { field: 'comment', verdict: 'block', code: 'J', reason: '無意義測試文字',
    text: 'aaaaaaa 測試測試 123456' },
  { field: 'comment', verdict: 'review', code: 'A', reason: '指控主管違法但無從查證',
    text: '聽說主管會把加班時數改掉，申報的跟實際差很多。' },
  { field: 'comment', verdict: 'review', code: 'B', reason: '疑似指涉特定人但描述模糊',
    text: '某位資深學姊很愛針對新人，大家都知道是誰。' },
  { field: 'specialBenefits', verdict: 'block', code: 'G', reason: '推銷保險並留聯絡方式',
    text: '有員工團保，想了解保單可以私訊我幫你規劃。' },
  { field: 'onCallPattern', verdict: 'review', code: 'A', reason: '指控扣薪但無從查證',
    text: '被叫回來都不算加班，還會被扣薪水。' },
];
const MOD_SAMPLE_RATE = 0.015;   // 約 1.5% 的筆數示範屏蔽／待複查

function assignModeration(rows, slug, auditRows) {
  rows.forEach((r) => {
    const results = {};
    for (const k of MOD_FIELDS) {
      r[modKey(k)] = '';
      r[modKey(k) + 'Code'] = '';
      if (r[k]) results[k] = { verdict: 'allow', code: '', reason: '' };
    }
    if (!r._keepClean && Math.random() < MOD_SAMPLE_RATE) {
      // 只換掉本來就有填的欄位（條件題不會被硬塞值）；短評一律可用
      const s = pick(MOD_SAMPLES.filter((x) => x.field === 'comment' || r[x.field]));
      r[s.field] = s.text;
      results[s.field] = { verdict: s.verdict, code: s.code, reason: s.reason };
    }
    for (const [k, res] of Object.entries(results)) {
      r[modKey(k)] = res.verdict;
      r[modKey(k) + 'Code'] = CODE_TEXT[res.code] || '';
    }
    const keys = Object.keys(results);
    // audit 分頁只記有欄位被判 review／block 的投稿（與 apps-script/submit.gs 一致）
    if (!keys.some((k) => results[k].verdict !== 'allow')) return;
    auditRows.push({
      ...Object.fromEntries(AUDIT_COLUMNS.map((c) => [c, r[c] ?? ''])),
      category: slug,
      modStatus: keys.length ? '已審稿' : '無需審稿',
      modReason: keys.map((k) => {
        const res = results[k];
        const head = VERDICT_TEXT[res.verdict] + (res.code ? `：${CODE_TEXT[res.code]}` : '');
        return `${MOD_FIELD_LABELS[k]}：${head}${res.reason ? `（${res.reason}）` : ''}`;
      }).join('；'),
    });
  });
}

const { perCat, all, realCount } = generateAll();
if (realCount < MIN_REAL_ROWS) {
  console.error(`真實醫院筆數 ${realCount} 未達 ${MIN_REAL_ROWS}，請調整權重。`);
  process.exit(1);
}

// 先刪掉舊的 mock CSV，整批重新產生（不會殘留已不存在的類別或欄位）
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith('.csv')) fs.unlinkSync(path.join(OUT_DIR, f));

// 冒煙測試會開 platform.html?id=1（全域最舊的那筆，見 js/data-loader.js assignGlobalSeq）測「產生分享圖」，
// 被屏蔽的列沒有分享鈕。所以最舊的幾筆不放審稿示範，測試資料才穩定。
{
  const ts = (r) => { const t = new Date(r.timestamp).getTime(); return Number.isFinite(t) ? t : Infinity; };
  const tiebreak = (r) => `${r.institutionName || ''}|${r.unitName || ''}|${r.comment || ''}`;
  all.slice().sort((a, b) => (ts(a) - ts(b)) || tiebreak(a).localeCompare(tiebreak(b), 'zh-Hant'))
    .slice(0, 20).forEach((r) => { r._keepClean = true; });
}

let total = 0;
const auditRows = [];
CFG.forEach(({ slug, cols }, i) => {
  const rows = perCat[i];
  // 按 timestamp 排序 (新→舊)；最新一筆強制加時間 (讓首頁分鐘顯示)
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (rows[0] && !/\d{2}:\d{2}/.test(rows[0].timestamp)) {
    rows[0].timestamp += ' ' + String(randint(7, 23)).padStart(2, '0') + ':' + String(randint(0, 59)).padStart(2, '0');
  }
  const formCols = conformToForm(slug, rows);
  assignModeration(rows, slug, auditRows);
  const columns = (formCols || cols).concat(MOD_COLUMNS);
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.csv`), toCsv(rows, columns), 'utf8');
  console.log(`✓ ${slug}.csv: ${rows.length} rows, ${columns.length} 欄${formCols ? '（依表單）' : ''}`);
  total += rows.length;
});
auditRows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
fs.writeFileSync(path.join(OUT_DIR, 'audit.csv'), toCsv(auditRows, AUDIT_COLUMNS), 'utf8');
console.log(`✓ audit.csv: ${auditRows.length} rows（審稿稽核分頁）`);
const realPct = ((100 * realCount) / total).toFixed(1);
console.log(`\nTotal: ${total} rows（真實評鑑醫院 ${realCount} 筆 / ${realPct}%，其餘為診所/其他場域）`);
