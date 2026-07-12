#!/usr/bin/env node
/**
 * 產生 9 大類別共 ~305 筆 mock CSV，輸出到 data/mock/*.csv
 * Usage: node tools/generate-mock-data.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'mock');

// ============ 真實評鑑醫院名單 ============
// 從 data/hospitals.json（衛福部醫院評鑑合格名單）讀入，讓多數測試資料掛在
// 真實醫院名稱上，機構總覽頁（hospital.html）才能以名稱對應到眾包資料。
const MIN_REAL_ROWS = 800;  // 至少 800 筆用真實評鑑醫院名稱
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
  const recommendIndex = Math.max(1, Math.min(4, Math.round(recBias + (Math.random() - 0.5))));
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
  let base = { '醫學中心': 100, '區域醫院': 85, '地區醫院': 70, '診所': 65, '其他': 78 }[institutionType] || 80;
  const titleBonus = { 'N0': -5, 'N1': 0, 'N2': 5, 'N3': 15, 'N4': 30,
                       '專科護理師': 20, '護理長': 35, '副護理長': 25,
                       '個案管理師': 10, '學校護理師': 0, '廠護': 18, '督導': 30, '公衛護士': 5 }[jobTitle] || 0;
  base += titleBonus + randint(-8, 8);
  return {
    annualSalary: base,
    monthlyBase: Math.round(base * 0.42),
    annualBonus: Math.round(base * 0.15),
    yearsCurrent: randint(1, 8),
    yearsTotal: randint(1, 13),
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
    return {
      timestamp: genTimestamp(),
      institutionType: inst.institutionType, institutionName: inst.institutionName,
      unitName: pair.unitName, location: inst.location || pick(LOCATIONS), jobTitle,
      clinicType: pair.clinicType,
      registrationPerSession: pick(['20-40', '40-60', '60-80', '80-100', '100+']),
      staffPerClinic: pick(['1', '1', '2', '2', '3']),
      supportProcedures: pick(['衛教', 'IV/打針', '衛教/抽血', '心電圖/檢查', 'IV/心電圖', '換藥/拆線', '抽血/超音波協助', '簡易處置']),
      hasOvertime: pick(['每日', '偶爾', '罕見', '無']),
      weeklyHours: hours, overtimePolicy: w.overtimePolicy,
      yearsCurrent: s.yearsCurrent, yearsTotal: s.yearsTotal,
      annualSalary: s.annualSalary, monthlyBase: s.monthlyBase, annualBonus: s.annualBonus,
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
    const institutionType = p.customCategory === '月子中心' ? '診所' : '其他';
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
// 各類別筆數合計 1000；多數走真實評鑑醫院（只有 診所 / other 用假名）
const CFG = [
  { slug: 'ward', n: 175, gen: generateWard,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'wardType','dayShiftRatio','eveningShiftRatio','nightShiftRatio','leaderSupport','invasiveDuties',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'icu', n: 115, gen: generateIcu,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'icuType','dayShiftRatio','dayPeakRatio','eveningShiftRatio','eveningPeakRatio','nightShiftRatio','nightPeakRatio','ventilatorCare',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'er', n: 125, gen: generateEr,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'erLevel','triageRatio','criticalRatio','observationRatio','violenceFreq',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'or', n: 95, gen: generateOr,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'orSpecialty','orRole','dailyCases','roomCount','dayShiftRatio','onCallSystem',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'outpatient', n: 115, gen: generateOutpatient,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'clinicType','registrationPerSession','staffPerClinic','supportProcedures','hasOvertime',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'dialysis', n: 105, gen: generateDialysis,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'dialysisType','hdRatio','hdPeakRatio','pdCount','pdPeakRatio','batchShift','onCallType','onCallRotation','restInterval11h','onCallPay','workDuties',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','specialBenefits','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'psych', n: 95, gen: generatePsych,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'psychType','dayShiftRatio','eveningShiftRatio','nightShiftRatio','hasProtectionRoom','teamSupport','restraintFreq','violenceFreq',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'special', n: 85, gen: generateSpecial,
    cols: ['timestamp','institutionType','institutionName','unitName','location','jobTitle',
           'specialType','dailyCases','onCallRequired','radiationExposure','dayShiftRatio',
           'weeklyHours','overtimePolicy','yearsCurrent','yearsTotal',
           'annualSalary','monthlyBase','annualBonus','workAtmosphere','promotion','recommendIndex','comment'] },
  { slug: 'other', n: 90, gen: generateOther,
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

const { perCat, all, realCount } = generateAll();
if (realCount < MIN_REAL_ROWS) {
  console.error(`真實醫院筆數 ${realCount} 未達 ${MIN_REAL_ROWS}，請調整權重。`);
  process.exit(1);
}

let total = 0;
CFG.forEach(({ slug, cols }, i) => {
  const rows = perCat[i];
  // 按 timestamp 排序 (新→舊)；最新一筆強制加時間 (讓首頁分鐘顯示)
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (rows[0] && !/\d{2}:\d{2}/.test(rows[0].timestamp)) {
    rows[0].timestamp += ' ' + String(randint(7, 23)).padStart(2, '0') + ':' + String(randint(0, 59)).padStart(2, '0');
  }
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.csv`), toCsv(rows, cols), 'utf8');
  console.log(`✓ ${slug}.csv: ${rows.length} rows`);
  total += rows.length;
});
const realPct = ((100 * realCount) / total).toFixed(1);
console.log(`\nTotal: ${total} rows（真實評鑑醫院 ${realCount} 筆 / ${realPct}%，其餘為診所/其他場域）`);
