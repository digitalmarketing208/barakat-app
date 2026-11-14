import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Cart, NetworkError, NewLine, cartAddLines, cartCreateLines, cartGet, cartRemove, cartUpdate } from './shopify';
import { CartApi, CartOp, applyRemote, isLens, matchQty, refOf, replay, withPending } from './net/cartOps';
import { isOffline, onReconnect } from './net/status';

type Store = {
  /** The cart to show: last known Shopify cart plus any changes still waiting to sync. */
  cart: Cart | null; cartBusy: boolean;
  /** Number of cart changes made offline that have not reached Shopify yet (checkout is unavailable while > 0). */
  cartPending: number;
  addToCart: (variantId: string, qty?: number) => Promise<void>;
  addLines: (lines: NewLine[]) => Promise<void>;
  setQty: (lineId: string, qty: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  wishlist: string[]; toggleWish: (handle: string) => void; isWished: (handle: string) => boolean;
  recent: string[]; pushRecent: (handle: string) => void;
};
const Ctx = createContext<Store>(null as unknown as Store);

const save = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});
const api: CartApi = { create: cartCreateLines, add: cartAddLines, update: cartUpdate, remove: cartRemove, get: cartGet };
const retryable = (e: unknown) => e instanceof NetworkError;
let opSeq = 0;
const opId = () => `${Date.now().toString(36)}${(opSeq++).toString(36)}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartBusy, setBusy] = useState(false);
  const [cartPending, setPending] = useState(0);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  // `server` = last cart Shopify confirmed; `ops` = changes waiting to be sent; `shown` = server + ops (what the UI renders).
  const server = useRef<Cart | null>(null);
  const ops = useRef<CartOp[]>([]);
  const shown = useRef<Cart | null>(null);
  const ready = useRef(false);

  const publish = useCallback(() => {
    const view = withPending(server.current, ops.current);
    shown.current = view; setCart(view); setPending(ops.current.length);
  }, []);
  const saveOps = useCallback(() => { save('cartOps', ops.current); }, []);
  const setServer = useCallback((c: Cart | null) => {
    server.current = c;
    if (c) { AsyncStorage.setItem('cartId', c.id).catch(() => {}); save('cartSnap', c); }
    else AsyncStorage.multiRemove(['cartId', 'cartSnap']).catch(() => {});
  }, []);

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Cart changes run one at a time so two quick taps cannot create two carts or race a pair update.
  const run = useCallback((fn: () => Promise<Cart | null>) => {
    const job = queue.current.catch(() => {}).then(async () => {
      setBusy(true);
      try { setServer(await fn()); }
      finally { publish(); setBusy(false); }
    });
    queue.current = job;
    return job;
  }, [publish, setServer]);

  // Send queued offline changes, oldest first. Stops at the first network failure and keeps the rest for next time.
  const retry = useRef<{ timer: ReturnType<typeof setTimeout> | null; n: number; go: () => void }>({ timer: null, n: 0, go: () => {} });
  const flush = useCallback((): Promise<void> => {
    if (!ops.current.length || isOffline()) return Promise.resolve();
    return run(async () => {
      const r = await replay(api, server.current, ops.current, retryable, (left) => { ops.current = [...left]; saveOps(); });
      ops.current = r.left; saveOps();
      return r.cart;
    }).catch(() => {}).then(() => {
      // Still waiting although the phone reports a connection (weak signal, Shopify hiccup): no reconnect event will
      // come, so try again shortly; otherwise the cart would stay "pending" and checkout blocked until the next app open.
      const r = retry.current;
      if (r.timer) { clearTimeout(r.timer); r.timer = null; }
      if (!ops.current.length) { r.n = 0; return; }
      if (isOffline()) return;
      r.timer = setTimeout(() => { r.timer = null; r.go(); }, Math.min(30000, 4000 * 2 ** Math.min(r.n++, 3)));
    });
  }, [run, saveOps]);
  useEffect(() => { retry.current.go = () => { void flush(); }; }, [flush]);

  // Re-read the cart from Shopify (after reconnecting, or returning from checkout), then send anything queued.
  const refresh = useCallback(() => {
    if (!ready.current || isOffline()) return Promise.resolve();
    const job = server.current ? run(async () => {
      const cur = server.current;
      if (!cur) return null;
      try { return await cartGet(cur.id); } // null = expired or checked out
      catch { return cur; }                 // keep the saved cart when the request fails
    }).catch(() => {}) : Promise.resolve();
    return job.then(flush);
  }, [run, flush]);

  useEffect(() => {
    (async () => {
      try {
        const [w, r, id, snap, q] = await Promise.all([
          AsyncStorage.getItem('wishlist'), AsyncStorage.getItem('recent'), AsyncStorage.getItem('cartId'),
          AsyncStorage.getItem('cartSnap'), AsyncStorage.getItem('cartOps'),
        ]);
        const strs = (raw: string | null): string[] => { try { const v: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
        if (w) setWishlist(strs(w));
        if (r) setRecent(strs(r));
        try {
          const list: unknown = q ? JSON.parse(q) : [];
          if (Array.isArray(list)) ops.current = list.filter((o): o is CartOp => !!o && ((o.t === 'add' && Array.isArray(o.lines)) || (o.t === 'qty' && !!o.ref)));
        } catch { /* a damaged queue is dropped */ }
        // The saved copy makes the cart visible immediately and with no connection.
        let saved: Cart | null = null;
        try { const c = snap ? (JSON.parse(snap) as Cart) : null; if (c && Array.isArray(c.lines) && c.cost?.subtotalAmount && c.cost?.totalAmount) saved = c; } catch { /* damaged copy: reload from Shopify */ }
        if (id) server.current = saved && saved.id === id ? saved : { id, checkoutUrl: '', totalQuantity: 0, cost: { subtotalAmount: { amount: '0', currencyCode: 'SAR' }, totalAmount: { amount: '0', currencyCode: 'SAR' } }, lines: [] };
        publish();
      } catch { /* storage unavailable: start empty */ }
      ready.current = true;
      refresh();
    })();
    const offNet = onReconnect(() => { refresh(); });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { offNet(); sub.remove(); };
  }, [publish, refresh]);

  // Apply a change: straight to Shopify when online, otherwise to the local cart + the replay queue.
  const mutate = useCallback(async (op: CartOp) => {
    const enqueue = () => { ops.current = [...ops.current, op]; saveOps(); publish(); };
    if (!isOffline() && ops.current.length) await flush(); // keep order: older queued changes go first
    if (isOffline() || ops.current.length) { enqueue(); return; }
    try {
      await run(() => {
        if (op.t === 'add') op.base = matchQty(server.current, op.lines);
        return applyRemote(api, op, server.current);
      });
    } catch (e) {
      if (!retryable(e)) throw e; // a real answer from Shopify (e.g. sold out): let the screen show it
      if (op.t === 'add') op.tried = true; // outcome unknown: replay checks the cart before re-sending
      enqueue();
      if (!retry.current.timer) retry.current.timer = setTimeout(() => { retry.current.timer = null; retry.current.go(); }, 4000);
    }
  }, [run, flush, publish, saveOps]);

  const addToCart = useCallback(async (variantId: string, qty = 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await mutate({ id: opId(), t: 'add', lines: [{ variantId, quantity: qty }] });
  }, [mutate]);
  const addLines = useCallback(async (lines: NewLine[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (lines.length) await mutate({ id: opId(), t: 'add', lines });
  }, [mutate]);
  // A lens add-on line shares a `_group` attribute with its frame line (the lens line also has "For frame");
  // the pairing itself lives in net/cartOps (applyLocal / applyRemote) so online, offline and replay behave the same.
  const setQty = useCallback(async (lineId: string, qty: number) => {
    const line = shown.current?.lines.find((l) => l.id === lineId);
    if (!line) return;
    if (isLens(line) && qty > 0) return; // lens qty follows its frame
    await mutate({ id: opId(), t: 'qty', ref: refOf(line), qty });
  }, [mutate]);
  const removeLine = useCallback((lineId: string) => setQty(lineId, 0), [setQty]);

  const toggleWish = useCallback((h: string) => {
    Haptics.selectionAsync().catch(() => {});
    setWishlist((p) => { const n = p.includes(h) ? p.filter((x) => x !== h) : [h, ...p]; save('wishlist', n); return n; });
  }, []);
  const pushRecent = useCallback((h: string) => {
    setRecent((p) => { const n = [h, ...p.filter((x) => x !== h)].slice(0, 12); save('recent', n); return n; });
  }, []);

  const value = useMemo<Store>(() => ({
    cart, cartBusy, cartPending, addToCart, addLines, setQty, removeLine, wishlist, toggleWish,
    isWished: (h) => wishlist.includes(h), recent, pushRecent,
  }), [cart, cartBusy, cartPending, addToCart, addLines, setQty, removeLine, wishlist, toggleWish, recent, pushRecent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);
