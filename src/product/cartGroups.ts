import type { Cart, NewLine } from '../shopify';

export type Line = Cart['lines'][number];
/** A cart row as shoppers see it: a product, plus the lens add-on paired with it (shared `_group`). */
export type Group = { key: string; main: Line; lens: Line | null; total: number };

export const attr = (l: Line, key: string) => l.attributes?.find((a) => a.key === key)?.value;
export const isLensLine = (l: Line) => !!l.attributes?.some((a) => a.key === 'For frame');
const lineTotal = (l: Line) => Number(l.merchandise.price.amount) * l.quantity;

export function groupLines(lines: Line[]): Group[] {
  const used = new Set<string>();
  const out: Group[] = [];
  for (const l of lines) {
    if (isLensLine(l)) continue;
    const g = attr(l, '_group');
    const lens = g ? lines.find((x) => x.id !== l.id && !used.has(x.id) && isLensLine(x) && attr(x, '_group') === g) ?? null : null;
    if (lens) used.add(lens.id);
    out.push({ key: l.id, main: l, lens, total: lineTotal(l) + (lens ? lineTotal(lens) : 0) });
  }
  // A lens whose frame is gone still has to be visible (and removable).
  for (const l of lines) if (isLensLine(l) && !used.has(l.id)) out.push({ key: l.id, main: l, lens: null, total: lineTotal(l) });
  return out;
}

/** Lines that re-create a removed group exactly (same attributes, so the frame + lens pairing survives an undo). */
export const restoreLines = (g: Group): NewLine[] =>
  [g.main, g.lens].filter((l): l is Line => !!l).map((l) => ({
    variantId: l.merchandise.id, quantity: l.quantity,
    attributes: l.attributes?.length ? l.attributes.map((a) => ({ key: a.key, value: a.value })) : undefined,
  }));
