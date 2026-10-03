// 短評屏蔽顯示 — AI 審稿判定 block 的短評在前端打馬賽克，答對數學題才展開。
//
// 判定來自投稿當下的 Worker（modVerdict / modCode 兩欄，隨 CSV 一起下來），
// 這裡只負責「怎麼顯示」：理由文案一律由 modCode 對照下表，不顯示 AI 原文，
// 避免理由本身複述違規內容。
//
// ⚠ 這是減速丘，不是保護機制：原文仍隨 CSV 送到瀏覽器，看得懂 DevTools 的人都能讀到。
//    真要讓內容不外流，必須在 Worker 端就不寫入原文（那樣也就無法解鎖）。

/** modCode → 對外顯示的屏蔽理由（簡短、不複述內容） */
export const BLOCK_REASONS = {
  A: '內容可能涉及不實指控',
  B: '內容可能揭露第三人身分',
  C: '內容可能涉及病人個案',
  D: '內容可能涉及兒少身分資訊',
  E: '內容可能涉及性侵害被害人身分資訊',
  F: '內容含人身攻擊或威脅',
  G: '內容疑似廣告或招攬',
  H: '內容可能侵害他人著作權',
  I: '內容可能違反法令',
  J: '內容疑似亂填或與職場資訊無關',
};
const FALLBACK_REASON = '內容可能違反平台使用規範';

// 刻意不記住已解鎖的短評：每次渲染都重新出題，同一則再打開也要重算一次。
// 解鎖只是「多花三秒」的減速丘，記住就等於只擋第一次。

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// 送 AI 審稿的自由文字欄位（與 worker-submit 的 MOD_FIELDS 對應）。各欄分開審、分開模糊、分開解鎖。
export const MOD_TEXT_FIELDS = ['comment', 'specialBenefits', 'onCallPattern'];

// 單欄判定欄名：comment → modComment。
// 值的格式：新資料為中文「通過」／「待複查：不實指控」／「屏蔽：揭露第三人身分」（方便在試算表人工複查）；
// 舊資料為英文 allow ／ review[:代碼] ／ block:代碼。兩種都要能讀。
const fieldModKey = (key) => 'mod' + key[0].toUpperCase() + key.slice(1);

// 中文 → 內部值。須與 worker-submit/src/index.js 的 VERDICT_TEXT／CODE_TEXT 一致
const MOD_VERDICT_TEXT = { 通過: 'allow', 待複查: 'review', 屏蔽: 'block' };
const MOD_CODE_TEXT = {
  不實指控: 'A', 揭露第三人身分: 'B', 病人個案資訊: 'C', 兒少身分資訊: 'D', 性侵害被害人身分: 'E',
  人身攻擊或威脅: 'F', 廣告或招攬: 'G', 侵害著作權: 'H', 其他違法: 'I', 亂填或無關: 'J',
};
const parseVerdict = (v) => {
  const s = String(v || '').trim();
  return MOD_VERDICT_TEXT[s] || s.toLowerCase();
};
const parseCode = (c) => {
  const s = String(c || '').trim();
  return MOD_CODE_TEXT[s] || s.toUpperCase();
};

/**
 * 某一欄的審稿判定 { verdict, code }。
 * 新資料列有逐欄判定（modComment…）；舊資料列只有整筆的 modVerdict / modCode，沿用整筆判定。
 */
export function fieldVerdict(row, key = 'comment') {
  const own = String(row?.[fieldModKey(key)] || '').trim();
  if (own) {
    const [verdict, code = ''] = own.split(/[:：]/);
    return { verdict: parseVerdict(verdict), code: parseCode(code) };
  }
  return { verdict: parseVerdict(row?.modVerdict), code: parseCode(row?.modCode) };
}

/** 這一欄是否被屏蔽（有字且判定 block） */
export function isFieldBlocked(row, key = 'comment') {
  return !!row?.[key] && fieldVerdict(row, key).verdict === 'block';
}

/** 這筆是否有任一欄被屏蔽（用來暫停分享圖與永久連結） */
export function isBlocked(row) {
  return MOD_TEXT_FIELDS.some((k) => isFieldBlocked(row, k));
}

export function blockReason(row, key = 'comment') {
  return BLOCK_REASONS[fieldVerdict(row, key).code] || FALLBACK_REASON;
}

/**
 * 解鎖用的數學題：一定同時含乘法與加減法，兩種題型隨機挑一種。
 *   A  兩位數 × 一位數 ± 兩位數     例：17 × 6 − 38
 *   B  兩組乘積相加減                例：8 × 7 + 9 × 4
 * 難度目標：需要真的動腦算十幾秒，但不必紙筆；答案一律為正整數。
 * 每次渲染都重新出題，同一則短評再打開也要重算。
 */
export function mathChallenge() {
  const pick = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

  if (Math.random() < 0.5) {
    // A：兩位數 × 一位數 ± 兩位數
    const a = pick(11, 29);
    const b = pick(3, 9);
    const c = pick(11, 49);
    const op = (Math.random() < 0.5 && a * b > c) ? '−' : '+';
    const answer = op === '+' ? a * b + c : a * b - c;
    return { text: `${a} × ${b} ${op} ${c}`, answer };
  }

  // B：兩組乘積相加減
  let a = pick(3, 12), b = pick(3, 9), c = pick(3, 12), d = pick(2, 9);
  let op = Math.random() < 0.5 ? '−' : '+';
  if (op === '−' && a * b < c * d) { [a, c] = [c, a]; [b, d] = [d, b]; }  // 保證為正
  if (op === '−' && a * b === c * d) op = '+';                            // 避開答案 0
  const answer = op === '+' ? a * b + c * d : a * b - c * d;
  return { text: `${a} × ${b} ${op} ${c} × ${d}`, answer };
}

/**
 * 自由文字區塊 HTML（短評、特殊福利、on call 樣態）。未屏蔽 → 原文；
 * 已屏蔽且未解鎖 → 模糊文字 + 一行說明 + 「展開」。
 * 數學題預設收著，點了展開才出現——平常看起來就只是一段被柔化的文字。
 * @param {Object} row
 * @param {Object} opts { compact:boolean, key:string } compact 用於卡片（行數更少）；key 預設 'comment'
 */
export function commentHtml(row, opts = {}) {
  const key = opts.key || 'comment';
  const text = row?.[key] || '';
  if (!text) return '';
  if (!isFieldBlocked(row, key)) return escapeHtml(text);

  const compact = !!opts.compact;
  const q = mathChallenge();
  return `
    <div class="comment-blocked${compact ? ' is-compact' : ''}" data-seq="${escapeHtml(row._seq ?? '')}"
         data-answer="${q.answer}">
      <div class="comment-blocked-text" aria-hidden="true">${escapeHtml(text)}</div>
      <div class="comment-blocked-foot">
        <span class="comment-blocked-reason">已隱藏 · ${blockReason(row, key)}</span>
        <button type="button" class="comment-unlock-toggle">展開</button>
      </div>
      <div class="comment-unlock" hidden>
        <span class="comment-unlock-q">${q.text} =</span>
        <input class="comment-unlock-input" type="text" inputmode="numeric" maxlength="4"
               aria-label="計算 ${q.text} 並輸入答案以展開內容" />
        <button type="button" class="comment-unlock-btn">確認</button>
        <span class="comment-unlock-err" hidden>答案不對</span>
      </div>
    </div>`;
}

/** 自由文字在表格窄欄位裡的顯示（屏蔽時只給一行提示，不放解鎖） */
export function commentCellHtml(row, key = 'comment') {
  const text = row?.[key] || '';
  if (!text) return '';
  if (!isFieldBlocked(row, key)) {
    return `<span class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
  }
  return `<span class="comment-cell-blocked" title="點開這筆可展開">已隱藏 · ${blockReason(row, key)}</span>`;
}

/** 全域解鎖事件（委派，重複呼叫安全）。答對數學題就把區塊換成原文。 */
export function initCommentUnlock() {
  if (initCommentUnlock._bound) return;
  initCommentUnlock._bound = true;

  const reveal = (box) => {
    const text = box.querySelector('.comment-blocked-text')?.innerHTML || '';
    box.outerHTML = `<span class="comment-unlocked">${text}</span>`;
  };

  const openChallenge = (box) => {
    const panel = box.querySelector('.comment-unlock');
    const foot = box.querySelector('.comment-blocked-foot');
    if (!panel) return;
    panel.hidden = false;
    if (foot) foot.hidden = true;
    panel.querySelector('.comment-unlock-input')?.focus();
  };

  const check = (box) => {
    const input = box.querySelector('.comment-unlock-input');
    const err = box.querySelector('.comment-unlock-err');
    const got = Number((input?.value || '').replace(/[^\d-]/g, ''));
    if (got === Number(box.dataset.answer)) { reveal(box); return; }
    if (err) err.hidden = false;
    input?.classList.add('is-error');
    input?.select();
  };

  // 捕獲階段：卡片／表格列自己綁的 click 是冒泡階段，在 document 冒泡層才擋已經來不及
  document.addEventListener('click', (e) => {
    const box = e.target.closest?.('.comment-blocked');
    if (!box) return;
    e.stopPropagation();
    if (e.target.closest('.comment-unlock-toggle')) openChallenge(box);
    else if (e.target.closest('.comment-unlock-btn')) check(box);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest?.('.comment-unlock-input');
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    check(input.closest('.comment-blocked'));
  }, true);

  document.addEventListener('input', (e) => {
    const input = e.target.closest?.('.comment-unlock-input');
    if (!input) return;
    input.classList.remove('is-error');
    const err = input.closest('.comment-blocked')?.querySelector('.comment-unlock-err');
    if (err) err.hidden = true;
  });
}
