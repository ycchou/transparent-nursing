# Apps Script — 寫入 Google Sheet

| 檔案 | 用途 |
|---|---|
| `submit.gs` | Web App。接 tn-submit Worker 轉發的投稿，寫進 `sub_<類別>` 與 `audit` 分頁 |
| `seed.gs` | 一次性工具。把線上的 `data/mock/*.csv` 灌進各分頁，讓正式管線先有資料可跑 |
| `appsscript.json` | 專案設定（時區、Web App 權限） |
| `.clasp.json.example` | clasp 設定範本，複製成 `.clasp.json` 並填 scriptId |

## 機密怎麼放

**不要寫在程式碼裡**——這個 repo 是公開的。改放「專案設定 → 指令碼屬性」：

| 屬性 | 必填 | 說明 |
|---|---|---|
| `SHARED_SECRET` | ✅ | 與 Worker 的 `APPS_SCRIPT_SECRET` 相同。**沒設就一律拒絕所有請求** |
| `SHEET_ID` | — | 綁定在試算表上的專案不必設，會自動用所屬那份 |

**最簡單的設法**：在編輯器選 `setupSecret` 函式按「執行」，它會自動產生一組 64 碼
隨機字串存好，並印在下方「執行記錄」。複製那串去設 Worker 的 `APPS_SCRIPT_SECRET`。
要換一組就先執行 `clearSecret()` 再跑一次 `setupSecret()`。

手動設也可以：編輯器 → 左側齒輪「專案設定」→ 最下方「指令碼屬性」→
「新增指令碼屬性」→ 屬性填 `SHARED_SECRET`、值填隨機字串 → 儲存。

## 首次設定

用 clasp 一次建好試算表 + 綁定的指令碼專案：

```bash
npx clasp login                      # 若還沒登入
cd apps-script
npx clasp create-script --type sheets --title "護理職場透明化 — 投稿資料"
npx clasp push --force               # ⚠ create-script 會覆蓋本地 appsscript.json，
                                     #   先 git checkout apps-script/appsscript.json 再 push
npx clasp create-deployment --description "tn-submit web app"
```

接著**一定要在瀏覽器完成授權**，否則 Web App 對外會回 403：

1. `npx clasp open-script` 開啟編輯器
2. 選 `selftest` 函式按執行 → 出現授權視窗 → 允許（存取試算表、連外網址）
3. 回到 `/exec` 網址，應該就看得到 JSON 了

> Web App 以 API 建立的部署，在擁有者完成 OAuth 同意前一律 403，這不是設定錯誤。

最後複製 `/exec` 網址，設成 Worker secret `APPS_SCRIPT_URL`。

## 用 clasp 從這個 repo 推送

```bash
npx clasp login                     # 瀏覽器授權（用你自己的 Google 帳號）
cp apps-script/.clasp.json.example apps-script/.clasp.json
# 編輯 .clasp.json 填入 scriptId
cd apps-script && npx clasp push    # 把 .gs 推上去
```

> `.clasp.json`（含 scriptId 與試算表 id）已列入 .gitignore，不會進版控。
> `clasp create-script` 會用預設 manifest 覆蓋本地 `appsscript.json`（時區、Web App 權限都會掉），
> push 前記得 `git checkout apps-script/appsscript.json`。

## 改完程式碼一定要「部署新版本」

clasp push 或在編輯器存檔都**只更新原始碼，不會更新線上的 Web App**。
要讓 Worker 打到的 `/exec` 反映改動，必須：

部署 → 管理部署作業 → 選現有部署 → 編輯（鉛筆）→ 版本選「新版本」→ 部署

（或 `npx clasp deploy -i <deploymentId> -d "說明"`）

## 確認有沒有活著

- **健康檢查**：把 `/exec` 網址直接貼進瀏覽器，應該看到
  `{"ok":true,"sheetReachable":true,"sheetTitle":"...","secretConfigured":true,...}`
  - HTTP 403 → 擁有者還沒在編輯器完成授權，見「首次設定」第 2 步
  - `sheetReachable: false` → `SHEET_ID` 屬性填錯，或專案沒綁在試算表上
  - `secretConfigured: false` → 還沒設 `SHARED_SECRET` 指令碼屬性
- **寫入測試**：在編輯器選 `selftest` 執行，會往 `sub_other` 寫一列
  「【測試】請刪除這一列」。確認寫得進去後把那列刪掉。

## 灌測試資料

見 `seed.gs` 開頭說明。`seedAll()` 灌、`clearSeeded()` 清。
灌進去的列都有 `dataSource = 'mock'`，真投稿是 `'form'`。

⚠ mock 資料用的是**真實醫院名稱配上假的職場條件**。正式對外開放前一定要跑
`clearSeeded()` 清掉，否則瀏覽者無法分辨真假。
