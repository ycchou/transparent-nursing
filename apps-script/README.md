# Apps Script — 寫入 Google Sheet

| 檔案 | 用途 |
|---|---|
| `submit.gs` | Web App。接 tn-submit Worker 轉發的投稿，寫進 `sub_<類別>` 與 `audit` 分頁 |
| `seed.gs` | 一次性工具。把線上的 `data/mock/*.csv` 灌進各分頁，讓正式管線先有資料可跑 |
| `appsscript.json` | 專案設定（時區、Web App 權限） |
| `.clasp.json.example` | clasp 設定範本，複製成 `.clasp.json` 並填 scriptId |

## 首次設定

1. 開一個新的 Apps Script 專案，記下網址裡的 **scriptId**
   （`https://script.google.com/.../projects/<scriptId>/edit`）
2. 把 `submit.gs`、`seed.gs` 貼進去，或用下面的 clasp 推送
3. 填好兩支檔案最上面的 `SHEET_ID` / `SEED_SHEET_ID` 與 `SHARED_SECRET`
4. 部署 → 新增部署作業 → **網頁應用程式**；執行身分「我」、存取權「任何人」
5. 複製 `/exec` 網址，設成 Worker secret `APPS_SCRIPT_URL`

## 用 clasp 從這個 repo 推送

```bash
npx clasp login                     # 瀏覽器授權（用你自己的 Google 帳號）
cp apps-script/.clasp.json.example apps-script/.clasp.json
# 編輯 .clasp.json 填入 scriptId
cd apps-script && npx clasp push    # 把 .gs 推上去
```

> `.clasp.json` 已列入 .gitignore，不會進版控。

## 改完程式碼一定要「部署新版本」

clasp push 或在編輯器存檔都**只更新原始碼，不會更新線上的 Web App**。
要讓 Worker 打到的 `/exec` 反映改動，必須：

部署 → 管理部署作業 → 選現有部署 → 編輯（鉛筆）→ 版本選「新版本」→ 部署

（或 `npx clasp deploy -i <deploymentId> -d "說明"`）

## 確認有沒有活著

- **健康檢查**：把 `/exec` 網址直接貼進瀏覽器，應該看到
  `{"ok":true,"sheetReachable":true,"secretConfigured":true,...}`
  - `sheetReachable: false` → `SHEET_ID` 填錯或沒有存取權
  - `secretConfigured: false` → `SHARED_SECRET` 還是範本的預設值
- **寫入測試**：在編輯器選 `selftest` 執行，會往 `sub_other` 寫一列
  「【測試】請刪除這一列」。確認寫得進去後把那列刪掉。

## 灌測試資料

見 `seed.gs` 開頭說明。`seedAll()` 灌、`clearSeeded()` 清。
灌進去的列都有 `dataSource = 'mock'`，真投稿是 `'form'`。

⚠ mock 資料用的是**真實醫院名稱配上假的職場條件**。正式對外開放前一定要跑
`clearSeeded()` 清掉，否則瀏覽者無法分辨真假。
