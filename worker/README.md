# tn-visits — 首頁匿名訪客計數 Worker

Cloudflare Worker + D1，提供首頁「今日訪客 / 累積人次」數字。獨立部署，**不走 GitHub Pages**。

- `src/index.js` — Worker 程式（`/hit`、`/stats`）
- `schema.sql` — D1 資料表（`daily`：日期 + 計數；`seen`：當天去重雜湊）
- `wrangler.toml` — 設定（部署前需填 `database_id`）

隱私與防灌水：
- `daily` 只存「日期 + 計數」。
- 伺服器端去重以「IP × 裝置類別」為單位：`h = SHA-256(SALT | IP | 裝置桶 | day)`，其中「裝置桶」是把 User-Agent 壓成粗粒度 `OS|瀏覽器|主版本`（例 `iOS|Safari|17`）。同一 IP 下不同裝置能分開計，降低同一出口（診所/NAT）多人被算成 1 的低估。
- 為避免「同 IP 狂換 User-Agent 灌水」，另存 `ipday = SHA-256(SALT | IP | day)` 做分群，**單一 IP 每天最多計 `CAP_PER_IP_PER_DAY`（目前 50）種裝置類別**。此上限在 `src/index.js` 頂部可調。
- `seen` **只存雜湊、不存原始 IP／User-Agent、不可逆推**；前天以前的列會在寫入時自動清掉。
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
