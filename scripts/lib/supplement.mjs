// 其他來源（Open Food Facts、品牌官網）→ 與萬家福原始資料同樣的欄位，並提供品名比對
import { readJson, CACHE_DIR } from './fetch.mjs';

const OFF_ALLERGEN = { 'en:milk': 'milk', 'en:eggs': 'egg', 'en:peanuts': 'peanut', 'en:nuts': 'nuts', 'en:soybeans': 'soy', 'en:gluten': 'gluten', 'en:sesame-seeds': 'sesame', 'en:fish': 'fish', 'en:crustaceans': 'crustacean', 'en:sulphur-dioxide-and-sulphites': 'sulfite', 'en:mango': 'mango' };
const CJK = /[一-鿿]/;
const num = (v) => (v == null || v === '' || Number.isNaN(+v) ? undefined : Math.round(+v * 10) / 10);

function offNutrition(n = {}, servingSize) {
  const pick = (suffix) => {
    const o = { kcal: num(n[`energy-kcal${suffix}`]), protein: num(n[`proteins${suffix}`]), fat: num(n[`fat${suffix}`]), satFat: num(n[`saturated-fat${suffix}`]),
      transFat: num(n[`trans-fat${suffix}`]), carb: num(n[`carbohydrates${suffix}`]), sugar: num(n[`sugars${suffix}`]),
      sodium: n[`sodium${suffix}`] != null ? Math.round(+n[`sodium${suffix}`] * 1000) : undefined, fiber: num(n[`fiber${suffix}`]) };
    for (const k in o) if (o[k] === undefined) delete o[k];
    return o;
  };
  const per100 = pick('_100g'), perServing = pick('_serving');
  if (Object.keys(per100).length < 3 && Object.keys(perServing).length < 3) return [];
  const sv = (servingSize || '').match(/(\d+(?:\.\d+)?)\s*(g|ml|公克|毫升)/i);
  return [{ mode: 'both', serving: sv ? { size: +sv[1], unit: /ml|毫升/i.test(sv[2]) ? 'ml' : 'g' } : null, perPack: null, per100, perServing, basis: sv && /ml|毫升/i.test(sv[2]) ? 'liquid' : null }];
}

export async function loadSupplements() {
  const out = [];
  const off = await readJson(new URL('off-taiwan.json', CACHE_DIR), []);
  for (const p of off) {
    const title = p['product_name_zh-TW'] || p.product_name_zh || p.product_name || '';
    if (!CJK.test(title)) continue;
    const ing = [p['ingredients_text_zh-TW'], p.ingredients_text_zh, p.ingredients_text].find((t) => t && CJK.test(t));
    out.push({
      source: 'off', label: 'Open Food Facts', url: `https://world.openfoodfacts.org/product/${p.code}`,
      title, brandText: p.brands || '', quantity: p.quantity || '',
      barcode: /^\d{8,14}$/.test(p.code) ? p.code : null,
      ingredients: ing ? [ing.replace(/^(成分|原料|配料)\s*[:：]\s*/, '').replace(/[。.]\s*$/, '')] : [],
      nutrition: offNutrition(p.nutriments, p.serving_size),
      allergenIds: (p.allergens_tags || []).map((t) => OFF_ALLERGEN[t]).filter(Boolean),
      sharedIds: (p.traces_tags || []).map((t) => OFF_ALLERGEN[t]).filter(Boolean),
      image: p.image_front_url || null,
    });
  }
  const serena = await readJson(new URL('brand/serena.json', CACHE_DIR), []);
  for (const s of serena) out.push({ ...s, label: '喜年來官網', brandText: '喜年來', brandId: 'serena' });
  return out;
}

// ---------- 品名相似度 ----------
const STRIP = /\d+(?:\.\d+)?\s*(公克|克|g|kg|公斤|毫升|ml|cc|公升|l)\b|[x×*]\s*\d+\s*(入|包|罐|瓶|盒|袋)?|\d+\s*(入|包入)|tp|pet|can|鋁罐|寶特瓶|利樂包|箱購|盒裝|量販包|家庭號|[()（）【】\[\]\s\-_/|.,，、·]/gi;
export function nameKey(s, brandWords = []) {
  let t = (s || '').normalize('NFKC').toLowerCase();
  for (const w of brandWords) t = t.split(w.toLowerCase()).join('');
  return t.replace(STRIP, '').replace(/臺/g, '台');
}
const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = grams(a), B = grams(b); let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size || 1);
}
export function brandMatches(brand, text) {
  const t = (text || '').toLowerCase();
  return [brand.name, ...brand.aliases, ...brand.slugs, ...(brand.en || [])].some((w) => w && t.includes(w.toLowerCase()));
}
