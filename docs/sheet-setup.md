# 投稿管線接線指南

從「表單送出」到「網站讀到」的完整一條線，以及正式／測試資料的開關。

```
表單 ──► tn-submit Worker ──► Apps Script ──► Google Sheet ──► 發布 CSV ──► 網站
        Turnstile/限流/AI審稿    分類別寫分頁                      js/env.js
```

程式碼已經全部接好，剩下的都是「開帳號、拿網址、填進 `js/env.js`」。

---

## 開關：正式版 vs 測試資料

全站只有 **`js/env.js`** 這一個開關：

```js
export const MODE = 'mock';   // 'mock' | 'live'
```

| | `mock`（預設） | `live` |
|---|---|---|
| 分享平台讀的資料 | `data/mock/*.csv`（假資料） | `LIVE.csvUrls` 的 Google Sheet CSV |
| 表單送出 | 只 `console.log`，不寫任何地方 | 真的送到 tn-submit Worker |

**臨時切換不必改檔**：網址加 `?data=live` 或 `?data=mock`，該分頁內持續有效（記在 sessionStorage），
關掉分頁就恢復預設，右下角會出現一個小標記提醒你正在看哪一份資料。
正式站上線後想確認假資料長相，或上線前想先偷看真實資料，都用這個。

兩種資料的 localStorage cache 是分開的，切換不會讀到另一邊的殘留。

**保險絲**：`MODE = 'live'` 但 `LIVE` 什麼都沒填 → 自動退回 mock 並在 console 警告；
個別類別沒填 CSV → 只有該類別退回測試資料。不會出現空白頁面。

---

## Step 1：建 Google Sheet

建一份試算表就好（不必一個類別一份），記下網址 `/d/<這段>/edit` 的 SHEET_ID。

分頁會自動長出來，不用先建：

| 分頁 | 內容 | 要發布嗎 |
|---|---|---|
| `sub_icu`、`sub_ward`… | 各類別的投稿，欄位隨投稿自動增長 | **要**，每個分頁各發布一條 CSV |
| `audit` | AI 審稿的理由原文 | **不要**，這是內部複查用 |

## Step 2：部署 Apps Script

1. 新建 Apps Script 專案，把 `apps-script/submit.gs` 整份貼進去
2. 填最上面的 `SHEET_ID`、`SHARED_SECRET`（自己產一組隨機字串，等下 Worker 要用同一組）
3. 部署 → 新增部署作業 → 網頁應用程式；執行身分「我」、存取權「任何人」→ 取得 `/exec` 網址

> 改過 `submit.gs` 之後要「管理部署作業 → 編輯 → 版本：新版本」才會生效，
> 只存檔不會更新線上版本。

## Step 3：Turnstile

Cloudflare Dashboard → Turnstile → 新增網站，網域填 `ycchou.github.io`，拿到：
- **Site Key**（公開）
- **Secret Key**（機密）

> 註：目前表單用的是站內自製驗證碼，Turnstile 的前端 widget 還沒掛上。
> Worker 端的 Turnstile 驗證是開著的，所以在掛上 widget 之前，
> **live 模式的送出會被 Worker 以 `captcha` 擋掉**。兩條路選一條：
> (a) 先掛 widget 再開 live；(b) 暫時把 Worker 的 ① Turnstile 檢查跳過。

## Step 4：部署 Worker

```bash
cd worker-submit
npx wrangler d1 create tn-submit        # 把回傳的 database_id 填回 wrangler.toml
npx wrangler d1 execute tn-submit --remote --file=schema.sql

echo -n '<Turnstile Secret Key>'     | npx wrangler secret put TURNSTILE_SECRET
echo -n '<Apps Script /exec 網址>'    | npx wrangler secret put APPS_SCRIPT_URL
echo -n '<Step 2 那組 shared secret>' | npx wrangler secret put APPS_SCRIPT_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" | npx wrangler secret put SALT
echo -n '<Google AI Studio API key>' | npx wrangler secret put GEMINI_API_KEY   # AI 審稿；不設＝關閉

npx wrangler deploy                     # 取得 https://tn-submit.<子網域>.workers.dev
```

## Step 5：先讓表單寫得進去

把 Worker 網址填進 `js/env.js`：

```js
export const LIVE = {
  submitEndpoint: 'https://tn-submit.<子網域>.workers.dev/submit',
  ...
};
```

把 `MODE` 改成 `'live'`，跑 `python tools/stamp-assets.py` 後 push。
送一筆測試投稿，確認 Sheet 的 `sub_<類別>` 分頁真的長出資料列。

> 這時分享平台仍讀測試資料（`csvUrls` 還沒填），不會影響線上瀏覽。

## Step 6：把 Sheet 發布成 CSV

每個 `sub_<類別>` 分頁各做一次：

1. 檔案 → 共用 → 發布到網路
2. 左側選該分頁，右側格式選 **逗號分隔值 (.csv)**
3. 勾「自動重新發布變更內容」→ 發布，複製連結

填進 `js/env.js`：

```js
csvUrls: {
  icu: 'https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv',
  ward: '...',
  // 沒開放投稿的類別留空即可，會自動用測試資料
},
```

跑 `python tools/stamp-assets.py` 後 push，分享平台就吃真實資料了。

**欄位對齊**：`js/data-loader.js` 認 CSV 的 header 名稱，而 `submit.gs` 寫進去的 header
就是表單欄位的 `name`（與 `js/config.js` 的 `key` 同名），所以不需要額外做 mapping。
`timestamp` 由 Apps Script 以 `yyyy-MM-dd HH:mm` 寫入，與前端解析格式一致。

**發布 ≠ 公開檔案**：發布後任何人只能透過 CSV URL 讀，不能編輯；試算表本身的權限不用改。
`audit` 分頁不要發布。

---

## 上線檢查表

- [ ] Sheet 的 `sub_*` 分頁有資料，`audit` 分頁有審稿紀錄
- [ ] `audit` 分頁**沒有**被發布
- [ ] `js/env.js`：`MODE = 'live'`、`submitEndpoint` 已填、要開放的類別 `csvUrls` 已填
- [ ] Turnstile widget 已掛上（或已確認 Worker 的 ① 檢查處置方式）
- [ ] 跑過 `python tools/stamp-assets.py`
- [ ] 網址加 `?data=mock` 確認還能切回測試資料
- [ ] 送一筆含人名的測試投稿，確認短評在平台上被打上馬賽克（見 `docs/moderation.md`）

## 個資注意

表單不要收 email、IP、Google 帳號。若用 Google Form 當備援入口，
記得在「設定 → 回應」關閉「收集電子郵件地址」與「限制每人回覆 1 次」。

## Troubleshooting

**送出回 `captcha`** — Turnstile widget 還沒掛上，見 Step 3。

**送出回 `upstream`** — Apps Script 那邊出錯：多半是 `SHARED_SECRET` 兩邊不一致，
或改完 `submit.gs` 忘了發布新版本。

**Sheet 有資料但網站看不到** — CSV 連結沒填進 `csvUrls`、或 `MODE` 還是 `mock`、
或前端 cache 未過期（10 分鐘，或換個 `?data=` 強制切）。

**CSV 被截斷** — 發布 CSV 預設有欄位/列數上限，資料量大時改用 Apps Script 寫 endpoint 較穩。

**短評沒有被打馬賽克** — 確認該分頁的 CSV 有 `modVerdict`、`modCode` 兩欄，
以及 Worker 的 `GEMINI_API_KEY` 有設（沒設時審稿整段跳過，一律 allow）。
