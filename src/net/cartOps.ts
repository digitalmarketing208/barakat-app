// Offline cart: pure helpers that describe a cart change, apply it to a local copy (so the cart is usable with
// no connection) and replay it against Shopify later. No React / native imports, so it is unit-testable in Node.
import type { Cart, NewLine } from '../shopify';
import { variantInfo } from '../shopify';

type Line = Cart['lines'][number];
/** Identifies a cart line in a way that survives the line getting a new id on the server. */
export type LineRef = { lineId?: string; variantId: string; group?: string; lens: boolean };
export type CartOp =
  /** `base`: matching quantity on the server before the first send; `tried`: a send was attempted with unknown outcome. */
  | { id: string; t: 'add'; lines: NewLine[]; base?: number; tried?: boolean }
  /** qty <= 0 removes the line. */
  | { id: string; t: 'qty'; ref: LineRef; qty: number };

const attr = (attrs: { key: string; value: string }[] | undefined, key: string) => attrs?.find((a) => a.key === key)?.value;
export const groupOf = (l: Line) => attr(l.attributes, '_group');
/** A lens add-on line carries "For frame"; its quantity always follows its frame line. */
export const isLens = (l: Line) => !!l.attributes?.some((a) => a.key === 'For frame');
export const isLocalId = (id: string) => id.startsWith('local:');

export const refOf = (l: Line): LineRef => ({ lineId: isLocalId(l.id) ? undefined : l.id, variantId: l.merchandise.id, group: groupOf(l), lens: isLens(l) });

export function resolve(cart: Cart | null, ref: LineRef): Line | null {
  if (!cart) return null;
  const byId = ref.lineId ? cart.lines.find((l) => l.id === ref.lineId) : undefined;
  if (byId) return byId;
  return cart.lines.find((l) => l.merchandise.id === ref.variantId && groupOf(l) === ref.group && isLens(l) === ref.lens) ?? null;
}

/** The lens line paired with a frame line (same `_group`), or null. */
export function partnerOf(cart: Cart, line: Line): Line | null {
  const grp = groupOf(line);
  if (!grp || isLens(line)) return null;
  return cart.lines.find((l) => l.id !== line.id && groupOf(l) === grp && isLens(l)) ?? null;
}

const sameAttrs = (a: { key: string; value: string }[] | undefined, b: { key: string; value: string }[] | undefined) => {
  const norm = (x: { key: string; value: string }[] | undefined) => JSON.stringify([...(x ?? [])].map((p) => [p.key, p.value]).sort());
  return norm(a) === norm(b);
};

const recalc = (cart: Cart, pending: boolean): Cart => {
  const cur = cart.cost.subtotalAmount.currencyCode;
  const sum = cart.lines.reduce((n, l) => n + Number(l.merchandise.price.amount) * l.quantity, 0);
  const amount = { amount: sum.toFixed(2), currencyCode: cur };
  return {
    ...cart,
    // A cart with unsynced changes must not be checked out: the hosted checkout would miss them.
    checkoutUrl: pending ? '' : cart.checkoutUrl,
    totalQuantity: cart.lines.reduce((n, l) => n + l.quantity, 0),
    cost: { subtotalAmount: amount, totalAmount: amount },
  };
};

/** Apply one change to a local copy of the cart (optimistic view). Never mutates its input. */
export function applyLocal(cart: Cart | null, op: CartOp): Cart | null {
  if (op.t === 'add') {
    const base: Cart = cart ?? { id: 'local', checkoutUrl: '', totalQuantity: 0, cost: { subtotalAmount: { amount: '0', currencyCode: 'SAR' }, totalAmount: { amount: '0', currencyCode: 'SAR' } }, lines: [] };
    const lines = base.lines.map((l) => ({ ...l }));
    op.lines.forEach((n, i) => {
      const hit = lines.find((l) => l.merchandise.id === n.variantId && sameAttrs(l.attributes, n.attributes));
      if (hit) { hit.quantity += n.quantity; return; }
      const info = variantInfo(n.variantId) ?? { id: n.variantId, title: 'Default Title', product: { title: '…', handle: '' }, image: null, price: { amount: '0', currencyCode: 'SAR' } };
      lines.push({ id: `local:${op.id}:${i}`, quantity: n.quantity, attributes: n.attributes ?? [], merchandise: info });
    });
    return recalc({ ...base, lines }, true);
  }
  if (!cart) return cart;
  const line = resolve(cart, op.ref);
  if (!line) return cart;
  if (isLens(line) && op.qty > 0) return cart; // lens quantity follows its frame
  const partner = partnerOf(cart, line);
  const ids = new Set([line.id, ...(partner ? [partner.id] : [])]);
  const lines = op.qty <= 0
    ? cart.lines.filter((l) => !ids.has(l.id))
    : cart.lines.map((l) => (ids.has(l.id) ? { ...l, quantity: op.qty } : l));
  return recalc({ ...cart, lines }, true);
}

/** What the user should see: the last known server cart plus every change still waiting to sync. */
export const withPending = (server: Cart | null, ops: CartOp[]): Cart | null => ops.reduce<Cart | null>(applyLocal, server);

/** Units already in the cart for the first line of an add (used to tell whether an add with unknown outcome landed). */
export function matchQty(cart: Cart | null, lines: NewLine[]): number {
  const first = lines[0];
  if (!cart || !first) return 0;
  return cart.lines.filter((l) => l.merchandise.id === first.variantId && sameAttrs(l.attributes, first.attributes)).reduce((n, l) => n + l.quantity, 0);
}

const GONE = /does not exist|not found|invalid id/i;

export type CartApi = {
  create: (lines: NewLine[]) => Promise<Cart>;
  add: (cartId: string, lines: NewLine[]) => Promise<Cart>;
  update: (cartId: string, lineId: string, qty: number) => Promise<Cart>;
  remove: (cartId: string, lineId: string) => Promise<Cart>;
  get: (cartId: string) => Promise<Cart | null>;
};

/** Send one change to Shopify. Keeps the frame + lens pairing: the lens line follows its frame's quantity/removal. */
export async function applyRemote(api: CartApi, op: CartOp, cur: Cart | null): Promise<Cart | null> {
  if (op.t === 'add') {
    if (!cur) return api.create(op.lines);
    try { return await api.add(cur.id, op.lines); } catch (e) {
      // The saved cart expired or was checked out: start a new one with these lines.
      if (e instanceof Error && GONE.test(e.message)) return api.create(op.lines);
      throw e;
    }
  }
  const line = resolve(cur, op.ref);
  if (!cur || !line) return cur; // already gone
  if (isLens(line) && op.qty > 0) return cur;
  const partner = partnerOf(cur, line);
  try {
    let c = op.qty <= 0 ? await api.remove(cur.id, line.id) : await api.update(cur.id, line.id, op.qty);
    if (partner) c = op.qty <= 0 ? await api.remove(cur.id, partner.id) : await api.update(cur.id, partner.id, op.qty);
    return c;
  } catch (e) {
    // The saved cart expired or was checked out: nothing left to change.
    if (e instanceof Error && GONE.test(e.message)) return null;
    throw e;
  }
}

/**
 * Replay queued changes in order. Stops (keeping the rest) when `isRetryable(error)`; a change Shopify rejects
 * (e.g. sold out) is dropped so the queue can never jam. Returns the new server cart and the changes still waiting.
 */
export async function replay(api: CartApi, server: Cart | null, ops: CartOp[], isRetryable: (e: unknown) => boolean, onProgress?: (left: CartOp[]) => void):
  Promise<{ cart: Cart | null; left: CartOp[]; dropped: number }> {
  let cur = server; let dropped = 0;
  const left = [...ops];
  while (left.length) {
    const op = left[0];
    try {
      if (op.t === 'add') {
        if (op.tried && cur) {
          // An earlier send had no answer. Ask Shopify whether it landed before sending again (no duplicates).
          const fresh = await api.get(cur.id);
          if (fresh) {
            cur = fresh;
            if (matchQty(fresh, op.lines) >= (op.base ?? 0) + (op.lines[0]?.quantity ?? 0)) { left.shift(); onProgress?.(left); continue; }
          } else cur = null;
        }
        op.base = matchQty(cur, op.lines); op.tried = true;
        onProgress?.(left);
      }
      cur = await applyRemote(api, op, cur);
    } catch (e) {
      if (isRetryable(e)) break;
      dropped++;
    }
    left.shift();
    onProgress?.(left);
  }
  return { cart: cur, left, dropped };
}
