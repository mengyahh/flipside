# 資料格式（初稿 v0.1）

所有資料放在 `data/`，網站載入後在手機端搜尋、篩選。第一版約 200 筆，整包 JSON 預估 < 1 MB。

```
data/
  products.json      商品
  substances.json    標準化成分／添加物（含別名對照）
  brands.json        品牌
  categories.json    分類樹
  labels.json        正向標籤（認證）定義
review/              本機審核用，不部署
  pending.json       待確認項目
  review.json        使用者匯出的確認結果
```

---

## 商品 `products.json`

一筆 = 一個口味。不同容量放在 `variants` 底下。

```jsonc
{
  "id": "hty-seaweed-pork-floss",          // 品牌-品名的英文短代碼，網址用
  "name": "精緻海苔肉鬆",
  "brand": "hty",                          // 對應 brands.json
  "category": "meat.floss",               // 對應 categories.json
  "flavor": "海苔",
  "variants": [
    { "size": "212g", "barcodes": ["4710..."] }
  ],

  "ingredients": {
    "raw": "上選豬後腿瘦肉(台灣)、蔗糖、豌豆粉、…、調味劑(5’-次黃嘌呤核苷磷酸二鈉、…)",
    "items": [                             // 由 raw 拆解，保留層級
      { "text": "上選豬後腿瘦肉(台灣)", "substance": "pork", "origin": "台灣" },
      { "text": "調味劑", "function": "調味劑", "children": [
          { "text": "5’-次黃嘌呤核苷磷酸二鈉", "substance": "e631" }
      ]}
    ]
  },

  "nutrition": {
    "basis": "solid",                      // solid=每100公克 / liquid=每100毫升
    "servingSize": 20.7, "servingUnit": "g", "servingsPerPack": 12,
    "perServing": { "kcal": 101, "protein": 6.3, "fat": 4.4, "satFat": 1.6,
                    "transFat": 0, "carb": 9.1, "sugar": 5.1, "sodium": 160 },
    "per100":     { "kcal": 490, "protein": 30.2, "fat": 21.4, "satFat": 7.8,
                    "transFat": 0, "carb": 44.2, "sugar": 24.8, "sodium": 774 },
    "extra": { "fiber": null, "cholesterol": null }   // 包裝有標才填
  },

  "allergens": {
    "contains": ["soy", "sesame"],         // 依法規過敏原清單（代碼）
    "sharedLine": ["peanut"],              // 同產線
    "raw": "本產品含有…"
  },
  "gmo": { "status": "non-gmo-claimed", "raw": "黃豆(非基因改造)" },
                                           // gmo-contains / non-gmo-claimed / not-applicable / unknown
  "origin": { "country": "台灣", "raw": "產地：台灣" },
  "diet": "meat",                          // meat 葷 / vegan 全素 / ovo-lacto 蛋奶素 / … （台灣素食標示）
  "labels": [                              // 正向標籤，只採認證
    { "id": "organic-tw", "evidence": "包裝有機標章", "source": 0 }
  ],

  "stores": {
    "pxmart": { "status": "unknown", "verified": false, "source": null },
    "seven":  { "status": "unknown", "verified": false, "source": null },
    "family": { "status": "unknown", "verified": false, "source": null }
  },                                       // status: yes / no / unknown

  "images": [
    { "kind": "front", "file": "img/hty-seaweed-pork-floss.webp",
      "sourceUrl": "https://…", "credit": "萬家福線上購物" }
  ],
  "sources": [
    { "type": "uni-prosperity", "url": "https://…", "fetchedAt": "2026-11-05" }
  ],
  "review": {
    "status": "needs-review",              // draft / needs-review / verified
    "issues": [ { "field": "nutrition", "note": "同頁兩組每100g數值不一致（490 vs 493 kcal）" } ]
  },
  "updatedAt": "2026-11-05"
}
```

## 標準化成分 `substances.json`

篩選（「排除阿斯巴甜」）和之後的風險標示都以這裡為準。

```jsonc
{
  "id": "aspartame",
  "name": "阿斯巴甜",
  "aliases": ["天門冬醯苯丙胺酸甲酯", "Aspartame", "E951"],
  "kind": "additive",                      // additive 添加物 / ingredient 一般原料
  "tfdaClass": "甜味劑",                    // 依《食品添加物使用範圍及限量》分類
  "eNumber": "E951",
  "filterable": true                       // 是否出現在篩選器中
  // 之後才加：iarc、爭議標記、說明文字…
}
```

## 資料來源優先順序與衝突

1. 包裝照片（使用者拍攝）
2. 品牌官網
3. 萬家福線上購物
4. Open Food Facts

**不同來源數值不一致時，不自動選，直接列入待確認。**實際案例：萬家福的新東陽肉鬆頁面，同一頁就有兩組營養標示和兩份成分表。
