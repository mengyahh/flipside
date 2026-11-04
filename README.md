# 翻背面 flipside

台灣超市加工食品的成分、營養標示、過敏原查詢網站。手機優先、可離線（PWA）、純靜態，部署在 GitHub Pages。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `site/` | 網站本體（部署這個資料夾） |
| `site/data/` | 商品、成分、分類、品牌、標籤 JSON |
| `review/` | 本機審核頁（不部署） |
| `scripts/` | 抓取、解析、建置資料的腳本（Node.js，無外部套件） |
| `data/overrides.json` | 人工審核結果，重新建置時會套用 |
| `docs/` | 決策紀錄、資料格式、表單說明、[人工審核指南](docs/review-guide.md) |

## 更新資料

```bash
node scripts/01-sitemap.mjs      # 讀萬家福網站地圖（約 2 分鐘）
node scripts/02-fetch.mjs        # 抓目標品牌商品頁，每 2.5 秒一頁，有快取可續跑
node scripts/03-build.mjs        # 產生 site/data/products.json 與 review/pending.json
```

解析器改版後，不用重抓：

```bash
node scripts/02b-reparse.mjs && node scripts/03-build.mjs
```

## 審核流程

1. 在專案根目錄啟動本機伺服器：`python -m http.server 8765`
2. 開 http://localhost:8765/review/ ，勾選通路、處理衝突、補條碼
3. 按「匯出 review.json」，把檔案放到 `review/`
4. 合併並重建：

```bash
node scripts/04-merge-review.mjs && node scripts/03-build.mjs
```

## 本機預覽網站

http://localhost:8765/site/

## 設定

`site/config.js`：GoatCounter 站點代碼、回報表單網址與欄位代碼。
