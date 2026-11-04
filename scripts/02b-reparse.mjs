// 只用本機快取重新解析（不連網），解析器改版後使用
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readJson, writeJson, CACHE_DIR } from './lib/fetch.mjs';
import { parseProductPage } from './lib/parse-uniprosperity.mjs';
import { SLUG_TO_BRAND } from './brands.mjs';

const rows = await readJson(new URL('sitemap-urls.json', CACHE_DIR), []);
let n = 0;
for (const r of rows) {
  if (!SLUG_TO_BRAND.has(r.brandSlug)) continue;
  const h = createHash('sha1').update(r.url).digest('hex').slice(0, 16);
  let html; try { html = await readFile(new URL(`pages/${h}.html`, CACHE_DIR), 'utf8'); } catch { continue; }
  const parsed = parseProductPage(html, r.url);
  parsed.brandId = SLUG_TO_BRAND.get(r.brandSlug); parsed.brandSlug = r.brandSlug;
  await writeJson(new URL(`raw/${r.sku}.json`, CACHE_DIR), parsed); n++;
}
console.log(`reparsed ${n}`);
