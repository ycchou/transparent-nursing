#!/usr/bin/env node
/*
 * 取得健保署醫院財務資訊查詢的「全部醫院」清單 → data/hospital-financials-list.json
 *
 * RGFE0030S01.aspx 的清單是 ASP.NET WebForms postback（純 HTTP POST 會被導到 BaseError），
 * 故用 headless Chrome 選「分區＝全部、機構層級＝全部」→ 開始查詢，讀取結果列的
 * data-hospid / data-hospfnam(全名) / data-hospnam(簡稱)。dedup 後輸出。
 *
 * 需求：puppeteer-core ＋ 系統 Chrome。
 *   npm i puppeteer-core     （或設 NODE_PATH 指向已安裝 puppeteer-core 的 node_modules）
 *   CHROME_PATH 可覆寫 Chrome 路徑
 * 用法：node tools/fetch-financials-list.js
 */
const fs = require('fs');
const path = require('path');

const URL = 'https://med.nhi.gov.tw/rgfe0000/RGFE0030S01.aspx';
const OUT = path.join(__dirname, '..', 'data', 'hospital-financials-list.json');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error('找不到 puppeteer-core。請先 `npm i puppeteer-core`，或設 NODE_PATH 指向已安裝的 node_modules。');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.select('#cph_ddlGroup', '');      // 分區業務組＝全部
    await page.select('#cph_ddlHostClass', '');  // 機構層級＝全部
    await page.click('#cph_query');              // 開始查詢
    await new Promise((r) => setTimeout(r, 5000));

    const raw = await page.$$eval('[data-hospid]', (els) =>
      els.map((e) => ({
        code: e.getAttribute('data-hospid'),
        full: e.getAttribute('data-hospfnam') || '',
        short: e.getAttribute('data-hospnam') || '',
      })));

    // dedup by code；全名優先、簡稱補齊
    const byCode = new Map();
    for (const r of raw) {
      if (!r.code) continue;
      const prev = byCode.get(r.code) || { code: r.code, name: '', shortName: '' };
      if (r.full && (!prev.name || r.full.length > prev.name.length)) prev.name = r.full;
      if (r.short && !prev.shortName) prev.shortName = r.short;
      byCode.set(r.code, prev);
    }
    const list = [...byCode.values()].map((h) => ({
      code: h.code,
      name: h.name || h.shortName,
      shortName: h.shortName,
    }));

    fs.writeFileSync(OUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: URL,
      count: list.length,
      hospitals: list,
    }, null, 2), 'utf8');
    console.log(`✔ 清單 ${list.length} 家 → ${OUT}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
