# tn-gemini-proxy — Gemini API 中繼（固定在美國）

tn-submit 的 AI 審稿原本直接從 Worker 呼叫 Gemini。Worker 預設在離使用者最近的 Cloudflare 節點執行，
台灣的流量有時被排到香港節點，而 Gemini API 不支援香港，會回
`400 User location is not supported for the API use`，該筆投稿就「審稿失敗（已放行）」。

這支 Worker 用 `placement.mode = "targeted"` 固定在 `gcp:us-central1` 執行，tn-submit 透過
service binding（`GEMINI_PROXY`）把 Gemini 請求原樣轉過來。沒有公開網址、不存機密
（API key 仍是 tn-submit 的 `GEMINI_API_KEY`，放在請求標頭裡轉送）。

## 部署

先部署這支，再部署 tn-submit（tn-submit 的 binding 指向這支）：

```bash
cd worker-gemini-proxy && npx wrangler deploy
cd ../worker-submit && npx wrangler deploy
```

確認：用 tn-submit 的 `/moderation/check`（帶 NOTIFY_TOKEN）會回 `status: ok` 與實際執行節點。
