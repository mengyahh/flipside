// 抓取目標品牌的萬家福商品頁（有快取，可中斷後續跑），解析成原始 JSON
// 輸出：.cache/raw/<sku>.json
import { cachedFetch, readJson, writeJson, CACHE_DIR } from './lib/fetch.mjs';
import { parseProductPage } from './lib/parse-uniprosperity.mjs';
import { SLUG_TO_BRAND } from './brands.mjs';

const rows = await readJson(new URL('sitemap-urls.json', CACHE_DIR), []);
const targets = rows.filter((r) => SLUG_TO_BRAND.has(r.brandSlug));
console.error(`targets: ${targets.length}`);

let done = 0, fetched = 0, failed = 0;
for (const r of targets) {
  try {
    const { html, cached } = await cachedFetch(r.url, { delayMs: 2500 });
    if (!cached) fetched++;
    if (html) {
      const parsed = parseProductPage(html, r.url);
      parsed.brandId = SLUG_TO_BRAND.get(r.brandSlug);
      parsed.brandSlug = r.brandSlug;
      await writeJson(new URL(`raw/${r.sku}.json`, CACHE_DIR), parsed);
    }
  } catch (e) {
    failed++;
    console.error(`FAIL ${r.url} ${e.message}`);
  }
  if (++done % 25 === 0) console.error(`${done}/${targets.length} fetched=${fetched} failed=${failed}`);
}
console.error(`DONE ${done}/${targets.length} fetched=${fetched} failed=${failed}`);
