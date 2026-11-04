// 解析萬家福商品頁 HTML → 原始欄位（尚未標準化）
// 頁面結構：.commodity-consult .info（自由文字）、.spec-table（表格）、.commodity-complete-introduce（自由文字）

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', times: '×', hellip: '…', ndash: '–', mdash: '—', deg: '°' };
export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
export function htmlToLines(html) {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<\/td>/gi, '\t')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/[ 　 ]+/g, ' ').trim())
    .filter(Boolean);
}

function section(html, cls) {
  const i = html.indexOf(`class="${cls}`);
  if (i < 0) return '';
  // 取到下一個大區塊為止（足夠涵蓋內容）
  let rest = html.slice(html.indexOf('>', i) + 1);
  const end = rest.search(/<div[^>]*class="(distribution-service|spec-introduce|commodity-complete-introduce|recommend)|萬家福線上購物｜購物須知/);
  return rest.slice(0, end > 0 ? end : 20000);
}

const NUTRI_KEYS = [
  ['kcal', /^熱\s*量/],
  ['protein', /^蛋\s*白\s*質/],
  ['satFat', /^飽和脂肪/],
  ['transFat', /^反式脂肪/],
  ['fat', /^(總)?脂\s*肪/],
  ['sugar', /^(總)?糖(類)?(?!醇)/],
  ['carb', /^碳水化合物/],
  ['sodium', /^鈉/],
  ['fiber', /^膳食纖維/],
  ['cholesterol', /^膽固醇/],
];

function nums(s) {
  return [...s.matchAll(/(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|公克|克|g|毫克|mg|微克)?/gi)].map((m) => ({ v: +m[1], u: m[2] || '' }));
}

// 從文字行找出所有營養標示表（可能多組）
export function parseNutrition(lines) {
  const tables = [];
  let cur = null;
  const start = () => { cur = { mode: null, serving: null, perPack: null, perServing: {}, per100: {}, basis: null }; tables.push(cur); };
  for (const raw of lines) {
    const l = raw.replace(/[：:]/g, ':');
    if (/營養標示|營養成分/.test(l) || (!cur && /每一?份量|^每份\s*\d/.test(l))) start();
    if (!cur) continue;
    const sv = l.match(/每一?份量?\s*:?\s*(\d+(?:\.\d+)?)\s*(公克|克|g|毫升|ml|mL)/i);
    if (sv) { cur.serving = { size: +sv[1], unit: /毫升|ml/i.test(sv[2]) ? 'ml' : 'g' }; }
    const pk = l.match(/本包裝含\s*:?\s*(\d+(?:\.\d+)?)\s*份/);
    if (pk) cur.perPack = +pk[1];
    if (/每\s*100\s*(公克|克|g)/i.test(l)) cur.basis = 'solid';
    if (/每\s*100\s*(毫升|ml)/i.test(l)) cur.basis = 'liquid';
    const hasPerServing = /每份/.test(l), hasPer100 = /每\s*100/.test(l);
    if (hasPerServing && hasPer100) cur.mode = 'both';
    else if (hasPer100 && !NUTRI_KEYS.some(([, re]) => re.test(l))) cur.mode = cur.mode === 'both' ? 'both' : 'per100';
    else if (hasPerServing && !NUTRI_KEYS.some(([, re]) => re.test(l))) cur.mode = cur.mode === 'both' ? 'both' : 'serving';
    // 一行可能含多個營養素（以、或，分隔）
    for (const part of l.split(/[、，,]/)) {
      const p = part.trim();
      const key = NUTRI_KEYS.find(([, re]) => re.test(p));
      if (!key) continue;
      const n = nums(p.replace(/^[^\d]*/, ''));
      if (!n.length) continue;
      const mode = cur.mode || 'per100';
      if (mode === 'both' && n.length >= 2) { cur.perServing[key[0]] ??= n[0].v; cur.per100[key[0]] ??= n[1].v; }
      else if (mode === 'serving') cur.perServing[key[0]] ??= n[0].v;
      else cur.per100[key[0]] ??= n[0].v;
    }
  }
  return tables.filter((t) => Object.keys(t.per100).length + Object.keys(t.perServing).length >= 3);
}

export function parseIngredients(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:【)?(成\s*分|原\s*料|內\s*容\s*物|配\s*料|原料成分|成分內容)(?:】)?\s*[:：]?\s*(.+)$/);
    if (!m || m[2].length < 2) continue;
    let text = m[2].replace(/[。.]\s*$/, '');
    // 下一行若是「食品添加物：」接續
    const next = lines[i + 1]?.match(/^食品添加物\s*[:：]\s*(.+)$/);
    if (next) text += '、' + next[1];
    out.push(text.replace(/[。.]\s*$/, '').trim());
  }
  // 沒有「成分:」標題時：找第一行看起來像成分清單的（多個頓號、不是營養數值或行銷句）
  if (!out.length) {
    const cand = lines.find((l) => (l.match(/、/g) || []).length >= 2 && !/大卡|公克|毫克|熱量|過敏|產線|保存|運費|退貨|^[-•．]/.test(l)
      && l.split('、').every((t) => t.length <= 40) && l.length < 600);
    if (cand) out.push(cand.replace(/^[^:：]{0,6}[:：]/, '').replace(/[。.]\s*$/, '').trim());
  }
  return [...new Set(out)];
}

export function parseSpec(html) {
  const sec = section(html, 'spec-table');
  const spec = {};
  for (const [, k, v] of sec.matchAll(/<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g)) {
    spec[decode(k.replace(/<[^>]+>/g, '')).trim()] = decode(v.replace(/<[^>]+>/g, '')).trim();
  }
  return spec;
}

function ldProduct(html) {
  for (const [, j] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const o = JSON.parse(j); if (o['@type'] === 'Product') return o; } catch {}
  }
  return {};
}
function breadcrumb(html) {
  for (const [, j] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const o = JSON.parse(j); if (o['@type'] === 'BreadcrumbList') return o.itemListElement.map((x) => x.name).slice(1); } catch {}
  }
  return [];
}

export function parseProductPage(html, url) {
  const ld = ldProduct(html);
  const lines = [
    ...htmlToLines(section(html, 'commodity-consult')),
    ...htmlToLines(section(html, 'commodity-complete-introduce')),
  ];
  const spec = parseSpec(html);
  const text = lines.join('\n');
  const allergenLines = lines.filter((l) => /過敏|本產品含有|同一?產線|同一生產線/.test(l));
  const dietLine = lines.find((l) => /(全素|純素|蛋奶素|奶蛋素|奶素|蛋素|植物五辛素|五辛素|葷食?)/.test(l) && l.length < 60);
  const originLine = lines.find((l) => /^(原?產地|產品產地|製造地)\s*[:：]/.test(l));
  return {
    url,
    sku: ld.sku || url.match(/(\d+)\.html/)?.[1],
    title: decode(ld.name || ''),
    brand: ld.brand?.name || '',
    image: Array.isArray(ld.image) ? ld.image[0] : ld.image || null,
    breadcrumb: breadcrumb(html),
    spec,
    ingredients: parseIngredients(lines),
    nutrition: parseNutrition(lines),
    allergens: allergenLines,
    diet: dietLine || null,
    origin: spec['商品來源國家'] || originLine?.replace(/^[^:：]+[:：]\s*/, '') || null,
    gmoLines: lines.filter((l) => /基因改造|基改/.test(l)),
    certLines: lines.filter((l) => /(CAS|產銷履歷|有機|雨林聯盟|Rainforest|動物福利|人道)/i.test(l)).slice(0, 5),
    rawText: text.slice(0, 6000),
  };
}
