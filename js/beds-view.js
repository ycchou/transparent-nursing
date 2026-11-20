import { escapeHtml } from './moderation.js?v=caac978e8b';
// 病床設施（衛福部醫院評鑑資訊專區登記數）：依「一般／特殊病床」分組的長條清單，多院區可切換。
// 供「人力監控」頁(personnel.js)與「機構總覽」頁(hospital-sections.js)共用；接在逐月病床圖下方，
// 逐月圖只有人力監測申報的 4 種床別，這裡補上目前登記的完整床別（加護、隔離、透析、安寧…）。
// 資料：tools/fetch-hospital-beds.py → data/beds/{code}.json，beds 為 [類別, 床名, 床數]（不含 0 床）。

const GROUPS = [
  { kind: '一般病床', cls: 'bf-general' },
  { kind: '特殊病床', cls: 'bf-special' },
];
const SOURCE_URL = 'https://openinfo.mohw.gov.tw/web/C02?type=1';

const cache = new Map();
export async function loadBeds(code) {
  if (!code) return null;
  if (cache.has(code)) return cache.get(code);
  const p = fetch(`data/beds/${code}.json?v=84d8731d91`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(code, p);
  return p;
}

// 人力監控的院區名（「仁愛院區」「main」或空字串）→ 對應的登記院區；對不到時用本院（第一個）
const normZone = (s) => String(s || '').replace(/院區$/, '');
function matchZone(zones, branch) {
  const b = normZone(branch);
  if (!b || b === 'main') return 0;
  const i = zones.findIndex((z) => normZone(z.name) === b || normZone(z.name).startsWith(b));
  return i >= 0 ? i : 0;
}

const fmt = (n) => n.toLocaleString();

function zoneHtml(doc, z) {
  const beds = z.beds || [];
  const groups = GROUPS.map((g) => {
    const rows = beds.filter((b) => b[0] === g.kind).sort((a, b) => b[2] - a[2]);
    return { ...g, rows, sum: rows.reduce((s, b) => s + b[2], 0) };
  });
  const total = groups.reduce((s, g) => s + g.sum, 0);
  const others = beds.filter((b) => !GROUPS.some((g) => g.kind === b[0]));
  if (!total && !others.length) return '<div class="bf-empty">此院區未登記病床設施。</div>';

  const max = Math.max(1, ...groups.flatMap((g) => g.rows.map((b) => b[2])));
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const [gen, spe] = groups;
  const summary = `
    <div class="bf-summary">
      <div class="bf-total"><span class="bf-total-num kpi-num">${fmt(total)}</span><span class="bf-total-unit">床</span></div>
      <div class="bf-total-label">登記總病床</div>
      <div class="bf-split" role="img" aria-label="一般病床 ${gen.sum} 床、特殊病床 ${spe.sum} 床">
        <span class="bf-general" style="width:${pct(gen.sum)}%"></span><span class="bf-special" style="width:${pct(spe.sum)}%"></span>
      </div>
      <div class="bf-split-legend">
        <span><i class="bf-dot bf-general"></i>一般 ${fmt(gen.sum)}</span>
        <span><i class="bf-dot bf-special"></i>特殊 ${fmt(spe.sum)}（${pct(spe.sum)}%）</span>
      </div>
    </div>`;
  const groupHtml = groups.filter((g) => g.rows.length).map((g) => `
    <div class="bf-group">
      <div class="bf-group-title"><span>${g.kind}</span><span>${fmt(g.sum)} 床</span></div>
      ${g.rows.map((b) => `
        <div class="bf-row">
          <span class="bf-name">${escapeHtml(b[1])}</span>
          <span class="bf-bar"><span class="${g.cls}" style="width:${Math.max(2, (b[2] / max) * 100)}%"></span></span>
          <span class="bf-num">${fmt(b[2])}<small> 床</small></span>
        </div>`).join('')}
    </div>`).join('');
  const otherHtml = others.length
    ? `<div class="bf-other"><span class="bf-other-label">其他設施</span>${others.map((b) => `<span class="bf-chip">${escapeHtml(b[1])} <strong>${fmt(b[2])}</strong></span>`).join('')}</div>`
    : '';
  const src = `${SOURCE_URL}&basAgencyId=${encodeURIComponent(doc.code)}&zoneCode=${encodeURIComponent(z.zone)}`;
  return `${summary}<div class="bf-groups">${groupHtml}</div>${otherHtml}
    <p class="bf-note">資料來源：<a href="${src}" target="_blank" rel="noopener" class="link">衛福部醫院評鑑資訊專區</a>（${escapeHtml(doc.updated || '')} 擷取）。
    為目前登記數，與上方逐月圖（醫事人力監測申報）口徑不同，數字可能略有差異。</p>`;
}

// 將病床設施畫進 host；branch 為人力監控的院區名，用來預選對應院區。無資料時回傳 false。
export async function renderBedFacilities(host, code, { branch = '' } = {}) {
  const doc = await loadBeds(code);
  const zones = (doc && doc.zones) || [];
  if (!zones.some((z) => z.beds && z.beds.length)) { host.innerHTML = ''; return false; }
  let cur = matchZone(zones, branch);
  const draw = () => {
    const tabs = zones.length > 1
      ? `<div class="bf-zones">${zones.map((z, i) => `<button type="button" class="bf-zone${i === cur ? ' active' : ''}" data-i="${i}">${escapeHtml(z.name || z.zone)}</button>`).join('')}</div>`
      : '';
    host.innerHTML = `<div class="bf">${tabs}${zoneHtml(doc, zones[cur])}</div>`;
    host.querySelectorAll('.bf-zone').forEach((btn) => btn.addEventListener('click', () => { cur = Number(btn.dataset.i); draw(); }));
  };
  draw();
  return true;
}
