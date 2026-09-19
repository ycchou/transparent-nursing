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

const UNLOCK_STORE_KEY = 'tn_unlocked_comments';

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/**
 * 解鎖用的數學題：a × b ± c，同時含乘法與加減法。
 * 難度刻意壓在心算範圍（乘數 2-9、加減 1-19），目的是讓人多花三秒、擋掉隨手點開，
 * 不是要考倒人。以 seq 當種子，同一筆每次出現的題目都一樣。
 */
export function mathChallenge(seq) {
  // mulberry32：小而分布均勻的可重現亂數。同一個 seq 永遠得到同一題。
  let t = (Number(seq) || 7) + 0x6D2B79F5;
  const rnd = () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (min, max) => min + Math.floor(rnd() * (max - min + 1));

  const a = pick(2, 9);
  const b = pick(2, 9);
  const c = pick(1, 19);
  // 減法時結果要為正，否則改用加法（a×b 最小 4，c 最大 19，有機會變負）
  const op = (rnd() < 0.5 && a * b > c) ? '−' : '+';
  const answer = op === '+' ? a * b + c : a * b - c;
  return { text: `${a} × ${b} ${op} ${c}`, answer, a, b, c, op };
}

/** 這筆的短評是否被 AI 判定屏蔽 */
export function isBlocked(row) {
  return String(row?.modVerdict || '').toLowerCase() === 'block' && !!row?.comment;
}

export function blockReason(row) {
  return BLOCK_REASONS[String(row?.modCode || '').toUpperCase()] || FALLBACK_REASON;
}

/** 本 session 已解鎖的短評（以 _seq 記；沒有 _seq 就不記憶，重繪後要重輸入） */
function unlockedSet() {
  try {
    const raw = sessionStorage.getItem(UNLOCK_STORE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function rememberUnlocked(seq) {
  if (seq === '' || seq == null) return;
  try {
    const s = unlockedSet();
    s.add(String(seq));
    sessionStorage.setItem(UNLOCK_STORE_KEY, JSON.stringify([...s]));
  } catch {}
}
export function isUnlocked(row) {
  return row?._seq != null && unlockedSet().has(String(row._seq));
}

/**
 * 短評區塊 HTML。未屏蔽 → 原文；已屏蔽且未解鎖 → 模糊文字 + 一行說明 + 「展開」。
 * 數學題預設收著，點了展開才出現——平常看起來就只是一段被柔化的文字。
 * @param {Object} row
 * @param {Object} opts { compact:boolean } compact 用於卡片（行數更少）
 */
export function commentHtml(row, opts = {}) {
  const text = row?.comment || '';
  if (!text) return '';
  if (!isBlocked(row) || isUnlocked(row)) return escapeHtml(text);

  const compact = !!opts.compact;
  const q = mathChallenge(row._seq);
  return `
    <div class="comment-blocked${compact ? ' is-compact' : ''}" data-seq="${escapeHtml(row._seq ?? '')}"
         data-answer="${q.answer}">
      <div class="comment-blocked-text" aria-hidden="true">${escapeHtml(text)}</div>
      <div class="comment-blocked-foot">
        <span class="comment-blocked-reason">已隱藏 · ${blockReason(row)}</span>
        <button type="button" class="comment-unlock-toggle">展開</button>
      </div>
      <div class="comment-unlock" hidden>
        <span class="comment-unlock-q">${q.text} =</span>
        <input class="comment-unlock-input" type="text" inputmode="numeric" maxlength="4"
               aria-label="計算 ${q.text} 並輸入答案以展開短評" />
        <button type="button" class="comment-unlock-btn">確認</button>
        <span class="comment-unlock-err" hidden>答案不對</span>
      </div>
    </div>`;
}

/** 短評在表格窄欄位裡的顯示（屏蔽時只給一行提示，不放解鎖） */
export function commentCellHtml(row) {
  const text = row?.comment || '';
  if (!text) return '';
  if (!isBlocked(row) || isUnlocked(row)) {
    return `<span class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
  }
  return `<span class="comment-cell-blocked" title="點開這筆可展開">已隱藏 · ${blockReason(row)}</span>`;
}

/** 全域解鎖事件（委派，重複呼叫安全）。答對數學題就把區塊換成原文。 */
export function initCommentUnlock() {
  if (initCommentUnlock._bound) return;
  initCommentUnlock._bound = true;

  const reveal = (box) => {
    rememberUnlocked(box.dataset.seq);
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
