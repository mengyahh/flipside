// 把審核頁匯出的 review/review.json 合併進 data/overrides.json（以及成分別名進 substances.json）
// 用法：node scripts/04-merge-review.mjs && node scripts/03-build.mjs
import { readJson, writeJson } from './lib/fetch.mjs';
import { parseNutrition, htmlToLines } from './lib/parse-uniprosperity.mjs';

const ROOT = new URL('../', import.meta.url);
const review = await readJson(new URL('review/review.json', ROOT), null);
if (!review) { console.error('找不到 review/review.json'); process.exit(1); }
const pending = await readJson(new URL('review/pending.json', ROOT), { items: [] });
const pend = new Map(pending.items.map((x) => [x.id, x]));
const ov = await readJson(new URL('data/overrides.json', ROOT), {});
const today = new Date().toISOString().slice(0, 10);
const touch = (id) => (ov[id] ||= {});

for (const [id, s] of Object.entries(review.stores || {})) {
  const o = touch(id); o.stores ||= {};
  for (const [k, v] of Object.entries(s)) o.stores[k] = { status: v, verified: v !== 'unknown', source: 'manual', checkedAt: today };
}
for (const [id, c] of Object.entries(review.choices || {})) {
  const o = touch(id);
  if (c.ingredients) o.ingredients = { raw: c.ingredients };
  if (c.nutrition != null) {
    const cand = pend.get(id)?.issues.find((i) => i.field === 'nutrition')?.candidates?.[c.nutrition];
    if (cand) o.nutrition = { basis: cand.serving?.unit === 'ml' ? 'liquid' : 'solid', serving: cand.serving, perServing: cand.perServing, per100: cand.per100 };
  }
}
for (const [id, m] of Object.entries(review.missing || {})) {
  const o = touch(id);
  if (m.ingredients) o.ingredients = { raw: m.ingredients };
  if (m.nutritionText) {
    const t = parseNutrition(htmlToLines(m.nutritionText.replace(/\n/g, '<br>')))[0];
    if (t) o.nutrition = { basis: t.basis || (t.serving?.unit === 'ml' ? 'liquid' : 'solid'), serving: t.serving, servingsPerPack: t.perPack, perServing: t.perServing, per100: t.per100 };
  }
  o.hidden = !!m.hide;
}
for (const [id, keep] of Object.entries(review.labels || {})) touch(id).labelsKeep = keep;
for (const [id, codes] of Object.entries(review.barcodes || {})) touch(id).barcodes = codes;

await writeJson(new URL('data/overrides.json', ROOT), ov);

// 別名
if (review.aliases?.length) {
  const subsUrl = new URL('site/data/substances.json', ROOT);
  const subs = await readJson(subsUrl, []);
  const ignore = await readJson(new URL('data/ignored-terms.json', ROOT), []);
  for (const a of review.aliases) {
    if (a.substance === '__ignore') { if (!ignore.includes(a.text)) ignore.push(a.text); continue; }
    const s = subs.find((x) => x.id === a.substance);
    if (s && !s.aliases.includes(a.text) && s.name !== a.text) s.aliases.push(a.text);
  }
  await writeJson(subsUrl, subs);
  await writeJson(new URL('data/ignored-terms.json', ROOT), ignore);
}
console.log(`merged: ${Object.keys(ov).length} products in overrides`);
