#!/usr/bin/env node
/*
 * 互動流程測試（手機尺寸）：模擬使用者操作主要功能，確認每一步都有正確反應。
 * 冒煙測試只確認頁面「打得開」；這裡確認「點了會動」——重構或拆模組時，
 * 沒被執行到的程式路徑（例如某個分頁、表單送出）出錯也抓得到。
 *
 *   · 違規紀錄：篩選地點 → 筆數改變；下一頁 → 列表換頁；點一筆 → 詳情彈窗開關
 *   · 機構總覽：用網址開一家醫院 → 五個分頁逐一切換都有內容
 *   · 護病比：縣市／層級／合規篩選 → 醫院清單跟著變
 *   · 機構名稱自動完成：選醫學中心＋地點 → 點欄位開出醫院選單 → 搜尋、點選帶入院名；
 *     類別點錯時以系統記載的層級為準；只選類別（未選縣市）也能開選單，點選後自動帶入縣市
 *   · 填寫表單：空白送出 → 標出錯誤；填完＋同意＋驗證碼 → 送出（測試模式）→ 感謝畫面；
 *     另測草稿：填一欄後重新整理 → 出現「繼續填寫」提示
 *   · 底部導覽列：打開「資料查詢」→ 點護病比 → 換到護病比頁
 *
 * 用法：node tools/e2e-test.mjs [網站根目錄，預設 repo 根目錄]
 * 全部通過 exit 0；失敗 exit 1 並列出哪一步出錯。
 */
import path from 'node:path';
import { REPO, VIEWPORTS, openSession } from './lib/headless.mjs';

const ROOT = path.resolve(REPO, process.argv[2] || '.');
const HOSP = '1132070011';

// 在頁面裡執行的小工具
const H = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const visible = (el) => !!el && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const waitFor = async (fn, ms = 10000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(100); }
    return null;
  };
  const fails = [];
  const expect = (cond, msg) => { if (!cond) fails.push(msg); return cond; };`;

const FLOWS = [
  {
    name: '違規紀錄',
    url: 'records.html',
    run: `
      await waitFor(() => $$('.viol-row').length);
      const count0 = $('#records-count')?.textContent;
      const first0 = $('.viol-row')?.dataset.id;
      expect($$('.viol-row').length > 0, '列表沒有資料');
      const chip = $$('#records-loc-filter .filter-chip')[1];
      if (expect(chip, '找不到地點篩選 chip')) {
        const slug = chip.dataset.slug;
        chip.click();
        await wait(400);
        expect($('#records-count')?.textContent !== count0, '篩選地點後筆數沒有改變');
        // chip 會重新產生，要重新找
        expect($('#records-loc-filter .filter-chip[data-slug="' + slug + '"]')?.classList.contains('active'), '篩選 chip 沒有變成選取狀態');
        $$('#records-loc-filter .filter-chip')[0].click();   // 還原「全部」
        await wait(400);
      }
      const next = $('.pg-next');
      if (expect(next && !next.disabled, '沒有下一頁按鈕')) {
        next.click();
        await wait(400);
        expect($('.viol-row')?.dataset.id !== first0, '按下一頁後列表沒有換頁');
      }
      $('.viol-row')?.click();
      const modal = await waitFor(() => { const m = $('.viol-detail-modal'); return visible(m) && m; });
      if (expect(modal, '點一筆紀錄沒有開出詳情彈窗')) {
        expect(modal.textContent.length > 50, '詳情彈窗沒有內容');
        (modal.querySelector('.modal-close') || modal.parentElement.querySelector('.modal-close'))?.click();
        await wait(400);
        expect(!visible($('.viol-detail-modal')), '詳情彈窗關不掉');
      }
      return fails;`,
  },
  {
    name: '機構總覽',
    url: `hospital.html?code=${HOSP}`,
    run: `
      await waitFor(() => visible($('#hospital-detail')));
      expect(/長庚/.test($('#hospital-detail')?.textContent || ''), '醫院標頭沒有顯示院名');
      for (const tab of ['nr', 'fi', 'pm', 'pf', 'vi']) {
        const btn = $('#hosp-tabs [data-tab="' + tab + '"]');
        if (!expect(btn, '找不到頁簽 ' + tab)) continue;
        btn.click();
        const panel = $('.hosp-tab-panel[data-panel="' + tab + '"]');
        const ok = await waitFor(() => visible(panel) && (panel.querySelector('canvas, table, .viol-row, .record-card, .card, li') || panel.textContent.trim().length > 40));
        expect(ok, '頁簽 ' + tab + ' 切換後沒有內容');
        expect(btn.classList.contains('active'), '頁簽 ' + tab + ' 沒有變成選取狀態');
      }
      return fails;`,
  },
  {
    name: '護病比篩選',
    url: 'nurse-ratio.html',
    run: `
      await waitFor(() => $$('.nurse-hospital-chip').length);
      const n0 = $$('.nurse-hospital-chip').length;
      $$('.nurse-city-filter')[1]?.click(); await wait(300);
      const n1 = $$('.nurse-hospital-chip').length;
      expect(n1 > 0 && n1 < n0, '縣市篩選後清單沒有變少（' + n0 + ' → ' + n1 + '）');
      $('.nurse-level-filter[data-level="醫學中心"]')?.click(); await wait(300);
      const n2 = $$('.nurse-hospital-chip').length;
      expect(n2 <= n1, '層級篩選後清單沒有變少');
      $('.nurse-city-filter[data-city="all"]')?.click();
      $('.nurse-compliance-filter[data-compliance="C"]')?.click(); await wait(300);
      expect($$('.nurse-hospital-chip').length > 0, '合規篩選後沒有醫院');
      expect($('.nurse-compliance-filter[data-compliance="C"]')?.classList.contains('active'), '合規 chip 沒有變成選取狀態');
      return fails;`,
  },
  {
    name: '填寫表單',
    url: 'participate-icu.html',
    run: `
      await waitFor(() => $$('.dform-field').length);
      window.__advanceClock(61000);   // 跳過「填寫少於 1 分鐘」的防濫用門檻（它在欄位驗證之前）
      $('.dform-submit-btn').click();
      await wait(300);
      expect($$('.dform-field.has-error').length > 0, '空白送出沒有標出錯誤欄位');
      // 填完所有必填欄位
      for (const f of $$('.dform-field[data-required="1"]')) {
        if (f.dataset.name === 'captcha') continue;
        const radio = f.querySelector('input[type=radio]');
        const box = f.querySelector('input[type=checkbox]');
        const sel = f.querySelector('select');
        const txt = f.querySelector('input[type=text], input[type=number], input:not([type]), textarea');
        if (radio) radio.click();
        else if (box) box.click();
        else if (sel) { sel.selectedIndex = Math.min(1, sel.options.length - 1); sel.dispatchEvent(new Event('change', { bubbles: true })); }
        else if (txt) { txt.value = txt.type === 'number' ? '3' : '測試'; txt.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      $$('input[data-consent="1"]').forEach((c) => { if (!c.checked) c.click(); });
      const cap = $$('.dform-captcha-char').map((e) => e.textContent).join('');
      const capInput = $('#captcha-input');
      if (capInput) { capInput.value = cap; capInput.dispatchEvent(new Event('input', { bubbles: true })); }
      $('.dform-submit-btn').click();
      const thanks = await waitFor(() => visible($('.dform-thanks-modal')) && $('.dform-thanks-modal'));
      expect(thanks, '填完送出後沒有出現感謝畫面（仍有錯誤欄位：' + $$('.dform-field.has-error').map((e) => e.dataset.name).join('、') + '）');
      return fails;`,
  },
  {
    name: '機構名稱自動完成',
    url: 'participate-icu.html',
    run: `
      await waitFor(() => $('#f-institutionName'));
      const lv = $('.dform-field[data-name="institutionType"] input[value="醫學中心"]');
      if (!expect(lv, '找不到機構層級「醫學中心」選項')) return fails;
      lv.click();
      // 手機底部選單要「層級＋地點」都選了才會開
      const loc = $('#f-location');
      if (!expect(loc, '找不到地點欄位')) return fails;
      loc.value = [...loc.options].find((o) => o.value.includes('桃園'))?.value || loc.options[1].value;
      loc.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(200);
      if (!$('.dform-picker-sheet.open')) { $('#f-institutionName').focus(); $('#f-institutionName').click(); }
      $('#f-institutionName').click();
      // 手機：底部選單；桌機：下拉建議
      const sheet = await waitFor(() => $('.dform-picker-sheet.open'));
      if (!expect(sheet, '點機構名稱沒有打開醫院選單')) return fails;
      const search = sheet.querySelector('.dform-picker-search');
      search.value = '長庚'; search.dispatchEvent(new Event('input', { bubbles: true }));
      const item = await waitFor(() => sheet.querySelector('.dform-picker-item'));
      if (!expect(item, '搜尋「長庚」沒有出現醫院')) return fails;
      expect(/長庚/.test(item.textContent), '搜尋結果不含「長庚」');
      const name = item.dataset.name;
      item.click();
      await wait(300);
      expect($('#f-institutionName').value === name, '點選醫院後欄位沒有帶入院名（' + $('#f-institutionName').value + '）');
      // 類別點錯：改成地區醫院後再手動輸入同一個院名 → 機構類別要被更正回系統記載的層級
      const checkedLevel = () => $('input[name="institutionType"]:checked')?.value;
      const wrong = $('.dform-field[data-name="institutionType"] input[value="地區醫院"]');
      wrong.click();
      await wait(300);
      $('.dform-picker-sheet.open .dform-picker-close')?.click();
      await wait(300);
      const nameInput = $('#f-institutionName');
      nameInput.value = name;
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(200);
      expect(checkedLevel() === item.dataset.level, '院名與機構類別不一致時沒有以系統層級為準（' + checkedLevel() + ' ≠ ' + item.dataset.level + '）');
      return fails;`,
  },
  {
    name: '機構名稱：只選類別',
    url: 'participate-psych.html',
    run: `
      await waitFor(() => $('#f-institutionName'));
      // 不選縣市，只選機構類別 → 醫院選單就要打開
      $('.dform-field[data-name="institutionType"] input[value="區域醫院"]').click();
      const sheet = await waitFor(() => $('.dform-picker-sheet.open'));
      if (!expect(sheet, '只選機構類別（未選縣市）沒有打開醫院選單')) return fails;
      const search = sheet.querySelector('.dform-picker-search');
      search.value = '汐止'; search.dispatchEvent(new Event('input', { bubbles: true }));
      const item = await waitFor(() => sheet.querySelector('.dform-picker-item'));
      if (!expect(item, '未選縣市時搜尋「汐止」沒有出現醫院')) return fails;
      item.click();
      await wait(300);
      expect($('#f-institutionName').value === item.dataset.name, '點選醫院後欄位沒有帶入院名');
      expect($('#f-location').value === item.dataset.city.replace(/臺/g, '台'), '點選醫院後沒有自動帶入縣市（' + $('#f-location').value + '）');
      return fails;`,
  },
  {
    name: '表單草稿',
    url: 'participate-icu.html',
    run: `
      await waitFor(() => $$('.dform-field').length);
      // 一般文字欄位（不是單選「其他」的補充欄位 .dform-other-input）
      const txt = $('.dform-field input[type=text][id^="f-"]');
      txt.value = '草稿測試'; txt.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(1500);   // 等自動存草稿（debounce）
      return fails;`,
    reload: true,
    after: `
      const banner = await waitFor(() => $('#draft-restore'));
      expect(banner, '重新整理後沒有出現「繼續填寫草稿」提示');
      return fails;`,
  },
  {
    name: '底部導覽列',
    url: 'hospital.html',
    run: `
      await waitFor(() => $('.bottom-nav [data-sheet="data"]'));
      $('.bottom-nav [data-sheet="data"]').click();
      const sheet = await waitFor(() => $('#bn-sheet.open'));
      expect(sheet, '點「資料查詢」沒有打開選單面板');
      $('#bn-sheet a[href="nurse-ratio.html"]')?.click();
      return fails;`,
    navigatesTo: 'nurse-ratio.html',
  },
];

const failures = [];
const s = await openSession({ root: ROOT });
try {
  await s.setViewport(VIEWPORTS[0]);
  for (const f of FLOWS) {
    const page = await s.load({ name: f.name, url: f.url });
    let fails = (await s.evaluate(`(async () => { ${H} ${f.run} })()`)) || ['流程執行失敗'];
    if (f.reload) {
      // 重新整理但保留 storage（測草稿）：暫時停用「每頁清空 storage」
      await s.evaluate(`sessionStorage.setItem('__keep_storage', '1')`);
      await s.send('Page.reload');
      await new Promise((r) => setTimeout(r, 2500));
      fails = fails.concat((await s.evaluate(`(async () => { ${H} ${f.after} })()`)) || ['流程執行失敗']);
    }
    if (f.navigatesTo) {
      await new Promise((r) => setTimeout(r, 2000));
      const at = await s.evaluate('location.pathname');
      if (!String(at).endsWith(f.navigatesTo)) fails.push(`沒有換到 ${f.navigatesTo}（目前在 ${at}）`);
    }
    fails.push(...page.errors);
    fails.forEach((m) => failures.push(`${f.name}：${m}`));
    console.log(`${fails.length ? '✘' : '✔'} ${f.name}${fails.length ? `（${fails.length} 項）` : ''}`);
  }
} finally {
  await s.close();
}
for (const [u, where] of s.missing) failures.push(`${where}：本站資源找不到 ${u}`);
if (failures.length) {
  console.log(`\n✘ 互動流程測試失敗（${failures.length} 項）：`);
  failures.forEach((m) => console.log('   ' + m));
  process.exit(1);
}
console.log(`\n✔ 互動流程測試通過：${FLOWS.length} 個流程`);
process.exit(0);
