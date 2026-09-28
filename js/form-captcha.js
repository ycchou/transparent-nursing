// form-captcha.js — 表單的人機驗證：站內自製驗證碼，live 模式有 Site Key 時改用 Cloudflare Turnstile。
import { C } from './theme.js?v=9bc2af9f89';

import { turnstileSiteKey } from './env.js?v=9bc2af9f89';

const CAPTCHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 避開易混字元 0/O/1/I/L
let currentCaptcha = '';

// ===== 驗證碼 =====
export function generateCaptcha() {
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
  const colors = [C.primaryFill, C.ink, C.success, C.dangerFill];
  const chars = (currentCaptcha || '').split('');
  display.innerHTML = chars.map((ch, i) => {
    const angle = ((Math.random() - 0.5) * 24).toFixed(1); // ±12 度
    const dy = ((Math.random() - 0.5) * 6).toFixed(1);     // ±3px
    const color = colors[i % colors.length];
    return `<span class="dform-captcha-char" style="color:${color};transform:translateY(${dy}px) rotate(${angle}deg);">${ch}</span>`;
  }).join('');
}

export function attachCaptcha() {
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
export function isCaptchaValid() {
  const input = document.getElementById('captcha-input');
  if (!input) return true; // 沒有 captcha 區塊就跳過（容錯）
  const v = (input.value || '').trim().toUpperCase();
  return v === currentCaptcha;
}

// ===== Cloudflare Turnstile =====
//
// 只有 live 模式且 js/env.js 填了 Site Key 才會掛上。Worker 端（tn-submit）的 ①
// 一定會驗 token，所以 live 模式沒掛 widget 的話送出必被擋。
//
// Turnstile 掛上時會取代站內自製驗證碼（兩個人機驗證連在一起對填表的人太煩，
// 且 Turnstile 嚴格強過自製那個）。要兩個都留就把下面改成 false。
export const TURNSTILE_REPLACES_LOCAL_CAPTCHA = true;

const TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tnTurnstileReady';
let TURNSTILE_WIDGET_ID = null;

export function turnstileActive() { return TURNSTILE_WIDGET_ID !== null; }

export function initTurnstile() {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return;                                   // mock 模式或沒填 key
  const bar = document.querySelector('.dform-submit-bar');
  if (!bar || document.getElementById('dform-turnstile')) return;

  const host = document.createElement('div');
  host.className = 'dform-field dform-turnstile-field';
  host.id = 'dform-turnstile-field';
  // widget 本身已經說明得夠清楚，不再加標題與說明文字
  host.innerHTML = `
    <div id="dform-turnstile"></div>
    <div class="dform-error-msg" id="err-turnstile">請完成人機驗證後再送出</div>`;
  bar.parentNode.insertBefore(host, bar);

  // explicit render：等 API 載入後由這個 callback 掛 widget
  window.__tnTurnstileReady = () => {
    try {
      TURNSTILE_WIDGET_ID = window.turnstile.render('#dform-turnstile', {
        sitekey: siteKey,
        theme: 'light',
        language: 'zh-tw',
        'refresh-expired': 'auto',     // token 5 分鐘過期；長表單填到一半會自動換新的
        'error-callback': () => console.warn('[turnstile] widget 錯誤'),
      });
      if (TURNSTILE_REPLACES_LOCAL_CAPTCHA) hideLocalCaptcha();
    } catch (e) {
      console.warn('[turnstile] render 失敗：', e.message);
    }
  };

  const el = document.createElement('script');
  el.src = TURNSTILE_API;
  el.async = true;
  el.defer = true;
  // 載不到（擋廣告外掛、網路問題）就維持自製驗證碼，至少表單還能填
  el.onerror = () => console.warn('[turnstile] API 載入失敗，沿用站內驗證碼');
  document.head.appendChild(el);
}

// Turnstile 成功掛上後隱藏站內自製驗證碼，並讓它的檢查自動通過
function hideLocalCaptcha() {
  const field = document.getElementById('dform-captcha-field');
  if (field) field.hidden = true;
}

export function turnstileToken() {
  if (!turnstileActive() || !window.turnstile) return '';
  try { return window.turnstile.getResponse(TURNSTILE_WIDGET_ID) || ''; } catch { return ''; }
}

// token 是一次性的：送出失敗要換一個新的，否則重送必定被 Worker 判為無效
export function resetTurnstile() {
  if (!turnstileActive() || !window.turnstile) return;
  try { window.turnstile.reset(TURNSTILE_WIDGET_ID); } catch {}
}
