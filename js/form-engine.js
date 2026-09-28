// 科別自建表單通用引擎：渲染、驗證、序列化、草稿、機構名稱 autocomplete、
// 驗證碼、送出、致謝。各科別頁面呼叫 initDepartmentForm({ schema, draftKey }) 即可。
// 未來 Apps Script 串接時，把 submitEndpoint 傳入即可。

import { mountLayout } from './components.js?v=93fa43955b';
import { renderIcons, icon } from './icons.js?v=93fa43955b';
import { markContributed } from './contribution-gate.js?v=93fa43955b';

import { showToast } from './toast.js?v=93fa43955b';
import { submitEndpoint as envSubmitEndpoint } from './env.js?v=93fa43955b';
import { notePwaIntent } from './pwa-prompt.js?v=93fa43955b';
import { markSubmitted } from './fresh-data.js?v=93fa43955b';
import { attachInstitutionAutocomplete, syncInstitutionLevel } from './form-institution-picker.js?v=93fa43955b';
import {
  generateCaptcha,
  attachCaptcha,
  isCaptchaValid,
  initTurnstile,
  turnstileActive,
  turnstileToken,
  resetTurnstile,
  TURNSTILE_REPLACES_LOCAL_CAPTCHA,
} from './form-captcha.js?v=93fa43955b';

const DRAFT_DEBOUNCE_MS = 500;

// ===== 每頁單例狀態（由 initDepartmentForm 設定）=====
let SCHEMA = [];
let DRAFT_KEY = '';
let SUBMIT_ENDPOINT = '';  // 空字串 = 測試模式（只模擬送出）
let CATEGORY_SLUG = '';    // 類別 slug，決定寫入 Sheet 的哪個分頁
let FORM_LOAD_TS = 0;      // 表單初始化時間戳（反垃圾：填寫過快判為機器）
const MIN_FILL_MS = 60000; // 少於 1 分鐘送出 → 視為可疑
const TEXTAREA_MAX_LENGTH = 1000;  // 自由文字欄位字數上限（可用 field.maxLength 覆寫）
// 反垃圾：單一裝置（localStorage）限制。可被清 storage／無痕繞過，屬軟限制。
const MAX_SUBMITS_PER_DAY = 5;                 // 每日提交上限
const MIN_SUBMIT_INTERVAL_MS = 5 * 60 * 1000;  // 兩次提交最小間隔（5 分鐘）
const SUBMITS_KEY = 'tn:submits';

// ===== 工具函式 =====

function safeAttr(str) {
  return String(str).replaceAll('"', '&quot;');
}

// optionId：把選項文字轉成可用於 DOM id 的字串
function optionId(name, value, idx) {
  return `opt-${name}-${idx}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ===== 渲染 =====

// 將 schema 的 options（string 或 {value,label,desc}）正規化為 {value,label,desc} 陣列
// desc：選項下方的小字說明（搭配 field.layout = 'list' 以直式卡片呈現）
function normalizeOptions(options) {
  return (options || []).map((o) => (typeof o === 'object' && o !== null)
    ? { value: String(o.value), label: o.label != null ? String(o.label) : String(o.value), desc: o.desc || '' }
    : { value: String(o), label: String(o), desc: '' });
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
    // 字數上限：太長的短評會撐爆卡片版面，也會拉長 AI 審稿時間（逾時＝沒審到）
    const maxLen = field.maxLength ?? TEXTAREA_MAX_LENGTH;
    inputHtml = `<textarea class="dform-textarea" id="f-${field.name}" name="${field.name}"
                    rows="${field.rows ?? 3}" maxlength="${maxLen}" ${field.required ? 'required' : ''}
                    aria-describedby="err-${field.name}"></textarea>
                 <div class="dform-charcount" data-for="${field.name}" data-max="${maxLen}">0 / ${maxLen}</div>`;
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
      <div class="dform-options${field.layout === 'list' ? ' dform-options--list' : ''}" role="${inputType === 'radio' ? 'radiogroup' : 'group'}" aria-labelledby="lab-${field.name}">
        ${opts.map((o, i) => {
          const id = optionId(field.name, o.value, i);
          return `
            <label class="dform-option" for="${id}">
              <input type="${inputType}" id="${id}" name="${field.name}" value="${safeAttr(o.value)}" />
              ${o.desc
                ? `<span class="dform-option-title">${o.label}</span><span class="dform-option-desc">${o.desc}</span>`
                : `<span>${o.label}</span>`}
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

  for (const item of SCHEMA) {
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
  for (const item of SCHEMA) {
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
  for (const item of SCHEMA) {
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
  for (const item of SCHEMA) {
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
      <span>${icon('pencil-line', { size: 16, className: 'ico-inline' })}偵測到 <strong>${ageText}</strong> 的未送出草稿，要繼續嗎？</span>
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

// Asia/Taipei（UTC+8）當天日期，與每日上限的「一天」一致
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
// 取本裝置今日提交紀錄（跨日自動歸零）
function getSubmitRecord() {
  const today = taipeiToday();
  try {
    const r = JSON.parse(localStorage.getItem(SUBMITS_KEY) || 'null');
    if (r && r.day === today) return r;
  } catch (_) {}
  return { day: today, count: 0, lastTs: 0 };
}
function saveSubmitRecord(r) {
  try { localStorage.setItem(SUBMITS_KEY, JSON.stringify(r)); } catch (_) {}
}

async function onSubmit(e) {
  e.preventDefault();

  // 反垃圾①：honeypot 有值 → 幾乎必為機器。靜默丟棄（不給反饋，避免對方調參重試）
  const hp = document.getElementById('dform-hp');
  if (hp && hp.value.trim() !== '') {
    console.warn('[DFORM] honeypot triggered — submission dropped');
    return;
  }
  // 反垃圾②：填寫過快 → 提示再確認（真人第二次送出時多半已超過門檻）
  if (FORM_LOAD_TS && Date.now() - FORM_LOAD_TS < MIN_FILL_MS) {
    showToast('請再確認一下填寫內容後送出', 'warn');
    return;
  }
  // 反垃圾③：單一裝置每日上限與最小間隔
  const rec = getSubmitRecord();
  if (rec.count >= MAX_SUBMITS_PER_DAY) {
    showToast(`今天的填寫已達上限（每日 ${MAX_SUBMITS_PER_DAY} 筆），請明天再來`, 'warn');
    return;
  }
  if (rec.lastTs && Date.now() - rec.lastTs < MIN_SUBMIT_INTERVAL_MS) {
    const wait = Math.ceil((MIN_SUBMIT_INTERVAL_MS - (Date.now() - rec.lastTs)) / 60000);
    showToast(`兩次填寫需間隔 5 分鐘，請約 ${wait} 分鐘後再送出`, 'warn');
    return;
  }

  // 機構名稱對得到主檔時，機構類別一律以系統記載為準（用戶可能點錯類別）
  syncInstitutionLevel();
  const data = serializeForm();
  const errors = validate(data);
  if (errors.length) {
    showErrors(errors);
    showToast(`還有 ${errors.length} 個必填欄位沒完成`, 'warn');
    return;
  }
  // 驗證碼檢查（不分大小寫）。Turnstile 掛上時由它接手，跳過站內驗證碼
  if (!(turnstileActive() && TURNSTILE_REPLACES_LOCAL_CAPTCHA) && !isCaptchaValid()) {
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
  // 法律條款 — checkbox 必須全勾才能送出
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

  // 人機驗證（Turnstile）— 沒掛 widget 時 turnstileActive() 為 false，整段跳過
  const tsToken = turnstileToken();
  if (turnstileActive() && !tsToken) {
    const tsField = document.getElementById('dform-turnstile-field');
    if (tsField) {
      tsField.classList.add('has-error');
      tsField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('請完成人機驗證後再送出', 'warn');
    return;
  }
  document.getElementById('dform-turnstile-field')?.classList.remove('has-error');

  const btn = document.querySelector('.dform-submit-btn');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="dform-spinner" aria-hidden="true"></span><span>送出中…</span>`;

  let moderationVerdict = '';
  try {
    if (SUBMIT_ENDPOINT) {
      // 第二階段：真正打 Apps Script
      const body = new URLSearchParams();
      body.append('category', CATEGORY_SLUG);   // 決定寫入 Sheet 的哪個分頁
      if (tsToken) body.append('cf-turnstile-response', tsToken);   // Worker ① 會驗這個
      Object.entries(data).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item) => body.append(k, item));
        } else {
          body.append(k, v ?? '');
        }
      });
      const res = await fetch(SUBMIT_ENDPOINT, { method: 'POST', body });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(submitErrorMessage(payload?.error, res.status));
      // Worker 回傳 AI 審稿判定；被屏蔽時在感謝畫面告知投稿者（其餘欄位照常公開）
      moderationVerdict = payload?.moderation?.verdict || '';
    } else {
      // 第一階段：模擬送出
      console.log('[DFORM] would submit:', data);
      await new Promise((r) => setTimeout(r, 600));
    }
    // 反垃圾：成功送出才計入本裝置每日次數與時間戳
    const rec2 = getSubmitRecord();
    saveSubmitRecord({ day: taipeiToday(), count: rec2.count + 1, lastTs: Date.now() });
    markSubmitted(CATEGORY_SLUG);   // 分享平台接下來 15 分鐘不讀這一類的快取，投稿者才看得到自己那筆
    clearDraft();
    showThanks({ blocked: moderationVerdict === 'block' });
  } catch (err) {
    console.error(err);
    const msg = err instanceof TypeError ? '連線失敗，請檢查網路後再試一次' : err.message;
    showToast('送出失敗：' + msg, 'error');
    resetTurnstile();   // token 一次性，重送要換新的
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function showThanks(opts = {}) {
  // Soft Give-to-Get：成功送出 = 解鎖分享平台完整資料
  markContributed();

  // 高意圖時刻：剛分享完 → 記下意圖，送出後自動跳首頁時由 initPWAPrompt 讀取顯示安裝提示
  notePwaIntent('form_submit');

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
        ${SUBMIT_ENDPOINT ? '資料已送出，將在彙整後顯示於分享平台。' : '（測試模式）資料已記錄於 console，未實際送出。'}<br/>
        你的經驗會成為下一位護理師選擇職場時最真實的參考。
      </p>
      ${opts.blocked ? `
        <p class="dform-thanks-blocked">
          ${icon('lock', { size: 16, className: 'ico-inline' })}你填寫的短評經自動檢查後判定可能違反平台使用規範，
          在分享平台上會先以模糊方式呈現；其餘欄位照常公開。
          若你認為判定有誤，可來信平台說明。
        </p>` : ''}
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

// tn-submit Worker 的錯誤碼 → 給填表者看的說明
function submitErrorMessage(code, status) {
  switch (code) {
    case 'captcha':  return '人機驗證沒通過，請重新勾選驗證框後再送出';
    case 'rate':     return '今天這台裝置送出的份數已達上限，請明天再試';
    case 'spam':     return '內容含有連結或重複字元，請移除後再送出';
    case 'upstream': return '資料庫暫時無法寫入，請稍後再試一次';
    case 'forbidden':return '來源網域不被允許，請從官方網站填寫';
    default:         return `伺服器回應異常（HTTP ${status}）`;
  }
}

// ===== 對外初始化 =====

export function initDepartmentForm({ schema, draftKey, slug = '', submitEndpoint = null }) {
  SCHEMA = schema || [];
  DRAFT_KEY = draftKey || 'dform_draft';
  // 類別 slug：決定寫進 Google Sheet 的哪個分頁。預設由 draftKey 推導（dform_draft_icu → icu）
  CATEGORY_SLUG = slug || DRAFT_KEY.replace(/^dform_draft_?/, '') || 'other';
  // 未指定就依 js/env.js 的模式決定：mock 模式回空字串＝只模擬送出，不寫到任何地方
  SUBMIT_ENDPOINT = submitEndpoint == null ? envSubmitEndpoint() : (submitEndpoint || '');

  mountLayout();
  renderForm();
  restoreDraftIfAny();
  attachDraftAutosave();
  attachInstitutionAutocomplete();
  attachCaptcha();
  initTurnstile();   // live 模式且有 Site Key 才會真的掛上
  renderIcons();

  const formEl = document.getElementById('dform');
  if (formEl) {
    // 反垃圾 honeypot：對真人隱藏、不在 SCHEMA（不會被送出），機器常會誤填
    formEl.insertAdjacentHTML('afterbegin',
      '<div aria-hidden="true" tabindex="-1" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">' +
      '<label>如果你是人，請勿填寫此欄<input type="text" id="dform-hp" name="website" tabindex="-1" autocomplete="off" /></label></div>');
    formEl.addEventListener('submit', onSubmit);
  }
  FORM_LOAD_TS = Date.now();  // 反垃圾：記錄表單就緒時間，供送出時計算填寫耗時

  // 自由文字欄位：即時字數計數（接近上限時變色）
  document.querySelectorAll('.dform-textarea[maxlength]').forEach((ta) => {
    const counter = ta.parentElement?.querySelector('.dform-charcount');
    if (!counter) return;
    const max = Number(counter.dataset.max) || TEXTAREA_MAX_LENGTH;
    const update = () => {
      const n = ta.value.length;
      counter.textContent = `${n} / ${max}`;
      counter.classList.toggle('is-near', n >= max * 0.9);
    };
    ta.addEventListener('input', update);
    update();
  });

  // 法律條款 checkbox 任一切換 → 清掉錯誤狀態
  const consentCardEl = document.getElementById('dform-consent-card');
  if (consentCardEl) {
    consentCardEl.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input[data-consent="1"]')) {
        consentCardEl.classList.remove('has-error');
      }
    });
  }
}
