// 讀取萬家福網站地圖，列出所有商品網址與品牌段落
// 輸出：.cache/sitemap-urls.json、並印出品牌出現次數
import { politeFetch, writeJson, CACHE_DIR } from './lib/fetch.mjs';

const BASE = 'https://online.uni-prosperity.com.tw';
const index = await politeFetch(`${BASE}/sitemap_index.xml`);
const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /product/.test(u));
console.error(`sitemaps: ${maps.length}`);

const urls = [];
for (const m of maps) {
  const xml = await politeFetch(m, { delayMs: 2000 });
  if (!xml) continue;
  for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(loc);
  console.error(`${m} -> total ${urls.length}`);
}

const rows = urls.map((u) => {
  const m = u.match(/\/zh\/([^/]+)\/(\d+)\.html/);
  return m ? { url: u, brandSlug: decodeURIComponent(m[1]), sku: m[2] } : null;
}).filter(Boolean);

await writeJson(new URL('sitemap-urls.json', CACHE_DIR), rows);
const counts = {};
for (const r of rows) counts[r.brandSlug] = (counts[r.brandSlug] || 0) + 1;
console.log(JSON.stringify(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 400)));
