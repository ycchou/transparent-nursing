# 護理職場透明化運動 — Prototype

> 致敬 [呼吸治療師勞動分享平台](https://trtu.org.tw/RT_platform/) 的開創性實踐。
> 本專案以 5 大護理工作場域（門診 / 病房 / 加護病房 / 急診 / 洗腎室）為主軸，
> 收集匿名職場資訊並公開呈現。

## 技術棧

- 純 HTML / CSS / JS（無 build step）
- Tailwind 自訂 design token（在 `css/styles.css`）
- [Chart.js](https://www.chartjs.org/) 視覺化（CDN）
- [PapaParse](https://www.papaparse.com/) CSV 解析（CDN）
- Google Fonts：Noto Sans TC + Lora
- 託管：GitHub Pages

## 本機開發

任何靜態檔案 server 即可：

```bash
# Python 3
python -m http.server 8000

# Node
npx serve .
```

開啟 http://localhost:8000 即可。**不要直接用 file:// 開啟**，因為使用 ES Modules + fetch。

## 部署到 GitHub Pages

1. 把整個目錄 push 到 GitHub repo
2. Repo Settings → Pages → Source 選 `main` branch 根目錄
3. 等候幾分鐘，網址會在 Settings 頁顯示

### ⚠️ 部署前必做：替換 SEO 網域

所有 SEO meta tag、Open Graph、Canonical URL、sitemap、robots.txt 都用 `https://transparentnursing.example.org` 作為**佔位網址**。部署前請整批替換：

```bash
# Linux / macOS / Git Bash on Windows
grep -rl "transparentnursing.example.org" . --include="*.html" --include="*.xml" --include="*.txt" --include="*.json" \
  | xargs sed -i 's|https://transparentnursing.example.org|https://你的網域.com|g'

# PowerShell
Get-ChildItem -Recurse -Include *.html,*.xml,*.txt,*.json |
  ForEach-Object { (Get-Content $_) -replace 'https://transparentnursing.example.org', 'https://你的網域.com' | Set-Content $_ }
```

替換後檢查的檔案：
- 5 個 HTML 的 `<link rel="canonical">`、`og:url`、`og:image`、`twitter:image`、JSON-LD
- `sitemap.xml` 的 `<loc>`
- `robots.txt` 的 `Sitemap:` 行
- `manifest.json` 的 `start_url` / `scope`（用相對路徑，通常不用改）

## SEO / 社群分享資產

| 檔案 | 用途 |
|---|---|
| `assets/favicon.svg` | 瀏覽器分頁圖示（100×100） |
| `assets/apple-touch-icon.svg` | iOS 加入主畫面圖示（180×180） |
| `assets/logo.svg` | 主 logo（256×256，含 ECG 線+心型） |
| `assets/og-image.svg` | 社群分享預覽圖（1200×630，符合 OG / Twitter Card 規範） |
| `manifest.json` | PWA 設定，支援「加入主畫面」 |
| `robots.txt` | 搜尋引擎爬蟲指令，允許全站索引 |
| `sitemap.xml` | 站台地圖，加速 Google / Bing 索引 |

每頁 head 都包含：
- `<title>` + `<meta name="description">`（針對該頁優化文案）
- Open Graph 完整 5 標籤（FB / LINE / LinkedIn 預覽）
- Twitter Card `summary_large_image`
- `<link rel="canonical">` 防止重複內容
- `<meta name="theme-color">` 配合 PWA 主題色
- 首頁 `index.html` 額外含 **JSON-LD Organization + WebSite** 結構化資料

### OG image 注意事項

`assets/og-image.svg` 是 SVG 格式。**Facebook / LINE / 老 X 不支援 SVG OG**，他們需要 PNG/JPG/GIF。

如果你希望這些平台正確顯示預覽圖，建議：
1. 把 `assets/og-image.svg` 用線上工具或 `sharp` / `puppeteer` 轉成 `assets/og-image.png` (1200×630 PNG)
2. 把所有 HTML 的 `og:image` / `twitter:image` 路徑改成 `.png`

簡單轉檔指令（Node 環境）：
```bash
npm i -g svgexport
svgexport assets/og-image.svg assets/og-image.png 1200:630
```

完成後 X / LINE / FB 分享連結都會出現大圖預覽。

## 檔案結構

```
TransparentNursing/
├── index.html          # 首頁
├── platform.html       # 資料平台（5 類 tabs + 篩選 + 表格/卡片）
├── stats.html          # 統計摘要（6 個 Chart.js 圖表）
├── participate.html    # 填寫表單入口（5 張表單卡）
├── about.html          # 關於頁
├── css/styles.css      # 全站樣式（design token、卡片、表格、modal）
├── js/
│   ├── config.js       # 站台設定、5 類別 metadata、欄位 schema
│   ├── icons.js        # Lucide-style 內嵌 SVG icon
│   ├── components.js   # 共用 header/footer 注入 + 格式工具
│   ├── data-loader.js  # CSV fetch + PapaParse + 記憶體 cache
│   ├── table.js        # 表格/卡片渲染 + 排序 + 詳情 Modal
│   ├── filters.js      # 篩選器 UI + 套用邏輯
│   └── charts.js       # 6 種圖表封裝
├── data/mock/          # Prototype 假資料（之後改成 Google Sheet CSV）
│   ├── icu.csv         # 加護病房（16 筆）
│   ├── dialysis.csv    # 洗腎室（15 筆）
│   ├── er.csv          # 急診（15 筆）
│   ├── ward.csv        # 病房（16 筆）
│   └── outpatient.csv  # 門診（15 筆）
└── docs/
    ├── form-drafts/    # 3 份未做表單的 Markdown 草稿
    │   ├── outpatient.md
    │   ├── ward.md
    │   └── er.md
    └── sheet-setup.md  # Google Sheet → CSV 設定教學
```

## 從 Prototype 進入正式版

### Step 1：建立 3 份 Google 表單

使用 `docs/form-drafts/` 內的草稿建立：
- 門診（outpatient.md）
- 病房（ward.md）
- 急診（er.md）

### Step 2：把 5 個 Google Sheet 發布為 CSV

照著 `docs/sheet-setup.md` 步驟做。每個 Sheet 取得一個 CSV URL。

### Step 3：更新 `js/config.js`

把每個類別的 `csvUrl` 從 `data/mock/xxx.csv` 改成 Google Sheet 的 CSV URL：

```js
{
  slug: 'icu',
  csvUrl: 'https://docs.google.com/spreadsheets/d/e/...../pub?gid=0&single=true&output=csv',
  // ...
}
```

### Step 4：欄位對齊

Google Sheet 的第一欄是「時間戳記」，後面的欄位順序需跟 `js/config.js` 的 `COMMON_FIELDS + specificFields` 對得起來，或在 `js/data-loader.js` 加 mapping。

> 簡單方式：把 Google Form 的題目「短名稱」改成 config 裡的 `key`，這樣 sheet header 就會一致。

## 設計系統

- 主色：`#2E86AB`（寧靜藍）
- 輔色：`#A8DADC`（薄荷綠）
- 背景：`#F1FAEE`（暖白）
- 字型：標題 Lora（襯線）+ 內文 Noto Sans TC
- 圓角：卡片 16px、按鈕 10px、tag 999px

修改全站色系：直接改 `css/styles.css` 最上方的 `:root` CSS variables。

## License

預計採 MIT。Prototype 階段尚未確定。

## Credits

- 致敬：[台灣呼吸治療產業工會](https://trtu.org.tw/) 的勞動分享平台
- Icons：[Lucide](https://lucide.dev/)
