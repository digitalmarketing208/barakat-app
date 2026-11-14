// Frame measurements (mm) read from metafields or tags. Everything is optional: no data, no UI.
type Dim = 'lens' | 'bridge' | 'temple' | 'width' | 'height';
export type FitLabel = 'narrow' | 'medium' | 'wide';
export type Fit = Partial<Record<Dim, number>> & { label?: FitLabel };
export type RawMeta = { namespace?: string; key: string; value: string };

const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
const RANGE: Record<Dim, [number, number]> = { lens: [38, 66], bridge: [10, 26], temple: [110, 160], width: [110, 160], height: [20, 65] };

// Exact Shopify metafield keys (namespace custom, type dimension).
const META_KEY: Record<string, Dim> = { lens_width: 'lens', bridge_width: 'bridge', temple_width: 'temple' };

/** custom.fit text (Narrow / Medium / Wide, English or Arabic) to a label. */
export const fitLabelOf = (v: string | undefined | null): FitLabel | undefined => {
  const t = (v ?? '').toLowerCase();
  if (/narrow|small|ضيق|صغير/.test(t)) return 'narrow';
  if (/medium|average|regular|متوسط/.test(t)) return 'medium';
  if (/wide|large|عريض|واسع|كبير/.test(t)) return 'wide';
  return undefined;
};

const fieldOf = (label: string): Dim | null => {
  const k = label.toLowerCase().replace(/[\s_-]+/g, ' ');
  if (/(frame|total|front) ?width/.test(k)) return 'width';
  if (/lens ?height|^height$/.test(k)) return 'height';
  if (/lens ?(width|size)|eye ?size|^lens$|^eye$/.test(k)) return 'lens';
  if (/bridge|^dbl$/.test(k)) return 'bridge';
  if (/temple|arm/.test(k)) return 'temple';
  return null;
};

// Metafield values may be plain ("140", "140 mm") or a dimension JSON ({"value":140,"unit":"MILLIMETERS"}).
const num = (v: string): number => {
  try { const j = JSON.parse(v); if (j && typeof j === 'object' && 'value' in j) return Number((j as { value: unknown }).value); } catch { /* plain text */ }
  const m = v.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

const put = (fit: Fit, f: Dim, n: number) => { if (fit[f] == null && inRange(n, ...RANGE[f])) fit[f] = Math.round(n); };

const TRIPLE = /(?:^|[^\d])(\d{2})\s*[-□x×/ ]\s*(\d{2})\s*[-□x×/ ]\s*(\d{3})(?!\d)/;

export function parseFit(opts: { metafields?: (RawMeta | null)[]; tags?: string[]; texts?: string[]; sizeOption?: string }): Fit | null {
  const fit: Fit = {};
  for (const m of opts.metafields ?? []) {
    if (!m?.value) continue;
    if (m.namespace === 'custom' && m.key === 'fit') { fit.label ??= fitLabelOf(m.value); continue; }
    const f = m.namespace === 'custom' ? META_KEY[m.key] : fieldOf(m.key);
    if (f) put(fit, f, num(m.value));
  }
  for (const tag of opts.tags ?? []) {
    const m = tag.match(/^([a-z][a-z\s_-]*?)[\s:=_-]*(\d{2,3}(?:\.\d)?)\s*(?:mm)?$/i);
    if (!m) continue;
    const f = fieldOf(m[1].trim());
    if (f) put(fit, f, Number(m[2]));
  }
  for (const text of [...(opts.tags ?? []), ...(opts.texts ?? [])]) {
    const m = text?.match(TRIPLE);
    if (!m) continue;
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (inRange(a, ...RANGE.lens) && inRange(b, ...RANGE.bridge) && inRange(c, ...RANGE.temple)) { put(fit, 'lens', a); put(fit, 'bridge', b); put(fit, 'temple', c); }
  }
  if (opts.sizeOption && /^\d{2}$/.test(opts.sizeOption.trim())) put(fit, 'lens', Number(opts.sizeOption));
  return Object.keys(fit).length ? fit : null;
}

export const fitClass = (fit: Fit): 'fitNarrow' | 'fitMedium' | 'fitWide' | null => {
  if (fit.label) return fit.label === 'narrow' ? 'fitNarrow' : fit.label === 'medium' ? 'fitMedium' : 'fitWide';
  return fit.lens == null ? null : fit.lens < 50 ? 'fitNarrow' : fit.lens <= 54 ? 'fitMedium' : 'fitWide';
};
