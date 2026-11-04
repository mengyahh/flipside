// 共用的禮貌抓取工具：固定間隔、失敗重試、本機快取
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const CACHE_DIR = new URL('../../.cache/', import.meta.url);
const UA = 'flipside-research/0.1 (+https://github.com/Mengyahh/flipside)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = 0;
export async function politeFetch(url, { delayMs = 3000, retries = 3 } = {}) {
  const wait = last + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  for (let i = 0; i <= retries; i++) {
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(delayMs * (i + 2));
    }
  }
}

function cachePath(url) {
  const h = createHash('sha1').update(url).digest('hex').slice(0, 16);
  return new URL(`pages/${h}.html`, CACHE_DIR);
}

export async function cachedFetch(url, opts) {
  const p = cachePath(url);
  try {
    await access(p);
    return { html: await readFile(p, 'utf8'), cached: true };
  } catch {}
  const html = await politeFetch(url, opts);
  if (html != null) {
    await mkdir(new URL('pages/', CACHE_DIR), { recursive: true });
    await writeFile(p, html);
  }
  return { html, cached: false };
}

export async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; }
}
export async function writeJson(url, data) {
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, JSON.stringify(data, null, 2) + '\n');
}
