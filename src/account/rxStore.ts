// Prescription photos kept on the phone: files in the app's document folder, the list in AsyncStorage.
// Nothing is uploaded; the customer sends a photo to Barakat on WhatsApp when they choose to.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const KEY = 'rx.saved.v1';
const MAX = 6;

export type SavedRx = { id: string; uri: string; addedAt: number; orderNo?: string };

const folder = () => {
  const d = new Directory(Paths.document, 'prescriptions');
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  return d;
};

export async function listRx(): Promise<SavedRx[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as SavedRx[]) : [];
    // drop entries whose file is gone (app data cleared, restore from backup…)
    const live = all.filter((r) => { try { return new File(r.uri).exists; } catch { return false; } });
    if (live.length !== all.length) await AsyncStorage.setItem(KEY, JSON.stringify(live));
    return live;
  } catch {
    return [];
  }
}

/** Copies a picked or captured image into the app's own storage and remembers it (newest first). */
export async function saveRx(sourceUri: string): Promise<SavedRx> {
  const id = String(Date.now());
  const ext = (/\.(jpe?g|png|heic|webp)$/i.exec(sourceUri)?.[1] ?? 'jpg').toLowerCase();
  const dest = new File(folder(), `rx-${id}.${ext}`);
  await new File(sourceUri).copy(dest);
  const item: SavedRx = { id, uri: dest.uri, addedAt: Date.now() };
  const list = await listRx();
  const next = [item, ...list];
  for (const old of next.slice(MAX)) { try { new File(old.uri).delete(); } catch { /* already gone */ } }
  await AsyncStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)));
  return item;
}

export async function removeRx(id: string): Promise<SavedRx[]> {
  const list = await listRx();
  const hit = list.find((r) => r.id === id);
  if (hit) { try { new File(hit.uri).delete(); } catch { /* already gone */ } }
  const next = list.filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export async function setRxOrder(id: string, orderNo: string): Promise<void> {
  const list = await listRx();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.map((r) => (r.id === id ? { ...r, orderNo: orderNo || undefined } : r)))).catch(() => {});
}

export const mimeOf = (uri: string) => (/\.png$/i.test(uri) ? 'image/png' : /\.webp$/i.test(uri) ? 'image/webp' : /\.heic$/i.test(uri) ? 'image/heic' : 'image/jpeg');
