#!/usr/bin/env bash
# 本機排程用：更新可全自動取得的官方資料（人力監控、病床設施），有變動才 commit、push（即部署、推播）。
# 由 cron 每 5 天呼叫（見 DATA.md「自動排程」）；也可手動執行：bash tools/auto-update.sh
# 記錄：logs/auto-update.log（不進版控）。同一時間只跑一個（flock）。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/auto-update.log" 2>&1

# cron 的環境很精簡：補上 git／gh 認證所在的 HOME 與 PATH
export HOME="${AUTO_UPDATE_HOME:-/home/kasm-user}"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export PYTHONIOENCODING=utf-8

exec 9>"$LOG_DIR/auto-update.lock"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] 上一次排程還在跑，略過"
  exit 0
fi

cd "$ROOT" || exit 1
echo
echo "════════ [$(date '+%F %T')] 自動更新開始 ════════"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "工作目錄有未提交的修改，為避免一起被提交，這次略過"
  exit 1
fi
git pull --rebase --quiet origin main || { echo "git pull 失敗"; exit 1; }
python3 tools/update-data.py --commit --push
status=$?
echo "════════ [$(date '+%F %T')] 結束（exit $status）════════"
exit $status
