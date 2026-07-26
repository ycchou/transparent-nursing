-- 捐款訂單：一筆一列。不存任何卡號/個資（綠界處理），只留對帳所需的訂單狀態。
CREATE TABLE IF NOT EXISTS orders (
  trade_no   TEXT PRIMARY KEY,               -- MerchantTradeNo（我方產生的訂單編號）
  amount     INTEGER NOT NULL,               -- 金額（新台幣，整數）
  status     TEXT NOT NULL DEFAULT 'created', -- created | paid | failed
  rtn_code   TEXT,                           -- 綠界回傳的 RtnCode
  created_at INTEGER NOT NULL,               -- epoch ms
  paid_at    INTEGER                         -- epoch ms（付款成功時）
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
