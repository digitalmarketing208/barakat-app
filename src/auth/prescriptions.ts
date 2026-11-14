// Saved prescriptions stay on this phone only, encrypted through vault.ts, one list per customer.
// They are health data: never sent to Shopify, never synced, wiped by "remove my data from this phone".
import { vaultGet, vaultRemove, vaultSet } from './vault';

export type EyeRx = { sph: string; cyl: string; axis: string; add: string };
export type SavedRx = {
  id: string; label: string; date: string;
  right: EyeRx; left: EyeRx; pd: string; notes: string;
  updatedAt: number;
};

export const emptyEye = (): EyeRx => ({ sph: '', cyl: '', axis: '', add: '' });
const keyFor = (customerId: string) => 'rx.' + customerId.replace(/[^A-Za-z0-9]/g, '_').slice(-40);

export async function listRx(customerId: string): Promise<SavedRx[]> {
  const v = await vaultGet<SavedRx[]>(keyFor(customerId));
  return Array.isArray(v) ? v : [];
}

/** Adds or replaces (same id). Returns the new list, or null when the phone could not store it. */
export async function saveRx(customerId: string, rx: Omit<SavedRx, 'id' | 'updatedAt'> & { id?: string }): Promise<SavedRx[] | null> {
  const list = await listRx(customerId);
  const id = rx.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const next = [{ ...rx, id, updatedAt: Date.now() }, ...list.filter((x) => x.id !== id)].slice(0, 20);
  return (await vaultSet(keyFor(customerId), next)) ? next : null;
}

export async function removeRx(customerId: string, id: string): Promise<SavedRx[]> {
  const next = (await listRx(customerId)).filter((x) => x.id !== id);
  if (next.length) await vaultSet(keyFor(customerId), next); else await vaultRemove(keyFor(customerId));
  return next;
}

export const clearRx = (customerId: string) => vaultRemove(keyFor(customerId));

/** One line per eye, used for the list and for sharing with a branch on WhatsApp. */
export function rxSummary(rx: SavedRx, labels: { right: string; left: string; pd: string }): string {
  const eye = (e: EyeRx) => [e.sph && `SPH ${e.sph}`, e.cyl && `CYL ${e.cyl}`, e.axis && `AX ${e.axis}`, e.add && `ADD ${e.add}`].filter(Boolean).join('  ') || '-';
  return [`${labels.right}: ${eye(rx.right)}`, `${labels.left}: ${eye(rx.left)}`, rx.pd ? `${labels.pd}: ${rx.pd}` : ''].filter(Boolean).join('\n');
}
