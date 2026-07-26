# tn-visits — 首頁匿名訪客計數 Worker

Cloudflare Worker + D1，提供首頁「今日來客 / 累計來客」數字。獨立部署，**不走 GitHub Pages**。

- `src/index.js` — Worker 程式（`/hit`、`/stats`）
- `schema.sql` — D1 資料表（`daily`：日期 + 計數）
- `wrangler.toml` — 設定（部署前需填 `database_id`）

隱私：只存「日期 + 計數」，不記錄 IP／任何可識別個資。UV 去重靠前端 `js/visits.js` 的 localStorage。

## 首次部署

> 若沒有全域 `wrangler`，把下列 `wrangler` 換成 `npx wrangler`。

```bash
# 1) 登入（會在瀏覽器開 OAuth，token 存本機、不進對話）
wrangler login

# 2) 建 D1，並把回傳的 database_id 填進 wrangler.toml
wrangler d1 create tn-visits

# 3) 建表（正式庫）
cd worker
wrangler d1 execute tn-visits --remote --file=schema.sql

# 4) 部署，取得 https://tn-visits.<你的子網域>.workers.dev
wrangler deploy
```

部署後把該網址填進 `js/visits.js` 的 `VISITS_API`，再跑 `python3 tools/stamp-assets.py` 並 push。

## 驗證

```bash
curl -X POST https://tn-visits.<子網域>.workers.dev/hit
curl        https://tn-visits.<子網域>.workers.dev/stats
wrangler d1 execute tn-visits --remote --command "SELECT * FROM daily"
```

## 日常

改完 `src/index.js` 後於 `worker/` 執行 `wrangler deploy` 即重新部署。
