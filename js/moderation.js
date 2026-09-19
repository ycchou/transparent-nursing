// 短評屏蔽顯示 — AI 審稿判定 block 的短評在前端打馬賽克，輸入當天日期才展開。
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

/** 台北時區今天，YYYYMMDD */
export function todayKeyTaipei() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
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
 * 短評區塊 HTML。未屏蔽 → 原文；已屏蔽且未解鎖 → 馬賽克 + 理由 + 解鎖框。
 * @param {Object} row
 * @param {Object} opts { compact:boolean } compact 用於卡片（字小一點、不佔太高）
 */
export function commentHtml(row, opts = {}) {
  const text = row?.comment || '';
  if (!text) return '';
  if (!isBlocked(row) || isUnlocked(row)) return escapeHtml(text);

  const compact = !!opts.compact;
  return `
    <div class="comment-blocked${compact ? ' is-compact' : ''}" data-seq="${escapeHtml(row._seq ?? '')}">
      <div class="comment-blocked-reason">
        <span class="comment-blocked-lock" aria-hidden="true">🔒</span>
        <span>此短評已屏蔽：${blockReason(row)}</span>
      </div>
      <div class="comment-blocked-text" aria-hidden="true">${escapeHtml(text)}</div>
      <div class="comment-unlock">
        <label class="comment-unlock-label">輸入今天日期（西元 YYYYMMDD）即可展開</label>
        <div class="comment-unlock-row">
          <input class="comment-unlock-input" type="text" inputmode="numeric" maxlength="10"
                 placeholder="${todayKeyTaipei()}" aria-label="輸入今天日期以展開短評" />
          <button type="button" class="comment-unlock-btn btn btn-secondary">展開</button>
        </div>
        <div class="comment-unlock-err" hidden>日期不對，請輸入今天的西元年月日</div>
      </div>
    </div>`;
}

/** 短評在表格窄欄位裡的顯示（屏蔽時只給一行提示，不放解鎖框） */
export function commentCellHtml(row) {
  const text = row?.comment || '';
  if (!text) return '';
  if (!isBlocked(row) || isUnlocked(row)) {
    return `<span class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
  }
  return `<span class="comment-cell-blocked" title="點開這筆可展開">🔒 已屏蔽 · ${blockReason(row)}</span>`;
}

/** 全域解鎖事件（委派，重複呼叫安全）。日期對了就把該區塊換成原文。 */
export function initCommentUnlock() {
  if (initCommentUnlock._bound) return;
  initCommentUnlock._bound = true;

  const reveal = (box) => {
    const seq = box.dataset.seq;
    rememberUnlocked(seq);
    const text = box.querySelector('.comment-blocked-text')?.innerHTML || '';
    box.outerHTML = `<span class="comment-unlocked">${text}</span>`;
  };

  const tryUnlock = (box) => {
    const input = box.querySelector('.comment-unlock-input');
    const err = box.querySelector('.comment-unlock-err');
    const digits = (input?.value || '').replace(/\D/g, '');
    if (digits === todayKeyTaipei()) { reveal(box); return; }
    if (err) err.hidden = false;
    input?.classList.add('is-error');
  };

  // 用「捕獲階段」攔截：卡片／表格列自己綁的 click 是冒泡階段，若在 document 冒泡層才
  // stopPropagation 已經來不及（卡片先收到事件 → 會誤開詳情彈窗）。
  document.addEventListener('click', (e) => {
    const box = e.target.closest?.('.comment-blocked');
    if (!box) return;
    e.stopPropagation();
    if (e.target.closest('.comment-unlock-btn')) tryUnlock(box);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest?.('.comment-unlock-input');
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    tryUnlock(input.closest('.comment-blocked'));
  }, true);

  document.addEventListener('input', (e) => {
    const input = e.target.closest?.('.comment-unlock-input');
    if (!input) return;
    input.classList.remove('is-error');
    const err = input.closest('.comment-blocked')?.querySelector('.comment-unlock-err');
    if (err) err.hidden = true;
  });
}
