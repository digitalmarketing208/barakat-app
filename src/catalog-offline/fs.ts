// Lazy native access (plain-Node tests import shopify.ts, so nothing here may load React Native at import time).
type FS = typeof import('expo-file-system');
type AS = typeof import('@react-native-async-storage/async-storage').default;
let fsMod: FS | null | undefined;
export const fsys = (): FS | null => {
  if (fsMod === undefined) { try { fsMod = require('expo-file-system') as FS; } catch { fsMod = null; } }
  return fsMod;
};
let asMod: AS | null | undefined;
export const storage = (): AS | null => {
  if (asMod === undefined) { try { asMod = (require('@react-native-async-storage/async-storage') as { default: AS }).default; } catch { asMod = null; } }
  return asMod;
};
const dirs = new Map<string, import('expo-file-system').Directory>();
/** A sub-directory of Paths.document (created on first use). Documents are never purged by the OS, unlike the cache directory. */
export function docDir(name: string) {
  const fs = fsys(); if (!fs) return null;
  let d = dirs.get(name);
  if (!d) { d = new fs.Directory(fs.Paths.document, name); try { d.create({ idempotent: true, intermediates: true }); } catch { /* exists */ } dirs.set(name, d); }
  return d;
}
export function writeBytes(dir: string, name: string, bytes: Uint8Array): boolean {
  try {
    const fs = fsys(); const d = docDir(dir); if (!fs || !d) return false;
    const tmp = new fs.File(d, `${name}.tmp`); const dst = new fs.File(d, name);
    if (tmp.exists) tmp.delete();
    tmp.create(); tmp.write(bytes);
    if (dst.exists) dst.delete();
    tmp.move(dst);
    return true;
  } catch { return false; }
}
export async function readBytes(dir: string, name: string): Promise<Uint8Array | null> {
  try { const fs = fsys(); const d = docDir(dir); if (!fs || !d) return null; const f = new fs.File(d, name); return f.exists ? await f.bytes() : null; } catch { return null; }
}
export function fileSize(dir: string, name: string): number {
  try { const fs = fsys(); const d = docDir(dir); if (!fs || !d) return 0; const f = new fs.File(d, name); return f.exists ? f.size ?? 0 : 0; } catch { return 0; }
}
export function removeFile(dir: string, name: string) {
  try { const fs = fsys(); const d = docDir(dir); if (!fs || !d) return; const f = new fs.File(d, name); if (f.exists) f.delete(); } catch { /* ignore */ }
}
export function removeDir(name: string) {
  try { const d = docDir(name); if (d) { for (const it of d.list()) { try { it.delete(); } catch { /* ignore */ } } } } catch { /* ignore */ }
}
