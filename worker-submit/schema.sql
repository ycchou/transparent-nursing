-- 表單提交限流：以「IP+裝置+版本」為單位的每日計數（只存雜湊，不存原始 IP/UA）。
-- 舊列由每日 Cron 清除（見 src/index.js 的 scheduled）。
CREATE TABLE IF NOT EXISTS sub_rate (
  k     TEXT PRIMARY KEY,          -- SHA-256(SALT | IP | 裝置桶(OS|瀏覽器|主版本) | day)
  day   TEXT NOT NULL,             -- Asia/Taipei 日期 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sub_rate_day ON sub_rate(day);

-- 跨裝置解鎖碼：投稿成功時發一組，在其他裝置輸入即可解鎖分享平台完整內容。
-- 只存雜湊與建立日期，刻意不與投稿資料列關聯（拿到碼也查不出是哪一筆、誰填的）。永久有效。
CREATE TABLE IF NOT EXISTS unlock_codes (
  code_hash   TEXT PRIMARY KEY,    -- SHA-256(SALT | 'unlock' | 正規化後的碼)
  created_day TEXT NOT NULL        -- Asia/Taipei 日期 YYYY-MM-DD
);
-- 已用某碼解鎖的裝置（裝置 ID 是瀏覽器隨機產生、存在 localStorage，不是指紋）。每碼上限見 src/index.js。
CREATE TABLE IF NOT EXISTS unlock_devices (
  code_hash   TEXT NOT NULL,
  device_hash TEXT NOT NULL,       -- SHA-256(SALT | 'device' | 裝置 ID)
  day         TEXT NOT NULL,
  PRIMARY KEY (code_hash, device_hash)
);
-- 解鎖嘗試限流（擋暴力猜碼）：以 IP 雜湊為單位的每日次數，舊列由每日 Cron 清除
CREATE TABLE IF NOT EXISTS unlock_rate (
  k     TEXT PRIMARY KEY,          -- SHA-256(SALT | 'unlock' | IP | day)
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_unlock_rate_day ON unlock_rate(day);

-- ───── 機構追蹤推播（見 src/push.js）─────
-- 推播訂閱：一個瀏覽器／App 一列。只存推播服務給的端點與加密公鑰，不存 IP、不與投稿關聯。
CREATE TABLE IF NOT EXISTS push_subs (
  id          TEXT PRIMARY KEY,    -- SHA-256(endpoint)
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  updated_day TEXT NOT NULL
);
-- 追蹤的機構與類型（kinds：c 新分享、f 財報、r 護病比 的組合）
CREATE TABLE IF NOT EXISTS push_follows (
  sub_id TEXT NOT NULL,
  code   TEXT NOT NULL,            -- 機構代號
  kinds  TEXT NOT NULL,
  PRIMARY KEY (sub_id, code)
);
CREATE INDEX IF NOT EXISTS idx_push_follows_code ON push_follows(code);
-- 待送通知（每位訂閱者一則彙整），送出即刪
CREATE TABLE IF NOT EXISTS push_queue (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id  TEXT NOT NULL,
  payload TEXT NOT NULL
);
-- 已處理過的資料批次（/notify 去重，同一批重送不會重複通知）
CREATE TABLE IF NOT EXISTS push_batches (
  batch_id TEXT PRIMARY KEY,
  day      TEXT NOT NULL
);
-- 訂閱同步限流：以 IP 雜湊為單位的每日次數，舊列由每日 Cron 清除
CREATE TABLE IF NOT EXISTS push_rate (
  k     TEXT PRIMARY KEY,          -- SHA-256(SALT | 'push' | IP | day)
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_rate_day ON push_rate(day);
