// 洗腎室自建表單頁面：欄位 schema、渲染、驗證、序列化、送出、草稿
// 未來 Apps Script 串接時，把 SUBMIT_ENDPOINT 填入即可

import { mountLayout } from './components.js?v=17';
import { renderIcons, icon } from './icons.js?v=17';
import { HOSPITALS } from './hospitals.js?v=17';
import { markContributed } from './contribution-gate.js?v=17';
import { getShort as getHospitalShort, HOSPITAL_SHORT_MAP as _SHORT_MAP } from './hospital-shortname.js?v=17';

const DRAFT_KEY = 'dform_draft_dialysis';
const CAPTCHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 避開易混字元 0/O/1/I/L
let currentCaptcha = '';
const DRAFT_DEBOUNCE_MS = 500;
const SUBMIT_ENDPOINT = ''; // ← 第二階段填 Apps Script URL；空字串 = 測試模式

// ===== 欄位 Schema =====
// 已對齊資料平台 (config.js + dialysis.csv) 的欄位型別與選項
// section 物件代表分區標題（不是欄位）；其餘為欄位
// options 可以是字串陣列、或 { value, label } 物件陣列（送出 value、顯示 label）
const LOCATIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣',
  '澎湖縣', '金門縣', '連江縣',
];

const DIALYSIS_FORM_SCHEMA = [
  { section: '機構基本資料' },
  { name: 'location', label: '工作地點（縣市）', type: 'select', required: true,
    options: LOCATIONS, placeholder: '請選擇縣市' },
  { name: 'institutionType', label: '機構類別', type: 'radio', required: true,
    options: ['醫學中心', '區域醫院', '地區醫院', '診所', '其他'] },
  { name: 'institutionName', label: '機構名稱', type: 'text' },
  { name: 'unitName', label: '單位名稱', type: 'text',
    help: '例：腎臟科血液透析室、PD 治療中心' },
  { name: 'jobTitle', label: '職稱', type: 'text',
    help: '例：N1、N2、N3、N4、專科護理師' },

  { section: '透析單位資訊' },
  { name: 'dialysisType', label: '透析類別', type: 'radio', required: true,
    options: ['血液透析', '腹膜透析', '兩者皆有'] },

  { section: '人力配置',
    intro: `<strong>114 年度醫院與腎醫學會評鑑基準及評量項目</strong><br><br>
<strong>血液透析室：</strong>每 4 床應有 1 人以上。<br><br>
<strong>腹膜透析：</strong><br>
若病人數 ≦ 20 人，應配置有兼任腹膜透析護理人員 1 人；若病人數 > 20 人但少於 35 人，設置專任腹膜透析護理人員 1 人。<br>
若病人數 > 30 人時，有 1 名腹膜透析護理人員加入。<br>
若病人數 > 35 人時，得除有 1 名正式腹膜透析護理人員外，應再增加 1 名兼任腹膜透析護理人員；當病人數 ≧ 55 人時，應配置 2 名正式人力。` },
  { name: 'hdRatio', label: 'HD 床護比', type: 'radio', required: true,
    options: ['1:4', '1:5', '1:6（偶爾）', '1:6（常態）', '不適用', '其他'] },
  { name: 'pdCount', label: 'PD 人數護病比', type: 'radio', required: true,
    options: ['<20', '20-30', '30-35', '35-40', '45+', '不適用'] },

  { section: '值班制度' },
  { name: 'onCallType', label: '值班型態', type: 'radio',
    options: ['小夜值班（下班至次日早班）', '全日值班', '週末值班（六日連續）', '無需值班', '其他'] },
  { name: 'onCallRotation', label: '值班輪值方式', type: 'radio',
    options: ['一人輪 8 小時小夜', '一人 24 小時連續', '一人連續 7 天', '其他'] },
  { name: 'restInterval11h', label: '值班出勤之間有 11 小時間隔嗎', type: 'radio',
    options: ['有', '無'] },
  { name: 'onCallPay', label: '未出勤值班費', type: 'radio',
    options: ['無', '200-250 元', '250-300 元', '300 元以上', '其他'] },
  { name: 'batchShift', label: '單位有無「批班」制度', type: 'radio',
    options: ['有', '無'],
    help: '批班＝病患減少時提前下班的制度' },

  { section: '業務與工時' },
  { name: 'workDuties', label: '業務內容', type: 'checkbox',
    options: ['病人抽血', '病人輸血', '病人給藥', '搬運病人量體重', 'BCM 量測', '紅外線理療協助', '其他'],
    help: '可複選' },
  { name: 'weeklyHours', label: '平均每週工時', type: 'radio', required: true,
    options: ['35-40', '40-45', '45-50', '50-55', '55-60', '60+'] },
  { name: 'overtimePolicy', label: '加班費合規', type: 'radio', required: true,
    options: ['一律給', '合理範圍給', '主管判斷', '一律不給'] },

  { section: '薪資與年資' },
  { name: 'yearsCurrent',   label: '現職年資（年）',   type: 'number', min: 0, step: 1 },
  { name: 'yearsTotal',     label: '累計工作年資（年）', type: 'number', min: 0, step: 1 },
  { name: 'annualSalary',   label: '近一年年薪（萬）',  type: 'number', min: 0, step: 1 },
  { name: 'monthlyBase',    label: '月底薪+津貼（千）', type: 'number', min: 0, step: 1,
    help: '單位為「千」(例：38 表示 38,000 元)' },
  { name: 'annualBonus',    label: '全年獎金（可詳述發放形式）', type: 'textarea', rows: 2 },
  { name: 'specialBenefits', label: '特殊福利', type: 'textarea', rows: 2,
    help: '例：自費健檢、員工旅遊補助、進修補助等' },

  { section: '整體評價' },
  { name: 'workAtmosphere', label: '工作環境氣氛 (1-5)', type: 'radio', required: true,
    options: [
      { value: '5', label: '5（極佳）' },
      { value: '4', label: '4（良好）' },
      { value: '3', label: '3（普通）' },
      { value: '2', label: '2（稍差）' },
      { value: '1', label: '1（極差）' },
    ] },
  { name: 'promotion', label: '升遷與發展前景', type: 'radio', required: true,
    options: ['機會多', '普通', '難以升遷'] },
  { name: 'recommendIndex', label: '整體推薦指數 (1-5)', type: 'radio', required: true,
    options: [
      { value: '5', label: '5（非常推薦）' },
      { value: '4', label: '4（推薦）' },
      { value: '3', label: '3（保留）' },
      { value: '2', label: '2（不推薦）' },
      { value: '1', label: '1（非常不推薦）' },
    ] },
  { name: 'comment', label: '個人短評', type: 'textarea', rows: 3,
    help: '可描述環境氣氛、需額外協助的非醫療事務等' },
];

// ===== 工具函式 =====

function safeAttr(str) {
  return String(str).replaceAll('"', '&quot;');
}

// optionId：把選項文字轉成可用於 DOM id 的字串（用 base64 編碼避免特殊字元）
function optionId(name, value, idx) {
  return `opt-${name}-${idx}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// 顯示 toast（沿用 platform.html 的同款做法）
function showToast(msg, kind = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

// ===== 渲染 =====

// 將 schema 的 options（string 或 {value,label}）正規化為 {value,label} 陣列
function normalizeOptions(options) {
  return (options || []).map((o) => (typeof o === 'object' && o !== null)
    ? { value: String(o.value), label: o.label != null ? String(o.label) : String(o.value) }
    : { value: String(o), label: String(o) });
}

function renderField(field) {
  const required = field.required ? '<span class="dform-required" aria-hidden="true">*</span>' : '';
  const help = field.help
    ? `<div class="dform-help">${field.help}</div>` : '';
  const errMsg = `<div class="dform-error-msg" id="err-${field.name}">此為必填欄位</div>`;

  let inputHtml = '';
  if (field.type === 'text' || field.type === 'email') {
    inputHtml = `<input class="dform-input" type="${field.type}" id="f-${field.name}" name="${field.name}"
                    ${field.required ? 'required' : ''} aria-describedby="err-${field.name}" />`;
  } else if (field.type === 'number') {
    inputHtml = `<input class="dform-input" type="number" id="f-${field.name}" name="${field.name}"
                    inputmode="numeric" min="${field.min ?? 0}" step="${field.step ?? 1}"
                    ${field.required ? 'required' : ''} aria-describedby="err-${field.name}" />`;
  } else if (field.type === 'textarea') {
    inputHtml = `<textarea class="dform-textarea" id="f-${field.name}" name="${field.name}"
                    rows="${field.rows ?? 3}" ${field.required ? 'required' : ''}
                    aria-describedby="err-${field.name}"></textarea>`;
  } else if (field.type === 'select') {
    const opts = normalizeOptions(field.options);
    inputHtml = `
      <select class="dform-input dform-select" id="f-${field.name}" name="${field.name}"
              ${field.required ? 'required' : ''} aria-describedby="err-${field.name}">
        <option value="">${field.placeholder || '請選擇'}</option>
        ${opts.map((o) => `<option value="${safeAttr(o.value)}">${o.label}</option>`).join('')}
      </select>`;
  } else if (field.type === 'radio' || field.type === 'checkbox') {
    const inputType = field.type;
    const opts = normalizeOptions(field.options);
    const hasOther = opts.some((o) => o.value === '其他');
    inputHtml = `
      <div class="dform-options" role="${inputType === 'radio' ? 'radiogroup' : 'group'}" aria-labelledby="lab-${field.name}">
        ${opts.map((o, i) => {
          const id = optionId(field.name, o.value, i);
          return `
            <label class="dform-option" for="${id}">
              <input type="${inputType}" id="${id}" name="${field.name}" value="${safeAttr(o.value)}" />
              <span>${o.label}</span>
            </label>`;
        }).join('')}
      </div>
      ${hasOther ? `
        <input type="text" class="dform-other-input" id="other-${field.name}"
               data-other-for="${field.name}" placeholder="請說明（選「其他」後在此自由填寫）" hidden />
      ` : ''}`;
  }

  const labelFor = (field.type === 'radio' || field.type === 'checkbox') ? '' : `for="f-${field.name}"`;

  return `
    <div class="dform-field" data-name="${field.name}" data-required="${field.required ? '1' : '0'}" data-type="${field.type}">
      <label class="dform-label" id="lab-${field.name}" ${labelFor}>
        ${field.label}${required}
      </label>
      ${help}
      ${inputHtml}
      ${errMsg}
    </div>`;
}

function renderForm() {
  const root = document.getElementById('dform-fields');
  if (!root) return;

  let html = '';
  let currentSection = null;
  let sectionBuf = [];

  const flushSection = () => {
    if (!currentSection && sectionBuf.length === 0) return;
    const intro = currentSection?.intro
      ? `<div class="dform-section-intro">${currentSection.intro}</div>` : '';
    const title = currentSection
      ? `<h3 class="dform-section-title">${currentSection.section}</h3>${intro}`
      : '';
    html += `<section class="dform-section">${title}${sectionBuf.join('')}</section>`;
    sectionBuf = [];
  };

  for (const item of DIALYSIS_FORM_SCHEMA) {
    if (item.section) {
      flushSection();
      currentSection = item;
    } else {
      sectionBuf.push(renderField(item));
    }
  }
  flushSection();

  root.innerHTML = html;

  // radio/checkbox 點 label 時讓對應 input 被選中（瀏覽器原生），
  // 同時：(a) 更新 .checked class 讓「卡片化」樣式生效；(b) 切換「其他」自填文字框
  root.querySelectorAll('.dform-option input').forEach((input) => {
    const updateChecked = () => {
      const otherInput = root.querySelector(`.dform-other-input[data-other-for="${input.name}"]`);

      if (input.type === 'radio') {
        // 同 name 的整組更新樣式
        const group = root.querySelectorAll(`.dform-option input[name="${input.name}"]`);
        group.forEach((g) => g.closest('.dform-option').classList.toggle('checked', g.checked));
        // 切換「其他」輸入框
        if (otherInput) {
          const otherIsChecked = Array.from(group).some((g) => g.checked && g.value === '其他');
          otherInput.hidden = !otherIsChecked;
          if (otherIsChecked) {
            setTimeout(() => otherInput.focus(), 50);
          } else {
            otherInput.value = '';
          }
        }
      } else {
        // checkbox：個別 toggle
        input.closest('.dform-option').classList.toggle('checked', input.checked);
        if (input.value === '其他' && otherInput) {
          otherInput.hidden = !input.checked;
          if (input.checked) {
            setTimeout(() => otherInput.focus(), 50);
          } else {
            otherInput.value = '';
          }
        }
      }
    };
    input.addEventListener('change', updateChecked);
  });

  // 任何欄位變動 → 清掉錯誤狀態
  root.addEventListener('input', (e) => {
    const fieldEl = e.target.closest('.dform-field');
    if (fieldEl) fieldEl.classList.remove('has-error');
  });
  root.addEventListener('change', (e) => {
    const fieldEl = e.target.closest('.dform-field');
    if (fieldEl) fieldEl.classList.remove('has-error');
  });
}

// ===== 序列化 / 反序列化 =====

// 取「其他」的自填文字（若有），找不到或空字串就回傳 '其他'
function pickOtherText(name) {
  const other = document.querySelector(`.dform-other-input[data-other-for="${name}"]`);
  const txt = other && other.value.trim();
  return txt || '其他';
}

function serializeForm() {
  const data = {};
  for (const item of DIALYSIS_FORM_SCHEMA) {
    if (item.section) continue;
    const { name, type } = item;
    if (type === 'checkbox') {
      const inputs = document.querySelectorAll(`input[type="checkbox"][name="${name}"]:checked`);
      data[name] = Array.from(inputs).map((i) => i.value === '其他' ? pickOtherText(name) : i.value);
    } else if (type === 'radio') {
      const sel = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
      const val = sel ? sel.value : '';
      data[name] = val === '其他' ? pickOtherText(name) : val;
    } else {
      const el = document.getElementById(`f-${name}`);
      data[name] = el ? el.value : '';
    }
  }
  return data;
}

// 選 radio/checkbox 「其他」並回填自填文字
function selectOtherWithText(name, type, txt) {
  const sel = document.querySelector(`input[type="${type}"][name="${name}"][value="其他"]`);
  const otherInput = document.querySelector(`.dform-other-input[data-other-for="${name}"]`);
  if (!sel || !otherInput) return false;
  sel.checked = true;
  sel.dispatchEvent(new Event('change'));
  otherInput.value = txt;
  return true;
}

function applyDataToForm(data) {
  if (!data || typeof data !== 'object') return;
  for (const item of DIALYSIS_FORM_SCHEMA) {
    if (item.section) continue;
    const { name, type } = item;
    const val = data[name];
    if (val == null) continue;
    if (type === 'checkbox' && Array.isArray(val)) {
      val.forEach((v) => {
        const input = document.querySelector(`input[type="checkbox"][name="${name}"][value="${safeAttr(v)}"]`);
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('change'));
        } else {
          // 不在原 options 內 → 視為「其他」自填值
          selectOtherWithText(name, 'checkbox', v);
        }
      });
    } else if (type === 'radio') {
      const input = document.querySelector(`input[type="radio"][name="${name}"][value="${safeAttr(val)}"]`);
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event('change'));
      } else {
        selectOtherWithText(name, 'radio', val);
      }
    } else {
      const el = document.getElementById(`f-${name}`);
      if (el) el.value = val;
    }
  }
}

// ===== 驗證 =====

function validate(data) {
  const errors = [];
  for (const item of DIALYSIS_FORM_SCHEMA) {
    if (item.section || !item.required) continue;
    const { name, type } = item;
    const val = data[name];
    const isEmpty = type === 'checkbox'
      ? (!Array.isArray(val) || val.length === 0)
      : (val == null || String(val).trim() === '');
    if (isEmpty) errors.push(name);
  }
  return errors;
}

function showErrors(errorNames) {
  // 清掉所有舊錯誤
  document.querySelectorAll('.dform-field.has-error').forEach((el) => el.classList.remove('has-error'));
  if (errorNames.length === 0) return;

  // 標紅所有有錯欄位
  errorNames.forEach((name) => {
    const fieldEl = document.querySelector(`.dform-field[data-name="${name}"]`);
    if (fieldEl) fieldEl.classList.add('has-error');
  });

  // 平滑捲到第一個錯誤 + focus
  const firstName = errorNames[0];
  const firstFieldEl = document.querySelector(`.dform-field[data-name="${firstName}"]`);
  if (firstFieldEl) {
    firstFieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = firstFieldEl.querySelector('input, textarea, select');
    if (focusable) setTimeout(() => focusable.focus(), 300);
  }
}

// ===== 草稿 =====

function saveDraft() {
  try {
    const data = serializeForm();
    // 如果整份完全空，就不要存草稿（避免覆蓋掉先前可能恢復的草稿）
    const hasAny = Object.values(data).some((v) =>
      (Array.isArray(v) ? v.length > 0 : String(v || '').trim() !== ''));
    if (!hasAny) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.data || !obj.ts) return null;
    return obj;
  } catch { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function restoreDraftIfAny() {
  const draft = loadDraft();
  if (!draft) return;

  const bannerHost = document.getElementById('dform-draft-banner-host');
  if (!bannerHost) return;

  const ageMin = Math.round((Date.now() - draft.ts) / 60000);
  const ageText = ageMin < 1 ? '剛才' : ageMin < 60 ? `${ageMin} 分鐘前` :
    ageMin < 1440 ? `${Math.round(ageMin / 60)} 小時前` : `${Math.round(ageMin / 1440)} 天前`;

  bannerHost.innerHTML = `
    <div class="dform-draft-banner" role="status">
      <span>📝 偵測到 <strong>${ageText}</strong> 的未送出草稿，要繼續嗎？</span>
      <span style="display:inline-flex;gap:8px;">
        <button type="button" id="draft-restore">繼續</button>
        <button type="button" id="draft-discard">捨棄</button>
      </span>
    </div>
  `;
  document.getElementById('draft-restore').addEventListener('click', () => {
    applyDataToForm(draft.data);
    bannerHost.innerHTML = '';
    showToast('草稿已恢復', 'info');
  });
  document.getElementById('draft-discard').addEventListener('click', () => {
    clearDraft();
    bannerHost.innerHTML = '';
  });
}

function attachDraftAutosave() {
  const root = document.getElementById('dform-fields');
  if (!root) return;
  const handler = debounce(saveDraft, DRAFT_DEBOUNCE_MS);
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
}

// ===== 送出 =====

async function onSubmit(e) {
  e.preventDefault();
  const data = serializeForm();
  const errors = validate(data);
  if (errors.length) {
    showErrors(errors);
    showToast(`還有 ${errors.length} 個必填欄位沒完成`, 'warn');
    return;
  }
  // 驗證碼檢查（不分大小寫）
  if (!isCaptchaValid()) {
    const captchaField = document.getElementById('dform-captcha-field');
    if (captchaField) {
      captchaField.classList.add('has-error');
      captchaField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const input = document.getElementById('captcha-input');
        if (input) input.focus();
      }, 300);
    }
    generateCaptcha();
    showToast('驗證碼錯誤，已重新產生', 'warn');
    return;
  }
  // 法律條款 — 5 項 checkbox 必須全勾才能送出
  const consentCard = document.getElementById('dform-consent-card');
  const consents = consentCard ? consentCard.querySelectorAll('input[data-consent="1"]') : [];
  const allChecked = consents.length > 0 && Array.from(consents).every((cb) => cb.checked);
  if (!allChecked) {
    if (consentCard) {
      consentCard.classList.add('has-error');
      consentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('請勾選全部 3 項法律聲明後再送出', 'warn');
    return;
  }

  const btn = document.querySelector('.dform-submit-btn');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="dform-spinner" aria-hidden="true"></span><span>送出中…</span>`;

  try {
    if (SUBMIT_ENDPOINT) {
      // 第二階段：真正打 Apps Script
      const body = new URLSearchParams();
      Object.entries(data).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item) => body.append(k, item));
        } else {
          body.append(k, v ?? '');
        }
      });
      const res = await fetch(SUBMIT_ENDPOINT, { method: 'POST', body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      // 第一階段：模擬送出
      console.log('[DFORM] would submit:', data);
      await new Promise((r) => setTimeout(r, 600));
    }
    clearDraft();
    showThanks();
  } catch (err) {
    console.error(err);
    showToast('送出失敗：' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function showThanks() {
  // Soft Give-to-Get：成功送出 = 解鎖資料平台完整資料
  markContributed();

  const form = document.getElementById('dform');
  const banner = document.getElementById('dform-draft-banner-host');
  if (banner) banner.innerHTML = '';
  if (form) form.hidden = true;

  // 建立彈出視窗
  const modal = document.createElement('div');
  modal.className = 'dform-thanks-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'dform-thanks-title');
  modal.innerHTML = `
    <div class="dform-thanks-backdrop"></div>
    <div class="dform-thanks-panel">
      <div class="dform-thanks-icon">${icon('check-circle', { size: 48 })}</div>
      <h2 id="dform-thanks-title">感謝你的分享！</h2>
      <p>
        ${SUBMIT_ENDPOINT ? '資料已送出，將在彙整後顯示於資料平台。' : '（測試模式）資料已記錄於 console，未實際送出。'}<br/>
        你的經驗會成為下一位護理師選擇職場時最真實的參考。
      </p>
      <p class="dform-thanks-countdown" id="thanks-countdown-text">
        <span id="thanks-countdown-num">10</span> 秒後自動回首頁
      </p>
      <div class="dform-thanks-actions">
        <button type="button" class="btn btn-secondary" id="thanks-again">再填一份</button>
        <a class="btn btn-primary" href="index.html">立即回首頁</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
  document.body.classList.add('dform-thanks-open'); // 鎖背景捲動
  renderIcons(modal);

  // 10 秒倒數 → 自動跳首頁
  let secondsLeft = 10;
  const countdownNum = modal.querySelector('#thanks-countdown-num');
  const countdownText = modal.querySelector('#thanks-countdown-text');
  const intervalId = setInterval(() => {
    secondsLeft -= 1;
    if (countdownNum) countdownNum.textContent = String(Math.max(0, secondsLeft));
    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      window.location.href = 'index.html';
    }
  }, 1000);

  // 「再填一份」→ 取消倒數、移除 modal、重置表單
  const cancelRedirect = () => {
    clearInterval(intervalId);
  };
  modal.querySelector('#thanks-again').addEventListener('click', () => {
    cancelRedirect();
    document.body.classList.remove('dform-thanks-open');
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 200);
    if (form) {
      form.hidden = false;
      form.reset();
      form.querySelectorAll('.dform-option.checked').forEach((el) => el.classList.remove('checked'));
      form.querySelectorAll('.dform-field.has-error').forEach((el) => el.classList.remove('has-error'));
      const btn = document.querySelector('.dform-submit-btn');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>送出表單</span> ${icon('arrow-right', { size: 14 })}`;
      }
    }
    // 重新產生驗證碼
    if (typeof generateCaptcha === 'function') generateCaptcha();
    // 捲回頂端
    document.querySelector('.dform-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 「立即回首頁」是 <a>，點了瀏覽器自動跳轉；無需額外處理
  // 點 backdrop 也視為「留下來」取消倒數（避免直接消失）
  modal.querySelector('.dform-thanks-backdrop').addEventListener('click', () => {
    cancelRedirect();
    if (countdownText) countdownText.textContent = '已取消自動跳轉';
  });
}

// ===== 機構名稱 autocomplete（依評鑑等級篩選 405 家醫院）=====

const ACCRED_LEVELS = new Set(['醫學中心', '區域醫院', '地區醫院']);

// 簡稱 map（accred 正式名稱 → VPN 簡稱）由共用模組載入
const HOSPITAL_SHORT_MAP = _SHORT_MAP;
window.addEventListener('hospitalShortNamesReady', () => {
  // 若下拉已展開，觸發重新 render 讓簡稱立即生效
  const input = document.getElementById('f-institutionName');
  if (input && document.activeElement === input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

function attachInstitutionAutocomplete() {
  const nameInput = document.getElementById('f-institutionName');
  if (!nameInput) return;

  const nameField = nameInput.closest('.dform-field');
  if (!nameField) return;

  // 訊息提示條（用戶選了醫/區/地時才顯示）
  const hint = document.createElement('div');
  hint.className = 'dform-suggest-hint';
  hint.hidden = true;
  hint.innerHTML = `💡 偵測到您選擇了 <strong>醫學中心 / 區域醫院 / 地區醫院</strong>，請優先從下拉建議中選取<strong>系統列出的完整名稱</strong>（依<a href="https://www.mohw.gov.tw/dl-99552-9299c250-c16f-4227-b655-506ad172b598.html" target="_blank" rel="noopener" class="dform-suggest-link">衛福部 108–114 年評鑑名單<span data-icon="arrow-up-right" data-size="11"></span></a>）；統一名稱可大幅提升資料統計與圖表的精準度。`;
  nameField.insertBefore(hint, nameInput);

  // 把 input 包進 anchor 容器，讓建議下拉可以用 absolute 飄在底下不擠掉下方欄位
  const anchor = document.createElement('div');
  anchor.className = 'dform-input-anchor';
  nameInput.parentNode.insertBefore(anchor, nameInput);
  anchor.appendChild(nameInput);

  // 建議下拉容器（floating popover）
  const wrap = document.createElement('div');
  wrap.className = 'dform-suggest-host';
  wrap.hidden = true;
  anchor.appendChild(wrap);

  function selectedLevel() {
    const r = document.querySelector('input[name="institutionType"]:checked');
    return r ? r.value : null;
  }
  function selectedLocation() {
    const sel = document.getElementById('f-location');
    return sel ? sel.value : '';
  }
  // 將「臺北 / 臺中 / 臺南」等正規化為「台北 / 台中 / 台南」以對齊表單下拉
  function normalizeCity(s) {
    return String(s || '').replace(/臺/g, '台');
  }
  function isEnabled() {
    return ACCRED_LEVELS.has(selectedLevel());
  }
  function highlightMatch(name, q) {
    if (!q) return safeAttr(name);
    const safeName = safeAttr(name);
    const safeQ = safeAttr(q);
    const lower = safeName.toLowerCase();
    const idx = lower.indexOf(safeQ.toLowerCase());
    if (idx < 0) return safeName;
    return safeName.slice(0, idx)
      + '<mark>' + safeName.slice(idx, idx + safeQ.length) + '</mark>'
      + safeName.slice(idx + safeQ.length);
  }

  // q 是否命中該醫院（正式名稱或簡稱）
  function matchesQuery(h, q) {
    if (!q) return true;
    if (h.name.toLowerCase().includes(q)) return true;
    const short = HOSPITAL_SHORT_MAP.get(h.name);
    return !!(short && short.toLowerCase().includes(q));
  }

  // 共用 filter（桌機 inline 與手機 sheet 共用）
  function getMatches(level, loc, q) {
    const cap = (loc || q) ? Infinity : 15;
    const primary = HOSPITALS
      .filter((h) => {
        if (h.level !== level) return false;
        if (loc && normalizeCity(h.city) !== loc) return false;
        if (!matchesQuery(h, q)) return false;
        return true;
      })
      .slice(0, cap);
    let crossLevel = [];
    if (q && loc) {
      crossLevel = HOSPITALS.filter((h) =>
        h.level !== level && normalizeCity(h.city) === loc && matchesQuery(h, q));
    }
    return { primary, crossLevel };
  }

  function isMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
  }
  function shouldUseSheet() {
    return isMobile() && isEnabled() && selectedLocation();
  }

  function renderInline() {
    if (!isEnabled()) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    const level = selectedLevel();
    const loc = normalizeCity(selectedLocation());
    const q = nameInput.value.trim().toLowerCase();
    const { primary, crossLevel } = getMatches(level, loc, q);

    if (primary.length === 0 && crossLevel.length === 0) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;

    const itemHtml = (h, isCross) => {
      const short = HOSPITAL_SHORT_MAP.get(h.name);
      const shortHtml = short ? `<span class="suggest-short">簡稱：${highlightMatch(short, q)}</span>` : '';
      return `
      <li class="dform-suggest-item${isCross ? ' is-cross' : ''}" role="option" data-name="${safeAttr(h.name)}">
        <span class="suggest-name">${highlightMatch(h.name, q)}</span>
        <span class="suggest-meta">${isCross ? `<span class="suggest-level">${safeAttr(h.level)}</span> · ` : ''}${safeAttr(h.city)}${shortHtml ? ' · ' + shortHtml : ''}</span>
      </li>
    `;
    };

    let html = '';
    if (primary.length > 0) {
      html += `<ul class="dform-suggest-list" role="listbox">${primary.map((h) => itemHtml(h, false)).join('')}</ul>`;
    }
    if (crossLevel.length > 0) {
      html += `<div class="dform-suggest-divider">
        ⚠️ 其他類別的同縣市醫院（您可能選錯機構類別）
      </div>`;
      html += `<ul class="dform-suggest-list" role="listbox">${crossLevel.map((h) => itemHtml(h, true)).join('')}</ul>`;
    }
    wrap.innerHTML = html;

    wrap.querySelectorAll('.dform-suggest-item').forEach((li) => {
      // mousedown 比 click 早觸發，避免 input 的 blur 先把 dropdown 隱藏
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        nameInput.value = li.dataset.name;
        wrap.hidden = true;
        wrap.innerHTML = '';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  // ===== 手機 bottom sheet picker =====
  let sheetEl = null;
  let sheetEscHandler = null;

  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.className = 'dform-picker-sheet';
    sheetEl.hidden = true;
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-modal', 'true');
    sheetEl.setAttribute('aria-labelledby', 'dform-picker-title');
    sheetEl.innerHTML = `
      <div class="dform-picker-backdrop" data-close="1"></div>
      <div class="dform-picker-panel">
        <div class="dform-picker-header">
          <h3 id="dform-picker-title">選擇機構名稱</h3>
          <button type="button" class="dform-picker-close" data-close="1" aria-label="關閉">×</button>
        </div>
        <div class="dform-picker-search-wrap">
          <input class="dform-picker-search" type="search" placeholder="搜尋醫院關鍵字..." autocomplete="off" inputmode="search" enterkeyhint="search" />
        </div>
        <div class="dform-picker-content"></div>
        <div class="dform-picker-footer">
          <button type="button" class="btn btn-secondary dform-picker-freetext">找不到？自行輸入</button>
        </div>
      </div>
    `;
    document.body.appendChild(sheetEl);

    sheetEl.addEventListener('click', (e) => {
      if (e.target && e.target.dataset && e.target.dataset.close === '1') closeSheet();
    });
    sheetEl.querySelector('.dform-picker-search').addEventListener('input', renderSheetList);
    sheetEl.querySelector('.dform-picker-freetext').addEventListener('click', () => {
      // 把當前搜尋框文字當成自填值送回 nameInput，方便用戶在欄位裡繼續編輯
      const search = sheetEl.querySelector('.dform-picker-search');
      const v = (search.value || '').trim();
      if (v) {
        nameInput.value = v;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      closeSheet();
    });
    return sheetEl;
  }

  function openSheet() {
    ensureSheet();
    const search = sheetEl.querySelector('.dform-picker-search');
    search.value = nameInput.value || '';
    renderSheetList();
    sheetEl.hidden = false;
    requestAnimationFrame(() => sheetEl.classList.add('open'));
    document.body.classList.add('dform-picker-open');
    setTimeout(() => search.focus(), 250);
    sheetEscHandler = (e) => { if (e.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', sheetEscHandler);
  }

  function closeSheet() {
    if (!sheetEl || sheetEl.hidden) return;
    sheetEl.classList.remove('open');
    document.body.classList.remove('dform-picker-open');
    if (sheetEscHandler) {
      document.removeEventListener('keydown', sheetEscHandler);
      sheetEscHandler = null;
    }
    setTimeout(() => { if (sheetEl) sheetEl.hidden = true; }, 220);
  }

  function renderSheetList() {
    if (!sheetEl) return;
    const search = sheetEl.querySelector('.dform-picker-search');
    const content = sheetEl.querySelector('.dform-picker-content');
    const q = (search.value || '').trim().toLowerCase();
    const level = selectedLevel();
    const loc = normalizeCity(selectedLocation());
    const { primary, crossLevel } = getMatches(level, loc, q);

    const itemHtml = (h, isCross) => {
      const short = HOSPITAL_SHORT_MAP.get(h.name);
      const shortHtml = short ? ` · <span class="picker-short">簡稱：${highlightMatch(short, q)}</span>` : '';
      return `
      <li class="dform-picker-item${isCross ? ' is-cross' : ''}" data-name="${safeAttr(h.name)}">
        <span class="picker-name">${highlightMatch(h.name, q)}</span>
        <span class="picker-meta">${isCross ? `<span class="picker-level">${safeAttr(h.level)}</span> · ` : ''}${safeAttr(h.city)}${shortHtml}</span>
      </li>
    `;
    };
    let html = '';
    if (primary.length === 0 && crossLevel.length === 0) {
      html = `<div class="dform-picker-empty">🔍 找不到符合的醫院<br><small>可調整關鍵字或點下方「找不到？自行輸入」</small></div>`;
    } else {
      if (primary.length > 0) {
        html += `<ul class="dform-picker-list">${primary.map((h) => itemHtml(h, false)).join('')}</ul>`;
      }
      if (crossLevel.length > 0) {
        html += `<div class="dform-picker-divider">⚠️ 其他類別的同縣市醫院（可能類別選錯）</div>`;
        html += `<ul class="dform-picker-list">${crossLevel.map((h) => itemHtml(h, true)).join('')}</ul>`;
      }
    }
    content.innerHTML = html;
    content.querySelectorAll('.dform-picker-item').forEach((li) => {
      li.addEventListener('click', () => {
        nameInput.value = li.dataset.name;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        closeSheet();
      });
    });
  }

  // ===== 事件 =====
  // focus：手機 + 條件齊備 + 欄位空 → 開 sheet；其他狀況走桌機 inline
  // 欄位「已有值」時即使在手機也走鍵盤編輯，不強拉 sheet（讓用戶能微調文字）
  nameInput.addEventListener('focus', () => {
    if (shouldUseSheet() && nameInput.value === '') {
      nameInput.blur();
      openSheet();
    } else if (!isMobile()) {
      renderInline();
    }
  });

  // 桌機 input 即時過濾；手機由 sheet 內的 search 處理
  nameInput.addEventListener('input', () => {
    if (!isMobile()) renderInline();
  });

  // blur 後延遲關閉，給 radio change 重新 focus 的機會（避免切類別時下拉一閃就消失）
  let blurHideTimerId = null;
  nameInput.addEventListener('blur', () => {
    if (blurHideTimerId) clearTimeout(blurHideTimerId);
    blurHideTimerId = setTimeout(() => {
      blurHideTimerId = null;
      // 真的失焦才 hide；如果中間 focus 又回到 input，這個 timer 也會被 clearTimeout 取消
      if (document.activeElement !== nameInput) wrap.hidden = true;
    }, 180);
  });
  // focus 回來：取消正在等待的 hide
  nameInput.addEventListener('focus', () => {
    if (blurHideTimerId) { clearTimeout(blurHideTimerId); blurHideTimerId = null; }
  });

  // 雙條件齊備 → 手機開 sheet（欄位空才開）、桌機 focus + inline
  function maybeAutoOpen() {
    hint.hidden = !isEnabled();
    // sheet 開啟中 → 即時換清單（用戶在 sheet 開著時換 location/level）
    if (sheetEl && !sheetEl.hidden) {
      if (isEnabled() && selectedLocation()) renderSheetList();
      else closeSheet();
      return;
    }
    if (isEnabled() && selectedLocation()) {
      if (shouldUseSheet() && nameInput.value === '') {
        openSheet();
      } else if (!isMobile() && document.activeElement !== nameInput) {
        nameInput.focus();
      } else if (!isMobile() && document.activeElement === nameInput) {
        renderInline();
      }
    } else {
      wrap.hidden = true;
      wrap.innerHTML = '';
    }
  }

  document.querySelectorAll('input[name="institutionType"]').forEach((r) => {
    r.addEventListener('change', maybeAutoOpen);
  });
  const locSel = document.getElementById('f-location');
  if (locSel) locSel.addEventListener('change', maybeAutoOpen);
}

// ===== 驗證碼 =====
function generateCaptcha() {
  currentCaptcha = '';
  for (let i = 0; i < 6; i++) {
    currentCaptcha += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  drawCaptcha();
  const input = document.getElementById('captcha-input');
  if (input) input.value = '';
  const field = document.getElementById('dform-captcha-field');
  if (field) field.classList.remove('has-error');
}

function drawCaptcha() {
  const display = document.getElementById('captcha-display');
  if (!display) return;
  const colors = ['#2E86AB', '#1D3557', '#06A77D', '#E63946'];
  const chars = (currentCaptcha || '').split('');
  display.innerHTML = chars.map((ch, i) => {
    const angle = ((Math.random() - 0.5) * 24).toFixed(1); // ±12 度
    const dy = ((Math.random() - 0.5) * 6).toFixed(1);     // ±3px
    const color = colors[i % colors.length];
    return `<span class="dform-captcha-char" style="color:${color};transform:translateY(${dy}px) rotate(${angle}deg);">${ch}</span>`;
  }).join('');
}

function attachCaptcha() {
  const refreshBtn = document.getElementById('captcha-refresh');
  const input = document.getElementById('captcha-input');
  if (refreshBtn) refreshBtn.addEventListener('click', generateCaptcha);
  if (input) {
    input.addEventListener('input', () => {
      // 輸入時清掉錯誤狀態
      const field = document.getElementById('dform-captcha-field');
      if (field) field.classList.remove('has-error');
    });
  }
  generateCaptcha();
}

// 不分大小寫比對
function isCaptchaValid() {
  const input = document.getElementById('captcha-input');
  if (!input) return true; // 沒有 captcha 區塊就跳過（容錯）
  const v = (input.value || '').trim().toUpperCase();
  return v === currentCaptcha;
}

// ===== 初始化 =====

mountLayout();
renderForm();
restoreDraftIfAny();
attachDraftAutosave();
attachInstitutionAutocomplete();
attachCaptcha();
renderIcons();

const formEl = document.getElementById('dform');
if (formEl) formEl.addEventListener('submit', onSubmit);

// 法律條款 checkbox 任一切換 → 清掉錯誤狀態
const consentCardEl = document.getElementById('dform-consent-card');
if (consentCardEl) {
  consentCardEl.addEventListener('change', (e) => {
    if (e.target && e.target.matches('input[data-consent="1"]')) {
      consentCardEl.classList.remove('has-error');
    }
  });
}
