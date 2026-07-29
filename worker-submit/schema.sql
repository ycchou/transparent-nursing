-- 表單提交限流：以「IP+裝置+版本」為單位的每日計數（只存雜湊，不存原始 IP/UA）。
-- 舊列由每日 Cron 清除（見 src/index.js 的 scheduled）。
CREATE TABLE IF NOT EXISTS sub_rate (
  k     TEXT PRIMARY KEY,          -- SHA-256(SALT | IP | 裝置桶(OS|瀏覽器|主版本) | day)
  day   TEXT NOT NULL,             -- Asia/Taipei 日期 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sub_rate_day ON sub_rate(day);
