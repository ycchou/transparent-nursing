// form-institution-picker.js — 表單的「機構名稱」自動建議：依選的機構層級篩選醫院（手機為底部選單），
// 清單來自 data/hospitals-master.json（評鑑名單＋VPN 補充）。

import { icon } from './icons.js?v=483b4e6a5f';

import { HOSPITAL_SHORT_MAP as _SHORT_MAP } from './hospital-shortname.js?v=483b4e6a5f';

import { escapeHtml } from './moderation.js?v=483b4e6a5f';

import { showToast } from './toast.js?v=483b4e6a5f';

// ===== 機構名稱 autocomplete（依評鑑等級篩選醫院）=====

const ACCRED_LEVELS = new Set(['醫學中心', '區域醫院', '地區醫院']);

// 簡稱 map（accred 正式名稱 → VPN 簡稱）由共用模組載入
const HOSPITAL_SHORT_MAP = _SHORT_MAP;
// 機構名稱自動建議清單：由單一權威主檔 data/hospitals-master.json 載入
// （取代舊的 hospitals.js / hospitals-extra.js 兩個 JS 模組）。含評鑑名單 + vpn-only 補充。
let HOSPITALS_ALL = [];
function reRenderPickerIfOpen() {
  // 若下拉已展開，觸發重新 render 讓新資料/簡稱立即生效
  const input = document.getElementById('f-institutionName');
  if (input && document.activeElement === input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
fetch('data/hospitals-master.json?v=242caa808f')
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { if (d && Array.isArray(d.hospitals)) { HOSPITALS_ALL = d.hospitals; reRenderPickerIfOpen(); } })
  .catch((e) => console.warn('[form] 機構主檔載入失敗:', e.message));
window.addEventListener('hospitalShortNamesReady', reRenderPickerIfOpen);

// 將「臺北 / 臺中 / 臺南」等正規化為「台北 / 台中 / 台南」以對齊表單下拉
function normalizeCity(s) {
  return String(s || '').replace(/臺/g, '台');
}

// 機構名稱對得到主檔時，回傳系統記載的 { level, city }（對不到回傳 null）。
// 同名多筆且層級不同時（主檔目前沒有，保險起見），用戶目前選的層級若在其中就沿用，否則取第一筆。
export function systemRecordFor(name, currentLevel = '') {
  const n = String(name || '').trim();
  if (!n) return null;
  const hits = HOSPITALS_ALL.filter((h) => h.name === n);
  if (!hits.length) return null;
  const h = hits.find((x) => x.level === currentLevel) || hits[0];
  return { level: h.level, city: normalizeCity(h.city) };
}

// 機構類別／縣市與系統記載不一致（或縣市還沒選）時，一律改成系統的值；回傳是否有更動。
// prefer：用戶從下拉點選的那一筆（同名多筆時以點選的為準）。
let suppressAutoOpen = false;
export function syncInstitutionLevel(prefer = {}) {
  const nameInput = document.getElementById('f-institutionName');
  const current = document.querySelector('input[name="institutionType"]:checked');
  const currentLevel = current ? current.value : '';
  const rec = prefer.level ? prefer : systemRecordFor(nameInput && nameInput.value, currentLevel);
  if (!rec) return false;

  const notes = [];
  // 補派 change 讓表單樣式／草稿更新，但不要因此重新彈出建議清單
  suppressAutoOpen = true;
  if (rec.level !== currentLevel) {
    const target = document.querySelector(`input[name="institutionType"][value="${rec.level}"]`);
    if (target) {
      target.checked = true;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      notes.push(`機構類別「${rec.level}」`);
    }
  }
  const locSel = document.getElementById('f-location');
  const city = normalizeCity(rec.city);
  if (locSel && city && locSel.value !== city && [...locSel.options].some((o) => o.value === city)) {
    locSel.value = city;
    locSel.dispatchEvent(new Event('change', { bubbles: true }));
    notes.push(`縣市「${city}」`);
  }
  suppressAutoOpen = false;

  if (notes.length) showToast(`已依系統資料帶入${notes.join('、')}`, 'info');
  return notes.length > 0;
}

export function attachInstitutionAutocomplete() {
  const nameInput = document.getElementById('f-institutionName');
  if (!nameInput) return;

  const nameField = nameInput.closest('.dform-field');
  if (!nameField) return;

  // 訊息提示條（用戶選了醫/區/地時才顯示）
  const hint = document.createElement('div');
  hint.className = 'dform-suggest-hint';
  hint.hidden = true;
  hint.innerHTML = `${icon('lightbulb', { size: 16, className: 'ico-inline' })}偵測到您選擇了 <strong>醫學中心 / 區域醫院 / 地區醫院</strong>，請優先從下拉建議中選取<strong>系統列出的完整名稱</strong>（依<a href="https://www.mohw.gov.tw/dl-99552-9299c250-c16f-4227-b655-506ad172b598.html" target="_blank" rel="noopener" class="dform-suggest-link">衛福部 108–114 年評鑑名單<span data-icon="arrow-up-right" data-size="11"></span></a>）；統一名稱可大幅提升資料統計與圖表的精準度。`;
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
  function isEnabled() {
    return ACCRED_LEVELS.has(selectedLevel());
  }
  function highlightMatch(name, q) {
    if (!q) return escapeHtml(name);
    const safeName = escapeHtml(name);
    const safeQ = escapeHtml(q);
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
  // limit：桌機下拉在「沒選縣市也沒打字」時只列前 15 筆；手機底部選單可捲動，全部列出
  function getMatches(level, loc, q, limit = Infinity) {
    const cap = (loc || q) ? Infinity : limit;
    const primary = HOSPITALS_ALL
      .filter((h) => {
        if (h.level !== level) return false;
        if (loc && normalizeCity(h.city) !== loc) return false;
        if (!matchesQuery(h, q)) return false;
        return true;
      })
      .slice(0, cap);
    let crossLevel = [];
    if (q) {
      crossLevel = HOSPITALS_ALL.filter((h) =>
        h.level !== level && (!loc || normalizeCity(h.city) === loc) && matchesQuery(h, q)).slice(0, 30);
    }
    return { primary, crossLevel };
  }

  function isMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
  }
  function shouldUseSheet() {
    return isMobile() && isEnabled();
  }

  // 從下拉選項挑選後，會補派一次 input 事件給表單驗證用；
  // 這個旗標讓那次 input 不要重新開下拉（否則選完馬上又彈出來）。
  let suppressInlineRender = false;

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
    const { primary, crossLevel } = getMatches(level, loc, q, 15);

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
      <li class="dform-suggest-item${isCross ? ' is-cross' : ''}" role="option" data-name="${escapeHtml(h.name)}" data-level="${escapeHtml(h.level)}" data-city="${escapeHtml(h.city)}">
        <span class="suggest-name">${highlightMatch(h.name, q)}</span>
        <span class="suggest-meta">${isCross ? `<span class="suggest-level">${escapeHtml(h.level)}</span> · ` : ''}${escapeHtml(h.city)}${shortHtml ? ' · ' + shortHtml : ''}</span>
      </li>
    `;
    };

    let html = '';
    if (primary.length > 0) {
      html += `<ul class="dform-suggest-list" role="listbox">${primary.map((h) => itemHtml(h, false)).join('')}</ul>`;
    }
    if (crossLevel.length > 0) {
      html += `<div class="dform-suggest-divider">
        ${icon('alert-triangle', { size: 14, className: 'ico-inline' })}其他類別的${loc ? '同縣市' : ''}醫院（您可能選錯機構類別）
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
        // 補派 input 事件給表單驗證/狀態，但不要讓它重新開下拉
        suppressInlineRender = true;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.blur();
        syncInstitutionLevel({ level: li.dataset.level, city: li.dataset.city });
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
          <button type="button" class="dform-picker-close" data-close="1" aria-label="關閉">${icon('x', { size: 20 })}</button>
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
      <li class="dform-picker-item${isCross ? ' is-cross' : ''}" data-name="${escapeHtml(h.name)}" data-level="${escapeHtml(h.level)}" data-city="${escapeHtml(h.city)}">
        <span class="picker-name">${highlightMatch(h.name, q)}</span>
        <span class="picker-meta">${isCross ? `<span class="picker-level">${escapeHtml(h.level)}</span> · ` : ''}${escapeHtml(h.city)}${shortHtml}</span>
      </li>
    `;
    };
    let html = '';
    if (primary.length === 0 && crossLevel.length === 0) {
      html = `<div class="dform-picker-empty">${icon('search', { size: 16, className: 'ico-inline' })}找不到符合的醫院<br><small>可調整關鍵字或點下方「找不到？自行輸入」</small></div>`;
    } else {
      if (primary.length > 0) {
        html += `<ul class="dform-picker-list">${primary.map((h) => itemHtml(h, false)).join('')}</ul>`;
      }
      if (crossLevel.length > 0) {
        html += `<div class="dform-picker-divider">${icon('alert-triangle', { size: 14, className: 'ico-inline' })}其他類別的${loc ? '同縣市' : ''}醫院（可能類別選錯）</div>`;
        html += `<ul class="dform-picker-list">${crossLevel.map((h) => itemHtml(h, true)).join('')}</ul>`;
      }
    }
    content.innerHTML = html;
    content.querySelectorAll('.dform-picker-item').forEach((li) => {
      li.addEventListener('click', () => {
        nameInput.value = li.dataset.name;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        closeSheet();
        syncInstitutionLevel({ level: li.dataset.level, city: li.dataset.city });
      });
    });
  }

  // ===== 事件 =====
  // focus：手機 + 已選醫/區/地 + 欄位空 → 開 sheet；其他狀況走桌機 inline
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
    // 剛從下拉選完的那次補派 input：略過，避免下拉又彈出來
    if (suppressInlineRender) { suppressInlineRender = false; return; }
    if (!isMobile()) renderInline();
  });

  // 手動輸入的名稱剛好對得到主檔 → 同樣以系統層級為準
  nameInput.addEventListener('change', () => syncInstitutionLevel());

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

  // 選了醫學中心／區域／地區 → 手機開 sheet（欄位空才開）、桌機 focus + inline
  function maybeAutoOpen() {
    hint.hidden = !isEnabled();
    if (suppressAutoOpen) return;
    // sheet 開啟中 → 即時換清單（用戶在 sheet 開著時換 location/level）
    if (sheetEl && !sheetEl.hidden) {
      if (isEnabled()) renderSheetList();
      else closeSheet();
      return;
    }
    // 選了醫學中心／區域／地區就開清單，不必先選縣市（有選縣市時清單會依縣市篩選）
    if (isEnabled()) {
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
