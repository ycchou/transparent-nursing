# tn-donate — 綠界（ECPay）捐款後端 Worker

Cloudflare Worker + D1，處理捐款下單（算 CheckMacValue、導向綠界付款）與付款結果回呼（驗章、記帳）。前端 `js/donate.js` 呼叫本 Worker，密鑰不進前端/repo。

- `src/index.js` — `/create`（下單）、`/callback`（綠界通知）、`/health`
- `schema.sql` — D1 `orders`（訂單狀態，不存卡號/個資）
- `wrangler.toml` — 設定（`ECPAY_ENV=stage|prod`；`database_id` 待填）

## 密鑰（不進版控）

以 `wrangler secret put` 設定三項；`ECPAY_ENV` 在 `wrangler.toml` 切 stage/prod。

```bash
cd worker-donate
wrangler d1 create tn-donate            # 把回傳 database_id 填進 wrangler.toml
wrangler d1 execute tn-donate --remote --file=schema.sql

# 開發階段：綠界公開測試帳號（不扣真錢）
printf '2000132'          | wrangler secret put ECPAY_MERCHANT_ID
printf '5294y06JbISpM5x9' | wrangler secret put ECPAY_HASH_KEY
printf 'v77hoKGq4kWxNNIS' | wrangler secret put ECPAY_HASH_IV

wrangler deploy                          # → https://tn-donate.<子網域>.workers.dev
```

## 切正式環境

1. 綠界後台**重新產生 HashKey/HashIV**（若曾外流）。
2. 覆蓋 secret 為正式憑證：
   ```bash
   printf '<正式MerchantID>' | wrangler secret put ECPAY_MERCHANT_ID
   printf '<正式HashKey>'    | wrangler secret put ECPAY_HASH_KEY
   printf '<正式HashIV>'     | wrangler secret put ECPAY_HASH_IV
   ```
3. `wrangler.toml` 把 `ECPAY_ENV` 改 `prod` → `wrangler deploy`。
4. 以真實小額（如 NT$100）實刷一次確認入帳，可於綠界後台退刷。

## 測試（stage）

測試信用卡：卡號 `4311-9522-2222-2222`、到期日任意未來、CVV 任意三碼、OTP 綠界測試頁會提示。

```bash
curl https://tn-donate.<子網域>.workers.dev/health
wrangler d1 execute tn-donate --remote --command "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10"
```

## 端點

- `POST /create` `{ "amount": 500 }` → `{ action, fields }`（前端自動 submit 到 `action`）。
- `POST /callback` — 綠界 server-to-server 通知；驗 CheckMacValue，成功記 `paid`，回 `1|OK`。
- `GET /health` — `{ ok: true, env }`。
