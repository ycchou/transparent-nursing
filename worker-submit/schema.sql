-- 表單提交限流：單一 IP 每日計數（只存雜湊，不存原始 IP）。
-- 舊列由每日 Cron 清除（見 src/index.js 的 scheduled）。
CREATE TABLE IF NOT EXISTS sub_rate (
  ipday TEXT PRIMARY KEY,          -- SHA-256(SALT | IP | day)
  day   TEXT NOT NULL,             -- Asia/Taipei 日期 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sub_rate_day ON sub_rate(day);
