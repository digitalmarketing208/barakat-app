// Removes the white studio background from a product photo so the frame can be laid over a live face.
// Pure JS (no native code) so it behaves the same on iOS, Android and web, and can be unit-tested in Node.
import * as jpeg from 'jpeg-js';
import UPNG from 'upng-js';

export type Cutout = { uri: string; aspect: number; width: number; height: number };

const smooth = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

function decode(bytes: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return { w: img.width, h: img.height, rgba: new Uint8Array(UPNG.toRGBA8(img)[0]) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const d = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { w: d.width, h: d.height, rgba: d.data as Uint8Array };
  }
  throw new Error('unsupported image format');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return out;
}

/** Turn near-white pixels transparent (soft edge), trim empty margins, return a PNG. */
export function cutoutBytes(bytes: Uint8Array, maxWidth = 640): { png: Uint8Array; width: number; height: number; keptRatio: number } {
  const src = decode(bytes);
  const step = Math.max(1, Math.ceil(src.w / maxWidth));
  const ow = Math.floor(src.w / step), oh = Math.floor(src.h / step);
  const px = new Uint8Array(ow * oh * 4);
  let minX = ow, minY = oh, maxX = -1, maxY = -1, kept = 0;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const si = ((y * step) * src.w + x * step) * 4, di = (y * ow + x) * 4;
      const r = src.rgba[si], g = src.rgba[si + 1], b = src.rgba[si + 2], sa = src.rgba[si + 3] / 255;
      const dist = Math.max(255 - r, 255 - g, 255 - b); // distance from pure white
      const a = Math.min(sa, smooth(10, 64, dist));
      if (a > 0.02) {
        // un-mix the white that bled into soft edge pixels so frames get no light halo
        const k = a < 1 ? (1 - a) * 255 : 0;
        px[di] = Math.max(0, Math.min(255, (r - k) / a));
        px[di + 1] = Math.max(0, Math.min(255, (g - k) / a));
        px[di + 2] = Math.max(0, Math.min(255, (b - k) / a));
        px[di + 3] = Math.round(a * 255);
        if (a > 0.3) { kept++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
  }
  if (maxX < 0) throw new Error('no frame found in image');
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(ow - 1, maxX + pad); maxY = Math.min(oh - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(px.subarray(((y + minY) * ow + minX) * 4, ((y + minY) * ow + minX + cw) * 4), y * cw * 4);
  const png = new Uint8Array(UPNG.encode([out.buffer as ArrayBuffer], cw, ch, 0));
  return { png, width: cw, height: ch, keptRatio: kept / (ow * oh) };
}

const CACHE_MAX = 8; // data-URI PNGs are large: keep only the most recent few
const cache = new Map<string, Promise<Cutout>>();
const tick = () => new Promise<void>((r) => setTimeout(r, 16));

/** Build a transparent cut-out for an image url (remote or local file). Rejects on failure so callers can fall back to the plain image. */
export function cutout(url: string): Promise<Cutout> {
  let p = cache.get(url);
  if (p) { cache.delete(url); cache.set(url, p); return p; } // refresh LRU order
  p = (async () => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    let buf: ArrayBuffer;
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) throw new Error(`image ${res.status}`);
      buf = await res.arrayBuffer();
    } finally { if (timer) clearTimeout(timer); }
    await tick(); // let the spinner paint before the CPU-heavy decode on the JS thread
    const r = cutoutBytes(new Uint8Array(buf));
    return { uri: `data:image/png;base64,${toBase64(r.png)}`, aspect: r.width / r.height, width: r.width, height: r.height };
  })();
  p.catch(() => { if (cache.get(url) === p) cache.delete(url); });
  cache.set(url, p);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return p;
}
