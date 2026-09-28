#!/usr/bin/env node
/*
 * 冒煙測試：用 headless Chrome 開每一頁與互動情境（手機＋桌機），確認網站「活著」：
 *   · 沒有未捕捉的 JS 例外、沒有 console.error
 *   · 本站資源沒有 404（例如 build-site.py 白名單漏檔、檔名打錯）
 *   · 共用外框在：header；手機版非表單頁有底部導覽列
 *   · 各頁的主要內容真的有畫出來（PAGE_EXPECT／情境的 expect）
 *
 * 用法：
 *   node tools/smoke-test.mjs            # 測 repo 根目錄
 *   node tools/smoke-test.mjs _site      # 測部署內容（CI 用這個）
 * 全部通過 exit 0；有失敗 exit 1 並列出原因。
 */
import path from 'node:path';
import { REPO, VIEWPORTS, openSession, targets } from './lib/headless.mjs';

const ROOT = path.resolve(REPO, process.argv[2] || '.');

// 各頁一定要出現的元素（選擇器：至少一個）。沒列的頁面只做通用檢查。
const PAGE_EXPECT = {
  index: '.category-card, .cat-card',
  platform: '#calc-trigger',
  stats: '#stats-tab-user canvas',
  records: '.viol-row',
  hospital: '#city-filter .nurse-city-filter',
  'nurse-ratio': '.nurse-hospital-chip',
  personnel: '#city-filter .nurse-city-filter',
  financials: '.fin-table tbody tr',
  participate: '.form-card',
  'participate-icu': '.dform-section',
  'participate-clinic': '.dform-section',
  'participate-dialysis': '.dform-section',
  'participate-outpatient': '.dform-section',
  'participate-other': '.dform-section',
  'participate-psych': '.dform-section',
  'participate-ward': '.dform-section',
  support: '.donate-tier',
};
const NO_SHELL = new Set(['coming-soon']);                 // 刻意不掛 header／導覽列的頁面
const isFormPage = (name) => /^participate-/.test(name);   // 表單頁不掛底部導覽列

const failures = [];
const s = await openSession({ root: ROOT });
let n = 0;
const all = targets(ROOT);
try {
  for (const vp of VIEWPORTS) {
    await s.setViewport(vp);
    for (const t of all) {
      const where = `${t.name}@${vp.name}`;
      const fail = (msg) => failures.push(`${where}：${msg}`);
      let page;
      try {
        page = await s.load(t);
      } catch (e) {
        fail(`載入失敗 ${e.message}`);
        continue;
      }
      page.errors.forEach(fail);
      const base = t.name.split('~')[0];
      const checks = await s.evaluate(`(() => ({
        header: !!document.querySelector('.site-header'),
        bottomNav: !!document.querySelector('.bottom-nav'),
        text: document.body.innerText.trim().length,
        loadFailed: /資料載入失敗|載入失敗：/.test(document.body.innerText),
        expect: ${JSON.stringify(t.expect || PAGE_EXPECT[t.name] || '')} ? !!document.querySelector(${JSON.stringify(t.expect || PAGE_EXPECT[t.name] || 'body')}) : true,
      }))()`);
      if (!NO_SHELL.has(base)) {
        if (!checks.header) fail('沒有 header');
        if (vp.mobile && !isFormPage(base) && !checks.bottomNav) fail('手機版沒有底部導覽列');
      }
      if (checks.text < 80) fail(`頁面幾乎沒有內容（${checks.text} 字）`);
      if (checks.loadFailed) fail('頁面顯示「載入失敗」');
      if (!checks.expect) fail(`找不到主要內容 ${t.expect || PAGE_EXPECT[t.name]}`);
      n++;
      process.stdout.write(`\r冒煙測試 ${n}/${all.length * VIEWPORTS.length}  ${where}        `);
    }
  }
} finally {
  await s.close();
}
for (const [u, where] of s.missing) failures.push(`${where}：本站資源找不到 ${u}`);

console.log('');
if (failures.length) {
  console.log(`✘ 冒煙測試失敗（${failures.length} 項）：`);
  failures.forEach((f) => console.log('   ' + f));
  process.exit(1);
}
console.log(`✔ 冒煙測試通過：${all.length} 個頁面／情境 × ${VIEWPORTS.length} 種尺寸，無錯誤、無 404`);
process.exit(0);
