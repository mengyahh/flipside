// 翻背面：單頁應用（hash 路由，無建置步驟）
const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const CFG = window.FLIPSIDE_CONFIG || {};

const STORES = { pxmart: '全聯', seven: '7-11', family: '全家' };
const ALLERGENS = {
  crustacean: '甲殼類', mango: '芒果', peanut: '花生', milk: '奶類', egg: '蛋',
  nuts: '堅果', sesame: '芝麻', gluten: '麩質穀物', soy: '大豆', fish: '魚類', sulfite: '亞硫酸鹽',
};
const DIETS = { vegan: '全素', 'ovo-lacto': '蛋奶素', lacto: '奶素', ovo: '蛋素', 'five-pungent': '植物五辛素', meat: '葷食' };
const NUTRIENTS = [
  ['kcal', '熱量', '大卡'], ['protein', '蛋白質', '公克'], ['fat', '脂肪', '公克'], ['satFat', '飽和脂肪', '公克', 1],
  ['transFat', '反式脂肪', '公克', 1], ['carb', '碳水化合物', '公克'], ['sugar', '糖', '公克', 1], ['sodium', '鈉', '毫克'],
  ['fiber', '膳食纖維', '公克'], ['cholesterol', '膽固醇', '毫克'],
];
const GMO = {
  'gmo-contains': '含基因改造原料', 'non-gmo-claimed': '標示使用非基因改造原料',
  'gmo-free-highly-processed': '含高層次加工基改原料（已不含基改 DNA）', unknown: '未標示',
};

// ---------- 儲存（localStorage 可能不可用） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('fs.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fs.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- 資料 ----------
const DB = { products: [], byId: new Map(), byBarcode: new Map(), substances: new Map(), categories: [], brands: new Map(), labels: new Map(), meta: {} };

async function loadData() {
  const get = (f) => fetch(`data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [p, s, c, b, l] = await Promise.all([get('products.json'), get('substances.json'), get('categories.json'), get('brands.json'), get('labels.json')]);
  DB.meta = p.meta || {};
  DB.products = p.products;
  for (const x of s) DB.substances.set(x.id, x);
  DB.categories = c;
  for (const x of b) DB.brands.set(x.id, x);
  for (const x of l) DB.labels.set(x.id, x);
  for (const x of DB.products) {
    DB.byId.set(x.id, x);
    for (const v of x.variants || []) for (const code of v.barcodes || []) DB.byBarcode.set(code, x);
    x._subs = new Set(collectSubs(x.ingredients?.items || []));
    x._search = norm([x.name, x.flavor, brandName(x.brand), ...(DB.brands.get(x.brand)?.aliases || []), catName(x.category), ...(x.keywords || [])].join(' '));
  }
}
function collectSubs(items, out = []) {
  for (const it of items) { if (it.substance) out.push(it.substance); if (it.children) collectSubs(it.children, out); }
  return out;
}
const brandName = (id) => DB.brands.get(id)?.name || id || '';
function catName(id) {
  for (const c of DB.categories) { if (c.id === id) return c.name; for (const s of c.children || []) if (s.id === id) return s.name; }
  return '';
}
function catRoot(id) { return (id || '').split('.')[0]; }

// ---------- 搜尋 ----------
function norm(s) {
  return (s || '')
    .normalize('NFKC').toLowerCase()
    .replace(/[臺]/g, '台').replace(/[\s·・\-_/()（）【】「」]/g, '');
}
function search(q, list = DB.products) {
  const nq = norm(q);
  if (!nq) return list;
  if (/^\d{8,14}$/.test(nq)) { const p = DB.byBarcode.get(nq); return p ? [p] : []; }
  const grams = new Set(); for (let i = 0; i < nq.length - 1; i++) grams.add(nq.slice(i, i + 2));
  const scored = [];
  for (const p of list) {
    let score = 0;
    if (p._search.includes(nq)) score += 100 + (norm(p.name).startsWith(nq) ? 20 : 0);
    else if (nq.length > 1) { let hit = 0; for (const g of grams) if (p._search.includes(g)) hit++; if (hit / grams.size >= 0.6) score += hit * 10; }
    else if (p._search.includes(nq)) score += 50;
    if (score) scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

// ---------- 篩選 ----------
const emptyFilter = () => ({ cats: [], origins: [], excludeSubs: [], excludeAllergens: [], labels: [], diets: [] });
const NO_ORIGIN = '未標示';
const originOf = (p) => p.origin?.country || NO_ORIGIN;
let filter = (() => { const f = { ...emptyFilter(), ...store.get('filter', {}) }; delete f.stores; return f; })();
// 所在通路：使用者已經在店裡，直接切換，不放在篩選裡
let here = STORES[store.get('here', '')] ? store.get('here', '') : '';
const setHere = (k) => { here = STORES[k] ? k : ''; store.set('here', here); };
function applyFilter(list, f = filter) {
  return list.filter((p) => {
    if (f.cats.length && !f.cats.some((c) => p.category === c || catRoot(p.category) === c)) return false;
    if (here && p.stores?.[here]?.status !== 'yes') return false;
    if (f.origins.length && !f.origins.includes(originOf(p))) return false;
    if (f.excludeSubs.some((s) => p._subs.has(s))) return false;
    if (f.excludeAllergens.some((a) => p.allergens?.contains?.includes(a))) return false;
    if (f.labels.length && !f.labels.every((l) => p.labels?.some((x) => x.id === l))) return false;
    if (f.diets.length && !f.diets.includes(p.diet)) return false;
    return true;
  });
}
const filterCount = (f = filter) => f.origins.length + f.cats.length + f.excludeSubs.length + f.excludeAllergens.length + f.labels.length + f.diets.length;

// ---------- 收藏與最近 ----------
let favs = new Set(store.get('favs', []));
function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  store.set('favs', [...favs]);
  toast(favs.has(id) ? '已加入收藏' : '已移除收藏');
  return favs.has(id);
}
function pushRecent(id) {
  const r = store.get('recent', []).filter((x) => x !== id);
  r.unshift(id); store.set('recent', r.slice(0, 8));
}

// ---------- 共用 UI ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); }
const icon = {
  search: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  x: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  filter: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  heart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  scan: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 9v6M10 9v6M13 9v6M16 9v6"/></svg>',
  share: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 13v7h14v-7"/></svg>',
  back: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
};
function storeChips(p) {
  return Object.entries(STORES).filter(([k]) => p.stores?.[k]?.status === 'yes').map(([, n]) => `<span class="chip static store">${n}</span>`).join('');
}
function labelChips(p) {
  return (p.labels || []).map((l) => `<span class="chip static good">${esc(DB.labels.get(l.id)?.short || l.id)}</span>`).join('');
}
function itemHTML(p) {
  const img = p.images?.[0]?.file;
  const size = p.variants?.map((v) => v.size).filter(Boolean).join('／');
  return `<li><a class="item" href="#/p/${encodeURIComponent(p.id)}">
    ${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : '<div class="thumb" aria-hidden="true"></div>'}
    <div><div class="t">${esc(brandName(p.brand))} ${esc(p.name)}</div>
    <div class="s">${esc(catName(p.category))}${size ? ' · ' + esc(size) : ''}</div>
    <div class="chips">${storeChips(p)}${labelChips(p)}</div></div></a></li>`;
}
function listHTML(list, limit = 60) {
  if (!list.length) return '';
  const more = list.length > limit ? `<button class="btn block" data-more>再顯示 ${Math.min(limit, list.length - limit)} 項</button>` : '';
  return `<ul class="list">${list.slice(0, limit).map(itemHTML).join('')}</ul>${more}`;
}
function bindMore(list, limit = 60) {
  main.addEventListener('click', function onMore(e) {
    const b = e.target.closest('[data-more]'); if (!b) return;
    limit += 60; b.previousElementSibling.outerHTML = `<ul class="list">${list.slice(0, limit).map(itemHTML).join('')}</ul>`;
    if (limit >= list.length) b.remove(); else b.textContent = `再顯示 ${Math.min(60, list.length - limit)} 項`;
  });
}
function reportURL(p, extra = {}) {
  const r = CFG.report; if (!r) return '#';
  const u = new URL(r.url); u.searchParams.set('usp', 'pp_url');
  const set = (k, v) => v && r.fields[k] && u.searchParams.set(r.fields[k], v);
  if (p) { set('type', '資料有誤'); set('name', `${brandName(p.brand)} ${p.name}`); set('brand', brandName(p.brand)); set('productId', p.id); }
  for (const [k, v] of Object.entries(extra)) set(k, v);
  return u.toString();
}
function searchBox(q = '') {
  return `<form class="search" role="search" data-search>
    <label class="sr" for="q">搜尋商品</label>${icon.search}
    <input id="q" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="搜尋品名、品牌或條碼" value="${esc(q)}">
    ${q ? `<button type="button" class="icon-btn clear" aria-label="清除搜尋" data-clear>${icon.x}</button>` : ''}
  </form>`;
}
function bindSearch(live) {
  const f = $('[data-search]'); if (!f) return;
  f.addEventListener('submit', (e) => { e.preventDefault(); const q = f.q.value.trim(); location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/browse'; });
  $('[data-clear]', f)?.addEventListener('click', () => { f.q.value = ''; f.q.focus(); live?.(''); });
  if (live) { let t; f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => live(f.q.value), 150); }); }
}

// ---------- 頁面 ----------
function viewHome() {
  const recent = store.get('recent', []).map((id) => DB.byId.get(id)).filter(Boolean);
  const counts = {}; for (const p of DB.products) counts[catRoot(p.category)] = (counts[catRoot(p.category)] || 0) + 1;
  main.innerHTML = `<div class="stack">
    <div><h1 class="sr">翻背面：查加工食品成分</h1>${searchBox()}</div>
    <a class="btn primary block" href="#/scan">${icon.scan}掃描條碼</a>
    <section><h2>分類</h2><div class="grid-cats">
      ${DB.categories.map((c) => `<a class="cat" href="#/browse?cat=${c.id}"><span class="emo" aria-hidden="true">${c.emoji || ''}</span><span class="nm">${esc(c.name)}</span><span class="n" aria-label="${counts[c.id] || 0} 項">${counts[c.id] || 0}</span></a>`).join('')}
    </div></section>
    <section><h2>我在哪家店</h2><div class="chips">
      ${Object.entries(STORES).map(([k, n]) => `<a class="chip" href="#/browse?store=${k}"${here === k ? ' aria-current="true"' : ''}>${n}</a>`).join('')}
    </div></section>
    ${recent.length ? `<section><h2>最近看過</h2>${listHTML(recent)}</section>` : ''}
    <footer class="site">收錄 ${DB.products.length} 項商品 · 資料更新 ${esc(DB.meta.updatedAt || '')}<br><a href="#/about">關於與資料來源</a></footer>
  </div>`;
  bindSearch();
}

function viewBrowse(params, mode = 'browse') {
  const q = params.get('q') || '';
  if (params.get('cat')) filter = { ...emptyFilter(), cats: [params.get('cat')] };
  if (params.get('store')) setHere(params.get('store'));
  if (params.get('cat') || params.get('store')) { store.set('filter', filter); history.replaceState(null, '', mode === 'search' ? `#/search?q=${encodeURIComponent(q)}` : '#/browse'); }
  const render = (qq) => {
    const list = applyFilter(search(qq));
    $('#results').innerHTML = `<p class="muted small" aria-live="polite">${here ? STORES[here] + '有販售的 ' : ''}${list.length} 項商品</p>` +
      (here ? '<p class="notice small">只列出已確認在這家店販售的商品。通路資料還在補，沒列出的不代表沒賣，可以切到「全部通路」找。</p>' : '') +
      (list.length ? listHTML(list) : `<div class="empty"><p>找不到符合的商品。</p>
        ${filterCount() ? '<p><button class="btn" data-reset>清除篩選</button></p>' : ''}
        <p><a class="btn" target="_blank" rel="noopener" href="${esc(reportURL(null, { type: '查無此商品', name: qq, barcode: /^\d{8,14}$/.test(qq) ? qq : '' }))}">回報缺少這項商品</a></p></div>`);
    bindMore(list);
  };
  const activeChips = () => {
    const chips = [];
    for (const c of filter.cats) chips.push(['cats', c, catName(c) || DB.categories.find((x) => x.id === c)?.name]);
    for (const o of filter.origins) chips.push(['origins', o, '產地：' + o]);
    for (const s of filter.excludeSubs) chips.push(['excludeSubs', s, '不含' + (DB.substances.get(s)?.name || s)]);
    for (const a of filter.excludeAllergens) chips.push(['excludeAllergens', a, '不含' + ALLERGENS[a]]);
    for (const l of filter.labels) chips.push(['labels', l, DB.labels.get(l)?.short || l]);
    for (const d of filter.diets) chips.push(['diets', d, DIETS[d]]);
    return chips.map(([g, v, n]) => `<button class="chip" aria-pressed="true" data-rm="${g}:${esc(v)}" aria-label="移除篩選：${esc(n)}">${esc(n)} ${icon.x}</button>`).join('');
  };
  const storeBar = `<div class="seg" role="group" aria-label="所在通路">${[['', '全部通路'], ...Object.entries(STORES)].map(([k, n]) =>
    `<button type="button" data-here="${k}" aria-pressed="${here === k}">${n}</button>`).join('')}</div>`;
  main.innerHTML = `${searchBox(q)}
    ${storeBar}
    <div class="toolbar"><button class="chip" data-open-filter aria-haspopup="dialog">${icon.filter.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2"')}篩選${filterCount() ? ' ' + filterCount() : ''}</button>${activeChips()}</div>
    <div id="results"></div>`;
  bindSearch(mode === 'search' ? null : render);
  render(q);
  main.onclick = (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const [g, v] = rm.dataset.rm.split(':'); filter[g] = filter[g].filter((x) => x !== v); store.set('filter', filter); route(); }
    const h = e.target.closest('[data-here]');
    if (h) { setHere(h.dataset.here); route(); return; }
    if (e.target.closest('[data-reset]')) { filter = emptyFilter(); store.set('filter', filter); route(); }
    if (e.target.closest('[data-open-filter]')) openFilterSheet(() => route());
  };
}

function openFilterSheet(onApply) {
  const draft = JSON.parse(JSON.stringify(filter));
  const oc = {}; for (const p of DB.products) oc[originOf(p)] = (oc[originOf(p)] || 0) + 1;
  const origins = Object.entries(oc).sort((a, b) => (a[0] === NO_ORIGIN) - (b[0] === NO_ORIGIN) || b[1] - a[1]).map(([o, n]) => [o, `${o} ${n}`]);
  const subs = [...DB.substances.values()].filter((s) => s.filterable).sort((a, b) => (b.common || 0) - (a.common || 0));
  const group = (key, entries, legend) => `<fieldset><legend>${legend}</legend><div class="chips">
    ${entries.map(([v, n]) => `<button type="button" class="chip" data-g="${key}" data-v="${esc(v)}" aria-pressed="${draft[key].includes(v)}">${esc(n)}</button>`).join('')}</div></fieldset>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="grab" aria-hidden="true"></div>
    <h2 id="sheetTitle">篩選</h2>
    ${group('cats', DB.categories.map((c) => [c.id, c.name]), '分類')}
    ${group('origins', origins, '產地')}
    ${group('excludeSubs', subs.slice(0, 16).map((s) => [s.id, s.name]), '排除含有這些成分')}
    <label class="small muted" for="subFind">找其他成分</label>
    <input id="subFind" list="subList" placeholder="輸入成分名稱，例如：蔗糖素" style="width:100%;min-height:44px;margin:4px 0 16px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
    <datalist id="subList">${subs.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>
    ${group('excludeAllergens', Object.entries(ALLERGENS), '排除過敏原')}
    ${group('labels', [...DB.labels.values()].map((l) => [l.id, l.short]), '標籤（認證）')}
    ${group('diets', Object.entries(DIETS), '素食標示')}
    <div class="actions"><button class="btn" data-clear-all>全部清除</button><button class="btn primary" data-apply>套用</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const prevFocus = document.activeElement;
  $('.sheet', wrap).querySelector('button.chip')?.focus();
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('#subFind', wrap).addEventListener('change', (e) => {
    const s = subs.find((x) => x.name === e.target.value.trim()); if (!s) return;
    if (!draft.excludeSubs.includes(s.id)) draft.excludeSubs.push(s.id);
    e.target.value = ''; toast(`已加入：不含${s.name}`);
  });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const c = e.target.closest('[data-g]');
    if (c) { const arr = draft[c.dataset.g]; const i = arr.indexOf(c.dataset.v); i < 0 ? arr.push(c.dataset.v) : arr.splice(i, 1); c.setAttribute('aria-pressed', i < 0); }
    if (e.target.closest('[data-clear-all]')) { Object.assign(draft, emptyFilter()); wrap.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
    if (e.target.closest('[data-apply]')) { filter = draft; store.set('filter', filter); close(); onApply(); }
  });
}

function ingredientHTML(items) {
  const render = (arr) => arr.map((it) => {
    const s = it.substance && DB.substances.get(it.substance);
    const label = esc(it.text);
    const inner = it.children?.length ? `${label}(${render(it.children)})` : label;
    if (s && s.kind === 'additive') return `<button class="add" data-sub="${esc(s.id)}" aria-label="${esc(it.text)}，添加物，查看說明">${inner}</button>`;
    return inner;
  }).join('、');
  return render(items);
}

function viewProduct(id) {
  const p = DB.byId.get(id);
  if (!p) { main.innerHTML = `<div class="empty"><p>找不到這項商品。</p><a class="btn" href="#/">回首頁</a></div>`; return; }
  pushRecent(p.id);
  document.title = `${brandName(p.brand)} ${p.name}｜翻背面`;
  const n = p.nutrition;
  const hasServing = n && Object.keys(n.perServing || {}).length;
  const unit100 = n?.basis === 'liquid' ? '每100毫升' : '每100公克';
  const nutRows = n ? NUTRIENTS.filter(([k]) => n.per100?.[k] != null || n.perServing?.[k] != null).map(([k, label, u, sub]) =>
    `<tr class="${sub ? 'sub' : ''}"><td>${label}</td>${hasServing ? `<td>${n.perServing?.[k] ?? '—'}</td>` : ''}<td>${n.per100?.[k] ?? '—'}</td><td class="muted small">${u}</td></tr>`).join('') : '';
  const allergen = p.allergens || {};
  const variants = (p.variants || []).map((v) => v.size).filter(Boolean);
  const reviewNote = p.review?.status !== 'verified' ? `<p class="notice">這筆資料尚未人工核對，請以實際包裝標示為準。</p>` : '';
  main.innerHTML = `<article class="stack">
    <div class="toolbar" style="margin:0;justify-content:space-between">
      <button class="icon-btn" data-back aria-label="返回">${icon.back.replace('<svg', '<svg width="24" height="24" style="fill:none;stroke:currentColor;stroke-width:2"')}</button>
      <span><button class="icon-btn fav-btn" data-fav aria-pressed="${favs.has(p.id)}" aria-label="收藏">${icon.heart.replace('<svg', '<svg width="24" height="24" style="fill:none;stroke:currentColor;stroke-width:2"')}</button>
      <button class="icon-btn" data-share aria-label="分享">${icon.share.replace('<svg', '<svg width="24" height="24" style="fill:none;stroke:currentColor;stroke-width:2"')}</button></span>
    </div>
    ${p.images?.[0]?.file ? `<img class="hero-img" src="${esc(p.images[0].file)}" alt="${esc(p.name)} 包裝照片">` : ''}
    <header><h1>${esc(brandName(p.brand))} ${esc(p.name)}</h1>
      <p class="muted">${[catName(p.category), variants.join('／'), p.origin?.country].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="chips">${storeChips(p)}${labelChips(p)}${p.diet ? `<span class="chip static">${DIETS[p.diet]}</span>` : ''}</div>
    </header>
    ${reviewNote}
    <section class="card"><h2>成分</h2>
      ${p.ingredients?.items?.length ? `<p class="ing">${ingredientHTML(p.ingredients.items)}</p><p class="small muted">標色的是食品添加物，點一下可以看說明。</p>` : p.ingredients?.raw ? `<p class="ing">${esc(p.ingredients.raw)}</p>` : '<p class="muted">尚無成分資料。</p>'}
    </section>
    <section class="card"><h2>營養標示 <span class="small muted">${n?.serving ? `每份 ${n.serving.size}${n.serving.unit === 'ml' ? '毫升' : '公克'}${n.servingsPerPack ? `，本包裝含 ${n.servingsPerPack} 份` : ''}` : ''}</span></h2>
      ${nutRows ? `<table class="nut"><thead><tr><th scope="col">項目</th>${hasServing ? '<th scope="col">每份</th>' : ''}<th scope="col">${unit100}</th><th scope="col"><span class="sr">單位</span></th></tr></thead><tbody>${nutRows}</tbody></table>` : '<p class="muted">尚無營養標示資料。</p>'}
    </section>
    <section class="card"><h2>過敏原</h2>
      ${allergen.contains?.length ? `<p>含有：${allergen.contains.map((a) => ALLERGENS[a] || a).join('、')}</p>` : ''}
      ${allergen.sharedLine?.length ? `<p class="muted">同產線：${allergen.sharedLine.map((a) => ALLERGENS[a] || a).join('、')}</p>` : ''}
      ${allergen.raw ? `<p class="small muted">${esc(allergen.raw)}</p>` : ''}
      ${!allergen.contains?.length && !allergen.raw ? '<p class="muted">未標示或尚無資料。</p>' : ''}
    </section>
    <section class="card"><h2>基改原料與產地</h2>
      <p>基改原料：${esc(GMO[p.gmo?.status] || '未標示')}${p.gmo?.raw ? `<br><span class="small muted">${esc(p.gmo.raw)}</span>` : ''}</p>
      <p>產地：${esc(p.origin?.country || '未標示')}</p>
    </section>
    ${p.labels?.length ? `<section class="card"><h2>認證標籤</h2><ul>${p.labels.map((l) => `<li>${esc(DB.labels.get(l.id)?.name || l.id)}${l.evidence ? `<br><span class="small muted">${esc(l.evidence)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="small muted">
      <p>資料來源：${(p.sources || []).map((s) => esc(s.label || s.type)).join('、')}${p.updatedAt ? `（${esc(p.updatedAt)}）` : ''}<br>
      ${p.images?.[0]?.credit ? `圖片來源：${esc(p.images[0].credit)}` : ''}</p>
    </section>
    <a class="btn block" target="_blank" rel="noopener" href="${esc(reportURL(p))}">回報資料有誤</a>
  </article>`;
  main.onclick = (e) => {
    if (e.target.closest('[data-back]')) history.length > 1 ? history.back() : (location.hash = '#/');
    const f = e.target.closest('[data-fav]'); if (f) f.setAttribute('aria-pressed', toggleFav(p.id));
    if (e.target.closest('[data-share]')) {
      const data = { title: document.title, url: location.href };
      if (navigator.share) navigator.share(data).catch(() => {});
      else navigator.clipboard?.writeText(location.href).then(() => toast('已複製連結'));
    }
    const s = e.target.closest('[data-sub]'); if (s) openSubstance(s.dataset.sub);
  };
}

function openSubstance(id) {
  const s = DB.substances.get(id); if (!s) return;
  const count = DB.products.filter((p) => p._subs.has(id)).length;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="subTitle"><div class="grab" aria-hidden="true"></div>
    <h2 id="subTitle">${esc(s.name)}</h2>
    <p class="muted">${[s.tfdaClass, s.eNumber].filter(Boolean).map(esc).join(' · ')}</p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    ${s.aliases?.length ? `<p class="small muted">其他名稱：${s.aliases.map(esc).join('、')}</p>` : ''}
    <p class="small">本站有 ${count} 項商品含有此成分。</p>
    <div class="actions"><button class="btn" data-close>關閉</button><button class="btn primary" data-exclude>篩選不含此成分的商品</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const prev = document.activeElement; $('[data-exclude]', wrap).focus();
  const close = () => { wrap.remove(); prev?.focus(); };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    if (e.target.closest('[data-exclude]')) { filter = { ...emptyFilter(), excludeSubs: [id] }; store.set('filter', filter); close(); location.hash = '#/browse'; }
  });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function viewFav() {
  const list = [...favs].map((id) => DB.byId.get(id)).filter(Boolean);
  main.innerHTML = `<h1>收藏</h1>
    ${list.length ? listHTML(list, 999) : `<div class="empty"><p>還沒有收藏的商品。</p><p class="small">在商品頁按愛心就能收藏，方便下次購物時快速找到。</p><a class="btn" href="#/browse">去逛逛</a></div>`}
    <p class="small muted" style="margin-top:16px">收藏只存在這支手機的瀏覽器裡；換手機或清除瀏覽資料後會消失。</p>`;
}

let scanStop = null;
async function viewScan() {
  main.innerHTML = `<div class="stack"><h1>掃描條碼</h1>
    <div class="scan-box"><video id="video" playsinline muted aria-label="相機畫面"></video><div class="frame" aria-hidden="true"></div></div>
    <p id="scanMsg" class="muted" aria-live="polite">將條碼放進框內。</p>
    <form data-manual class="search"><label class="sr" for="code">手動輸入條碼</label>${icon.search}
      <input id="code" inputmode="numeric" pattern="[0-9]*" placeholder="或手動輸入條碼數字" autocomplete="off"></form>
  </div>`;
  $('[data-manual]').addEventListener('submit', (e) => { e.preventDefault(); onCode($('#code').value.replace(/\D/g, '')); });
  const msg = (t) => { const m = $('#scanMsg'); if (m) m.textContent = t; };
  const onCode = (code) => {
    if (!code) return;
    scanStop?.();
    const p = DB.byBarcode.get(code);
    if (p) { location.hash = `#/p/${encodeURIComponent(p.id)}`; return; }
    main.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:16px"><h2>找不到條碼 ${esc(code)}</h2>
      <p class="muted">這項商品還沒有收錄，或我們還沒有它的條碼。可以試試用品名搜尋。</p>
      <div class="toolbar"><a class="btn" href="#/browse">用品名搜尋</a>
      <a class="btn primary" target="_blank" rel="noopener" href="${esc(reportURL(null, { type: '查無此商品', barcode: code }))}">回報這項商品</a></div></div>`);
  };
  if (!navigator.mediaDevices?.getUserMedia) { msg('這個瀏覽器無法使用相機，請手動輸入條碼。'); return; }
  try {
    const video = $('#video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream; await video.play();
    let active = true;
    scanStop = () => { active = false; stream.getTracks().forEach((t) => t.stop()); scanStop = null; };
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('ean_13')) {
      const det = new BarcodeDetector({ formats });
      const tick = async () => { if (!active) return; try { const r = await det.detect(video); if (r[0]) return onCode(r[0].rawValue); } catch {} requestAnimationFrame(tick); };
      tick();
    } else {
      msg('載入條碼辨識中…');
      await loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js');
      if (!active) return;
      const Z = window.ZXing;
      const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]]]);
      const reader = new Z.BrowserMultiFormatReader(hints);
      msg('將條碼放進框內。');
      const canvas = document.createElement('canvas');
      const loop = () => {
        if (!active) return;
        try {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          const r = reader.decodeFromCanvas ? reader.decodeFromCanvas(canvas) : null;
          if (r) return onCode(r.getText());
        } catch {}
        setTimeout(loop, 200);
      };
      loop();
    }
  } catch (e) {
    msg(e?.name === 'NotAllowedError' ? '沒有相機權限。請在瀏覽器設定允許使用相機，或手動輸入條碼。' : '無法開啟相機，請手動輸入條碼。');
  }
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

function viewAbout() {
  main.innerHTML = `<article class="stack"><h1>關於翻背面</h1>
    <p>在超市拿起加工食品時，先在這裡查它的成分、營養標示和過敏原，決定要不要買。</p>
    <section class="card"><h2>資料來源</h2><ul>
      <li>萬家福線上購物商品頁</li><li>品牌官方網站</li><li>Open Food Facts（ODbL 授權）</li><li>使用者回報與實際包裝照片</li></ul>
      <p class="small muted">資料可能與實際包裝不同（例如配方更新），請以包裝標示為準。每筆資料都標有來源與更新日期。</p></section>
    <section class="card"><h2>標籤怎麼來的</h2><p>「有機」「雨林友善」「動物福利」「非基因改造」「CAS」「產銷履歷」只依包裝上的認證標章或法定標示判斷；包裝上「天然」「健康」等宣稱不採計。</p></section>
    <section class="card"><h2>圖片與權利</h2><p>商品圖片版權屬於各品牌或原拍攝者，本站僅用於辨識商品。如權利人希望移除，請透過<a target="_blank" rel="noopener" href="${esc(reportURL(null, { type: '其他建議' }))}">回報表單</a>告知，我們會盡快處理。</p></section>
    <section class="card"><h2>隱私</h2><p>收藏、最近看過和篩選條件只存在你的瀏覽器裡，不會上傳。網站使用 GoatCounter 計算瀏覽次數，不使用 cookie、不追蹤個人。</p></section>
    <p class="small muted">本站不提供醫療或營養建議。</p>
  </article>`;
}

// ---------- 路由 ----------
function route() {
  scanStop?.();
  main.onclick = null;
  const [path, qs] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  const seg = (path || '/').split('/').filter(Boolean);
  document.title = '翻背面｜加工食品成分查詢';
  const tab = { '': 'home', browse: 'browse', search: 'browse', scan: 'scan', fav: 'fav', p: 'browse' }[seg[0] || ''];
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (!seg.length) viewHome();
  else if (seg[0] === 'browse') viewBrowse(params);
  else if (seg[0] === 'search') viewBrowse(params, 'search');
  else if (seg[0] === 'p') viewProduct(decodeURIComponent(seg[1] || ''));
  else if (seg[0] === 'fav') viewFav();
  else if (seg[0] === 'scan') viewScan();
  else if (seg[0] === 'about') viewAbout();
  else viewHome();
  window.scrollTo(0, 0);
  if (window.goatcounter?.count) window.goatcounter.count({ path: location.pathname + location.hash });
}

// 字級
const SIZES = ['m', 'l', 'xl'];
document.documentElement.dataset.size = store.get('size', 'm');
$('#textSizeBtn').addEventListener('click', () => {
  const next = SIZES[(SIZES.indexOf(document.documentElement.dataset.size) + 1) % SIZES.length];
  document.documentElement.dataset.size = next; store.set('size', next);
  toast({ m: '標準字級', l: '大字級', xl: '特大字級' }[next]);
});

window.addEventListener('hashchange', route);
loadData().then(route).catch((e) => {
  console.error(e);
  main.innerHTML = '<div class="empty"><p>資料載入失敗，請檢查網路後重新整理。</p></div>';
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
