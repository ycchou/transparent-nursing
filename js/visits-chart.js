// visits-chart.js — 近 30 天每日訪客折線圖彈窗（低調、點「累積人次」才開）。
// 純內嵌 SVG，無外部依賴；重用站上既有 .modal-backdrop / .modal 樣式。

import { getVisitHistory } from './visits.js?v=7a6fd7f3ca';

// 依日期補齊近 n 天（缺的日補 0），回傳 [{ day:'MM/DD', full:'YYYY-MM-DD', count }]
function fillDays(history, n) {
  const map = new Map((history || []).map((r) => [r.day, r.count || 0]));
  const out = [];
  const base = new Date(Date.now() + 8 * 3600 * 1000); // Asia/Taipei
  base.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const full = d.toISOString().slice(0, 10);
    out.push({ full, day: full.slice(5).replace('-', '/'), count: map.get(full) || 0 });
  }
  return out;
}

function lineChartSVG(rows) {
  const W = 620, H = 260, padL = 40, padR = 16, padT = 16, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const nice = max <= 5 ? 5 : Math.ceil(max / 5) * 5; // 讓 y 軸頂端好看
  const x = (i) => padL + (rows.length <= 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  const y = (v) => padT + ih - (ih * v) / nice;

  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.count).toFixed(1)}`).join(' ');
  const area = `${padL},${padT + ih} ${pts} ${x(rows.length - 1)},${padT + ih}`;

  // y 軸格線（0, 半, 滿）
  const yTicks = [0, nice / 2, nice].map((v) => {
    const yy = y(v).toFixed(1);
    return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="vc-grid"/>
            <text x="${padL - 6}" y="${(+yy + 4).toFixed(1)}" class="vc-ylabel" text-anchor="end">${v}</text>`;
  }).join('');

  // x 軸標籤：頭、中、尾，避免壅擠
  const idxs = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  const xTicks = idxs.map((i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 12}" class="vc-xlabel" text-anchor="middle">${rows[i].day}</text>`
  ).join('');

  // 資料點（僅末點加大，其餘小點）
  const dots = rows.map((r, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(r.count).toFixed(1)}" r="${i === rows.length - 1 ? 3.5 : 2}" class="vc-dot"><title>${r.full}：${r.count} 人</title></circle>`
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="vc-svg" role="img" aria-label="近 30 天每日訪客折線圖">
    ${yTicks}
    <polygon points="${area}" class="vc-area"/>
    <polyline points="${pts}" class="vc-line"/>
    ${dots}${xTicks}
  </svg>`;
}

let modal;
function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'visits-chart-modal';
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
  return modal;
}
function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
async function openModal() {
  const m = ensureModal();
  m.innerHTML = `
    <div class="modal vc-modal" role="dialog" aria-modal="true" aria-label="近 30 天訪客趨勢">
      <button type="button" class="modal-close vc-close" aria-label="關閉">✕</button>
      <h3 style="margin:0 0 2px;">近 30 天訪客趨勢</h3>
      <p style="color:var(--muted);font-size:0.85rem;margin:0 0 14px;">每日不重複訪客（依裝置去重）</p>
      <div class="vc-body"><div class="vc-loading" style="color:var(--muted);text-align:center;padding:40px 0;">載入中…</div></div>
    </div>`;
  m.querySelector('.vc-close').addEventListener('click', closeModal);
  m.classList.add('open');
  document.body.style.overflow = 'hidden';

  const history = await getVisitHistory(30);
  const body = m.querySelector('.vc-body');
  if (!body) return;
  if (!history) {
    body.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px 0;">目前無法載入趨勢資料</div>';
    return;
  }
  body.innerHTML = lineChartSVG(fillDays(history, 30));
}

// 讓「累積人次」可點開趨勢圖。低調：不加明顯按鈕，只讓數字可點 + 極淡提示。
export function initVisitsChart() {
  const el = document.getElementById('stat-visits-total');
  if (!el) return;
  const cell = el.closest('.visits-cell') || el;
  cell.classList.add('visits-cell-clickable');
  cell.setAttribute('role', 'button');
  cell.setAttribute('tabindex', '0');
  cell.setAttribute('aria-label', '查看近 30 天訪客趨勢');
  cell.addEventListener('click', openModal);
  cell.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
  });
}
