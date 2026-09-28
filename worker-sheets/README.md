# tn-sheets — Google Sheet CSV 快取代理 Worker

Cloudflare Worker + KV。把分享平台（10 類）與違規紀錄（勞檢／性平／職安）的 Google Sheet 發布 CSV
存成 KV 快照，前端改讀快照：**約 0.2 秒**，原本直連 Google 要 **2–6 秒**。獨立部署，**不走 GitHub Pages**。

- `src/index.js` — Worker 程式；`SOURCES` 是白名單（pubId + gid）
- `wrangler.toml` — KV 綁定與 Cron（每 5 分鐘）

運作方式：
- **Cron 每 5 分鐘**重抓全部來源，內容有變（或距上次寫入超過 6 小時）才寫 KV，控制在免費方案每日 1000 次寫入內。
- **群組合併包** `/bundle/<group>`：整個群組一次回傳 JSON `{ "<pubId>/<gid>": csv }`，Cron 另存合併快照，每次只讀 1 次 KV。
  `share`＝分享平台 10 類、`viol`＝違規紀錄 3 份 → 前端（`js/sheet-fetch.js`）一般開頁只打 **2 次** Worker。
- `viol` 群組在 `GROUPS` 標 `daily`：更新頻率低，Cron 每天只在台北 04:00 那輪抓。
- `/spreadsheets/d/e/<pubId>/bundle`（同試算表合併包）與單份路徑是舊版前端用的，過渡期保留。單份路徑與 Google 相同：`/spreadsheets/d/e/<pubId>/pub?gid=<gid>&single=true&output=csv`。
- 前端 Worker 失敗（網路錯誤、非 2xx）時自動退回直連 Google。
- 不在白名單的 Sheet：合併包裡沒有它（或回 404）→ 前端退回直連，**新增 Sheet 忘了加白名單也不會壞，只是比較慢**。
- Google 回非 CSV（例如 Sheet 被取消發布）時不覆蓋 KV，維持最後一份好的快照。
- 資料新鮮度：Google 發布 CSV 本身約 1–5 分鐘，加上最多 5 分鐘（Cron）＋ 1 分鐘（KV 邊緣快取）＋ 1 分鐘（isolate 記憶體）。

## 新增／更換 Sheet

1. 改 `js/env.js` 的 `LIVE.csvUrls` 或 `js/config.js` 的 `VIOL_FEEDS`
2. 把同一組 `pubId`、`gid` 與群組（`share`／`viol`）加進 `src/index.js` 的 `SOURCES`；
   新群組還要加進 `GROUPS`，並在 `js/sheet-fetch.js` 的 `groupOf` 對應
3. 在 `worker-sheets/` 執行 `wrangler deploy`

## 首次部署

> 若沒有全域 `wrangler`，把下列 `wrangler` 換成 `npx wrangler`。

```bash
wrangler login
cd worker-sheets
wrangler kv namespace create tn-sheets   # 回傳的 id 填進 wrangler.toml
wrangler deploy                          # → https://tn-sheets.<子網域>.workers.dev
```

部署網址填進 `js/sheet-fetch.js` 的 `SHEET_PROXY`，再跑 `python3 tools/stamp-assets.py` 並 push。

## 驗證

```bash
curl https://tn-sheets.ycchou-1005.workers.dev/health    # 各來源快照時間
curl -sI 'https://tn-sheets.ycchou-1005.workers.dev/spreadsheets/d/e/<pubId>/pub?gid=<gid>&single=true&output=csv' | grep -i x-cache
wrangler tail                                             # 看 Cron 刷新失敗的 log
```
