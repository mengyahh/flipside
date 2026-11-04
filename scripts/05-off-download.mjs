// 下載 Open Food Facts 上的台灣商品（ODbL 授權），存成 .cache/off-taiwan.json
// OFF 搜尋 API 限制約每分鐘 10 次，所以每頁間隔 7 秒
import { politeFetch, writeJson, readJson, CACHE_DIR } from './lib/fetch.mjs';

const FIELDS = 'code,product_name,product_name_zh,product_name_zh-TW,brands,brands_tags,quantity,ingredients_text,ingredients_text_zh,ingredients_text_zh-TW,nutriments,serving_size,allergens_tags,traces_tags,labels_tags,image_front_url,categories_tags,last_modified_t';
const out = await readJson(new URL('off-taiwan.json', CACHE_DIR), []);
const seen = new Set(out.map((p) => p.code));
const firstPage = Math.max(11, Math.floor(out.length / 100) + 1); // 前 10 頁已抓過；超過第 10 頁會被拒，直接跳到品牌查詢
for (let page = firstPage; page <= 10; page++) {
  const url = `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=taiwan&page_size=100&page=${page}&fields=${FIELDS}`;
  let body;
  try { body = await politeFetch(url, { delayMs: 12000, retries: 6 }); } catch (e) { console.error(`page ${page} failed: ${e.message}`); break; }
  let d; try { d = JSON.parse(body); } catch { console.error(`page ${page}: not JSON`); break; }
  const list = d.products || [];
  for (const p of list) if (!seen.has(p.code)) { seen.add(p.code); out.push(p); }
  console.error(`page ${page}: +${list.length} total ${out.length} / ${d.count}`);
  await writeJson(new URL('off-taiwan.json', CACHE_DIR), out);
  if (!list.length || page * 100 >= d.count) break;
}
// 依品牌補抓（OFF 搜尋 API 超過第 10 頁會被拒絕，所以改用品牌標籤縮小範圍）
const { BRANDS } = await import('./brands.mjs');
const tags = [...new Set(BRANDS.flatMap((b) => [b.name, ...b.aliases, ...b.en]).map((t) => t.toLowerCase().replace(/\s+/g, '-')))];
for (const tag of tags) {
  for (let page = 1; page <= 10; page++) {
    const url = `https://world.openfoodfacts.org/api/v2/search?brands_tags=${encodeURIComponent(tag)}&page_size=100&page=${page}&fields=${FIELDS}`;
    let d; try { d = JSON.parse(await politeFetch(url, { delayMs: 12000, retries: 3 })); } catch (e) { console.error(`brand ${tag} p${page} failed: ${e.message}`); break; }
    const list = d.products || []; let added = 0;
    for (const p of list) if (!seen.has(p.code)) { seen.add(p.code); out.push(p); added++; }
    console.error(`brand ${tag} p${page}: ${list.length} results, +${added} new, total ${out.length}`);
    await writeJson(new URL('off-taiwan.json', CACHE_DIR), out);
    if (list.length < 100) break;
  }
}
console.log(`OFF products: ${out.length}`);
