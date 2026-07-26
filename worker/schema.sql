-- 每日訪客計數：一天一列。total = SUM(count)。
-- 只存「日期 + 計數」，不存 IP／任何可識別個資（匿名）。
CREATE TABLE IF NOT EXISTS daily (
  day   TEXT PRIMARY KEY,          -- Asia/Taipei 日期，格式 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);

-- 防灌水去重：同一「IP × 裝置類別」當天只計一次。
-- 只存雜湊，「不記錄原始 IP／User-Agent、不可逆推」，仍維持匿名。
--   h     = SHA-256(SALT | IP | 裝置桶 | day)：粗粒度「OS|瀏覽器|主版本」，用來分辨同 IP 下不同裝置
--   ipday = SHA-256(SALT | IP | day)：把同一 IP 的裝置歸群，用來限制單 IP 每日計數上限（防換 UA 灌水）
-- 舊列（前天以前）會在寫入時順手清掉，資料量恆為「近一兩天的不重複紀錄」。
CREATE TABLE IF NOT EXISTS seen (
  h     TEXT PRIMARY KEY,
  ipday TEXT NOT NULL,
  day   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seen_day ON seen(day);
CREATE INDEX IF NOT EXISTS idx_seen_ipday ON seen(ipday);
