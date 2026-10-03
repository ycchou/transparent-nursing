// records-page.js — 違規紀錄頁（勞檢／性平／職安共用）的畫面：KPI、篩選、表格（手機為卡片）、分頁、詳情彈窗。
import { getShort as getHospitalShort } from './hospital-shortname.js?v=56fb7c03b7';
import { normalizeInstitutionName } from './institution-name.js?v=56fb7c03b7';
import { icon, renderIcons } from './icons.js?v=56fb7c03b7';
import { ensureTooltip } from './tooltip.js?v=56fb7c03b7';
import { pageSlice, renderPagination } from './pagination.js?v=56fb7c03b7';
import { escapeHtml } from './moderation.js?v=56fb7c03b7';
import { formatROCDate, fmtFine, fineToWan, debounce } from './records-format.js?v=56fb7c03b7';

// ============================================================
// UI Factory：把 violations.html 那套 UI 提煉成可組態的 initRecordsPage
// 需要 HTML 有以下 DOM ID（各頁面共用）：
//   records-kpi-total / -orgs / -fine / -latest
//   records-filter-badge
//   records-search
//   records-loc-filter / -law-filter
//   records-count
//   records-table-container
// ============================================================


// 違規機構名稱 → 機構代號 對照表（離線預建，供機構名稱連到整合檔案頁）
let _violHospitalMap = null;
let _violHospitalMapLoading = null;
function ensureViolHospitalMap() {
  if (_violHospitalMap) return Promise.resolve(_violHospitalMap);
  if (_violHospitalMapLoading) return _violHospitalMapLoading;
  _violHospitalMapLoading = fetch('data/violations-hospital-map.json?v=bd99316e15', { cache: 'default' })
    .then((r) => (r.ok ? r.json() : { map: {} }))
    .then((d) => { _violHospitalMap = (d && d.map) || {}; return _violHospitalMap; })
    .catch(() => { _violHospitalMap = {}; return _violHospitalMap; });
  return _violHospitalMapLoading;
}

/**
 * @param {Object} cfg
 * @param {{ load: Function, preload: Function }} cfg.loader - createCsvLoader() 的產物
 * @param {(article: string) => string} cfg.articleLabel - 條號 → 白話標籤
 * @param {string} cfg.lawShort - 例：'勞基法' / '性平法' / '職安法'（給 chip tooltip 用）
 * @param {string} cfg.modalTag - 例：'勞檢紀錄'（modal header 顯示）
 * @param {string} cfg.logTag - '[violations]' 等
 * @param {(row: Object) => Array<{label: string, value: string}>} [cfg.extraModalFields] - modal 額外欄位
 * @param {string} cfg.storageDomId - modal backdrop 的 id，避免多頁面殘留衝突（例 'records-detail-modal'）
 */
export function initRecordsPage(cfg) {
  const {
    loader,
    articleLabel,
    lawShort,
    modalTag,
    logTag,
    extraModalFields,
    storageDomId = 'records-detail-modal',
  } = cfg;

  const state = { rows: [], q: '', location: 'all', article: 'all', page: 1 };

  function applyFilters() {
    const q = state.q.toLowerCase();
    return state.rows.filter((r) => {
      if (state.location !== 'all' && r.location !== state.location) return false;
      if (state.article !== 'all' && !(r.articles || []).includes(state.article)) return false;
      if (q) {
        const short = getHospitalShort(r.institutionName) || '';
        const hay = `${r.institutionName} ${short} ${r.lawArticle} ${r.lawDesc} ${r.location} ${r.locationRaw || ''} ${r.docId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function setKpi(id, html, opts = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('is-text', !!opts.isText);
  }

  function renderKPI() {
    const all = state.rows;
    const orgs = new Set();
    let maxFine = 0;
    let latest = null;
    all.forEach((r) => {
      const cleanName = normalizeInstitutionName(r.institutionName);
      if (cleanName) orgs.add(cleanName);
      if (r.fine > maxFine) maxFine = r.fine;
      if (r.penaltyDate && (!latest || r.penaltyDate > latest)) latest = r.penaltyDate;
    });
    setKpi('records-kpi-total', `${all.length.toLocaleString()}<span class="kpi-unit">筆</span>`);
    setKpi('records-kpi-orgs', `${orgs.size.toLocaleString()}<span class="kpi-unit">家</span>`);
    setKpi('records-kpi-fine', maxFine
      ? `${fineToWan(maxFine)}<span class="kpi-unit">萬</span>`
      : '—');
    setKpi('records-kpi-latest', latest ? formatROCDate(latest) : '—', { isText: true });
  }

  function renderLocationFilter() {
    const groups = {};
    state.rows.forEach((r) => {
      if (!r.location) return;
      if (!groups[r.location]) groups[r.location] = { n: 0, rawSet: new Set() };
      groups[r.location].n++;
      if (r.locationRaw && r.locationRaw !== r.location) {
        groups[r.location].rawSet.add(r.locationRaw);
      }
    });
    const sorted = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
    const items = [
      { slug: 'all', name: '全部', tip: null, n: state.rows.length },
      ...sorted.map(([loc, g]) => ({
        slug: loc, name: loc,
        tip: g.rawSet.size ? Array.from(g.rawSet).join(' / ') : null,
        n: g.n,
      })),
    ];
    const el = document.getElementById('records-loc-filter');
    if (!el) return;
    el.innerHTML = items.map((it) => {
      const tipAttr = it.tip ? `data-tip="${it.tip.replaceAll('"', '&quot;')}"` : '';
      return `<span class="filter-chip ${state.location === it.slug ? 'active' : ''}" data-slug="${it.slug}" ${tipAttr}>${it.name} <span class="chip-count">${it.n}</span></span>`;
    }).join('');
    el.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.location = chip.dataset.slug;
        state.page = 1;
        renderLocationFilter();
        renderAll();
      });
    });
  }

  function renderLawFilter() {
    const counts = {};
    state.rows.forEach((r) => (r.articles || []).forEach((a) => { counts[a] = (counts[a] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const items = [
      { slug: 'all', name: '全部', tip: null, n: state.rows.length },
      ...top.map(([a, n]) => ({ slug: a, name: articleLabel(a), tip: `${lawShort}第 ${a} 條`, n })),
    ];
    const el = document.getElementById('records-law-filter');
    if (!el) return;
    el.innerHTML = items.map((it) => {
      const tipAttr = it.tip ? `data-tip="${it.tip}"` : '';
      return `<span class="filter-chip ${state.article === it.slug ? 'active' : ''}" data-slug="${it.slug}" ${tipAttr}>${it.name} <span class="chip-count">${it.n}</span></span>`;
    }).join('');
    el.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.article = chip.dataset.slug;
        state.page = 1;
        renderLawFilter();
        renderAll();
      });
    });
  }

  function renderLawChips(articles, fallback) {
    if (!articles || !articles.length) return `<span class="cell-trunc" title="${(fallback || '').replaceAll('"', '&quot;')}">${fallback || '—'}</span>`;
    return articles.map((a) => `<span class="viol-law-chip" data-tip="${lawShort}第 ${a} 條">${articleLabel(a)}</span>`).join(' ');
  }

  function renderLocCell(r) {
    if (!r.location) return '<span class="viol-loc">—</span>';
    const needTip = r.locationRaw && r.locationRaw !== r.location;
    const tipAttr = needTip ? `data-tip="${r.locationRaw.replaceAll('"', '&quot;')}"` : '';
    return `<span class="viol-loc" ${tipAttr}>${r.location}</span>`;
  }

  // 機構名稱：若違規對照表命中，連到整合檔案頁（stopPropagation 避免觸發列 modal）
  function instCell(r) {
    const name = r.institutionName || '';
    if (!name) return '—';
    const code = _violHospitalMap && _violHospitalMap[name];
    if (!code) return escapeHtml(name);
    return `<a href="hospital.html?code=${encodeURIComponent(code)}" onclick="event.stopPropagation()" title="查看整合檔案">${escapeHtml(name)}</a>`;
  }

  function renderTable() {
    const filtered = applyFilters();
    filtered.sort((a, b) => {
      if (a.penaltyDate && b.penaltyDate) return b.penaltyDate - a.penaltyDate;
      if (a.penaltyDate) return -1;
      if (b.penaltyDate) return 1;
      return 0;
    });

    const countEl = document.getElementById('records-count');
    if (countEl) countEl.textContent =
      `共 ${filtered.length.toLocaleString()} 筆${state.rows.length !== filtered.length ? `（已套用篩選 / 全部 ${state.rows.length.toLocaleString()} 筆）` : ''}`;

    const badge = document.getElementById('records-filter-badge');
    if (badge) badge.hidden = !(state.location !== 'all' || state.article !== 'all' || state.q);

    const c = document.getElementById('records-table-container');
    if (!c) return;
    if (filtered.length === 0) {
      c.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:48px 24px;">沒有符合條件的紀錄</div>`;
      return;
    }
    const pageInfo = pageSlice(filtered, state.page);
    const pageRows = pageInfo.items;

    c.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table viol-table">
          <thead>
            <tr>
              <th class="seq-col">#</th>
              <th>處分日期</th>
              <th>地點</th>
              <th class="viol-inst-col">機構名稱</th>
              <th>違反法條</th>
              <th class="text-right">罰鍰 (元)</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((r) => `
              <tr class="viol-row" data-id="${r.id}">
                <td class="seq-col">#${r.id}</td>
                <td class="viol-date-cell"><span class="viol-date">${r.penaltyDate ? formatROCDate(r.penaltyDate) : r.penaltyDateRaw || '—'}</span></td>
                <td class="viol-loc-cell">${renderLocCell(r)}</td>
                <td class="viol-inst-cell">${instCell(r)}</td>
                <td class="viol-law-cell">${renderLawChips(r.articles, r.lawArticle)}</td>
                <td class="viol-fine">${fmtFine(r.fine)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination-mount"></div>
    `;

    c.querySelectorAll('.viol-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = tr.dataset.id;
        const row = state.rows.find((r) => r.id === id);
        if (row) { setDeepLinkUrl(id); openDetailModal(row); }
      });
    });

    renderPagination(c.querySelector('.pagination-mount'), pageInfo, (newPage) => {
      state.page = newPage;
      renderTable();
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderAll() { renderTable(); }

  // ===== Deep link =====
  function parseDeepLinkId() {
    const raw = new URL(location.href).searchParams.get('id');
    return raw ? String(raw).trim() : null;
  }
  function setDeepLinkUrl(id, replace = false) {
    const u = new URL(location.href);
    if (id == null) u.searchParams.delete('id');
    else u.searchParams.set('id', String(id));
    history[replace ? 'replaceState' : 'pushState']({ id: id ?? null }, '', u.toString());
  }

  // ===== Detail modal =====
  function openDetailModal(row) {
    const backdrop = document.getElementById(storageDomId) || (() => {
      const el = document.createElement('div');
      el.id = storageDomId;
      el.className = 'modal-backdrop';
      document.body.appendChild(el);
      return el;
    })();

    const dateStr = row.penaltyDate ? formatROCDate(row.penaltyDate) : (row.penaltyDateRaw || '—');
    const pubStr = row.publishDate ? formatROCDate(row.publishDate) : (row.publishDateRaw || '—');
    const fineStr = row.fine ? row.fine.toLocaleString() : '—';
    const locFull = row.locationRaw || row.location || '—';
    const chipsHtml = renderLawChips(row.articles, row.lawArticle);

    const extraFields = extraModalFields ? extraModalFields(row) : [];
    const extraCoreHtml = extraFields
      .filter((f) => f.value && String(f.value).trim())
      .map((f) => `
        <div>
          <div class="key">${escapeHtml(f.label)}</div>
          <div class="val">${escapeHtml(f.value)}</div>
        </div>
      `).join('');

    backdrop.innerHTML = `
      <div class="modal viol-detail-modal" role="dialog">
        <div class="modal-header">
          <div style="min-width:0;flex:1;">
            <span class="viol-detail-tag">${escapeHtml(modalTag)} · #${row.id}</span>
            <h3 style="margin:8px 0 0;word-break:break-word;">${escapeHtml(row.institutionName) || '未填寫'}</h3>
            <div style="color:var(--muted);font-size:0.88rem;margin-top:4px;">
              ${escapeHtml(locFull)}${row.penaltyDate ? ' · ' + dateStr + ' 處分' : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
            <button id="viol-modal-copylink" class="btn btn-secondary" style="padding:8px 14px;font-size:0.85rem;gap:6px;" title="複製這筆的永久連結">
              ${icon('link', { size: 14 })}
              <span>複製連結</span>
            </button>
            <button class="modal-close" aria-label="關閉">${icon('x', { size: 16 })}</button>
          </div>
        </div>
        <div class="modal-grid">
          <div><div class="key">處分日期</div><div class="val">${dateStr}</div></div>
          <div><div class="key">公告日期</div><div class="val">${pubStr}</div></div>
          <div><div class="key">主管機關</div><div class="val">${escapeHtml(locFull)}</div></div>
          <div><div class="key">處分字號</div><div class="val">${escapeHtml(row.docId) || '—'}</div></div>
          <div><div class="key">罰鍰 (元)</div><div class="val" style="font-weight:600;color:var(--danger);">${fineStr}</div></div>
          <div><div class="key">違反法條 (標籤)</div><div class="val">${chipsHtml}</div></div>
          ${extraCoreHtml}
        </div>
        <hr class="divider" />
        <div>
          <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">違反法規條款（完整）</div>
          <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawArticle) || '—'}</p>
        </div>
        ${row.lawDesc ? `
          <hr class="divider" />
          <div>
            <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">法條敘述</div>
            <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.lawDesc)}</p>
          </div>
        ` : ''}
        ${row.note ? `
          <hr class="divider" />
          <div>
            <div class="key" style="color:var(--muted);font-size:0.85rem;margin-bottom:6px;">備註</div>
            <p style="margin:0;color:var(--ink-soft);line-height:1.8;">${escapeHtml(row.note)}</p>
          </div>
        ` : ''}
      </div>
    `;

    backdrop.classList.add('open');
    document.body.classList.add('viol-modal-open');

    const close = () => {
      backdrop.classList.remove('open');
      document.body.classList.remove('viol-modal-open');
      setDeepLinkUrl(null, true);
      document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', escHandler);

    const copyBtn = backdrop.querySelector('#viol-modal-copylink');
    const copyLabelEl = copyBtn?.querySelector('span:last-child');
    let copyResetTimer;
    copyBtn?.addEventListener('click', async () => {
      const u = new URL(location.href);
      u.searchParams.set('id', String(row.id));
      u.hash = '';
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

    ensureTooltip();
  }

  function closeDetailModal() {
    const backdrop = document.getElementById(storageDomId);
    if (backdrop && backdrop.classList.contains('open')) {
      backdrop.classList.remove('open');
      document.body.classList.remove('viol-modal-open');
    }
  }

  // ===== 入口 =====
  return async function initPage() {
    const container = document.getElementById('records-table-container');
    if (container) {
      container.innerHTML = `
        <div class="data-table-wrap" style="padding:24px;">
          ${Array.from({ length: 8 }).map(() => `<div class="skeleton" style="height:36px;margin-bottom:8px;"></div>`).join('')}
        </div>`;
    }

    const pendingDeepLinkId = parseDeepLinkId();

    try {
      state.rows = await loader.load();
      renderKPI();
      renderLocationFilter();
      renderLawFilter();
      renderAll();
      renderIcons();
      ensureTooltip();

      // 載入違規對照表後重繪表格，讓可對應的機構名稱變成整合檔案連結
      ensureViolHospitalMap().then(() => renderAll());

      const input = document.getElementById('records-search');
      if (input) {
        input.addEventListener('input', debounce(() => {
          state.q = (input.value || '').trim();
          state.page = 1;
          renderAll();
        }, 200));
      }

      if (pendingDeepLinkId) {
        const target = state.rows.find((r) => r.id === pendingDeepLinkId);
        if (target) openDetailModal(target);
        else {
          setDeepLinkUrl(null, true);
          console.warn(`${logTag} 找不到 #${pendingDeepLinkId} 這筆資料`);
        }
      }

      window.addEventListener('popstate', () => {
        const id = parseDeepLinkId();
        if (id) {
          const row = state.rows.find((r) => r.id === id);
          if (row) openDetailModal(row);
        } else {
          closeDetailModal();
        }
      });
    } catch (e) {
      console.error(e);
      const cont = document.getElementById('records-table-container');
      if (cont) cont.innerHTML = `<div class="card" style="text-align:center;color:var(--danger);padding:40px 24px;">資料載入失敗：${e.message}</div>`;
      const cnt = document.getElementById('records-count');
      if (cnt) cnt.textContent = '載入失敗';
      document.querySelectorAll('.kpi-skel').forEach((el) => { el.replaceWith('—'); });
    }
  };
}
