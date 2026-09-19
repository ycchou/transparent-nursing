#!/usr/bin/env bash
# 列出目前 wrangler 登入帳號裡與本專案相關的資源（唯讀，不刪任何東西）。
# 用途：搬帳號前先盤點。需要已 `wrangler login`。
set -u

CFG="${HOME}/.config/.wrangler/config/default.toml"
TOKEN=$(grep -oP 'oauth_token\s*=\s*"\K[^"]+' "$CFG" 2>/dev/null)
if [ -z "${TOKEN:-}" ]; then echo "找不到 oauth_token，請先 wrangler login"; exit 1; fi

API="https://api.cloudflare.com/client/v4"
hdr=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "== 帳號 =="
ACCOUNTS=$(curl -s "${hdr[@]}" "$API/accounts")
echo "$ACCOUNTS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for a in d.get('result') or []:
    print(f\"  {a['id']}  {a['name']}\")
"
ACC=$(echo "$ACCOUNTS" | python3 -c "import sys,json; r=json.load(sys.stdin).get('result') or []; print(r[0]['id'] if r else '')")
[ -z "$ACC" ] && { echo "取不到 account id"; exit 1; }

show() {  # show <標題> <API 路徑> <欄位...>
  echo
  echo "== $1 =="
  curl -s "${hdr[@]}" "$API/accounts/$ACC/$2" | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: print('  (讀取失敗)'); raise SystemExit
if not d.get('success'): print('  (無權限或不支援)'); raise SystemExit
res = d.get('result') or []
if isinstance(res, dict): res = res.get('databases') or res.get('result') or [res]
if not res: print('  （無）'); raise SystemExit
for x in res:
    parts = [str(x.get(k, '')) for k in '''$3'''.split()]
    print('  ' + '  '.join(p for p in parts if p))
"
}

show "Workers"        "workers/scripts"          "id created_on"
show "D1 資料庫"      "d1/database"              "uuid name"
show "KV 命名空間"    "storage/kv/namespaces"    "id title"
show "R2 儲存桶"      "r2/buckets"               "name creation_date"
show "Pages 專案"     "pages/projects"           "name subdomain"
show "Turnstile 網站" "challenges/widgets"       "sitekey name domains"

echo
echo "（唯讀盤點完成，未刪除任何東西）"
