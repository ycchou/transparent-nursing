// 薪資百分位數 KPI 條 + 可拖曳浮動氣泡式薪資試算工具
// 給 platform.html 使用：依目前篩選後的資料即時計算
import { icon } from './icons.js?v=0fdcc10059';
import { notePwaIntent } from './pwa-prompt.js?v=0fdcc10059';

/** 線性插值法百分位數（標準 type-7） */
export function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/** 計算 x 在 values 中的百分位排名（0~100）。採「等於+一半」規則。 */
export function percentileRank(values, x) {
  if (!values.length) return null;
  let below = 0, equal = 0;
  for (const v of values) {
    if (v < x) below += 1;
    else if (v === x) equal += 1;
  }
  return Math.round(((below + equal / 2) / values.length) * 100);
}

function pickNumeric(rows, key) {
  return rows
    .map((r) => r[key])
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

/** 一次計算所有 KPI 數字 */
export function computeKpis(rows) {
  const sal = pickNumeric(rows, 'annualSalary').sort((a, b) => a - b);
  const mon = pickNumeric(rows, 'monthlyBase').sort((a, b) => a - b);
  const rec = pickNumeric(rows, 'recommendIndex');
  const avg = rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : null;
  return {
    n: rows.length,
    salary: {
      count: sal.length,
      p25: percentile(sal, 25),
      p50: percentile(sal, 50),
      p75: percentile(sal, 75),
    },
    monthly: {
      count: mon.length,
      p50: percentile(mon, 50),
    },
    recommendAvg: avg,
  };
}

const fmt0 = (v) => (v == null ? '—' : Math.round(v).toString());
const fmt1 = (v) => (v == null ? '—' : v.toFixed(1));

/** 渲染 KPI 條（橫條 6 格） */
export function renderKpiStrip(container, rows) {
  const k = computeKpis(rows);
  const salN = k.salary.count;
  const tooLow = salN < 3;

  container.innerHTML = `
    <div class="kpi-strip ${tooLow ? 'kpi-strip-thin' : ''}">
      <div class="kpi-strip-item">
        <div class="kpi-strip-num">${k.n}</div>
        <div class="kpi-strip-label">筆資料</div>
      </div>
      <div class="kpi-strip-item">
        <div class="kpi-strip-num">${fmt1(k.salary.p25)}<span class="kpi-strip-unit">萬</span></div>
        <div class="kpi-strip-label">年薪 P25</div>
      </div>
      <div class="kpi-strip-item kpi-strip-item-hi">
        <div class="kpi-strip-num">${fmt0(k.salary.p50)}<span class="kpi-strip-unit">萬</span></div>
        <div class="kpi-strip-label">年薪 中位數</div>
      </div>
      <div class="kpi-strip-item">
        <div class="kpi-strip-num">${fmt1(k.salary.p75)}<span class="kpi-strip-unit">萬</span></div>
        <div class="kpi-strip-label">年薪 P75</div>
      </div>
      <div class="kpi-strip-item">
        <div class="kpi-strip-num">${fmt0(k.monthly.p50)}<span class="kpi-strip-unit">千</span></div>
        <div class="kpi-strip-label">月薪+津貼 中位數</div>
      </div>
      <div class="kpi-strip-item">
        <div class="kpi-strip-num">${fmt1(k.recommendAvg)}<span class="kpi-strip-unit">/5</span></div>
        <div class="kpi-strip-label">推薦指數 平均</div>
      </div>
    </div>
  `;
}

/**
 * 掛載薪資試算工具 — 只建 modal，回傳 { open, close } API 給外部觸發
 * @param {() => Object[]} getRows  取得目前篩選後 rows 的 callback
 * @param {() => Object[]} getConditions  取得目前篩選條件描述的 callback
 * @returns {{ open: () => void, close: () => void }}
 */
export function mountSalaryCalculator(getRows, getConditions) {
  if (document.getElementById('calc-modal')) {
    // 已經 mount 過：回傳對既有 modal 的 open/close 操作
    return {
      open() {
        const m = document.getElementById('calc-modal');
        if (m) {
          m.hidden = false;
          requestAnimationFrame(() => m.classList.add('open'));
          document.body.classList.add('calc-modal-open');
        }
      },
      close() {
        const m = document.getElementById('calc-modal');
        if (m) {
          m.classList.remove('open');
          document.body.classList.remove('calc-modal-open');
          setTimeout(() => { m.hidden = true; }, 180);
        }
      },
    };
  }

  const host = document.createElement('div');
  host.innerHTML = `
    <div class="calc-modal" id="calc-modal" hidden role="dialog" aria-modal="true" aria-labelledby="calc-modal-title">
      <div class="calc-modal-backdrop" data-close="1"></div>
      <div class="calc-modal-panel">
        <div class="calc-modal-header">
          <h3 id="calc-modal-title"><span class="calc-modal-title-icon">${icon('calculator', { size: 20 })}</span> 薪資百分位試算</h3>
          <button class="calc-modal-close" type="button" aria-label="關閉" data-close="1">×</button>
        </div>
        <div class="calc-modal-body">
          <div class="calc-form">
            <label class="calc-field">
              <span class="calc-field-label">輸入你的年薪</span>
              <div class="calc-input-wrap">
                <input id="calc-salary" type="number" min="1" step="1" inputmode="numeric" placeholder="例：80" />
                <span class="calc-suffix">萬</span>
              </div>
            </label>
            <button class="btn btn-primary calc-go" id="calc-go" type="button">試算</button>
          </div>
          <div class="calc-result" id="calc-result"></div>
          <div class="calc-hint">
            ※ 比對基礎是目前篩選後的資料。想更精準，可先用「篩選條件」設定機構類別、地點等，再來試算。
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  // ===== Modal 開關 =====
  const modal = document.getElementById('calc-modal');
  const input = document.getElementById('calc-salary');
  const goBtn = document.getElementById('calc-go');
  const resultEl = document.getElementById('calc-result');

  // 數值 clamp helper — 給結果卡的分布條 tick 定位用。
  // NOTE: 舊版把這個 helper 混在浮動氣泡的拖曳邏輯裡；改 inline 觸發卡時砍氣泡邏輯連帶砍掉，
  // 導致 run() 內 markerLeft / p25Left 等呼叫變成 ReferenceError → 試算按鈕整個掛掉。
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function openModal() {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.classList.add('calc-modal-open');
    setTimeout(() => {
      input.focus();
      // 鍵盤跳出後把輸入框捲到中央，避免被虛擬鍵盤覆蓋
      setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    }, 80);
    document.addEventListener('keydown', onKey);
  }
  function closeModal() {
    modal.classList.remove('open');
    document.body.classList.remove('calc-modal-open');
    setTimeout(() => { modal.hidden = true; }, 180);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeModal(); }

  modal.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.close === '1') closeModal();
  });

  // ===== 試算邏輯 =====
  // 快取上次試算結果，供 privacy toggle 切換不重算
  let lastResult = null;

  // hex (#RRGGBB) → rgba(r,g,b,a) — 給 verdict / edge note 動態著色
  // 用 rgba() 而非 color-mix()，避免 Chrome computed style 回傳 color(srgb ...) 讓 html2canvas 抓不到
  function hexToRgba(hex, alpha) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(46,134,171,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function run() {
    const val = Number(input.value);
    if (!Number.isFinite(val) || val <= 0) {
      resultEl.innerHTML = `<div class="calc-empty">請輸入有效的年薪（單位：萬元）</div>`;
      lastResult = null;
      return;
    }
    const rows = getRows();
    const salaries = pickNumeric(rows, 'annualSalary');
    if (salaries.length < 3) {
      resultEl.innerHTML = `
        <div class="calc-empty">
          目前篩選後可比對的有效樣本只有 <strong>${salaries.length}</strong> 筆，建議放寬篩選後再試算（至少需 3 筆）。
        </div>`;
      return;
    }
    const sorted = [...salaries].sort((a, b) => a - b);
    const rank = percentileRank(salaries, val);
    const p25 = Math.round(percentile(sorted, 25));
    const p50 = Math.round(percentile(sorted, 50));
    const p75 = Math.round(percentile(sorted, 75));
    const minV = Math.round(sorted[0]);
    const maxV = Math.round(sorted[sorted.length - 1]);
    const diff = +(val - p50).toFixed(1);
    const diffPct = p50 > 0 ? (diff / p50) * 100 : 0;

    const belowMin = val < minV;
    const aboveMax = val > maxV;

    const verdict = belowMin
      ? '低於樣本'
      : aboveMax
      ? '高於樣本'
      : rank >= 75 ? '頂尖區' : rank >= 50 ? '中段偏上' : rank >= 25 ? '中段偏下' : '低段';
    const colorHex = belowMin
      ? '#E63946'
      : aboveMax
      ? '#06A77D'
      : rank >= 75 ? '#06A77D' : rank >= 50 ? '#2E86AB' : rank >= 25 ? '#F4A261' : '#E63946';

    const span = Math.max(1, maxV - minV);
    const markerLeft = clamp(((val - minV) / span) * 100, 0, 100);
    const p25Left = clamp(((p25 - minV) / span) * 100, 0, 100);
    const p50Left = clamp(((p50 - minV) / span) * 100, 0, 100);
    const p75Left = clamp(((p75 - minV) / span) * 100, 0, 100);

    const headline = belowMin
      ? `年薪 <strong>${val}</strong> 萬 · <strong>低於</strong>目前樣本最低（${minV} 萬）`
      : aboveMax
      ? `年薪 <strong>${val}</strong> 萬 · <strong>高於</strong>目前樣本最高（${maxV} 萬）`
      : `年薪 <strong>${val}</strong> 萬 · 高於 <strong>${rank}%</strong> 同條件護理人員`;

    const edgeNote = belowMin
      ? `<div class="calc-edge-note">
           ⚠️ 你輸入的數字低於目前篩選後的所有 ${salaries.length} 筆樣本（最低 ${minV} 萬）。可能原因：你的薪資真的偏低，建議查證合規；或目前樣本量還不夠涵蓋低薪段。
         </div>`
      : aboveMax
      ? `<div class="calc-edge-note">
           ✨ 你輸入的數字高於目前篩選後的所有 ${salaries.length} 筆樣本（最高 ${maxV} 萬）。可能屬於高階／罕見職位，或樣本量還未涵蓋該段。
         </div>`
      : '';

    // 比較條件描述：當前的篩選範圍
    const conditions = typeof getConditions === 'function' ? (getConditions() || []) : [];
    const conditionsHtml = conditions.length === 0
      ? `<div class="calc-conditions">
           <span class="calc-conditions-label">比較範圍</span>
           <span class="calc-conditions-all">全部 ${salaries.length} 筆 · 未套用篩選</span>
         </div>`
      : `<div class="calc-conditions">
           <span class="calc-conditions-label">比較條件</span>
           ${conditions.map((c) => `<span class="calc-conditions-tag"><span class="calc-conditions-key">${c.label}</span>${c.value}</span>`).join('')}
         </div>`;

    // 偵測 tick 標籤水平距離太近 → 把比較靠近的標籤錯位到下排，避免重疊
    const TICK_GAP_PCT = 14; // 寬度約等於「P50 88」字串
    const p25_close = (p50Left - p25Left) < TICK_GAP_PCT;
    const p75_close = (p75Left - p50Left) < TICK_GAP_PCT;
    const anyStagger = p25_close || p75_close;

    // 全部運算結果快取到 closure，方便切換 privacy 時不重算
    lastResult = {
      val, rank, p25, p50, p75, minV, maxV, sampleN: salaries.length,
      diff, diffPct, belowMin, aboveMax, verdict, colorHex,
      markerLeft, p25Left, p50Left, p75Left,
      conditionsHtml, p25_close, p75_close, anyStagger,
      conditionsRaw: conditions,  // 給社群分享圖用：原始 [{label, value}] 陣列
    };
    renderResultCard(false);
  }

  // 依資料 + 隱私模式組裝結果 HTML（不重算數字）
  function buildResultHtml(d, hideNumbers) {
    const {
      val, rank, p25, p50, p75, minV, maxV, sampleN,
      diff, diffPct, belowMin, aboveMax, verdict, colorHex,
      markerLeft, p25Left, p50Left, p75Left,
      conditionsHtml, p25_close, p75_close, anyStagger,
    } = d;

    // headline：隱私模式拿掉具體 X 萬，只保留 % 排名與「低於/高於樣本」描述
    const headline = belowMin
      ? hideNumbers
        ? `<strong>低於</strong>樣本最低值`
        : `年薪 <strong>${val}</strong> 萬 · <strong>低於</strong>目前樣本最低（${minV} 萬）`
      : aboveMax
      ? hideNumbers
        ? `<strong>高於</strong>樣本最高值`
        : `年薪 <strong>${val}</strong> 萬 · <strong>高於</strong>目前樣本最高（${maxV} 萬）`
      : hideNumbers
        ? `高於 <strong>${rank}%</strong> 同條件護理人員`
        : `年薪 <strong>${val}</strong> 萬 · 高於 <strong>${rank}%</strong> 同條件護理人員`;

    // edge note：隱私模式簡化
    const edgeNote = belowMin
      ? hideNumbers
        ? `<div class="calc-edge-note">⚠️ 輸入值低於目前樣本範圍</div>`
        : `<div class="calc-edge-note">⚠️ 你輸入的數字低於目前篩選後的所有 ${sampleN} 筆樣本（最低 ${minV} 萬）。可能原因：你的薪資真的偏低，建議查證合規；或目前樣本量還不夠涵蓋低薪段。</div>`
      : aboveMax
      ? hideNumbers
        ? `<div class="calc-edge-note">✨ 輸入值高於目前樣本範圍</div>`
        : `<div class="calc-edge-note">✨ 你輸入的數字高於目前篩選後的所有 ${sampleN} 筆樣本（最高 ${maxV} 萬）。可能屬於高階／罕見職位，或樣本量還未涵蓋該段。</div>`
      : '';

    // diffLine：隱私模式只留 %
    const diffLine =
      diff === 0
        ? `與中位數相同`
        : hideNumbers
          ? (diff > 0
              ? `比中位數高 <strong style="color:${colorHex}">+${diffPct.toFixed(1)}%</strong>`
              : `比中位數低 <strong style="color:${colorHex}">${diffPct.toFixed(1)}%</strong>`)
          : (diff > 0
              ? `比中位數高 <strong style="color:${colorHex}">+${diff}</strong> 萬 (+${diffPct.toFixed(1)}%)`
              : `比中位數低 <strong style="color:${colorHex}">${diff}</strong> 萬 (${diffPct.toFixed(1)}%)`);

    // summary：隱私模式拿掉 N、中位數絕對值
    const summaryHtml = hideNumbers
      ? `${diffLine}`
      : `樣本 <strong>N=${sampleN}</strong>　·　中位數 <strong>${p50}</strong> 萬　·　${diffLine}`;

    // tick labels：隱私模式拿掉數值；錯位 class 防重疊
    const tickLabel = (prefix, num) => hideNumbers ? prefix : `${prefix} ${num}`;
    const axisHtml = hideNumbers
      ? `<span>&nbsp;</span><span>&nbsp;</span>`
      : `<span>${minV} 萬</span><span>${maxV} 萬</span>`;

    const verdictBg = hexToRgba(colorHex, 0.12);
    const edgeBg = hexToRgba(colorHex, 0.08);

    return `
      <div class="calc-result-card${hideNumbers ? ' is-private' : ''}" style="--calc-accent:${colorHex};--calc-verdict-bg:${verdictBg};--calc-edge-bg:${edgeBg};">
        ${conditionsHtml}
        <div class="calc-rank-row">
          <div class="calc-rank-num">${rank}<span class="calc-rank-pct">%</span></div>
          <div class="calc-rank-text">
            ${headline}
            <span class="calc-verdict">${verdict}</span>
          </div>
        </div>
        <div class="calc-bar-wrap${anyStagger ? ' has-stagger' : ''}">
          <div class="calc-bar" role="img" aria-label="薪資分布條，標記百分位與你的位置">
            <div class="calc-bar-tick" style="left:${p25Left}%"><span class="${p25_close ? 'tick-stagger' : ''}">${tickLabel('P25', p25)}</span></div>
            <div class="calc-bar-tick calc-bar-tick-mid" style="left:${p50Left}%"><span>${tickLabel('P50', p50)}</span></div>
            <div class="calc-bar-tick" style="left:${p75Left}%"><span class="${p75_close ? 'tick-stagger' : ''}">${tickLabel('P75', p75)}</span></div>
            <div class="calc-bar-marker" style="left:${markerLeft}%" title="${hideNumbers ? '你的位置' : `你的位置：${val} 萬`}"></div>
          </div>
          <div class="calc-bar-axis">
            ${axisHtml}
          </div>
        </div>
        <div class="calc-summary">${summaryHtml}</div>
        ${edgeNote}
        <div class="calc-share-bar">
          <label class="calc-privacy-toggle">
            <input type="checkbox" id="calc-privacy" ${hideNumbers ? 'checked' : ''} />
            <span class="calc-privacy-icon">🔒</span>
            <span>隱藏具體數字</span>
          </label>
          <button type="button" class="btn btn-primary calc-share-btn">
            <span class="calc-share-icon">📷</span>
            <span class="calc-share-label">產生分享圖</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderResultCard(hideNumbers) {
    if (!lastResult) return;
    resultEl.innerHTML = buildResultHtml(lastResult, hideNumbers);
    const toggle = resultEl.querySelector('#calc-privacy');
    if (toggle) toggle.addEventListener('change', () => renderResultCard(toggle.checked));
    const shareBtn = resultEl.querySelector('.calc-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', () => onShareClick(shareBtn));
  }

  // === 分享圖生成 ===
  let _h2cLoading = null;
  function loadH2C() {
    if (typeof window !== 'undefined' && window.html2canvas) return Promise.resolve(window.html2canvas);
    if (_h2cLoading) return _h2cLoading;
    _h2cLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.async = true;
      s.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas not available'));
      s.onerror = () => reject(new Error('html2canvas CDN 載入失敗'));
      document.head.appendChild(s);
    });
    return _h2cLoading;
  }

  // 心型 + ECG 線 logo（與站內 header 一致）
  const HEART_PULSE_SVG = `<svg width="42" height="42" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>
    <path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;

  // 1080 × 1350 IG 直式分享卡：全 inline style，方便 html2canvas 正確擷取
  function buildCalcShareCardHTML(d, hideNumbers) {
    const {
      val, rank, p25, p50, p75, minV, maxV, sampleN,
      diff, diffPct, belowMin, aboveMax, verdict, colorHex,
      markerLeft, p25Left, p50Left, p75Left,
      conditionsRaw, p25_close, p75_close, anyStagger,
    } = d;

    const verdictBg = hexToRgba(colorHex, 0.16);
    const isEdge = belowMin || aboveMax;

    const heroBig = isEdge
      ? (belowMin ? '低於樣本' : '高於樣本')
      : `${rank}<span style="font-size:80px;vertical-align:top;margin-left:6px;font-weight:700;">%</span>`;

    const heroLabel = isEdge ? '試算結果' : '我在護理薪資的';

    const subHeadline = belowMin
      ? hideNumbers
        ? '輸入值低於目前樣本範圍'
        : `年薪 ${val} 萬 · 低於目前樣本最低（${minV} 萬）`
      : aboveMax
      ? hideNumbers
        ? '輸入值高於目前樣本範圍'
        : `年薪 ${val} 萬 · 高於目前樣本最高（${maxV} 萬）`
      : hideNumbers
        ? `高於 ${rank}% 同條件護理人員`
        : `年薪 ${val} 萬 · 高於 ${rank}% 同條件護理人員`;

    const diffSummary = isEdge
      ? ''
      : hideNumbers
        ? (diff === 0
            ? '與中位數相同'
            : diff > 0
              ? `比中位數高 +${diffPct.toFixed(1)}%`
              : `比中位數低 ${diffPct.toFixed(1)}%`)
        : (diff === 0
            ? '與中位數相同'
            : diff > 0
              ? `比中位數高 +${diff} 萬 (+${diffPct.toFixed(1)}%)`
              : `比中位數低 ${diff} 萬 (${diffPct.toFixed(1)}%)`);

    const conds = Array.isArray(conditionsRaw) ? conditionsRaw : [];
    const condChipsHtml = conds.length === 0
      ? `<span style="display:inline-block;padding:10px 24px;background:rgba(46,134,171,0.10);border:1px solid rgba(46,134,171,0.28);border-radius:999px;font-size:22px;color:#1D3557;white-space:nowrap;">全部 ${sampleN} 筆 · 未套用篩選</span>`
      : conds.map((c) => `
          <span style="display:inline-block;padding:10px 22px;background:rgba(46,134,171,0.10);border:1px solid rgba(46,134,171,0.28);border-radius:999px;font-size:21px;color:#1D3557;margin:0 10px 10px 0;line-height:1.4;white-space:nowrap;">
            <span style="font-weight:700;color:#2E86AB;">${c.label}</span><span style="margin:0 8px;color:#9AA5B8;">·</span>${c.value}
          </span>
        `).join('');

    const tickLabel = (prefix, num) => hideNumbers ? prefix : `${prefix} ${num}`;
    const labelTop = (close) => close ? '88px' : '58px';
    const barWrapHeight = anyStagger ? 150 : 120;

    const barHtml = isEdge ? `
      <div style="padding:32px 28px;background:${verdictBg};border-radius:14px;text-align:center;">
        <div style="font-size:22px;color:${colorHex};font-weight:600;line-height:1.55;">
          ${belowMin ? '⚠️ 輸入值低於目前樣本，可能薪資偏低或樣本量不足' : '✨ 輸入值高於目前樣本，可能為高階／罕見職位'}
        </div>
      </div>
    ` : `
      <div style="position:relative;height:${barWrapHeight}px;margin:0 16px;">
        <!-- Bar 底色 -->
        <div style="position:absolute;top:26px;left:0;right:0;height:18px;background:linear-gradient(90deg,#fef2f2 0%,#fffaf0 35%,#ecfdf5 100%);border-radius:999px;border:1px solid rgba(15,23,42,0.08);"></div>
        <!-- Ticks -->
        <div style="position:absolute;top:22px;left:${p25Left}%;width:3px;height:26px;background:rgba(15,23,42,0.4);transform:translateX(-50%);"></div>
        <div style="position:absolute;top:16px;left:${p50Left}%;width:3px;height:38px;background:rgba(15,23,42,0.7);transform:translateX(-50%);"></div>
        <div style="position:absolute;top:22px;left:${p75Left}%;width:3px;height:26px;background:rgba(15,23,42,0.4);transform:translateX(-50%);"></div>
        <!-- Marker（你的位置） -->
        <div style="position:absolute;top:10px;left:${markerLeft}%;width:26px;height:50px;background:${colorHex};border-radius:7px;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.20);transform:translateX(-50%);"></div>
        <!-- 標籤（P25/P50/P75） -->
        <div style="position:absolute;top:${labelTop(p25_close)};left:${p25Left}%;transform:translateX(-50%);font-size:19px;color:#6B7C93;white-space:nowrap;">${tickLabel('P25', p25)}</div>
        <div style="position:absolute;top:58px;left:${p50Left}%;transform:translateX(-50%);font-size:19px;color:#1D3557;font-weight:700;white-space:nowrap;">${tickLabel('P50', p50)}</div>
        <div style="position:absolute;top:${labelTop(p75_close)};left:${p75Left}%;transform:translateX(-50%);font-size:19px;color:#6B7C93;white-space:nowrap;">${tickLabel('P75', p75)}</div>
        ${hideNumbers ? '' : `
          <div style="position:absolute;top:${barWrapHeight - 22}px;left:0;font-size:17px;color:#9AA5B8;">${minV} 萬</div>
          <div style="position:absolute;top:${barWrapHeight - 22}px;right:0;font-size:17px;color:#9AA5B8;">${maxV} 萬</div>
        `}
      </div>
    `;

    return `
      <div id="calc-share-root" style="
        width:1080px;height:1350px;
        background:linear-gradient(180deg,#F8FBFA 0%,#FFFFFF 55%);
        padding:64px 72px;
        box-sizing:border-box;
        font-family:'Noto Sans TC','PingFang TC','Microsoft YaHei',sans-serif;
        color:#1D3557;
        position:relative;
        overflow:hidden;
        display:flex;
        flex-direction:column;
      ">
        <!-- 頂部品牌色條 -->
        <div style="position:absolute;top:0;left:0;right:0;height:10px;background:linear-gradient(90deg,#2E86AB 0%,#A8DADC 50%,#06A77D 100%);"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:18px;">
          <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#2E86AB,#A8DADC);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${HEART_PULSE_SVG}
          </div>
          <div>
            <div style="font-size:18px;color:#6B7C93;letter-spacing:0.06em;line-height:1.2;">護理職場透明化運動</div>
            <div style="font-size:34px;font-weight:700;font-family:Lora,'Noto Serif TC',serif;color:#1D3557;margin-top:2px;letter-spacing:0.01em;">薪資百分位試算</div>
          </div>
        </div>

        <!-- 主要內容區塊（hero + bar + conditions）垂直置中於 header 下方的剩餘空間 -->
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:36px;">
          <!-- Hero -->
          <div style="text-align:center;">
            <div style="font-size:32px;color:#6B7C93;margin-bottom:10px;letter-spacing:0.06em;">${heroLabel}</div>
            <div style="font-size:${isEdge ? '108px' : '200px'};font-weight:800;line-height:1;color:${colorHex};font-family:Lora,'Noto Serif TC',serif;letter-spacing:-0.04em;${isEdge ? 'padding:20px 0;' : ''}">
              ${heroBig}
            </div>
            <div style="display:inline-block;margin-top:${isEdge ? '12px' : '20px'};padding:12px 32px;background:${verdictBg};color:${colorHex};border-radius:999px;font-size:28px;font-weight:700;letter-spacing:0.04em;">
              ${verdict}
            </div>
            <div style="font-size:32px;margin-top:24px;color:#46557A;line-height:1.55;font-weight:500;">${subHeadline}</div>
            ${diffSummary ? `<div style="font-size:26px;margin-top:8px;color:#6B7C93;">${diffSummary}</div>` : ''}
          </div>

          <!-- Bar / Edge note -->
          ${barHtml}

          <!-- Conditions -->
          <div style="padding-top:24px;border-top:1px dashed #E5E9F0;">
            <div style="font-size:18px;color:#6B7C93;margin-bottom:14px;letter-spacing:0.08em;font-weight:600;">📍 比較條件</div>
            <div style="display:flex;flex-wrap:wrap;align-items:flex-start;line-height:1.4;">
              ${condChipsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function onShareClick(shareBtn) {
    if (shareBtn.disabled) return;
    const origHTML = shareBtn.innerHTML;
    shareBtn.disabled = true;
    shareBtn.innerHTML = `<span class="dform-spinner"></span><span>生成中…</span>`;

    // 從 toggle 偵測當前隱私模式
    const privacyToggle = resultEl.querySelector('#calc-privacy');
    const hideNumbers = !!(privacyToggle && privacyToggle.checked);

    let wrapper = null;
    try {
      const h2c = await loadH2C();
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch {}
      }
      if (!lastResult) throw new Error('找不到試算結果');

      // 把分享卡 inject 到 offscreen
      wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;top:0;left:-99999px;z-index:-1;pointer-events:none;';
      wrapper.innerHTML = buildCalcShareCardHTML(lastResult, hideNumbers);
      document.body.appendChild(wrapper);
      const node = wrapper.querySelector('#calc-share-root');
      if (!node) throw new Error('分享卡 build 失敗');

      const canvas = await h2c(node, {
        scale: 2,
        backgroundColor: '#FFFFFF',
        useCORS: true,
        logging: false,
        width: 1080,
        height: 1350,
        windowWidth: 1080,
        windowHeight: 1350,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
      const dataUrl = canvas.toDataURL('image/png');
      const { showSharePreview } = await import('./share-card.js?v=0fdcc10059');
      showSharePreview(blob, dataUrl, `salary-percentile-${Date.now()}.png`);
      // 高意圖時刻：做完薪資試算並產生分享圖 → 當頁嘗試顯示安裝提示
      notePwaIntent('salary_calc', { showNow: true });
    } catch (err) {
      console.error(err);
      alert('生成失敗：' + err.message);
    } finally {
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      shareBtn.disabled = false;
      shareBtn.innerHTML = origHTML;
    }
  }

  goBtn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  return { open: openModal, close: closeModal };
}
