// ZATCA e-invoice QR decoder (pure TypeScript, no React Native imports, runs in plain Node).
// The app only uses this to PREVIEW a receipt; the Rewards API decodes and validates the QR again on its own.
//
// Format (ZATCA, "Guide to Develop FATOORA Compliant QR Code":
//   https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Documents/QRCodeCreation.pdf
//  and Security Features Implementation Standards v1.2, Annex 2 of the e-invoicing technical specifications):
//   base64( TLV entries concatenated ), entry = 1 byte tag, 1 byte length (max 255), value (UTF-8).
//   1 seller name, 2 seller VAT registration number, 3 timestamp yyyy-MM-ddTHH:mm:ssZ, 4 invoice total incl. VAT,
//   5 VAT total; Phase 2 (from 1 Jan 2023, simplified invoices) adds 6 XML hash, 7 ECDSA signature,
//   8 ECDSA public key, 9 stamp signature of the key (binary values, kept opaque here).

export type ZatcaFailure = 'not_base64' | 'damaged' | 'missing_fields' | 'bad_vat' | 'bad_date' | 'bad_amount';

export interface ZatcaReceipt {
  seller: string;
  /** 15 digits */
  vat: string;
  /** timestamp text exactly as printed in the QR */
  stampRaw: string;
  /** instant as an ISO string in UTC (a stamp without a zone is read as Saudi time, UTC+3) */
  utc: string;
  /** printed date and time digits, "YYYY-MM-DDTHH:mm:ss" */
  wall: string;
  /** invoice total incl. VAT, SAR */
  total: number;
  /** VAT amount, SAR */
  vatAmount: number;
  /** tags 6 and 7 are present */
  phase2: boolean;
  /** tag numbers found, ascending */
  tags: number[];
}

export type ZatcaResult = { ok: true; receipt: ZatcaReceipt } | { ok: false; reason: ZatcaFailure };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Strict base64 (also accepts the URL-safe alphabet and missing padding). Returns null if invalid. */
export function base64ToBytes(input: string): Uint8Array | null {
  const t = String(input ?? '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!t || !/^[A-Za-z0-9+/]+$/.test(t) || t.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < t.length; i++) {
    acc = (acc << 6) | B64.indexOf(t[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

/** Strict UTF-8 decoder (rejects overlong forms, surrogates and truncated sequences). Returns null if invalid. */
export function utf8Decode(b: Uint8Array): string | null {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number;
    let n: number;
    if (c < 0x80) { cp = c; n = 0; }
    else if (c >= 0xc2 && c <= 0xdf) { cp = c & 0x1f; n = 1; }
    else if (c >= 0xe0 && c <= 0xef) { cp = c & 0x0f; n = 2; }
    else if (c >= 0xf0 && c <= 0xf4) { cp = c & 0x07; n = 3; }
    else return null;
    if (i + n >= b.length && n > 0) return null; // truncated multi-byte sequence
    for (let k = 1; k <= n; k++) {
      const x = b[i + k];
      if ((x & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (x & 0x3f);
    }
    if ((n === 2 && cp < 0x800) || (n === 3 && cp < 0x10000) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    s += String.fromCodePoint(cp);
    i += n + 1;
  }
  return s;
}

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/٫/g, '.');

/** Parses the QR timestamp. A stamp without a zone is Saudi local time (UTC+3). Returns null if invalid. */
export function parseZatcaStamp(v: string): { utc: string; wall: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(String(v).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', zone] = m;
  const wall = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const naive = Date.parse(wall + 'Z');
  if (!Number.isFinite(naive) || +mo < 1 || +mo > 12 || +d < 1 || +h > 23 || +mi > 59 || +s > 59) return null;
  if (new Date(naive).getUTCDate() !== +d) return null; // e.g. 31 February
  let offMin = 180;
  if (zone) {
    if (/^z$/i.test(zone)) offMin = 0;
    else { const zz = zone.replace(':', ''); offMin = (zz[0] === '-' ? -1 : 1) * (+zz.slice(1, 3) * 60 + +zz.slice(3, 5)); }
  }
  return { utc: new Date(naive - offMin * 60000).toISOString(), wall };
}

const money = (text: string): number | null => {
  const s = toLatinDigits(text).trim();
  return /^\d{1,9}(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) / 100 : null;
};

/** Decodes and validates a ZATCA receipt QR (the string the camera returns). */
export function decodeZatca(qr: string): ZatcaResult {
  const b = base64ToBytes(qr);
  if (!b) return { ok: false, reason: 'not_base64' };
  const fields = new Map<number, Uint8Array>();
  for (let i = 0; i < b.length; ) {
    if (i + 2 > b.length) return { ok: false, reason: 'damaged' };
    const tag = b[i];
    const len = b[i + 1];
    const end = i + 2 + len;
    if (tag === 0 || end > b.length || fields.has(tag)) return { ok: false, reason: 'damaged' };
    fields.set(tag, b.subarray(i + 2, end));
    i = end;
  }
  if (![1, 2, 3, 4, 5].every((t) => (fields.get(t)?.length ?? 0) > 0)) return { ok: false, reason: 'missing_fields' };
  const text = (tag: number): string | null => {
    const s = utf8Decode(fields.get(tag) as Uint8Array);
    return s === null ? null : s.trim();
  };
  const seller = text(1), vatRaw = text(2), stampRaw = text(3), totalRaw = text(4), vatAmtRaw = text(5);
  if (seller === null || vatRaw === null || stampRaw === null || totalRaw === null || vatAmtRaw === null) return { ok: false, reason: 'damaged' };
  if (!seller) return { ok: false, reason: 'missing_fields' };
  const vat = toLatinDigits(vatRaw).replace(/\s+/g, '');
  if (!/^\d{15}$/.test(vat)) return { ok: false, reason: 'bad_vat' };
  const stamp = parseZatcaStamp(stampRaw);
  if (!stamp) return { ok: false, reason: 'bad_date' };
  const total = money(totalRaw), vatAmount = money(vatAmtRaw);
  if (total === null || vatAmount === null || vatAmount > total) return { ok: false, reason: 'bad_amount' };
  return {
    ok: true,
    receipt: { seller, vat, stampRaw, utc: stamp.utc, wall: stamp.wall, total, vatAmount, phase2: fields.has(6) && fields.has(7), tags: [...fields.keys()].sort((x, y) => x - y) },
  };
}

/** Points a receipt total would earn at `rate` points per SAR (floor, same rule as the API). */
export const pointsFor = (totalSar: number, rate: number): number => Math.floor(Math.round(totalSar * 100) * rate / 100);

/** Whole days between the receipt time and `now` (negative = in the future). */
export const receiptAgeDays = (utc: string, now: number = Date.now()): number => (now - Date.parse(utc)) / 864e5;

/** Receipts older than this are refused by the API (setting receipt_max_age_days). */
export const MAX_AGE_DAYS = 14;
