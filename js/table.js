// 表格 / 卡片 渲染、排序、Modal
import { CATEGORIES, COMMON_FIELDS, getCategory, getAllFields } from './config.js?v=d5f792af4d';
import { fmt, recommendPill, categoryTag } from './components.js?v=d5f792af4d';
import { icon } from './icons.js?v=d5f792af4d';
import { generateShareCard, showSharePreview } from './share-card.js?v=d5f792af4d';
import { ensureTooltip } from './tooltip.js?v=d5f792af4d';
import { pageSlice, renderPagination } from './pagination.js?v=d5f792af4d';
import { getHospitalCode } from './hospital-shortname.js?v=d5f792af4d';

// 機構名稱若對得上評鑑醫院，包成連到機構總覽頁的連結（stopPropagation 避免觸發列 modal）
function withHospitalLink(name, innerHtml) {
  const code = getHospitalCode(name);
  if (!code) return innerHtml;
  return `<a href="hospital.html?code=${encodeURIComponent(code)}" onclick="event.stopPropagation()" title="查看機構總覽">${innerHtml}</a>`;
}

function gateCtaHtml(shownCount, fullCount, isFilteredView) {
  const reasonText = isFilteredView ? '（篩選結果）' : '';
  return `
    <div class="g2g-cta-block">
      <div class="g2g-cta-text">
        目前顯示前 <strong>${shownCount}</strong> 筆 · 共 <strong>${fullCount}</strong> 筆${reasonText}
      </div>
      <a href="participate.html" class="btn btn-primary g2g-cta-btn">
        📝 分享你的職場資訊，解鎖完整資料 →
      </a>
      <div class="g2g-cta-sub">完全匿名、3-5 分鐘填完。分享後即解鎖。</div>
    </div>
  `;
}

const DEFAULT_TABLE_COLUMNS = {
  // 欄位順序：地點 → 機構類別 → 機構名稱 → 單位名稱 → [類別專屬] → 工時 → 推薦
  all:        ['_category', 'location', 'institutionType', 'institutionName', 'unitName', 'weeklyHours', 'recommendIndex'],
  icu:        ['location', 'institutionType', 'institutionName', 'unitName', 'dayShiftRatio', 'weeklyHours', 'recommendIndex'],
  dialysis:   ['location', 'institutionType', 'institutionName', 'unitName', 'hdRatio', 'weeklyHours', 'recommendIndex'],
  er:         ['location', 'institutionType', 'institutionName', 'unitName', 'criticalRatio', 'weeklyHours', 'recommendIndex'],
  ward:       ['location', 'institutionType', 'institutionName', 'unitName', 'dayShiftRatio', 'weeklyHours', 'recommendIndex'],
  outpatient: ['location', 'institutionType', 'institutionName', 'unitName', 'clinicsPerNurse', 'weeklyHours', 'recommendIndex'],
  or:         ['location', 'institutionType', 'institutionName', 'unitName', 'orSpecialty', 'weeklyHours', 'recommendIndex'],
  special:    ['location', 'institutionType', 'institutionName', 'unitName', 'specialType', 'weeklyHours', 'recommendIndex'],
  other:      ['location', 'institutionType', 'institutionName', 'unitName', 'workplaceType', 'weeklyHours', 'recommendIndex'],
};

const KEY_LABELS = {
  _category: '類別',
  institutionType: '機構類別',
  institutionName: '機構名稱',
  unitName: '單位名稱',
  location: '地點',
  jobTitle: '職稱',
  weeklyHours: '每週工時',
  overtimePolicy: '加班費',
  recommendIndex: '推薦指數',
  comment: '短評',
  // ICU
  icuType: 'ICU 類型',
  dayShiftRatio: '白班人均',
  eveningShiftRatio: '小夜人均',
  nightShiftRatio: '大夜人均',
  ventilatorCare: '呼吸器照護',
  // Dialysis
  dialysisType: '透析類別',
  hdRatio: 'HD 床護比',
  pdCount: 'PD 人數比',
  batchShift: '批班制度',
  onCallType: '值班型態',
  onCallRotation: '值班輪值方式',
  restInterval11h: '值班 11 小時間隔',
  onCallPay: '值班費',
  workDuties: '業務內容',
  specialBenefits: '特殊福利',
  // ER
  erLevel: '急診級別',
  triageRatio: '檢傷人均',
  criticalRatio: '重症區人均',
  observationRatio: '留觀人均',
  violenceFreq: '暴力事件頻率',
  // Ward
  wardType: '病房類型',
  leaderSupport: 'Leader 協助',
  invasiveDuties: '侵入性處置',
  // OPD (門診)
  clinicType: '門診類型',
  clinicsPerNurse: '一次顧幾診',
  weeklyPatients: '就診人數週平均',
  shiftType: '班別',
  pShift: 'P 班（PRN）',
  lunchBreak: '休息一小時',
  clinicOvertimeWeekly: '門診逾時週平均',
  patientComplaints: '被申訴頻率',
  salaryGrowth: '薪資依年資增加',
  clinicReason: '選擇門診原因',
  // OR (手術房)
  orSpecialty: '主要科別',
  orRole: '工作角色',
  dailyCases: '每日案件數',
  roomCount: '手術室數',
  onCallSystem: 'On-call',
  // Special (特殊檢查/介入)
  specialType: '單位類型',
  onCallRequired: 'On-call 制度',
  radiationExposure: '輻射暴露',
  // Other (其他)
  workplaceType: '職場類型',
  practiceRegistration: '需執業登記',
  otherCerts: '其他證書資格',
  certRequired: '資格是否必備',
  scheduleSystem: '排班制度',
  shiftPattern: '輪班型態',
  fieldWork: '需外出值勤',
  violenceRisk: '暴力風險',
  dailyOvertime: '每日平均加班',
  // common extras
  timestamp: '填寫時間',
  yearsCurrent: '現職年資',
  yearsTotal: '累計年資',
  annualSalary: '近一年年薪 (萬)',
  monthlyBase: '月底薪+津貼 (千)',
  annualBonus: '全年獎金 (萬)',
  workAtmosphere: '工作氣氛 (1-5)',
  promotion: '升遷前景',
};

function renderCellValue(row, key) {
  const v = row[key];
  if (key === '_category') return categoryTag(v);
  if (key === 'recommendIndex') return recommendPill(v);
  if (key === 'timestamp') return fmt.date(v);
  if (key === 'comment') {
    return `<span class="truncate" title="${(v || '').replaceAll('"','&quot;')}">${fmt.empty(v)}</span>`;
  }
  // 機構名稱、單位名稱：太長時截斷顯示「...」，hover 顯示完整名稱
  if (key === 'institutionName' || key === 'unitName') {
    if (!v) return fmt.empty(v);
    const safe = String(v).replaceAll('"', '&quot;');
    const span = `<span class="cell-trunc" data-key="${key}" title="${safe}">${v}</span>`;
    return key === 'institutionName' ? withHospitalLink(v, span) : span;
  }
  return fmt.empty(v);
}

// card 視圖不截斷文字
function renderCellValueForCard(row, key) {
  const v = row[key];
  if (key === '_category') return categoryTag(v);
  if (key === 'recommendIndex') return recommendPill(v);
  if (key === 'timestamp') return fmt.date(v);
  return fmt.empty(v);
}

/**
 * 渲染表格
 * @param {HTMLElement} container
 * @param {Array} rows
 * @param {Object} opts { slug, onRowClick }
 */
export function renderTable(container, rows, opts = {}) {
  const slug = opts.slug || 'all';
  const cols = DEFAULT_TABLE_COLUMNS[slug] || DEFAULT_TABLE_COLUMNS.all;
  // 預設：依填寫時間 desc（最新在最上面）
  const state = container._tableState || (container._tableState = {
    sortKey: 'timestamp', sortDir: 'desc', page: 1, lastRowsRef: null,
  });

  // 偵測外部資料變動（換 tab / 套用篩選 / 自動刷新）→ 跳回第 1 頁
  if (state.lastRowsRef !== rows) {
    state.page = 1;
    state.lastRowsRef = rows;
  }

  // Soft Give-to-Get：未貢獻者連排序功能都鎖住，強制按填寫時間 desc。
  // 必須在 sort 之前重置，否則使用者切過排序欄位之後仍會殘留 state。
  const gate = opts.gate;
  const isGated = !!(gate && gate.gated);
  if (isGated) {
    state.sortKey = 'timestamp';
    state.sortDir = 'desc';
  }

  let sorted = rows.slice();
  if (state.sortKey) {
    const isTimeKey = state.sortKey === 'timestamp';
    sorted.sort((a, b) => {
      const av = a[state.sortKey], bv = b[state.sortKey];
      if (av === bv) return 0;
      if (av === '' || av == null) return 1;
      if (bv === '' || bv == null) return -1;
      if (isTimeKey) {
        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        const aOk = !isNaN(ad), bOk = !isNaN(bd);
        if (aOk && bOk) return state.sortDir === 'asc' ? ad - bd : bd - ad;
        if (aOk) return -1;
        if (bOk) return 1;
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return state.sortDir === 'asc' ? av - bv : bv - av;
      }
      return state.sortDir === 'asc'
        ? String(av).localeCompare(String(bv), 'zh-Hant')
        : String(bv).localeCompare(String(av), 'zh-Hant');
    });
  }

  // 限筆數：未貢獻者切到 gate.limit 筆
  const fullCount = sorted.length;
  const willGate = isGated && fullCount > gate.limit;
  if (willGate) {
    sorted = sorted.slice(0, gate.limit);
    state.page = 1;
  }

  // 切到當前頁（每頁 100 筆，由 pagination.js 預設）
  const pageInfo = pageSlice(sorted, state.page);
  const pageRows = pageInfo.items;

  // 未貢獻者：thead 不掛 data-sort、不顯示排序箭頭、cursor 改 default，視覺上鎖住
  const sortAttr = (k) => (isGated ? '' : ` data-sort="${k}"`);
  const sortCls  = (k) => (!isGated && state.sortKey === k ? 'sort-' + state.sortDir : '');
  const lockedCls = isGated ? ' g2g-sort-locked' : '';

  const tableHtml = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="seq-col ${sortCls('_seq')}${lockedCls}"${sortAttr('_seq')}>#</th>
            ${cols.map((k) => `
              <th class="${sortCls(k)}${lockedCls}"${sortAttr(k)}>
                ${KEY_LABELS[k] || k}
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${pageRows.length === 0
            ? `<tr><td colspan="${cols.length + 1}" style="padding:48px 24px;text-align:center;color:var(--muted);">沒有符合條件的資料</td></tr>`
            : pageRows.map((r, idx) => `
              <tr data-idx="${idx}">
                <td class="seq-col">#${r._seq != null ? r._seq : (idx + 1)}</td>
                ${cols.map((k) => `<td>${renderCellValue(r, k)}</td>`).join('')}
              </tr>
            `).join('')
          }
        </tbody>
      </table>
    </div>
  `;

  const cardHtml = `
    <div class="data-cards">
      ${pageRows.length === 0
        ? `<div class="card" style="text-align:center;color:var(--muted);">沒有符合條件的資料</div>`
        : pageRows.map((r, idx) => `
          <div class="data-card" data-idx="${idx}">
            <div class="data-card-header">
              <div style="min-width:0;flex:1;">
                <div style="font-size:0.78rem;color:var(--muted-light);font-weight:600;letter-spacing:0.04em;margin-bottom:2px;">#${r._seq != null ? r._seq : (idx + 1)}</div>
                <div class="data-card-title">${r.institutionName ? withHospitalLink(r.institutionName, r.institutionName) : fmt.empty(r.institutionName)}</div>
                ${r.unitName ? `<div style="font-size:0.88rem;color:var(--ink-soft);font-weight:500;margin-top:2px;">${r.unitName}</div>` : ''}
                <div style="font-size:0.82rem;color:var(--muted);margin-top:2px;">
                  ${fmt.empty(r.institutionType)}${r.location ? ' · ' + r.location : ''}
                </div>
              </div>
              ${slug === 'all' ? categoryTag(r._category) : recommendPill(r.recommendIndex)}
            </div>
            ${cols.filter((k) => !['institutionName','institutionType','_category','recommendIndex','comment'].includes(k)).map((k) => `
              <div class="data-card-row">
                <span class="key">${KEY_LABELS[k] || k}</span>
                <span class="val">${renderCellValueForCard(r, k)}</span>
              </div>
            `).join('')}
            ${r.comment ? `
              <div class="data-card-comment">
                <span class="key">短評</span>
                ${r.comment}
              </div>` : ''}
          </div>
        `).join('')
      }
    </div>
  `;

  container.innerHTML = `
    <div class="table-view" style="display:${container.dataset.view === 'card' ? 'none' : 'block'}">${tableHtml}</div>
    <div class="card-view"  style="display:${container.dataset.view === 'card' ? 'block' : 'none'}">${cardHtml}</div>
    <div class="pagination-mount"></div>
    <div class="g2g-cta-mount"></div>
  `;

  // 限筆數版本：用 CTA 取代分頁；否則正常顯示分頁
  if (willGate) {
    container.querySelector('.g2g-cta-mount').innerHTML = gateCtaHtml(
      sorted.length,
      fullCount,
      gate.isFilteredView,
    );
  } else {
    renderPagination(container.querySelector('.pagination-mount'), pageInfo, (newPage) => {
      state.page = newPage;
      renderTable(container, rows, opts);
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Header click → sort（排序變動也回到第 1 頁，讓使用者看見新排序的頭部）
  container.querySelectorAll('thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      state.page = 1;
      renderTable(container, rows, opts);
    });
  });

  // Row click → modal（索引對應「當前頁切片」，不是全部）
  const openByIdx = (idx) => opts.onRowClick && opts.onRowClick(pageRows[idx]);
  container.querySelectorAll('tbody tr[data-idx]').forEach((tr) => {
    tr.addEventListener('click', () => openByIdx(+tr.dataset.idx));
  });
  container.querySelectorAll('.data-card[data-idx]').forEach((c) => {
    c.addEventListener('click', () => openByIdx(+c.dataset.idx));
  });

  // 全名 tooltip：當機構/單位被截斷時 hover 顯示完整名稱（共用模組）
  ensureTooltip();
}

/** Switch view: 'table' | 'card' */
export function setView(container, view) {
  container.dataset.view = view;
  const tv = container.querySelector('.table-view');
  const cv = container.querySelector('.card-view');
  if (tv) tv.style.display = view === 'card' ? 'none' : 'block';
  if (cv) cv.style.display = view === 'card' ? 'block' : 'none';
}

/** Detail modal */
export function showDetailModal(row, opts = {}) {
  const slug = row._category;
  const cat = getCategory(slug);
  const fields = getAllFields(slug);

  const backdrop = document.getElementById('detail-modal') || (() => {
    const el = document.createElement('div');
    el.id = 'detail-modal';
    el.className = 'modal-backdrop';
    document.body.appendChild(el);
    return el;
  })();

  backdrop.innerHTML = `
    <div class="modal" role="dialog">
      <div class="modal-header">
        <div style="min-width:0;flex:1;">
          ${categoryTag(slug)}
          <h3 style="margin:8px 0 0;">${row.institutionName || '未填寫'}</h3>
          ${row.unitName ? `<div style="color:var(--ink-soft);font-size:0.95rem;font-weight:500;margin-top:2px;">${row.unitName}</div>` : ''}
          <div style="color:var(--muted);font-size:0.88rem;margin-top:4px;">
            ${row.institutionType || ''}${row.location ? ' · ' + row.location : ''}${row.jobTitle ? ' · ' + row.jobTitle : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button id="modal-copylink-btn" class="btn btn-secondary" style="padding:8px 14px;font-size:0.85rem;gap:6px;" title="複製這筆的永久連結">
            ${icon('link', { size: 14 })}
            <span>複製連結</span>
          </button>
          <button id="modal-share-btn" class="btn btn-primary" style="padding:8px 14px;font-size:0.85rem;gap:6px;">
            ${icon('share', { size: 14 })}
            <span>產生分享圖</span>
          </button>
          <button class="modal-close" aria-label="關閉">${icon('x', { size: 16 })}</button>
        </div>
      </div>
      <div class="modal-grid">
        ${fields.filter((f) => f.key !== 'institutionName' && f.key !== 'institutionType' && f.key !== 'location' && f.key !== 'jobTitle' && f.key !== 'comment').map((f) => `
          <div>
            <div class="key">${f.label}</div>
            <div class="val">${renderCellValue(row, f.key)}</div>
          </div>
        `).join('')}
      </div>
      ${row.comment ? `
        <hr class="divider" />
        <div>
          <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">個人短評</div>
          <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${row.comment}</p>
        </div>
      ` : ''}
    </div>
  `;

  backdrop.classList.add('open');
  const close = () => {
    backdrop.classList.remove('open');
    opts.onClose?.(row);
  };
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  // Copy-link button — 永久連結（依賴 row._seq 全域穩定編號）
  const copyBtn = backdrop.querySelector('#modal-copylink-btn');
  const copyLabelEl = copyBtn?.querySelector('span:last-child');
  let copyResetTimer;
  copyBtn?.addEventListener('click', async () => {
    if (row._seq == null) {
      alert('此筆資料尚無永久編號，無法產生連結。');
      return;
    }
    const u = new URL(location.href);
    u.searchParams.set('id', String(row._seq));
    u.hash = ''; // 連結不帶 tab hash，靠 _category 自動切
    const link = u.toString();
    const flashCopied = () => {
      copyBtn.classList.add('copied');
      if (copyLabelEl) copyLabelEl.textContent = '已複製';
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (copyLabelEl) copyLabelEl.textContent = '複製連結';
      }, 1800);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        flashCopied();
      } else {
        window.prompt('請手動複製此連結：', link);
      }
    } catch {
      window.prompt('請手動複製此連結：', link);
    }
  });

  // Share button
  const shareBtn = backdrop.querySelector('#modal-share-btn');
  const originalShareHTML = shareBtn.innerHTML;
  shareBtn.addEventListener('click', async () => {
    if (shareBtn.disabled) return;
    shareBtn.disabled = true;
    shareBtn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></span><span>生成中...</span>`;
    try {
      const { blob, dataUrl } = await generateShareCard(row);
      const safeName = (row.institutionName || 'share').replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeName}_${cat.name}_${Date.now()}.png`;
      showSharePreview(blob, dataUrl, filename);
    } catch (e) {
      console.error(e);
      alert('生成失敗：' + e.message);
    } finally {
      shareBtn.disabled = false;
      shareBtn.innerHTML = originalShareHTML;
    }
  });
}
