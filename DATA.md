# 資料檔說明（DATA.md）

本站無資料庫，所有資料都是 `data/` 底下的靜態檔，由 GitHub Pages 直接提供。
本文件說明**每個資料檔的來源、由哪支工具產生、是否供前端即時讀取、以及能不能手改**，
避免誤改到「一 rebuild 就被覆蓋」的生成檔。

## 資料分層

| 層 | 位置 | 意義 | 能手改? |
|---|---|---|---|
| **原始 source** | `data/*.pdf`、`data/VPN.../`、`data/醫院醫事人力持續性監測/` | 政府原始檔（PDF/ODS），建置輸入 | 否（換來源檔才更新） |
| **手改 manual** | `data/manual/` | 人工維護的修正／對照，建置輸入 | ✅ 是（本層就是給你改的） |
| **手改（runtime）** | `data/hospitals-manual-city.json` | 手工維護但前端直接讀 | ✅ 是 |
| **生成 derived** | `data/*.json`（其餘） | 由 `tools/` 腳本產生 | ✗ 否（改了會被 rebuild 覆蓋） |
| **眾包 mock** | `data/mock/*.csv` | 假資料備援（正式資料走 Google Sheets） | 由 generate-mock-data.js 產 |

## 檔案清單

### 生成檔（derived，勿手改；跑對應工具重建）

| 檔案 | 產生工具 | 上游來源 | 前端讀取 |
|---|---|---|---|
| `hospitals.json` / `hospitals.csv` | `extract-hospitals.py` | 108–114 評鑑合格名單 PDF | — |
| `hospitals-merged.json` | `build-nurse-ratio.py` | hospitals.json＋VPN ODS | ✅ hospital / hospital-shortname |
| `hospitals-master.json` | `build-hospitals-master.py` | hospitals.json＋nurse-ratio＋overlay＋健保署 | ✅ 表單機構建議 |
| `hospitals-address-overlay.json` | `fetch-hospital-addresses.py` | 健保署特約機構開放資料 | ✅ nurse-ratio / hospital |
| `nurse-ratio.json` | `build-nurse-ratio.py` | VPN 三班護病比 ODS＋hospitals.json | ✅ nurse-ratio（獨立頁） |
| `nurse-ratio/by-code/{code}.json` | `split-hospital-data.py` | nurse-ratio.json 拆 per-code | ✅ hospital（機構總覽惰性載） |
| `financials/{code}.json` | `split-hospital-data.py` | hospital-financials.json 拆 per-code | ✅ hospital（機構總覽惰性載） |
| `personnel-index.json`、`personnel-aggregate.json`、`personnel/{id}.json` | `build-personnel.py` | 醫事人力監測 PDF | ✅ personnel / hospital |
| `hospital-financials-list.json` | `fetch-financials-list.js` | 健保署 | —（餵下一支） |
| `hospital-financials.json` | `fetch-hospital-financials.py` | 健保署財務公開 API | ✅ financials / hospital |
| `violations-hospital-map.json` | `build-violations-map.py` | 違規 CSV＋manual overrides | ✅ records / hospital |

### 手改檔（manual，建置輸入，`data/manual/`）

| 檔案 | 消費工具 | 用途 |
|---|---|---|
| `manual/hospitals-corrections.json` | `apply-hospital-corrections.py` | 修正評鑑/VPN 醫院名稱、地址、縣市誤植 |
| `manual/personnel-corrections.json` | `build-personnel.py` | 修正監測 PDF 數字誤植 |
| `manual/violations-hospital-overrides.json` | `build-violations-map.py` | 補違規機構名稱→代號對照（自動對不到者） |

### 手改檔（runtime）

| 檔案 | 前端讀取 | 用途 |
|---|---|---|
| `hospitals-manual-city.json` | nurse-ratio.js | 補評鑑 PDF 未收錄醫院的縣市（`{代號: 縣市}`） |

### 原始 source（建置輸入，體積大）

| 位置 | 消費工具 |
|---|---|
| `108-114年醫院評鑑…合格名單.pdf` | extract-hospitals.py |
| `VPN登錄之各月份三班護病比/*.ods` | build-nurse-ratio.py |
| `醫院醫事人力持續性監測/**/*.pdf` | build-personnel.py |

## 每月更新官方資料

```bash
python tools/update-data.py --commit --push   # 抓新資料 → 增量建置 → 更新 README → commit、push（即部署）
python tools/update-data.py                   # 同上但不 commit，先看結果
```

| 資料 | 新資料怎麼來 | 官方公告時間 |
|---|---|---|
| 人力監控 | `fetch-personnel.py` 自動從衛福部下載 | 約次兩月（115/07 於 115/09 公告） |
| 三班護病比 | 健保署主站有 Cloudflare 機器人驗證，程式無法下載 → 用瀏覽器到[三班護病比資訊公開](https://www.nhi.gov.tw/ch/cp-15138-b2fee-3669-1.html)下載 ODS，**留在「下載」資料夾即可**，`update-data.py` 會自動歸檔。`fetch-nurse-ratio.py` 另會檢查政府開放資料平台（目前只上架到 113/12） | 約次月底 |
| 醫院財務 | `update-data.py` 會查健保署財務 API 的最新年度，有新年度時提示；年度報表 ODS 同樣手動下載後留在「下載」資料夾 | 每年一次 |

手動下載的檔案也可以放在 `data/_inbox/`（不進版控）。歸檔時以內容雜湊判斷，重複下載的檔案不會重複歸檔。

## 重建

一鍵重建（依相依順序跑所有工具，最後破快取＋驗證）。預設**增量**：記錄各步驟輸入檔的指紋於
`.build-cache/build-all.json`，輸入沒變的步驟直接略過；上游重跑、產物改變時下游自動跟著重跑。
人力監控另有逐檔 PDF 解析快取（`.build-cache/personnel/`）：全部解析約 14 分鐘，每月新增 3 份約 20 秒。
`.build-cache/` 不進版控，刪掉即全部重來。

```bash
python tools/build-all.py           # 增量：只跑輸入有變的離線步驟（＋破快取＋驗證）
python tools/build-all.py --all     # 忽略指紋，離線步驟全部重跑
python tools/build-all.py --fetch   # 連健保署等連網步驟一起（完整重建）
python tools/build-all.py --list    # 只列出計畫（含哪些步驟輸入有變）、不執行
python tools/build-all.py --mark    # 不執行，把目前輸入記為已建置（剛 clone／換機器時建立基準）
```

各步驟對應的工具與順序見 `tools/build-all.py` 的 `STEPS`；單獨重建某項也可直接跑該工具
（見上表「產生工具」欄）。

### 破快取（版本號）
改完程式或資料後跑 `python tools/stamp-assets.py`，自動把所有 `?v=` 更新為內容雜湊，
**不要再手動改版本號**。CI 可用 `python tools/stamp-assets.py --check` 驗證是否已 stamp。

### 資料驗證
`python tools/validate-data.py` 檢查主要 JSON 輸出的結構（必填欄位、per-code 拆檔數量
是否與來源相符等）；非 0 退出＝有問題，適合放進 CI／部署前。
