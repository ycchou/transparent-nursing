# tn-visits — 首頁匿名訪客計數 Worker

Cloudflare Worker + D1，提供首頁「今日訪客 / 累積人次」數字。獨立部署，**不走 GitHub Pages**。

- `src/index.js` — Worker 程式（`/hit`、`/stats`）
- `schema.sql` — D1 資料表（`daily`：日期 + 計數；`seen`：當天去重雜湊）
- `wrangler.toml` — 設定（部署前需填 `database_id`）

隱私與防灌水：
- `daily` 只存「日期 + 計數」。
- 伺服器端以 `SHA-256(SALT | IP | 當天)` 去重，同一 IP 一天只計一次；`seen` **只存雜湊、不存原始 IP、不可逆推**，前天以前的列會在寫入時自動清掉。
- 前端 `js/visits.js` 的 localStorage 是第一層去重（減少後端寫入），伺服器端才是防灌水的關鍵一層。
- `SALT` 為 Worker secret（見下方步驟），不進版控。

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

# 4) 設定去重用的 SALT secret（隨機、不進版控；換值會讓當天去重重來一次，無妨）
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" | wrangler secret put SALT

# 5) 部署，取得 https://tn-visits.<你的子網域>.workers.dev
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
