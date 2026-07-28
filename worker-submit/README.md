# tn-submit — 表單提交防護代理

前端 →（帶 Turnstile token）→ 本 Worker → ①驗 Turnstile ②每 IP 每日限流 ③內容檢查
→ 帶 shared secret 轉發 Apps Script（寫 Google Sheet）。獨立部署，不走 GitHub Pages。

- `src/index.js` — Worker（`/submit`）
- `schema.sql` — D1 限流表（`sub_rate`，只存雜湊）
- `../apps-script/submit.gs` — Apps Script 範本（寫 Sheet）

防護對應本專案「反垃圾」分層的 ①②（③ honeypot＋耗時已在前端 `js/form-engine.js`）。

## 你需要先準備

1. **Turnstile**（Cloudflare Dashboard → Turnstile → 新增網站，網域 `ycchou.github.io`）
   - Site Key（公開，之後嵌前端）
   - Secret Key（機密，設為 Worker secret `TURNSTILE_SECRET`）
2. **Google Sheet**：建一個試算表，記下網址中的 SHEET_ID。
3. **一組隨機 shared secret**（自行產生，例如 `openssl rand -hex 24`）。

## 部署 Apps Script

1. 開一個新的 Apps Script 專案，把 `../apps-script/submit.gs` 貼進去。
2. 填 `SHEET_ID`、`SHARED_SECRET`（用上面第 3 步那組）。
3. 部署 → 新增部署作業 → 網頁應用程式；執行身分「我」、存取權「任何人」→ 取得 `/exec` 網址。

## 部署 Worker

> 沒有全域 `wrangler` 就把下列 `wrangler` 換成 `npx wrangler`。

```bash
wrangler login
wrangler d1 create tn-submit           # 把回傳的 database_id 填進 wrangler.toml
cd worker-submit
wrangler d1 execute tn-submit --remote --file=schema.sql

# 設定機密（不進版控）
echo -n '<Turnstile Secret Key>'        | wrangler secret put TURNSTILE_SECRET
echo -n '<Apps Script /exec 網址>'       | wrangler secret put APPS_SCRIPT_URL
echo -n '<上面那組 shared secret>'       | wrangler secret put APPS_SCRIPT_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" | wrangler secret put SALT

wrangler deploy                         # 取得 https://tn-submit.<子網域>.workers.dev
```

## 前端接線（拿到 Site Key 與 Worker 網址後，我來做）

1. 各 `participate-*.html` 載入 Turnstile script、放一個 widget、把 Site Key 填上。
2. `js/form-engine.js` 送出時附上 `cf-turnstile-response` token，`submitEndpoint` 指向 `https://tn-submit.<子網域>.workers.dev/submit`。
3. 跑 `python tools/stamp-assets.py` 破快取後 push。

## 可調參數（`src/index.js` 頂部）

- `CAP_PER_IP_PER_DAY`：單 IP 每日提交上限（預設 20）。
- `MAX_LINKS`：自由文字允許的連結數（預設 0＝不允許）。
- `ALLOWED_ORIGINS`：允許的來源網域。

## 驗證

```bash
# 缺 token 應回 403（captcha）
curl -X POST https://tn-submit.<子網域>.workers.dev/submit \
  -H 'Origin: https://ycchou.github.io' -d 'foo=bar'
```
