// Connectivity state shared by the API client, hooks and UI. Pure module (no native imports) so Node tests can load it.
export type NetKind = 'wifi' | 'cellular' | 'other' | 'none' | 'unknown';
export type NetState = {
  /** No connection at all (airplane mode, no signal). */
  offline: boolean;
  /** Connected to a network that reports no internet access; requests are still attempted. */
  limited: boolean;
  kind: NetKind;
  /** The last catalog request failed and saved (cached) data was shown instead. */
  savedData: boolean;
};

let state: NetState = { offline: false, limited: false, kind: 'unknown', savedData: false };
const subs = new Set<() => void>();
const reconnectSubs = new Set<() => void>();

export const netState = () => state;
export const isOffline = () => state.offline;
export const isWifi = () => !state.offline && !state.limited && (state.kind === 'wifi' || state.kind === 'other');

export function subscribeNet(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
/** Fires when the device comes back online, or when the user taps "retry" on the banner. */
export function onReconnect(fn: () => void) { reconnectSubs.add(fn); return () => { reconnectSubs.delete(fn); }; }
export function fireReconnect() { [...reconnectSubs].forEach((fn) => { try { fn(); } catch { /* listener errors must not break others */ } }); }

export function setNet(next: Partial<NetState>) {
  const merged = { ...state, ...next };
  if (merged.offline === state.offline && merged.limited === state.limited && merged.kind === state.kind && merged.savedData === state.savedData) return;
  const cameBack = state.offline && !merged.offline;
  state = merged;
  [...subs].forEach((fn) => fn());
  if (cameBack) fireReconnect();
}

/** Called by the API client: true when cached data was served after a failed request, false after a live answer. */
export const markSaved = (saved: boolean) => setNet(saved ? { savedData: true } : { savedData: false });

/** Resolves once `ok()` holds (checked on every connectivity change), or rejects when `signal.cancelled` is set. */
export function waitFor(ok: () => boolean, signal?: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ok()) return resolve();
    const off = subscribeNet(() => {
      if (signal?.cancelled) { off(); reject(new Error('cancelled')); } else if (ok()) { off(); resolve(); }
    });
  });
}
