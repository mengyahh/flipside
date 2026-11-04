// 成分字串拆解與標準化成分比對

const OPEN = '(（[［〔【{', CLOSE = ')）]］〕】}';

// 依頂層分隔符號拆開，保留括號內層
export function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (OPEN.includes(ch)) depth++;
    if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[、，,;；]/.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// 「調味劑(5'-次黃嘌呤…、5'-鳥嘌呤…)」→ { text:'調味劑', children:[...] }
const FUNCTION_WORDS = /^(調味劑|甜味劑|酸味劑|酸度調節劑|酸度調整劑|防腐劑|抗氧化劑|乳化劑|安定劑|增稠劑|黏稠劑|糊料|膨脹劑|著色劑|色素|香料|品質改良劑|品質改良用劑|結著劑|保色劑|漂白劑|營養添加劑|食品添加物|複方[^(（]*|天然色素|食用色素)$/;

export function parseList(s) {
  // 「黏稠劑】(玉米糖膠、鹿角菜膠)」→「黏稠劑(玉米糖膠、鹿角菜膠)】」：把緊接在右括號後的括號移進去
  let t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) t = t.replace(/([】\]］〕）)])\s*([(（][^()（）]*[)）])/g, '$2$1');
  return splitTop(t).map(parseItem).filter((x) => x.text);
}
function parseItem(raw) {
  const m = raw.match(/^([^(（\[［〔【]*)[(（\[［〔【](.*)[)）\]］〕】]\s*([^)）】]*)$/);
  if (!m) return { text: raw.replace(/[。.]$/, '').trim() };
  const head = m[1].trim(), inner = m[2].trim(), tail = m[3].trim();
  const parts = splitTop(inner);
  // 括號內是單一短詞且看起來是產地或說明（例如「豬肉(台灣)」「黃豆(非基因改造)」）
  const looksNote = parts.length === 1 && (/^(台灣|國產|美國|澳洲|紐西蘭|加拿大|日本|泰國|越南|中國|印尼|馬來西亞|菲律賓|巴西|阿根廷|荷蘭|丹麥|法國|德國|義大利|西班牙|英國|愛爾蘭|智利|韓國|印度|斯里蘭卡|進口|非基因改造|基因改造|非基改|含[\d.]+%|[\d.]+\s*%)/.test(parts[0]) || /基因改造/.test(parts[0]));
  if (looksNote || !head) return { text: raw.trim(), ...(looksNote ? { note: parts[0] } : {}) };
  const item = { text: head + (tail ? tail : ''), children: parts.map(parseItem) };
  if (FUNCTION_WORDS.test(head)) item.function = head;
  return item;
}

// 標準化比對用字串
export function normName(s) {
  return (s || '').normalize('NFKC').toLowerCase().replace(/[’‘´`]/g, "'").replace(/\s+/g, '').replace(/[臺]/g, '台');
}

export function buildMatcher(substances) {
  const entries = [];
  for (const s of substances) for (const a of [s.name, ...(s.aliases || [])]) {
    const n = normName(a);
    if (n.length >= 2 || /^e\d/.test(n)) entries.push([n, s.id]);
  }
  entries.sort((a, b) => b[0].length - a[0].length); // 長的優先
  return (text) => {
    const t = normName(text);
    // E 編號需完整比對；中文名以包含比對
    for (const [n, id] of entries) {
      if (/^e\d/.test(n)) { if (new RegExp(`(^|[^a-z0-9])${n}($|[^0-9a-z(])`).test(t)) return id; }
      else if (t.includes(n)) return id;
    }
    return null;
  };
}

export function annotate(items, match) {
  for (const it of items) {
    if (it.children?.length) annotate(it.children, match);
    // 只有葉節點或無子項的才比對，避免「調味劑」本身被當成某物質
    if (!it.children?.length) { const id = match(it.text); if (id) it.substance = id; }
    else if (!it.function && it.text.length <= 12) { const id = match(it.text); if (id) it.substance = id; }
  }
  return items;
}
