// donate.js — 綠界捐款前端 widget。
// 金額檔位 + 自訂 → 呼叫 tn-donate Worker /create → 拿到已簽章參數 → 自動 submit 到綠界付款頁。
// 密鑰與簽章都在 Worker，前端只送金額、不碰任何機密。

import { SITE } from './config.js?v=f21dd448bb';
import { renderIcons } from './icons.js?v=f21dd448bb';

const TIERS = [100, 300, 500, 1000, 2000];
const DEFAULT_AMOUNT = 500;
const MIN = 1;
const MAX = 100000;

function buildAndSubmit(action, fields) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = action;
  f.style.display = 'none';
  Object.entries(fields).forEach(([k, v]) => {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = k;
    i.value = String(v);
    f.appendChild(i);
  });
  document.body.appendChild(f);
  f.submit();
}

export function mountDonate(mountEl) {
  if (!mountEl) return;
  const api = (SITE.donateApi || '').trim();
  if (!api) {
    mountEl.innerHTML = '<p style="color:var(--muted);font-size:0.92rem;">捐款功能設定中，敬請期待。</p>';
    return;
  }

  let amount = DEFAULT_AMOUNT;   // 目前選定金額
  let isCustom = false;

  mountEl.innerHTML = `
    <div class="donate-tiers" role="group" aria-label="選擇捐款金額">
      ${TIERS.map((t) => `<button type="button" class="donate-tier${t === amount ? ' active' : ''}" data-amt="${t}">NT$${t.toLocaleString()}</button>`).join('')}
      <button type="button" class="donate-tier donate-tier-custom" data-custom="1">其他金額</button>
    </div>
    <div class="donate-custom-wrap" hidden>
      <span class="donate-custom-prefix">NT$</span>
      <input type="number" class="donate-custom-input" min="${MIN}" max="${MAX}" step="1" inputmode="numeric" placeholder="輸入金額" />
    </div>
    <button type="button" class="btn btn-primary donate-submit">
      <span class="donate-heart" aria-hidden="true">🤍</span> <span class="donate-submit-label">前往捐款</span>
    </button>
    <p class="donate-error" role="alert" hidden></p>
    <p class="donate-note">將前往綠界金流安全結帳，款項由台灣呼吸治療產業工會統一代收。</p>
  `;

  const tiers = [...mountEl.querySelectorAll('.donate-tier')];
  const customWrap = mountEl.querySelector('.donate-custom-wrap');
  const customInput = mountEl.querySelector('.donate-custom-input');
  const submitBtn = mountEl.querySelector('.donate-submit');
  const submitLabel = mountEl.querySelector('.donate-submit-label');
  const errorEl = mountEl.querySelector('.donate-error');

  const setActive = (btn) => tiers.forEach((b) => b.classList.toggle('active', b === btn));
  const showError = (msg) => { errorEl.textContent = msg || ''; errorEl.hidden = !msg; };

  tiers.forEach((btn) => {
    btn.addEventListener('click', () => {
      showError('');
      setActive(btn);
      if (btn.dataset.custom) {
        isCustom = true;
        customWrap.hidden = false;
        customInput.focus();
        amount = parseInt(customInput.value, 10) || 0;
      } else {
        isCustom = false;
        customWrap.hidden = true;
        amount = parseInt(btn.dataset.amt, 10);
      }
    });
  });

  customInput.addEventListener('input', () => {
    showError('');
    amount = parseInt(customInput.value, 10) || 0;
  });

  submitBtn.addEventListener('click', async () => {
    const amt = Math.floor(Number(amount));
    if (!Number.isInteger(amt) || amt < MIN || amt > MAX) {
      showError(`請輸入 ${MIN}–${MAX.toLocaleString()} 之間的金額`);
      if (isCustom) customInput.focus();
      return;
    }
    showError('');
    submitBtn.disabled = true;
    submitLabel.textContent = '前往綠界…';
    try {
      const res = await fetch(api + '/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.action || !data.fields) {
        throw new Error((data && data.error) || '建立訂單失敗');
      }
      buildAndSubmit(data.action, data.fields);  // 導向綠界（本分頁）
    } catch (e) {
      showError('連線失敗，請稍後再試。');
      submitBtn.disabled = false;
      submitLabel.textContent = '前往捐款';
    }
  });

  renderIcons();
}
