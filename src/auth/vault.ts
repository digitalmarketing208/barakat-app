// Encrypted local storage for personal data (cached profile, saved prescriptions).
// Preferred: AES-256-GCM (expo-crypto) with the key kept in expo-secure-store and the ciphertext in AsyncStorage.
// Fallback when AES is not in this build: the value is split across expo-secure-store entries (Keychain / Keystore).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY_ID = 'bo.vault.key';
const PREFIX = 'vault.';
const CHUNK = 1800; // stay under the ~2 KB per-item limit some iOS versions enforce
const secureOpts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

type CryptoMod = typeof import('expo-crypto');
const crypto = (): CryptoMod | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-crypto') as CryptoMod;
    return m && typeof m.aesEncryptAsync === 'function' && m.AESEncryptionKey ? m : null;
  } catch { return null; }
};

function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i++];
    let cp = c;
    if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63);
    if (cp > 0xffff) { cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
    else s += String.fromCharCode(cp);
  }
  return s;
}

let keyPromise: Promise<InstanceType<CryptoMod['AESEncryptionKey']> | null> | null = null;
function getKey(C: CryptoMod, create: boolean) {
  if (!keyPromise) {
    keyPromise = (async () => {
      const stored = await SecureStore.getItemAsync(KEY_ID, secureOpts);
      if (stored) return C.AESEncryptionKey.import(stored, 'base64');
      if (!create) return null;
      const k = await C.AESEncryptionKey.generate();
      await SecureStore.setItemAsync(KEY_ID, await k.encoded('base64'), secureOpts);
      return k;
    })().catch(() => null);
    // A failed or empty lookup is retried next time.
    keyPromise.then((k) => { if (!k) keyPromise = null; });
  }
  return keyPromise;
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '_');
const chunkKey = (name: string, i: number | 'n') => `bo.v.${safeName(name)}.${i}`;

async function chunksClear(name: string) {
  const n = Number(await SecureStore.getItemAsync(chunkKey(name, 'n'), secureOpts).catch(() => null)) || 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(name, i), secureOpts).catch(() => {});
  await SecureStore.deleteItemAsync(chunkKey(name, 'n'), secureOpts).catch(() => {});
}
async function chunksWrite(name: string, text: string) {
  await chunksClear(name);
  const parts = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < parts; i++) await SecureStore.setItemAsync(chunkKey(name, i), text.slice(i * CHUNK, (i + 1) * CHUNK), secureOpts);
  await SecureStore.setItemAsync(chunkKey(name, 'n'), String(parts), secureOpts);
}
async function chunksRead(name: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(chunkKey(name, 'n'), secureOpts)) || 0;
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(name, i), secureOpts);
    if (part == null) return null;
    s += part;
  }
  return s;
}

/** Stores JSON encrypted. Returns false if nothing could be written (never throws). */
export async function vaultSet(name: string, value: unknown): Promise<boolean> {
  const text = JSON.stringify(value);
  try {
    const C = crypto();
    const key = C ? await getKey(C, true) : null;
    if (C && key) {
      const sealed = await C.aesEncryptAsync(utf8Encode(text), key);
      await AsyncStorage.setItem(PREFIX + name, 'v1:' + (await sealed.combined('base64')));
      await chunksClear(name).catch(() => {});
      return true;
    }
  } catch { /* fall through to the secure-store fallback */ }
  try {
    await chunksWrite(name, text);
    await AsyncStorage.removeItem(PREFIX + name).catch(() => {});
    return true;
  } catch { return false; }
}

export async function vaultGet<T>(name: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + name);
    if (raw && raw.startsWith('v1:')) {
      const C = crypto();
      const key = C ? await getKey(C, false) : null;
      if (!C || !key) return null;
      const bytes = await C.aesDecryptAsync(C.AESSealedData.fromCombined(raw.slice(3)), key);
      return JSON.parse(utf8Decode(bytes)) as T;
    }
    const text = await chunksRead(name);
    return text ? (JSON.parse(text) as T) : null;
  } catch { return null; }
}

export async function vaultRemove(name: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + name).catch(() => {});
  await chunksClear(name).catch(() => {});
}
