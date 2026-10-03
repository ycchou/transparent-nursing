// follows-page.js — 「我的追蹤」頁（follows.html）：推播狀態、追蹤清單（逐家切換通知類型）、刪除訂閱資料。

import { icon } from './icons.js?v=56fb7c03b7';
import { showToast } from './toast.js?v=56fb7c03b7';
import { escapeHtml } from './moderation.js?v=56fb7c03b7';
import {
  getFollows, pushStatus, guideToInstall, setKinds, unfollowHospital, deleteAll, healthCheck,
  KIND_LABELS, ALL_KINDS,
} from './follow.js?v=56fb7c03b7';

function renderStatus() {
  const box = document.getElementById('follow-status');
  const n = Object.keys(getFollows()).length;
  const status = pushStatus();
  const perm = 'Notification' in window ? Notification.permission : 'default';

  let cls = '', ico = 'bell', title, text, action = '';
  if (status === 'browser') {
    cls = 'is-warn';
    title = '先把網站加到主畫面';
    text = '推播通知只能送到安裝好的 App。安裝後從主畫面打開「護理職場」，到機構總覽選醫院按「追蹤」。已經安裝過的話，直接從主畫面打開即可。';
    action = `<button type="button" class="btn btn-primary" data-act="install">${icon('download', { size: 16 })} 看安裝教學</button>`;
  } else if (status === 'unsupported') {
    cls = 'is-warn'; ico = 'bell-off';
    title = '這個裝置不支援推播通知';
    text = 'iPhone／iPad 需要 iOS 16.4 以上；其他裝置請改用最新版 Chrome、Edge、Firefox 或 Safari。';
  } else if (status === 'unconfigured') {
    cls = 'is-warn';
    title = '推播通知即將開放';
    text = '功能還在準備中，開放後就能在這裡追蹤醫院。';
  } else if (status === 'denied') {
    cls = 'is-warn'; ico = 'bell-off';
    title = '通知權限已被關閉';
    text = '請到手機或電腦的系統設定 → 通知，允許「護理職場」，再回到這一頁。';
  } else if (n && perm !== 'granted') {
    cls = 'is-warn'; ico = 'bell-off';
    title = '通知尚未開啟';
    text = `你追蹤了 ${n} 家醫院，但這台裝置還沒允許通知。`;
    action = `<button type="button" class="btn btn-primary" data-act="permit">${icon('bell', { size: 16 })} 開啟通知</button>`;
  } else if (n) {
    cls = 'is-ok';
    title = `通知已開啟・追蹤 ${n} 家醫院`;
    text = '有更新時會推播到這台裝置。分享在送出後立即通知；財報與護病比在平台更新資料時通知。';
  } else {
    title = '還沒有追蹤醫院';
    text = '到機構總覽選一家醫院，按名稱旁的「追蹤」，第一次會詢問是否允許通知。';
    action = `<a class="btn btn-primary" href="hospital.html">${icon('building', { size: 16 })} 前往機構總覽</a>`;
  }

  box.innerHTML = `<div class="follow-status ${cls}">
      <span class="follow-status-icon">${icon(ico, { size: 20 })}</span>
      <div><h2>${title}</h2><p>${text}</p>${action}</div>
    </div>`;
  box.querySelector('[data-act="install"]')?.addEventListener('click', () => guideToInstall());
  box.querySelector('[data-act="permit"]')?.addEventListener('click', async () => {
    const p = await Notification.requestPermission();
    if (p === 'granted') { await healthCheck(); showToast('通知已開啟', 'info'); }
    render();
  });
}

function renderList() {
  const list = document.getElementById('follow-list');
  const follows = getFollows();
  const entries = Object.entries(follows).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  document.getElementById('follow-empty').hidden = entries.length > 0;
  list.innerHTML = entries.map(([code, f]) => {
    const kinds = f.kinds || ALL_KINDS;
    const chips = Object.entries(KIND_LABELS).map(([k, label]) =>
      `<button type="button" class="follow-kind" data-code="${code}" data-kind="${k}" aria-pressed="${kinds.includes(k)}">${label}</button>`).join('');
    return `<li class="follow-item">
        <a class="follow-item-name" href="hospital.html?code=${encodeURIComponent(code)}">${escapeHtml(f.name || code)}</a>
        <div class="follow-item-actions">${chips}
          <button type="button" class="follow-unfollow" data-code="${code}">取消追蹤</button>
        </div>
      </li>`;
  }).join('');
}

function render() {
  renderStatus();
  renderList();
}

function wire() {
  const list = document.getElementById('follow-list');
  list.addEventListener('click', async (e) => {
    const chip = e.target.closest('.follow-kind');
    const un = e.target.closest('.follow-unfollow');
    if (chip) {
      const { code, kind } = chip.dataset;
      const cur = (getFollows()[code] || {}).kinds || ALL_KINDS;
      const next = cur.includes(kind) ? cur.replace(kind, '') : [...cur, kind].sort().join('');
      if (!next) { showToast('至少保留一種通知；不想收的話請按「取消追蹤」', 'warn'); return; }
      chip.disabled = true;
      await setKinds(code, next);
      render();
    } else if (un) {
      const name = (getFollows()[un.dataset.code] || {}).name || '';
      un.disabled = true;
      await unfollowHospital(un.dataset.code);
      showToast(`已取消追蹤${name}`, 'info');
      render();
    }
  });

  // 刪除全部：按兩次才執行（不用瀏覽器 confirm 對話框）
  const del = document.getElementById('follow-delete-all');
  let armed = null;
  del.addEventListener('click', async () => {
    if (!armed) {
      del.classList.add('is-armed');
      del.textContent = '再按一次確認刪除';
      armed = setTimeout(() => { armed = null; del.classList.remove('is-armed'); del.textContent = '刪除這台裝置的追蹤與訂閱資料'; }, 4000);
      return;
    }
    clearTimeout(armed); armed = null;
    del.disabled = true;
    const ok = await deleteAll();
    del.disabled = false;
    del.classList.remove('is-armed');
    del.textContent = '刪除這台裝置的追蹤與訂閱資料';
    showToast(ok ? '已刪除這台裝置的追蹤與伺服器上的訂閱資料' : '本機已清除，但伺服器刪除失敗，連上網路後重開此頁會再試一次', ok ? 'info' : 'warn');
    render();
  });

  window.addEventListener('tn:follows-changed', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStatus(); });
}

export function initFollowsPage() {
  wire();
  render();
}
