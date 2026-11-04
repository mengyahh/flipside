// 產生 PNG 圖示（不需外部套件）：與 icons/icon.svg 同樣的圖案
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x / size * 512, y / size * 512); raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4); }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const G = [0x1f, 0x6f, 0x5c, 255], W = [255, 255, 255, 255], L = [0xcf, 0xe9, 0xdf, 255];
const inRR = (x, y, x0, y0, w, h, r) => {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
function pixel(x, y, maskable) {
  if (!maskable && !inRR(x, y, 0, 0, 512, 512, 112)) return [0, 0, 0, 0];
  const s = maskable ? 0.8 : 1, ox = 256 - 256 * s; // maskable 縮小到安全區
  const X = (x - ox) / s, Y = (y - ox) / s;
  const inPage = X >= 156 && X <= 376 && Y >= 104 && Y <= 408 && !(X > 304 && Y < 176 && (X - 304) > (Y - 104));
  if (inPage) {
    if (X >= 304 && Y <= 176 && (X - 304) <= (Y - 104)) return L;
    if (inRR(X, Y, 196, 236, 140, 22, 11) || inRR(X, Y, 196, 284, 140, 22, 11) || inRR(X, Y, 196, 332, 92, 22, 11)) return G;
    return W;
  }
  return G;
}
const out = new URL('../site/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, (x, y) => pixel(x, y, false)));
writeFileSync(new URL('icon-512.png', out), png(512, (x, y) => pixel(x, y, true)));
console.log('icons written');
