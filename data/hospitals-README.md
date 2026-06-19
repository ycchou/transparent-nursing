# 醫院評鑑名單資料

## 檔案

- `hospitals.json` — 結構化 JSON，含 metadata 與 12 個欄位
- `hospitals.csv` — Excel 友善 CSV（含 UTF-8 BOM）

## 來源

衛生福利部「108-114 年醫院評鑑及教學醫院評鑑（含兒醫）合格名單」PDF

## 欄位說明（共 12 個）

| 欄位 | 中文 | 範例 |
|---|---|---|
| code | 機構代碼（10 碼） | 1101100011 |
| name | 機構名稱 | 台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院 |
| city | 所在縣市 | 臺北市 |
| level | 評鑑類別 | 醫學中心 / 區域醫院 / 地區醫院 |
| hospitalAccredResult | 醫院評鑑結果 | 醫院評鑑優等（醫學中心） |
| teachingAccredResult | 教學醫院評鑑結果 | 教學醫院評鑑合格 |
| hospitalAccredYear | 醫院評鑑年度 | 112 |
| teachingAccredYear | 教學醫院評鑑年度 | 112 |
| hospitalAccredPeriod | 醫院評鑑期效 | 113/1/1-118/12/31 |
| teachingAccredPeriod | 教學評鑑期效 | 113/1/1-118/12/31 |
| phone | 機構電話 | 02-25433535 |
| address | 機構地址 | 臺北市中山區中山北路二段92號 |

## 與 `js/hospitals.js` 的差異

- `js/hospitals.js` 是給前端 autocomplete 用的輕量版，只有 `{ name, city, level }`
- 本目錄是完整版，保留全部 PDF 欄位（共 409 家）
- 兩者醫院總數應一致，可用 `code` 互相對應

## 更新方式

如果 PDF 有新版（衛福部年度更新時），重跑 `python tools/extract-hospitals.py` 即可重新產生。
