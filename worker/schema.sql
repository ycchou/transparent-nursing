-- 每日訪客計數：一天一列。total = SUM(count)。
-- 只存「日期 + 計數」，不存 IP／任何可識別個資（匿名）。
CREATE TABLE IF NOT EXISTS daily (
  day   TEXT PRIMARY KEY,          -- Asia/Taipei 日期，格式 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);
