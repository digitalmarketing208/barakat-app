import { useSyncExternalStore } from 'react';
import { trustedNow } from './clock';
import { nextBoundary } from './engine';
import { subscribeOffers } from './manifest';

// One shared ticker for every card on screen (a hook per card would mean hundreds of timers).
const subs = new Set<() => void>();
let version = 0, iv: ReturnType<typeof setInterval> | null = null, to: ReturnType<typeof setTimeout> | null = null, off: (() => void) | null = null;
const bump = () => { version++; subs.forEach((f) => f()); };
const arm = () => {
  if (to) clearTimeout(to);
  const nb = nextBoundary(trustedNow());
  to = nb === null ? null : setTimeout(() => { bump(); arm(); }, Math.min(Math.max(nb - trustedNow() + 50, 50), 2 ** 31 - 1));
};
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) { iv = setInterval(() => { bump(); arm(); }, 30000); off = subscribeOffers(() => { bump(); arm(); }); arm(); }
  return () => {
    subs.delete(f);
    if (!subs.size) { if (iv) clearInterval(iv); if (to) clearTimeout(to); if (off) off(); iv = to = off = null; }
  };
}

/** Trusted time (ms) that re-renders the caller at each offer start/end and every 30 s. Cheap enough for list cards. */
export function useOfferNow(): number {
  useSyncExternalStore(subscribe, () => version);
  return trustedNow();
}
