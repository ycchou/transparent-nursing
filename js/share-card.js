// 一鍵產生單筆資料分享圖片（1080 × 1350，IG 4:5 直式）
import { getCategory } from './config.js?v=0fdcc10059';

const KEY_LABELS = {
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
  onCallPay: '值班費',
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
  // OPD
  clinicType: '門診類型',
  registrationPerSession: '每診掛號',
  staffPerClinic: '每診人力',
  // OR
  orSpecialty: '主要科別',
  orRole: '工作角色',
  dailyCases: '每日案件數',
  roomCount: '手術室數',
  onCallSystem: 'On-call',
  // Special
  specialType: '單位類型',
  onCallRequired: 'On-call 制度',
  radiationExposure: '輻射暴露',
  // Other
  workplaceType: '職場類型',
  practiceRegistration: '需執業登記',
  otherCerts: '其他證書資格',
  scheduleSystem: '排班制度',
  fieldWork: '需外出值勤',
  violenceRisk: '暴力風險',
  // Common
  weeklyHours: '每週工時',
  overtimePolicy: '加班費合規',
  workAtmosphere: '工作氣氛',
};

// 各類別在分享卡上要呈現的 5 個關鍵欄位
const SHARE_FIELDS = {
  icu:        ['icuType',     'dayShiftRatio', 'nightShiftRatio', 'weeklyHours', 'overtimePolicy'],
  dialysis:   ['dialysisType','hdRatio',       'batchShift',      'weeklyHours', 'overtimePolicy'],
  er:         ['erLevel',     'criticalRatio', 'violenceFreq',    'weeklyHours', 'overtimePolicy'],
  ward:       ['wardType',    'dayShiftRatio', 'nightShiftRatio', 'leaderSupport','weeklyHours'],
  outpatient: ['clinicType',  'registrationPerSession', 'staffPerClinic','weeklyHours', 'overtimePolicy'],
  or:         ['orSpecialty', 'orRole',        'dailyCases',      'weeklyHours', 'overtimePolicy'],
  special:    ['specialType', 'dailyCases',    'onCallRequired',  'weeklyHours', 'overtimePolicy'],
  other:      ['workplaceType','scheduleSystem','violenceRisk',   'weeklyHours', 'overtimePolicy'],
};

const REC_LABEL = { 5: '非常推薦', 4: '推薦', 3: '保留', 2: '不推薦', 1: '非常不推薦' };
const REC_COLOR = { 5: '#06A77D', 4: '#2E86AB', 3: '#F4A261', 2: '#E63946', 1: '#991B1B' };
const REC_BG    = { 5: 'rgba(6,167,125,0.10)', 4: 'rgba(46,134,171,0.10)',
                    3: 'rgba(244,162,97,0.12)', 2: 'rgba(230,57,70,0.10)',
                    1: 'rgba(153,27,27,0.12)' };

const MAX_COMMENT_LENGTH = 200;
function truncateComment(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (t.length <= MAX_COMMENT_LENGTH) return t;
  return t.slice(0, MAX_COMMENT_LENGTH) + '…';
}

function buildShareCardHTML(row) {
  const cat = getCategory(row._category);
  const fields = SHARE_FIELDS[row._category] || [];
  const recIdx = Number(row.recommendIndex);
  const recLabel = REC_LABEL[recIdx] || '—';
  const recColor = REC_COLOR[recIdx] || '#6B7C93';
  const recBg    = REC_BG[recIdx]    || 'rgba(107,124,147,0.10)';
  const commentText = truncateComment(row.comment);
  const commentTruncated = row.comment && row.comment.length > MAX_COMMENT_LENGTH;

  const dataRows = fields.map((k, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;${i === fields.length - 1 ? '' : 'border-bottom:1px solid #E5E9F0;'}">
      <span style="color:#6B7C93;font-size:28px;letter-spacing:0.01em;">${KEY_LABELS[k] || k}</span>
      <span style="color:#1D3557;font-weight:600;font-size:30px;">${row[k] || '—'}</span>
    </div>
  `).join('');

  const subtitle = [row.institutionType, row.location, row.jobTitle]
    .filter(Boolean).join(' · ');

  return `
    <div id="share-card-root" style="
      width:1080px;height:1350px;
      background:linear-gradient(180deg, #F1FAEE 0%, #FFFFFF 60%, #F1FAEE 100%);
      padding:56px 60px 64px;
      box-sizing:border-box;
      font-family:'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
      color:#1D3557;
      position:relative;
      overflow:hidden;
    ">
      <!-- 背景裝飾圓 -->
      <div style="position:absolute;top:-150px;right:-150px;width:480px;height:480px;border-radius:50%;background:${cat.color}1a;"></div>
      <div style="position:absolute;bottom:-200px;left:-200px;width:560px;height:560px;border-radius:50%;background:#A8DADC33;"></div>

      <div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column;">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg, #2E86AB 0%, #A8DADC 100%);display:flex;align-items:center;justify-content:center;">
            <svg width="46" height="46" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 20.6 c-5.6 -3.8 -9.2 -8.2 -9.2 -13.0 a4.6 4.6 0 0 1 9.2 -1 a4.6 4.6 0 0 1 9.2 1 c0 4.8 -3.6 9.2 -9.2 13.0 z" fill="white"/>
              <path d="M5.6 10.2 h3.4 l1.4 -2.6 l2.4 5.2 l1.4 -3.2 h5.6" stroke="#E63946" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>
          <div>
            <div style="font-weight:700;font-size:28px;letter-spacing:0.02em;">護理職場透明化運動</div>
            <div style="font-size:18px;color:#6B7C93;margin-top:2px;">一筆真實的職場分享</div>
          </div>
        </div>

        <!-- Category tag -->
        <div style="display:inline-flex;align-self:flex-start;background:${cat.color};color:white;padding:8px 20px;border-radius:999px;font-size:24px;font-weight:600;margin-bottom:18px;letter-spacing:0.02em;">
          ${cat.name}
        </div>

        <!-- Institution name -->
        <h1 style="font-family:'Lora','Noto Serif TC',serif;font-size:56px;font-weight:700;margin:0 0 6px;line-height:1.15;letter-spacing:-0.01em;">
          ${row.institutionName || '匿名機構'}
        </h1>
        ${row.unitName ? `<div style="font-size:28px;color:#1D3557;font-weight:600;margin-bottom:8px;line-height:1.3;">${row.unitName}</div>` : ''}
        <div style="font-size:22px;color:#6B7C93;margin-bottom:20px;line-height:1.5;">
          ${subtitle || '—'}
        </div>

        <!-- Recommend index card -->
        <div style="display:flex;align-items:center;justify-content:space-between;background:${recBg};border:2px solid ${recColor};padding:18px 28px;border-radius:18px;margin-bottom:20px;">
          <div>
            <div style="font-size:20px;color:#6B7C93;margin-bottom:4px;letter-spacing:0.02em;">整體推薦指數</div>
            <div style="font-size:38px;font-weight:700;color:${recColor};">${recLabel}</div>
          </div>
          <div style="font-family:'Lora',serif;font-size:68px;font-weight:700;color:${recColor};line-height:1;">
            ${recIdx ? recIdx + '<span style="font-size:30px;color:#6B7C93;">/5</span>' : '—'}
          </div>
        </div>

        <!-- Key data rows -->
        <div style="background:#FFFFFFcc;border-radius:14px;padding:2px 24px;margin-bottom:18px;">
          ${dataRows}
        </div>

        <!-- Comment (optional, max 200 chars) -->
        ${commentText ? `
          <div style="background:#A8DADC2e;border-left:6px solid ${cat.color};padding:16px 22px;border-radius:8px;margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <div style="font-size:18px;color:#6B7C93;letter-spacing:0.02em;">分享者短評</div>
              ${commentTruncated ? `<div style="font-size:14px;color:#6B7C93;">已顯示前 ${MAX_COMMENT_LENGTH} 字</div>` : ''}
            </div>
            <div style="font-size:22px;line-height:1.55;color:#1D3557;font-weight:500;">${commentText}</div>
          </div>` : ''}

        <!-- Footer -->
        <div style="margin-top:auto;padding-top:20px;border-top:1px solid ${cat.color}33;text-align:center;">
          <div style="font-size:18px;color:#6B7C93;letter-spacing:0.02em;">
            ${row.timestamp ? '填寫於 ' + row.timestamp : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

// html2canvas lazy load —— 使用者按「產生分享圖」時才下載 (~100KB)
const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let _html2canvasLoading = null;
function loadHtml2Canvas() {
  if (typeof window !== 'undefined' && window.html2canvas) return Promise.resolve(window.html2canvas);
  if (_html2canvasLoading) return _html2canvasLoading;
  _html2canvasLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML2CANVAS_CDN;
    s.async = true;
    s.onload = () => window.html2canvas
      ? resolve(window.html2canvas)
      : reject(new Error('html2canvas 載入後仍找不到全域變數'));
    s.onerror = () => reject(new Error('html2canvas CDN 載入失敗'));
    document.head.appendChild(s);
  });
  return _html2canvasLoading;
}

/** 產生分享圖片，回傳 { blob, dataUrl } */
export async function generateShareCard(row) {
  // 延遲載入 html2canvas（首次按下才下載）
  const html2canvas = await loadHtml2Canvas();

  // 等字型載入完成
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }

  // 注入卡片到 DOM（offscreen）
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:0;left:-99999px;z-index:-1;pointer-events:none;';
  wrapper.innerHTML = buildShareCardHTML(row);
  document.body.appendChild(wrapper);

  try {
    const node = wrapper.querySelector('#share-card-root');
    const canvas = await html2canvas(node, {
      scale: 2,             // retina
      useCORS: true,
      backgroundColor: '#F1FAEE',
      logging: false,
      width: 1080,
      height: 1350,
      windowWidth: 1080,
      windowHeight: 1350,
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    const dataUrl = canvas.toDataURL('image/png');
    return { blob, dataUrl };
  } finally {
    document.body.removeChild(wrapper);
  }
}

/** 顯示預覽 modal（下載 / 複製 / 關閉） */
export function showSharePreview(blob, dataUrl, filename) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.style.zIndex = '200';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">分享圖片已生成</h3>
          <div style="color:var(--muted);font-size:0.9rem;margin-top:4px;">
            可直接下載或複製，分享到 Instagram、LINE、Threads
          </div>
        </div>
        <button class="modal-close" aria-label="關閉">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
      <img src="${dataUrl}" alt="分享圖片預覽"
        style="width:100%;border-radius:12px;box-shadow:0 8px 32px rgba(29,53,87,0.15);display:block;" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;">
        <button id="share-download" class="btn btn-primary">下載 PNG</button>
        <button id="share-copy" class="btn btn-secondary">複製到剪貼簿</button>
      </div>
      <div id="share-status" style="margin-top:12px;text-align:center;font-size:0.88rem;min-height:1.3em;color:var(--success);"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  const status = modal.querySelector('#share-status');

  modal.querySelector('#share-download').addEventListener('click', () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.style.color = 'var(--success)';
    status.textContent = '✓ 圖片已下載到「下載」資料夾';
  });

  modal.querySelector('#share-copy').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('不支援');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      status.style.color = 'var(--success)';
      status.textContent = '✓ 已複製，可直接貼到 LINE / FB / IG DM';
    } catch (e) {
      status.style.color = 'var(--danger)';
      status.textContent = '此瀏覽器不支援複製圖片，請改用下載';
    }
  });
}
