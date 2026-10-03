// hospital-sections.js — 機構總覽頁五個分頁的內容：三班護病比、財務概況、人力監控、分享平台、違規紀錄（含違規詳情彈窗）。
import { icon, renderIcons } from './icons.js?v=ed5f8b12b6';
import { getShort } from './hospital-shortname.js?v=ed5f8b12b6';
import { normalizeInstitutionName, institutionNameMatches } from './institution-name.js?v=ed5f8b12b6';
import {
  STANDARDS,
  COMPLIANCE_CLASSES,
  formatRocMonth,
  shiftStatus,
  classifyHospital,
  renderNurseChart,
} from './nurse-ratio-view.js?v=ed5f8b12b6';

import { renderKpiStrip } from './stats-kpi.js?v=ed5f8b12b6';
import { renderTable, showDetailModal } from './table.js?v=ed5f8b12b6';
import { hasContributed } from './contribution-gate.js?v=ed5f8b12b6';

import {
  loadFinancialsHospital,
  getFinancialFields,
  formatVal as finFormatVal,
  formatRocYear as finRocYear,
  renderFinancialTrendChart,
  signClass as finSignClass,
} from './financials-view.js?v=ed5f8b12b6';
import { levelSlug } from './picker-filters.js?v=ed5f8b12b6';
import { feeMergedParent, reportMergedInfo } from './hospital-merges.js?v=ed5f8b12b6';
import {
  loadPersonnelHospital,
  ensurePersonnelIndex,
  renderStaffChart as renderPmStaffChart,
  renderBedChart as renderPmBedChart,
  latestMonthTable,
} from './personnel-view.js?v=ed5f8b12b6';

import { fineToWan, formatROCDate } from './records-format.js?v=ed5f8b12b6';
import { skeletonRows } from './skeleton.js?v=ed5f8b12b6';
import { escapeHtml } from './moderation.js?v=ed5f8b12b6';

import { state, loadNurseByCode, ensurePlatformRows, ensureViolRows } from './hospital-data.js?v=ed5f8b12b6';

// 共用院區頁簽：多院區時以 .tabs 頁簽切換，內容區惰性重繪（重用 css .tabs/.tab）。
// tabs: [{ label, data }]；renderPanel(data, panelEl) 每次切換都重畫（圖表用新 canvas）。
function renderBranchTabs(host, tabs, renderPanel) {
  host.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'tabs';
  bar.style.cssText = 'margin-bottom:14px;';
  const panel = document.createElement('div');
  const activate = (i) => {
    bar.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('active', j === i));
    renderPanel(tabs[i].data, panel);
  };
  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (i === 0 ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => activate(i));
    bar.appendChild(btn);
  });
  host.appendChild(bar);
  host.appendChild(panel);
  if (tabs.length) renderPanel(tabs[0].data, panel);
}

// 護病比：依 code 惰性載入單院小檔（data/nurse-ratio/by-code/{code}.json）；
// 每個 code 可能對應多院區 → 單院區直接呈現，多院區用院區頁簽切換。
export function renderNurseSection(code, hosp) {
  const wrap = document.getElementById('nr-section-body');
  const empty = document.getElementById('nr-section-empty');
  wrap.innerHTML = skeletonRows(3, { pad: 8 });
  empty.hidden = true;

  loadNurseByCode(code).then((data) => {
    if (state.currentCode !== code) return;
    const branches = (data && data.hospitals) || [];
    if (branches.length === 0) {
      wrap.innerHTML = '';
      empty.hidden = false;
      return;
    }
    const months = data.months;

  const renderOne = (b, panel) => {
    const latestMonth = [...months].reverse().find((m) => b.history[m]);
    const latest = latestMonth ? b.history[latestMonth] : {};
    const std = STANDARDS[b.level] || {};
    const cls = classifyHospital(b, months);
    const meta = COMPLIANCE_CLASSES[cls];
    const lvBadge = `<span class="nurse-level-badge nurse-level-${levelSlug(b.level)}">${escapeHtml(b.level)}</span>`;
    const kpi = (val, sname, s) => {
      if (val == null) return `<div class="card stat-card"><div class="stat-num kpi-num">—</div><div class="stat-label">${sname}</div></div>`;
      const st = shiftStatus(val, s);
      return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${st ? 'status-' + st : ''}">${val.toFixed(1)}</span></div><div class="stat-label">${sname}</div></div>`;
    };
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        ${lvBadge}
        <span class="nurse-compliance-badge nurse-compliance-${cls}">${meta.label}</span>
        <span style="color:var(--muted);font-size:0.82rem;">${latestMonth ? formatRocMonth(latestMonth) : ''}</span>
      </div>
      <div class="grid grid-3">
        ${kpi(latest.day, '白班護病比', std.day)}
        ${kpi(latest.eve, '小夜班護病比', std.eve)}
        ${kpi(latest.night, '大夜班護病比', std.night)}
      </div>
      <div class="chart-card" style="margin-top:16px;">
        <div class="chart-canvas-wrap" style="height:360px;">
          <canvas class="nr-branch-canvas"></canvas>
        </div>
      </div>`;
    renderNurseChart(panel.querySelector('.nr-branch-canvas'), b, months);
    renderIcons();
  };

    if (branches.length === 1) {
      wrap.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.marginTop = '8px';
      wrap.appendChild(panel);
      renderOne(branches[0], panel);
    } else {
      renderBranchTabs(wrap, branches.map((b) => ({ label: b.branch || '本院', data: b })), renderOne);
    }
  }).catch(() => {
    if (state.currentCode === code) { wrap.innerHTML = ''; empty.hidden = false; }
  });
}

// 財務概況（健保署）：依 code 惰性載入單院小檔 data/financials/{code}.json → 最新年 KPI + 趨勢圖
// 財務逐年明細表欄位（同財務頁彈窗，含營運欄位）
const FI_YEAR_COLS = ['F1', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8',
  'DOCTOR', 'BED', 'OPD_CNT', 'IPD_CNT', 'IPD_DAY', 'PT_ALL', 'OPD_PT', 'IPD_PT'];

export function renderFinancialsSection(code) {
  const empty = document.getElementById('fi-section-empty');
  const kpi = document.getElementById('fi-section-kpi');
  const chartWrap = document.getElementById('fi-section-chart');
  const opsWrap = document.getElementById('fi-section-ops-chart');
  const tableWrap = document.getElementById('fi-section-yeartable');
  const tableMount = document.getElementById('fi-section-table');
  const link = document.getElementById('fi-section-link');
  kpi.innerHTML = '';
  link.innerHTML = '';
  chartWrap.hidden = true;
  opsWrap.hidden = true;
  tableWrap.hidden = true;
  tableMount.innerHTML = '';
  empty.hidden = true;

  // 直接把某份財報資料（可能是本院或母院）渲染到財務區塊；noteHtml 為合併提示、detailCode 為深連結代號
  const renderFinData = (dataHosp, noteHtml, detailCode) => {
    const fields = dataHosp.fields || getFinancialFields();
    const rowsDesc = [...dataHosp.rows].sort((a, b) => Number(b.YEAR) - Number(a.YEAR));
    const latest = rowsDesc[0];
    const card = (key, label) => {
      const val = latest[`${key}Val`]; const rank = latest[`${key}Rank`];
      return `<div class="card stat-card"><div class="stat-num kpi-num"><span class="${finSignClass(val)}">${finFormatVal(key, val, fields)}</span></div><div class="stat-label">${label}${rank ? ` · 全國第 ${rank}` : ''}</div></div>`;
    };
    const note = noteHtml ? `<div class="fin-merge-note">${noteHtml}</div>` : '';
    kpi.innerHTML = `${note}<div style="color:var(--muted);font-size:0.85rem;margin-bottom:8px;">最新年度：${finRocYear(latest.YEAR)}</div>
      <div class="grid grid-3">${card('F3', '整體獲利/虧損')}${card('F5', '醫務利益率')}${card('F6', '醫務收入')}</div>
      <div class="grid grid-3" style="margin-top:12px;">${card('DOCTOR', '醫師數')}${card('BED', '病床數')}${card('F8', '全日平均護病比')}</div>`;
    link.innerHTML = `<a href="financials.html?code=${encodeURIComponent(detailCode)}" style="color:var(--primary);text-decoration:underline;font-size:0.85rem;">在財務頁開啟 →</a>`;

    chartWrap.hidden = false;
    renderFinancialTrendChart(document.getElementById('fi-chart'), dataHosp, fields, { metrics: ['F1', 'F2', 'F3'] });
    opsWrap.hidden = false;
    renderFinancialTrendChart(document.getElementById('fi-ops-chart'), dataHosp, fields, { metrics: ['OPD_CNT', 'IPD_CNT'] });

    // 各年度明細表（同財務頁彈窗）
    const signKeys = new Set(['F1', 'F3', 'F5']);
    tableMount.innerHTML = `
      <div class="data-table-wrap"><table class="data-table fin-table">
        <thead><tr><th>年度</th>${FI_YEAR_COLS.map((c) => `<th style="text-align:right;white-space:nowrap;">${(fields[c] && fields[c].title) || c}</th>`).join('')}</tr></thead>
        <tbody>${rowsDesc.map((r) => `<tr><td>${finRocYear(r.YEAR)}</td>${FI_YEAR_COLS.map((c) => `<td style="text-align:right;white-space:nowrap;"><span class="${signKeys.has(c) ? finSignClass(r[c + 'Val']) : ''}">${finFormatVal(c, r[c + 'Val'], fields)}</span>${r[c + 'Rank'] ? `<span class="fin-rank">#${r[c + 'Rank']}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    tableWrap.hidden = false;
    renderIcons();
  };

  loadFinancialsHospital(code).then((h) => {
    if (state.currentCode !== code) return;

    // 有本院財報（含財報合併提報之兩碼）：直接顯示，合併提報者加提示
    if (h && h.rows && h.rows.length) {
      const rm = reportMergedInfo(code);
      const rmLink = rm ? ` <a href="hospital.html?code=${encodeURIComponent(rm.partner)}" class="link">查看 ${rm.partnerName} →</a>` : '';
      const note = rm
        ? (rm.main
          ? `本院財報與 <strong>${rm.partnerName}</strong> 合併提報，下列數字為兩院合計。${rmLink}`
          : `下列數字為與 <strong>${rm.partnerName}</strong> 合併提報之<strong>合計數</strong>，非本院單獨財報。${rmLink}`)
        : '';
      renderFinData(h, note, code);
      return;
    }

    // 無本院財報但屬醫療費用合併申報之子院：改載母院財報直接顯示，並提示為合併數據
    const fm = feeMergedParent(code);
    if (fm) {
      loadFinancialsHospital(fm.parent).then((ph) => {
        if (state.currentCode !== code) return;
        if (ph && ph.rows && ph.rows.length) {
          renderFinData(ph, `本院醫療費用併入 <strong>${fm.parentName}</strong> 合併申報，以下為 <strong>${fm.parentName}</strong> 之合併財報數據。 <a href="hospital.html?code=${encodeURIComponent(fm.parent)}" class="link">查看 ${fm.parentName} →</a>`, fm.parent);
        } else {
          empty.innerHTML = `本院醫療費用併入 <strong>${fm.parentName}</strong> 合併申報，健保署未單獨公開本院財務。`;
          empty.hidden = false;
        }
      });
      return;
    }

    // 其餘：確無財報
    empty.innerHTML = '查無此機構的財務公開資料（僅依法須公開財務之醫院有）。';
    empty.hidden = false;
  });
}

// 一個院區的人力監控面板（職類 + 病床折線圖），寫入 panel。
function renderPersonnelPanel(h, panel) {
  const latest = latestMonthTable(h);
  const latestBlock = latest.monthLabel ? `
    <h4 style="margin:24px 4px 4px;font-size:0.95rem;">
      <span data-icon="layout" data-size="16" class="ico-primary"></span>
      最新月一覽（民國 ${latest.monthLabel}）
    </h4>
    <div class="data-table-wrap">${latest.tableHtml}</div>` : '';
  panel.innerHTML = `
    <p style="color:var(--muted-light);font-size:0.8rem;margin:0 4px 10px;">各職類實際人數（逐月）；預設顯示護產，點圖例可加看其他職類。未填報之月份線段中斷、不補值。</p>
    <div class="chart-canvas-wrap" style="height:300px;"><canvas class="pm-staff-canvas"></canvas></div>
    <h4 style="margin:20px 4px 4px;font-size:0.95rem;">病床數量（逐月）</h4>
    <div class="chart-canvas-wrap" style="height:260px;"><canvas class="pm-bed-canvas"></canvas></div>
    ${latestBlock}`;
  renderPmStaffChart(panel.querySelector('.pm-staff-canvas'), h, null);
  // 病床圖：無登錄床數時以提示取代（renderPmBedChart 回傳 null）
  const bedCanvas = panel.querySelector('.pm-bed-canvas');
  const bedChart = renderPmBedChart(bedCanvas, h, null);
  if (!bedChart) {
    bedCanvas.style.display = 'none';
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:24px;color:var(--muted);text-align:center;';
    msg.textContent = '此機構無登錄病床資料。';
    bedCanvas.parentElement.appendChild(msg);
  }
  renderIcons();
}

// 人力監控：以機構代號查院區清單 → 單院區直接呈現，多院區用院區頁簽切換。
export function renderPersonnelSection(code) {
  const empty = document.getElementById('pm-section-empty');
  const body = document.getElementById('pm-section-body');
  const link = document.getElementById('pm-section-link');
  link.innerHTML = '';
  body.hidden = true;
  empty.hidden = true;

  ensurePersonnelIndex().then((idx) => {
    if (state.currentCode !== code) return;
    const campuses = idx.byCode.get(code) || [];
    if (campuses.length === 0) { empty.hidden = false; return; }
    body.hidden = false;
    link.innerHTML = `<a href="personnel.html?id=${encodeURIComponent(campuses[0].id)}" style="color:var(--primary);text-decoration:underline;font-size:0.85rem;">查看人力監控 →</a>`;

    const loadPanel = (campus, panel) => {
      panel.innerHTML = skeletonRows(3, { pad: 8 });
      loadPersonnelHospital(campus.id).then((h) => {
        if (state.currentCode !== code) return;
        renderPersonnelPanel(h, panel);
      }).catch(() => { panel.innerHTML = '<div style="padding:16px;color:var(--danger);">人力資料載入失敗。</div>'; });
    };

    if (campuses.length === 1) {
      body.innerHTML = '';
      const panel = document.createElement('div');
      body.appendChild(panel);
      loadPanel(campuses[0], panel);
    } else {
      renderBranchTabs(body, campuses.map((c) => ({ label: c.branch || '本院', data: c })), loadPanel);
    }
  }).catch(() => { if (state.currentCode === code) empty.hidden = false; });
}

// 分享平台眾包：以機構名稱/簡稱比對 → KPI 摘要 + 每筆可點開的表格
export function renderPlatformSection(hosp) {
  const kpi = document.getElementById('pf-section-kpi');
  const table = document.getElementById('pf-section-table');
  const empty = document.getElementById('pf-section-empty');
  kpi.innerHTML = '';
  table.innerHTML = skeletonRows(4, { pad: 8 });
  empty.hidden = true;

  ensurePlatformRows().then((rows) => {
    if (state.currentCode !== hosp.code) return; // 已切換醫院
    const short = hosp.shortName || getShort(hosp.name);
    const matched = rows.filter((r) => {
      const nm = r.institutionName;
      if (!nm) return false;
      if (institutionNameMatches(nm, hosp.name)) return true;
      return !!(short && normalizeInstitutionName(nm) === normalizeInstitutionName(short));
    });
    if (matched.length === 0) {
      kpi.innerHTML = '';
      table.innerHTML = '';
      empty.hidden = false;
      return;
    }
    renderKpiStrip(kpi, matched);
    // 每筆資料的表格/卡片視圖，點列可開明細（重用分享平台的 modal）
    table.dataset.view = window.matchMedia('(max-width: 640px)').matches ? 'card' : 'table';
    // Soft Give-to-Get：未貢獻者鎖住排序、只顯示前 5 筆；填表分享後解鎖完整資料
    const gate = hasContributed()
      ? { gated: false, limit: Infinity, isFilteredView: false }
      : { gated: true, limit: 5, isFilteredView: false };
    renderTable(table, matched, { slug: 'all', onRowClick: (r) => showDetailModal(r), gate });
  });
}

// 違規紀錄：以離線對照表（名稱→代號）比對
export function renderViolationsSection(code, hosp) {
  const body = document.getElementById('vi-section-body');
  const empty = document.getElementById('vi-section-empty');
  const sum = document.getElementById('vi-section-summary');
  body.innerHTML = skeletonRows(4, { pad: 8 });
  sum.innerHTML = '';
  empty.hidden = true;

  ensureViolRows().then((rows) => {
    if (state.currentCode !== code) return;
    const matched = rows
      .filter((r) => state.violMap[r.institutionName] === code)
      .sort((a, b) => {
        const ta = a.penaltyDate ? a.penaltyDate.getTime() : 0;
        const tb = b.penaltyDate ? b.penaltyDate.getTime() : 0;
        return tb - ta;
      });

    if (matched.length === 0) {
      body.innerHTML = '';
      sum.innerHTML = '';
      empty.hidden = false;
      return;
    }

    const totalFine = matched.reduce((a, r) => a + (r.fine || 0), 0);
    const byTag = {};
    matched.forEach((r) => { byTag[r.feedTag] = (byTag[r.feedTag] || 0) + 1; });
    sum.innerHTML = `
      <span class="nurse-compliance-badge nurse-compliance-C">${matched.length} 筆違規</span>
      <span style="color:var(--muted);font-size:0.85rem;">累計罰鍰 <strong class="text-ink">${fineToWan(totalFine) || 0}</strong> 萬元
      · ${Object.entries(byTag).map(([t, n]) => `${t} ${n}`).join(' / ')}</span>`;

    body.innerHTML = `
      <div class="records-list">
        ${matched.map((r, i) => `
          <div class="record-row" data-idx="${i}" role="button" tabindex="0" title="點擊看詳情"
               style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:baseline;flex-wrap:wrap;cursor:pointer;">
            <span class="tag" style="flex:0 0 auto;">${r.feedTag}</span>
            <span style="flex:0 0 auto;color:var(--muted);font-size:0.85rem;">${r.penaltyDate ? formatROCDate(r.penaltyDate) : (r.penaltyDateRaw || '—')}</span>
            <span style="flex:1 1 260px;min-width:200px;">${escapeHtml(r.lawShort)}${escapeHtml(r.lawArticle ? '・' + r.lawArticle : '')}<br/><span style="color:var(--muted);font-size:0.86rem;">${escapeHtml(r.lawDesc)}</span></span>
            <span style="flex:0 0 auto;font-weight:600;color:var(--danger);">${r.fine ? fineToWan(r.fine) + ' 萬' : '—'}</span>
          </div>`).join('')}
      </div>`;

    const open = (idx) => openViolModal(matched[idx]);
    body.querySelectorAll('.record-row').forEach((el) => {
      el.addEventListener('click', () => open(+el.dataset.idx));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(+el.dataset.idx); } });
    });
  });
}

// 違規單筆明細 modal（含「複製連結」→ 連到違規紀錄頁該筆的永久連結）
function openViolModal(row) {
  const backdrop = document.getElementById('hosp-viol-modal') || (() => {
    const el = document.createElement('div');
    el.id = 'hosp-viol-modal';
    el.className = 'modal-backdrop';
    document.body.appendChild(el);
    return el;
  })();

  const dateStr = row.penaltyDate ? formatROCDate(row.penaltyDate) : (row.penaltyDateRaw || '—');
  const pubStr = row.publishDate ? formatROCDate(row.publishDate) : (row.publishDateRaw || '—');
  const fineStr = row.fine ? row.fine.toLocaleString() : '—';
  const locFull = row.locationRaw || row.location || '—';
  const recordLink = `records.html?type=${encodeURIComponent(row.feedKey)}&id=${encodeURIComponent(row.id)}`;

  backdrop.innerHTML = `
    <div class="modal viol-detail-modal" role="dialog">
      <div class="modal-header">
        <div style="min-width:0;flex:1;">
          <span class="viol-detail-tag">${escapeHtml(row.feedTag)}紀錄 · #${escapeHtml(row.id)}</span>
          <h3 style="margin:8px 0 0;word-break:break-word;">${escapeHtml(row.institutionName) || '未填寫'}</h3>
          <div style="color:var(--muted);font-size:0.88rem;margin-top:4px;">
            ${escapeHtml(locFull)}${row.penaltyDate ? ' · ' + dateStr + ' 處分' : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <a href="${recordLink}" class="btn btn-secondary" style="padding:8px 14px;font-size:0.85rem;gap:6px;text-decoration:none;" title="在違規紀錄頁開啟這一筆">在違規紀錄頁開啟 →</a>
          <button id="hosp-viol-copylink" class="btn btn-primary" style="padding:8px 14px;font-size:0.85rem;gap:6px;">複製連結</button>
          <button class="modal-close" aria-label="關閉">${icon('x', { size: 18 })}</button>
        </div>
      </div>
      <div class="modal-grid">
        <div><div class="key">處分日期</div><div class="val">${dateStr}</div></div>
        <div><div class="key">公告日期</div><div class="val">${pubStr}</div></div>
        <div><div class="key">主管機關</div><div class="val">${escapeHtml(locFull)}</div></div>
        <div><div class="key">處分字號</div><div class="val">${escapeHtml(row.docId) || '—'}</div></div>
        <div><div class="key">罰鍰 (元)</div><div class="val" style="font-weight:600;color:var(--danger);">${fineStr}</div></div>
        <div><div class="key">依據法規</div><div class="val">${escapeHtml(row.lawShort)}</div></div>
      </div>
      <hr class="divider" />
      <div>
        <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">違反法規條款</div>
        <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawArticle) || '—'}</p>
      </div>
      ${row.lawDesc ? `
        <hr class="divider" />
        <div>
          <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">法條敘述</div>
          <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawDesc)}</p>
        </div>` : ''}
    </div>`;

  backdrop.classList.add('open');
  const close = () => {
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', esc);
  };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', esc);

  const copyBtn = backdrop.querySelector('#hosp-viol-copylink');
  copyBtn.addEventListener('click', () => {
    const abs = new URL(recordLink, location.href).toString();
    copyOrShare(abs, copyBtn, '複製連結');
  });
}

// 複製連結 / Web Share（回饋「已複製」）
export function copyOrShare(link, btn, defaultLabel) {
  const labelEl = btn.querySelector('.btn-label') || btn;
  const flash = () => {
    labelEl.textContent = '已複製';
    setTimeout(() => { labelEl.textContent = defaultLabel; }, 1600);
  };
  if (navigator.share) {
    navigator.share({ url: link }).catch(() => {});
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(flash).catch(() => window.prompt('請手動複製：', link));
  } else {
    window.prompt('請手動複製：', link);
  }
}

// ---------- search wiring ----------
