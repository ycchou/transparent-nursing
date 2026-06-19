# Google Sheet 發布 CSV 教學

本網站採「Google Form → Google Sheet → CSV → 前端」的資料流。
本文教你怎麼把每一份 Sheet 設定成可直接 fetch 的 CSV 連結。

## Step 1：表單對應到試算表

1. 開啟你的 Google Form
2. 切到「回覆」分頁
3. 點右上角 Google Sheet 圖示「在試算表中查看」
4. 第一次會問你要建立新試算表還是用既有的——選新建立
5. 試算表會自動命名（如「{表單名稱}（回應）」）

> 建議：5 個類別各自一份試算表，比較好獨立管理權限與資料

## Step 2：發布為 CSV

1. 在試算表頁面，點「檔案 → 共用 → 發布到網路」
2. 在彈窗左側選擇要發布的「分頁」（通常是「表單回應 1」）
3. 在右側格式選 **「逗號分隔值 (.csv)」**
4. 勾選「自動重新發布變更內容」
5. 點「發布」，會給你一個連結，類似：
   ```
   https://docs.google.com/spreadsheets/d/e/2PACX-1vXXXXXXXXXXXXX/pub?gid=0&single=true&output=csv
   ```
6. 複製這個連結

## Step 3：更新前端設定

打開 `js/config.js`，找到對應類別，把 `csvUrl` 改成剛剛拿到的連結：

```js
{
  slug: 'icu',
  // ...
  csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?gid=0&single=true&output=csv',
  // ...
}
```

5 個類別都更新後 push 到 GitHub，等 Pages 重新部署。

## Step 4：欄位對齊（重要！）

`data-loader.js` 依靠 CSV 的 **column header** 來認欄位。
建議在 Google Sheet 第一列把 header 改成跟 `config.js` 裡的 `key` 一致（英文 key），
或在試算表上方加一列做 mapping。

最簡單的方式：

1. 開啟試算表，第一列是 Google Form 自動生成的中文題目
2. **在第 1 列「上方」插入一個空白列**（變成新的第 1 列）
3. 把每一欄填入對應的英文 key（參考 `js/config.js` 的 `COMMON_FIELDS` + 該類別 `specificFields`）
4. 修改發布範圍：再次「檔案 → 共用 → 發布到網路」，調整成從第 1 列開始（包含 header）
5. 隱藏第 2 列原本的中文題目列（在 Sheet 內隱藏，但 CSV 仍會包含）

**或更簡單的方式**：在試算表右側建一個「彙整」分頁，用 `=QUERY(Sheet1!A:Z, "SELECT ...")` 重組欄位順序 + 改英文 header，發布這個彙整分頁的 CSV。

## Step 5：權限注意

- 發布到網路 ≠ 公開檔案。發布後任何人**只能透過 CSV URL 讀**，不能編輯。
- 試算表本身仍受權限保護，分享設定不需要改成「任何人都能檢視」。
- 個資保護：表單建議**不要**收 email、IP、Google 帳號（在 Form「設定 → 回應」關閉「收集電子郵件地址」「限制每人回覆 1 次」這些會綁定 Google 帳號的選項）。

## Troubleshooting

**Q：fetch 拿到的 CSV 是空的或被截斷**
A：CSV URL 預設只發布 2000 個欄位/列。如果未來資料量大，改用 Apps Script 寫 endpoint 較穩。

**Q：CSV 有 BOM 開頭，第一個欄位被解析錯**
A：PapaParse 預設會處理 BOM，但若仍有問題，在 `data-loader.js` 的 PapaParse config 加 `skipFirstNLines: 0` 或手動 `.replace(/^﻿/, '')`。

**Q：時間戳記格式 `2024/3/15 上午 10:30:45` 解析錯誤**
A：在 `data-loader.js` 的 `normalizeRow` 加 timestamp 解析邏輯，或在試算表把欄位格式統一改成 ISO 8601。
