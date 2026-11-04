// 喜年來官網：抓所有商品頁的成分、營養標示、過敏原、產地、條碼
// 輸出：.cache/brand/serena.json
import { cachedFetch, writeJson, CACHE_DIR } from './lib/fetch.mjs';
import { htmlToLines, parseNutrition, parseNutritionBlob, parseIngredients } from './lib/parse-uniprosperity.mjs';

const BASE = 'https://www.serenafoods.com.tw/ec99/rwd1851/';
const opt = { delayMs: 3000 };
const home = (await cachedFetch(BASE, opt)).html;
const cats = [...new Set([...home.matchAll(/category\.asp\?category_id=(\d+)/g)].map((m) => m[1]))];
const ids = new Set([...home.matchAll(/product\.asp\?prodid=(\d+)/g)].map((m) => m[1]));
for (const c of cats) {
  const { html } = await cachedFetch(`${BASE}category.asp?category_id=${c}`, opt);
  for (const m of (html || '').matchAll(/product\.asp\?prodid=(\d+)/g)) ids.add(m[1]);
}
console.error(`categories ${cats.length}, products ${ids.size}`);

const out = [];
for (const id of ids) {
  const url = `${BASE}product.asp?prodid=${id}`;
  const { html } = await cachedFetch(url, opt);
  if (!html) continue;
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/[-|｜].*$/, '').trim() || '';
  const rawLines = htmlToLines(html.replace(/[\s\S]*?<body[^>]*>/i, ''));
  // 「成 分:」這類標籤自成一行時，與下一行合併
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (/^[一-鿿\s]{2,10}[:：]$/.test(l) && rawLines[i + 1] && !/[:：]$/.test(rawLines[i + 1])) { lines.push(l.replace(/\s/g, '') + rawLines[i + 1]); i++; }
    else lines.push(l);
  }
  const storeLine = lines.find((l) => /販售通路/.test(l)) || '';
  const stores = { pxmart: /全聯/.test(storeLine), seven: /7-?11|7-ELEVEN|統一超商/i.test(storeLine), family: /全家/.test(storeLine) };
  // 商品全名在「● 商品貨號」的前一行
  const idxNo = rawLines.findIndex((l) => /商品貨號/.test(l));
  const prev2 = idxNo > 1 ? rawLines[idxNo - 2] : '';
  const series = prev2 && prev2.length <= 12 && !/["<>]|共有\d+張圖|首頁|產品介紹/.test(prev2) ? prev2 : '';
  const name = idxNo > 0 ? series + rawLines[idxNo - 1].replace(/^.*">\s*/, '').trim() : '';
  const get = (re) => lines.find((l) => re.test(l))?.replace(re, '').trim() || null;
  const barcode = (lines.join(' ').match(/條碼\s*(?:Barcode)?\s*[:：]?\s*([\d\- ]{8,20})/i) || [])[1]?.replace(/\D/g, '') || null;
  const ing = parseIngredients(lines);
  let nut = parseNutritionBlob(lines); if (!nut.length) nut = parseNutrition(lines);
  out.push({
    source: 'serena', url, id, title: (name && !/^(共有|首頁)/.test(name) ? name : title).trim(),
    storeLine: storeLine.replace(/^.*販售通路\s*[:：]\s*/, ''), stores,
    barcode,
    ingredients: ing,
    nutrition: nut,
    allergens: lines.filter((l) => /過敏|本產品含有|同一?產線/.test(l)).slice(0, 3),
    origin: get(/^產\s*地\s*[:：]?/),
    diet: lines.find((l) => /(全素|純素|蛋奶素|奶素|蛋素|植物五辛素|葷食)/.test(l) && l.length < 40) || null,
    image: (() => { const m = html.match(/['"](\/rwd1851\/Store\/(?:prodPic|bImages)\/[^'"]+\.(?:png|jpe?g|webp))['"]/i); return m ? encodeURI(`https://www.serenafoods.com.tw${m[1]}`) : null; })(),
  });
}
await writeJson(new URL('brand/serena.json', CACHE_DIR), out);
console.log(`serena products: ${out.length}, with ingredients ${out.filter((x) => x.ingredients.length).length}, with barcode ${out.filter((x) => x.barcode).length}`);
