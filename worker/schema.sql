-- 每日訪客計數：一天一列。total = SUM(count)。
-- 只存「日期 + 計數」，不存 IP／任何可識別個資（匿名）。
CREATE TABLE IF NOT EXISTS daily (
  day   TEXT PRIMARY KEY,          -- Asia/Taipei 日期，格式 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);

-- 防灌水去重：同一 IP 當天只計一次。
-- 只存 SHA-256(SALT + IP + 日期) 的雜湊，「不可逆推回 IP」，仍維持匿名。
-- 舊列（前天以前）會在寫入時順手清掉，資料量恆為「近一兩天的不重複訪客數」。
CREATE TABLE IF NOT EXISTS seen (
  h   TEXT PRIMARY KEY,            -- SHA-256(SALT|IP|day)
  day TEXT NOT NULL               -- Asia/Taipei 日期，用來清舊列
);
CREATE INDEX IF NOT EXISTS idx_seen_day ON seen(day);
