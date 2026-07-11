# SEO 說明與維護

本站的 SEO 相關設定與「換網域」的一鍵操作說明。

## 現行網域（暫時）

目前正式網域為**暫時網域**，之後會再更換：

```
ycchou.github.io/transparent-nursing
```

這個字串是全站絕對網址的**唯一 token**，出現在：

- 各頁 `<link rel="canonical">`、`og:url`、`og:image`、`twitter:image`
- 各頁 JSON-LD（`@id`、`url`、`publisher.url`）
- `sitemap.xml` 的 `<loc>`
- `robots.txt` 的 `Sitemap:`

> 社群分享卡（Facebook / LINE / X）的爬蟲**不會執行 JS**，因此這些絕對網址必須是靜態字串、不能用 JS 動態產生。這是刻意保留成單一 token、以便一鍵替換的原因。

## 換網域：一行指令

換到新網域時（例：自訂網域 `nursing.example.tw`，根目錄部署），在專案根目錄執行：

```bash
# 把 OLD 換成目前字串、NEW 換成新網域（含子路徑，如有）
OLD='ycchou.github.io/transparent-nursing'
NEW='nursing.example.tw'
grep -rl "$OLD" --include='*.html' --include='*.xml' --include='*.txt' . \
  | xargs sed -i "s#${OLD//./\\.}#${NEW}#g"
```

替換後請驗證：

```bash
# 1) 不應再殘留舊網域
grep -rn "$OLD" --include='*.html' --include='*.xml' --include='*.txt' .
# 2) JSON-LD 仍為合法 JSON、sitemap 仍為合法 XML
python tools/check-seo.py   # 若有；否則見本檔末的內嵌檢查
```

### 注意事項

- **子路徑**：GitHub Pages 專案頁是 `使用者.github.io/專案名/`（含子路徑）；自訂網域通常是根目錄（無子路徑）。因為 token 直接接在 `https://` 之後、後面才是 `/path`，所以 `NEW` 只要填「host（＋子路徑）」即可，各頁面路徑會自動接續正確。
- **聯絡 Email**：`about.html` / `terms.html` 內的 `transparentnursing@example.org` 是**佔位 Email**（非網址，`sed` 不會動到），請另行換成真實信箱。

## 已完成的 SEO 項目

- 每頁：`title` / `description` / `keywords` / `canonical` / `robots` / `lang`
- 社群卡：Open Graph（含 `og:image` 1200×630）＋ Twitter Card
- 結構化資料（JSON-LD, schema.org）：
  - `index.html`：Organization + WebSite
  - `nurse-ratio.html` / `personnel.html` / `financials.html`：Dataset
  - `hospital.html`：WebApplication
  - `records.html` / `stats.html`：既有
- `sitemap.xml`：15 條 URL（含 `changefreq` / `priority`）
- `robots.txt`：允許索引、擋 `/data/mock/` 與 `/tools/`、指向 sitemap
- 重複內容整併：舊頁 `violations.html` / `gender.html` / `osha.html` 的 `canonical`
  指向 `records.html?type=labor|gender|osha`，避免與整併後頁面互搶排名

## 換網域後別忘了

1. 到 **Google Search Console** 重新驗證新網域、提交 `sitemap.xml`。
2. 若沿用 GitHub Pages 自訂網域，設定 `CNAME` 檔並在 DNS 設好紀錄。
3. 用 [Rich Results Test](https://search.google.com/test/rich-results) 抽驗幾頁 JSON-LD。
4. 用 FB [Sharing Debugger](https://developers.facebook.com/tools/debug/) 重新抓取 OG 卡片快取。
