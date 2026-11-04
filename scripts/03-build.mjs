// 把 .cache/raw/*.json 整理成網站資料 site/data/products.json 與審核清單 review/pending.json
// 會保留 data/overrides.json（人工審核結果）的修正
import { readdir } from 'node:fs/promises';
import { readJson, writeJson, CACHE_DIR } from './lib/fetch.mjs';
import { parseList, annotate, buildMatcher } from './lib/ingredients.mjs';
import { BRANDS } from './brands.mjs';

const ROOT = new URL('../', import.meta.url);
const today = new Date().toISOString().slice(0, 10);
const substances = await readJson(new URL('site/data/substances.json', ROOT), []);
const match = buildMatcher(substances);
const overrides = await readJson(new URL('data/overrides.json', ROOT), {});
const ignored = new Set(await readJson(new URL('data/ignored-terms.json', ROOT), []));

// ---------- 分類規則（依序比對：標題 + 麵包屑） ----------
const CAT_RULES = [
  ['EXCLUDE', /啤酒|紹興|高粱|米酒|料理酒|調酒|威士忌|葡萄酒|清酒|梅酒|沙瓦|酒精|飼料|寵物|貓|狗|洗|紙|保養|面膜|牙|餐具|保溫|鍋|杯具|禮券|贈品|保健食品|膠囊|錠|益生菌粉|奶粉|嬰兒|幼兒|成長配方|配方奶|醬油|味噌|沙拉醬|番茄醬|烤肉醬|調味料|胡椒|鹽巴|食用油|沙拉油|麵粉|白米|糙米|米$|冷凍水餃|水餃|餛飩|湯圓|包子|饅頭|蔥油餅/],
  ['meat.sausage', /香腸|熱狗|德式|小熱狗|雞肉腸|豬肉腸|貢丸|魚丸|甜不辣/],
  ['meat.ham', /火腿|培根|臘肉|叉燒|煙燻/],
  ['meat.jerky', /肉乾|肉條|肉角|牛肉乾|豬肉乾|肉紙|肉脯/],
  ['meat.floss', /肉鬆|肉酥|魚鬆/],
  ['meat.canned', /肉醬|肉燥|肉罐|牛肉罐|雞肉罐|鮪魚|罐頭.*(肉|雞|魚)|(肉|雞|魚).*罐|花瓜|麵筋|菜心|筍|蔭瓜|豆腐乳/],
  ['ice.bar', /冰棒|雪糕|雪派|冰棍|冰沙棒/],
  ['ice.cream', /冰淇淋|冰品|霜淇淋|冰淇林|杯冰|甜筒/],
  ['dairy.yogurt', /優格|優酪|多多|發酵乳|活菌|養樂/],
  ['dairy.pudding', /布丁|奶酪|仙草凍|愛玉|豆花|果凍杯/],
  ['dairy.milk', /鮮乳|鮮奶|保久乳|全脂牛乳|低脂牛乳|脫脂牛乳|^.{0,8}牛乳\s*\d|羊乳|高鈣牛乳/],
  ['drink.coffee', /咖啡|拿鐵|美式|卡布|貝納頌|韋恩|左岸/],
  ['drink.milk', /調味乳|奶茶|乳飲|果乳|巧克力牛乳|麥芽牛乳|木瓜牛乳|蘋果牛乳|咖啡牛乳|保久調味|乳酸飲料|可爾必思|優酪飲|鮮奶茶|麥芽飲/],
  ['drink.plant', /豆漿|豆奶|燕麥奶|杏仁奶|米漿|植物奶|黑豆漿/],
  ['drink.tea', /茶|烏龍|紅茶|綠茶|麥茶|青茶|普洱|花茶|冬瓜|茶裏王|純喫茶|麥香/],
  ['drink.soda', /汽水|沙士|可樂|蘇打|氣泡|碳酸|C&C|candc/i],
  ['drink.sport', /運動飲料|電解質|能量|機能|維他命飲|寶礦力|舒跑|補給|蠻牛|提神/],
  ['drink.juice', /果汁|蔬果汁|柳橙汁|蘋果汁|葡萄汁|番茄汁|芭樂汁|蔓越莓|檸檬|柳丁|鳳梨汁|蘆筍汁|蔬菜汁|每日C|椰子水|果粒|果肉|梅子綠|酸梅湯|楊桃/],
  ['drink.water', /礦泉水|純水|蒸餾水|鹼性水|海洋深層水|^.{0,6}水\s*\d/],
  ['noodle.instant', /泡麵|拉麵|麵\s*\d+g|碗麵|杯麵|袋麵|速食麵|科學麵|王子麵|雞絲麵|拌麵|乾麵|冬粉|米粉|意麵|來一客|滿漢|大補帖|阿Q|一度贊|小廚師/],
  ['noodle.cereal', /麥片|燕麥|穀片|玉米片|麥粉|沖泡|即溶|三合一|堅果飲|穀物飲|麵茶|芝麻糊|杏仁茶|穀粉|五穀粉|完膳/],
  ['noodle.ready', /即食|調理包|咖哩|粥|湯品|濃湯|雞湯|燉|微波|罐頭/],
  ['biscuit.eggroll', /蛋捲|捲心酥|雞蛋捲|蛋酥捲/],
  ['biscuit.sandwich', /夾心|威化|wafer|三明治餅/i],
  ['biscuit.cake', /蛋糕|麵包|吐司|蛋黃派|派$|派\s|銅鑼燒|瑞士捲|鬆糕|小西點|泡芙|蛋酥|鳳梨酥|月餅|牛舌餅|太陽餅/],
  ['biscuit.cookie', /餅乾|餅|酥|蘇打餅|薄餅|曲奇|消化餅|口糧|小饅頭|蛋酥|奶酥|喜年來/],
  ['snack.chips', /洋芋片|薯片|薯條|卡迪那|卡廸那|波卡|樂事|多力多滋|玉米片|薯格/],
  ['snack.puffed', /乖乖|可樂果|浪味仙|蝦味先|玉米脆|脆條|脆棒|圈圈|米果|仙貝|雪餅|米菓|膨化|旺旺|豆塔|元氣|爆米花|鍋巴/],
  ['snack.nuts', /堅果|花生|腰果|杏仁果|核桃|開心果|夏威夷豆|瓜子|葵瓜子|南瓜子|豌豆|蠶豆|青豆|毛豆|黑豆|綜合果仁|萬歲牌|堅果日記/],
  ['snack.chocolate', /巧克力|可可(?!粉)/],
  ['snack.candy', /糖果|軟糖|喉糖|口香糖|棒棒糖|牛軋糖|麥芽糖|硬糖|QQ糖|果凍|蒟蒻|晶球/],
  ['snack.dried', /果乾|蜜餞|梅|芒果乾|葡萄乾|蔓越莓乾|龍眼乾|地瓜|番薯/],
  ['snack.seaweed', /海苔|紫菜|元本山/],
];
const BREAD_DEFAULT = [
  [/飲料|茶|咖啡/, 'drink.other'],
  [/零食|餅乾|糖果/, 'snack.other'],
  [/冰品|冰淇淋/, 'ice.cream'],
  [/肉/, 'meat.other'],
];
function categorize(title, bread) {
  const s = `${title} ${bread.join(' ')}`;
  for (const [id, re] of CAT_RULES) if (re.test(id === 'EXCLUDE' ? title : s)) return id;
  if (/酒/.test(bread.join(' '))) return 'EXCLUDE';
  for (const [re, id] of BREAD_DEFAULT) if (re.test(bread.join(' '))) return id;
  return null;
}

// ---------- 品名與容量 ----------
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(公克|克|g|G|kg|KG|公斤|毫升|ml|mL|ML|cc|CC|公升|L)(?![a-z])/;
const PACK_RE = /[x×X*＊]\s*(\d+)\s*(入|包|罐|瓶|盒|袋|杯|支|條|片|組)?|(\d+)\s*(入|包入|罐入|瓶入|盒入|袋入|杯入|支入)/;
function splitTitle(title, brand) {
  let t = title.normalize('NFKC').replace(/【[^】]*】|\[[^\]]*\]|（[^）]*箱[^）]*）|\([^)]*箱[^)]*\)/g, ' ').trim();
  const size = t.match(SIZE_RE);
  const pack = t.match(PACK_RE);
  let name = t;
  for (const prefix of [brand.name, ...brand.slugs, ...brand.aliases]) {
    if (name.startsWith(prefix)) { name = name.slice(prefix.length); break; }
  }
  name = name
    .replace(new RegExp(SIZE_RE.source, 'g'), ' ')
    .replace(new RegExp(PACK_RE.source, 'g'), ' ')
    .replace(/(箱購|整箱|量販包|家庭號|超值|組合|特惠|限量|盒裝|BOX盒|BOX|箱裝|瓶裝|罐裝)/gi, ' ')
    .replace(/[\s\-_/|]+/g, ' ')
    .replace(/\s*\b(TP|PET|Pet|pet|can|CAN|Can|BIB|LL)\b\s*$/g, '')
    .replace(/\s*(鋁罐|寶特瓶|利樂包|易開罐|鐵罐|玻璃瓶)\s*$/g, '')
    .trim();
  const sizeStr = size ? `${size[1]}${normUnit(size[2])}` : null;
  const packN = pack ? +(pack[1] || pack[3]) : null;
  return { name: name || title, size: sizeStr ? (packN && packN > 1 ? `${sizeStr}×${packN}` : sizeStr) : null, unitSize: sizeStr };
}
function normUnit(u) {
  u = u.toLowerCase();
  return { '公克': 'g', '克': 'g', g: 'g', kg: 'kg', '公斤': 'kg', '毫升': 'ml', ml: 'ml', cc: 'ml', '公升': 'L', l: 'L' }[u] || u;
}

// ---------- 過敏原 ----------
const ALLERGEN_RE = [
  ['crustacean', /甲殼|蝦|蟹/], ['mango', /芒果/], ['peanut', /花生/], ['milk', /牛奶|羊奶|乳|奶/],
  ['egg', /蛋/], ['nuts', /堅果|杏仁|核桃|腰果|榛果|夏威夷豆|開心果|胡桃|松子|巴西堅果/], ['sesame', /芝麻/],
  ['gluten', /麩質|小麥|大麥|燕麥|黑麥|裸麥/], ['soy', /大豆|黃豆/], ['fish', /魚/], ['sulfite', /亞硫酸|二氧化硫/],
];
function parseAllergens(lines) {
  const raw = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const contains = new Set(), shared = new Set();
  for (const sentence of raw.split(/[。；;！!]/)) {
    const isShared = /產線|生產線|設備|同一工廠|同廠/.test(sentence);
    // 「本產品含有X，與含有Y之產品同產線」→ 前半含有、後半同產線
    const parts = isShared ? sentence.split(/[，,]?(?=與|和|及其他|與其他|於同)/) : [sentence];
    parts.forEach((part, i) => {
      const target = isShared && (i > 0 || /產線|生產線|設備/.test(part)) && !/本產品含有/.test(part) ? shared : contains;
      for (const [id, re] of ALLERGEN_RE) if (re.test(part)) target.add(id);
    });
  }
  for (const id of contains) shared.delete(id);
  return { contains: [...contains], sharedLine: [...shared], raw: raw.slice(0, 300) };
}

const DIET_MAP = [[/全素|純素/, 'vegan'], [/植物五辛素|五辛素/, 'five-pungent'], [/蛋奶素|奶蛋素/, 'ovo-lacto'], [/奶素/, 'lacto'], [/蛋素/, 'ovo'], [/葷/, 'meat']];
const dietOf = (s) => (s ? DIET_MAP.find(([re]) => re.test(s))?.[1] || null : null);

function gmoOf(lines, ingredientText) {
  const all = [...lines, ingredientText || ''].join(' ');
  if (/高層次加工.*基因改造|基因改造.*高層次加工/.test(all)) return { status: 'gmo-free-highly-processed', raw: lines[0] || null };
  const NON = /非基因改造|非基改|(不含|無|未使用|未含)基因改造(原料|成分)?/g;
  if (/基因改造/.test(all.replace(NON, ''))) return { status: 'gmo-contains', raw: lines.find((l) => /基因改造/.test(l.replace(NON, ''))) || null };
  if (NON.test(all)) return { status: 'non-gmo-claimed', raw: (all.match(/[^、，。]*非基(因改造|改)[^、，。]*/) || [])[0] || null };
  return { status: 'unknown', raw: null };
}

function labelsOf(certLines, gmo) {
  const out = [];
  const t = certLines.join(' ');
  if (/CAS/.test(t) && /(認證|標章|產品)/.test(t) && !/^[^。]*CAS[^。]*(豬|雞|肉)為原料[^。]*$/.test(t)) out.push({ id: 'cas', evidence: certLines.find((l) => /CAS/.test(l)) });
  if (/產銷履歷/.test(t)) out.push({ id: 'tap', evidence: certLines.find((l) => /產銷履歷/.test(l)) });
  if (/有機/.test(t) && /(認證|標章|驗證)/.test(t)) out.push({ id: 'organic', evidence: certLines.find((l) => /有機/.test(l)) });
  if (/雨林聯盟|Rainforest/i.test(t)) out.push({ id: 'rainforest', evidence: certLines.find((l) => /雨林|Rainforest/i.test(l)) });
  if (/動物福利|人道飼養/.test(t)) out.push({ id: 'animal-welfare', evidence: certLines.find((l) => /動物福利|人道/.test(l)) });
  if (gmo.status === 'non-gmo-claimed') out.push({ id: 'non-gmo', evidence: gmo.raw });
  return out;
}

function pickNutrition(tables, issues) {
  if (!tables.length) return null;
  const t = tables[0];
  if (tables.length > 1) {
    const a = t.per100.kcal, others = tables.slice(1).map((x) => x.per100.kcal).filter((x) => x != null);
    if (a != null && others.some((b) => Math.abs(a - b) / Math.max(a, b) > 0.03)) {
      issues.push({ field: 'nutrition', type: 'conflict', note: `頁面上有 ${tables.length} 組營養標示，每100熱量不一致：${[a, ...others].join(' / ')}`, candidates: tables.map((x) => ({ per100: x.per100, perServing: x.perServing, serving: x.serving })) });
    }
  }
  const n = { basis: t.basis || (t.serving?.unit === 'ml' ? 'liquid' : 'solid'), serving: t.serving, servingsPerPack: t.perPack, perServing: t.perServing, per100: { ...t.per100 } };
  // 只有每份時換算每100
  if (!Object.keys(n.per100).length && t.serving?.size) {
    for (const [k, v] of Object.entries(t.perServing)) n.per100[k] = Math.round((v / t.serving.size) * 1000) / 10;
    n.per100Computed = true;
  }
  return n;
}

// ---------- 主流程 ----------
const files = (await readdir(new URL('raw/', CACHE_DIR))).filter((f) => f.endsWith('.json'));
const groups = new Map();
const stats = { raw: files.length, excluded: 0, uncategorized: 0, noIngredients: 0 };
const uncategorized = [];

for (const f of files) {
  const r = await readJson(new URL(`raw/${f}`, CACHE_DIR));
  const brand = BRANDS.find((b) => b.id === r.brandId);
  const cat = categorize(r.title, r.breadcrumb || []);
  if (cat === 'EXCLUDE') { stats.excluded++; continue; }
  if (!r.ingredients.length && !r.nutrition.length) { stats.noIngredients++; continue; }
  if (!cat) { stats.uncategorized++; uncategorized.push(`${r.title} | ${(r.breadcrumb || []).join('>')}`); continue; }
  const { name, size } = splitTitle(r.title, brand);
  const key = `${brand.id}|${name.normalize('NFKC').replace(/\s/g, '').toLowerCase()}`;
  if (!groups.has(key)) groups.set(key, { raws: [], brand, name, cat });
  groups.get(key).raws.push({ ...r, size });
}

const products = [];
const pending = [];
const richness = (x) => (x.ingredients.length ? 2 : 0) + (x.nutrition.length ? 2 : 0) + (x.allergens.length ? 1 : 0) - (x.ingredients.length > 1 ? 0.5 : 0);
for (const g of groups.values()) {
  g.raws.sort((a, b) => richness(b) - richness(a) || a.sku.localeCompare(b.sku));
  const r = g.raws[0];
  const id = `${g.brand.id}-${r.sku}`;
  const issues = [];
  const ingRaw = r.ingredients[0] || null;
  if (r.ingredients.length > 1) issues.push({ field: 'ingredients', type: 'conflict', note: `頁面上有 ${r.ingredients.length} 份成分寫法`, candidates: r.ingredients });
  if (!ingRaw) issues.push({ field: 'ingredients', type: 'missing', note: '找不到成分' });
  const items = ingRaw ? annotate(parseList(ingRaw), match) : [];
  const unmatchedFunctions = [];
  (function walk(arr) { for (const it of arr) { if (it.function && it.children) for (const c of it.children) if (!c.substance && !c.children && !ignored.has(c.text)) unmatchedFunctions.push(`${it.function}：${c.text}`); if (it.children) walk(it.children); } })(items);
  if (unmatchedFunctions.length) issues.push({ field: 'substances', type: 'unmatched', note: '下列添加物沒有對應到成分資料庫', candidates: unmatchedFunctions });
  const nutrition = pickNutrition(r.nutrition, issues);
  if (!nutrition) issues.push({ field: 'nutrition', type: 'missing', note: '找不到營養標示' });
  const gmo = gmoOf(r.gmoLines, ingRaw);
  const labels = labelsOf(r.certLines, gmo);
  if (labels.length) issues.push({ field: 'labels', type: 'verify', note: '自動偵測到標籤，請確認是認證而非宣稱', candidates: labels.map((l) => `${l.id}：${l.evidence || ''}`) });
  const allergens = parseAllergens(r.allergens);
  const variants = g.raws.map((x) => ({ size: x.size, sku: x.sku, barcodes: [] }))
    .filter((v, i, a) => a.findIndex((y) => y.size === v.size) === i);
  const p = {
    id,
    name: g.name,
    brand: g.brand.id,
    category: g.cat,
    variants,
    ingredients: ingRaw ? { raw: ingRaw, items } : null,
    nutrition,
    allergens,
    gmo,
    origin: r.origin ? { country: r.origin.replace(/^中華民國$/, '台灣') } : null,
    diet: dietOf(r.diet),
    labels,
    stores: { pxmart: { status: 'unknown', verified: false }, seven: { status: 'unknown', verified: false }, family: { status: 'unknown', verified: false } },
    images: r.image ? [{ kind: 'front', file: `${r.image}?sw=480&sh=480`, sourceUrl: r.url, credit: '萬家福線上購物' }] : [],
    sources: g.raws.map((x) => ({ type: 'uni-prosperity', label: '萬家福線上購物', url: x.url, fetchedAt: today })),
    review: { status: 'needs-review', issues },
    updatedAt: today,
  };
  // 套用人工審核結果
  const o = overrides[id];
  if (o?.hidden) continue;
  if (o) {
    if (o.stores) p.stores = { ...p.stores, ...o.stores };
    if (o.barcodes) p.variants[0].barcodes = o.barcodes;
    if (o.ingredients?.raw) {
      p.ingredients = { raw: o.ingredients.raw, items: annotate(parseList(o.ingredients.raw), match) };
      p.review.issues = p.review.issues.filter((i) => i.field !== 'ingredients');
    }
    if (o.nutrition) { p.nutrition = o.nutrition; p.review.issues = p.review.issues.filter((i) => i.field !== 'nutrition'); }
    if (o.labelsKeep) { p.labels = p.labels.filter((l) => o.labelsKeep.includes(l.id)); p.review.issues = p.review.issues.filter((i) => i.field !== 'labels'); }
    for (const k of ['name', 'category', 'diet', 'origin', 'allergens', 'gmo']) if (o[k] !== undefined) p[k] = o[k];
    const storesDone = Object.values(p.stores).every((s) => s.verified);
    if (storesDone && !p.review.issues.length) p.review.status = 'verified';
  }
  products.push(p);
  pending.push({ id, title: `${g.brand.name} ${g.name}`, category: g.cat, image: p.images[0]?.file, url: r.url, issues: p.review.issues });
}

products.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, 'zh-Hant'));
await writeJson(new URL('site/data/products.json', ROOT), { meta: { updatedAt: today, count: products.length }, products });
await writeJson(new URL('site/data/brands.json', ROOT), BRANDS.map(({ id, name, aliases }) => ({ id, name, aliases })));
await writeJson(new URL('review/pending.json', ROOT), { generatedAt: today, items: pending });
await writeJson(new URL('uncategorized.json', CACHE_DIR), uncategorized);

const byCat = {}; for (const p of products) byCat[p.category] = (byCat[p.category] || 0) + 1;
const issueCount = {}; for (const x of pending) for (const i of x.issues) issueCount[`${i.field}.${i.type}`] = (issueCount[`${i.field}.${i.type}`] || 0) + 1;
console.log(JSON.stringify({ ...stats, products: products.length, byCat, issueCount }, null, 1));
