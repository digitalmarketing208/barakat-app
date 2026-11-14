// Saudi address model, validators and Shopify MailingAddress mapping. Pure TS (no RN imports) so it is testable in Node.

export type SaudiAddress = {
  fullName: string;
  mobile: string;        // 05xxxxxxxx or 9665xxxxxxxx (also accepts +966 / 00966 / 5xxxxxxxx on input)
  city: string;
  district: string;
  street: string;
  buildingNo: string;    // 4 digits
  additionalNo: string;  // 4 digits (may be empty)
  postalCode: string;    // 5 digits
  shortAddress: string;  // 4 letters + 4 digits, e.g. RRRD2929 (may be empty)
  lat: number | null;
  lng: number | null;
  notes: string;
};

export const emptyAddress = (): SaudiAddress => ({
  fullName: '', mobile: '', city: '', district: '', street: '', buildingNo: '', additionalNo: '',
  postalCode: '', shortAddress: '', lat: null, lng: null, notes: '',
});

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Convert Arabic-Indic digits to ASCII and trim. */
export const asciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).trim();

/** Normalise any accepted Saudi mobile input to local form 05xxxxxxxx; returns '' if unrecognised. */
export function normalizeMobile(raw: string): string {
  let s = asciiDigits(raw).replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('966')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  return /^5\d{8}$/.test(s) ? '0' + s : '';
}
export const isSaudiMobile = (s: string) => normalizeMobile(s) !== '';
/** International form 9665xxxxxxxx (for Shopify phone use +966...). */
export const toInternationalMobile = (s: string) => { const n = normalizeMobile(s); return n ? '966' + n.slice(1) : ''; };

export const isBuildingNo = (s: string) => /^\d{4}$/.test(asciiDigits(s));
export const isAdditionalNo = (s: string) => /^\d{4}$/.test(asciiDigits(s));
export const isPostalCode = (s: string) => /^\d{5}$/.test(asciiDigits(s));
export const normalizeShortAddress = (s: string) => s.replace(/[\s\-]/g, '').toUpperCase();
export const isShortAddress = (s: string) => /^[A-Z]{4}[0-9]{4}$/.test(normalizeShortAddress(asciiDigits(s)));

export type FieldKey = 'fullName' | 'mobile' | 'city' | 'district' | 'street' | 'buildingNo' | 'additionalNo' | 'postalCode' | 'shortAddress';
export type ErrorCode = 'required' | 'invalid';
export type AddressErrors = Partial<Record<FieldKey, ErrorCode>>;

/** Returns {} when valid. additionalNo and shortAddress are optional but validated when present. */
export function validateAddress(a: SaudiAddress): AddressErrors {
  const e: AddressErrors = {};
  if (a.fullName.trim().length < 2) e.fullName = a.fullName.trim() ? 'invalid' : 'required';
  if (!a.mobile.trim()) e.mobile = 'required'; else if (!isSaudiMobile(a.mobile)) e.mobile = 'invalid';
  if (!a.city.trim()) e.city = 'required';
  if (!a.district.trim()) e.district = 'required';
  if (!a.street.trim()) e.street = 'required';
  if (!a.buildingNo.trim()) e.buildingNo = 'required'; else if (!isBuildingNo(a.buildingNo)) e.buildingNo = 'invalid';
  if (a.additionalNo.trim() && !isAdditionalNo(a.additionalNo)) e.additionalNo = 'invalid';
  if (!a.postalCode.trim()) e.postalCode = 'required'; else if (!isPostalCode(a.postalCode)) e.postalCode = 'invalid';
  if (a.shortAddress.trim() && !isShortAddress(a.shortAddress)) e.shortAddress = 'invalid';
  return e;
}
export const isValidAddress = (a: SaudiAddress) => Object.keys(validateAddress(a)).length === 0;

/** Shopify MailingAddressInput-compatible shape (Storefront/Admin: firstName/lastName optional, name split below). */
export type ShopifyMailingAddress = {
  firstName: string; lastName: string;
  address1: string; address2: string;
  city: string; zip: string; country: 'SA'; countryCode: 'SA'; phone: string;
};

const SEP = ' · ';
export function toShopifyAddress(a: SaudiAddress): ShopifyMailingAddress {
  const parts = a.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  const b = asciiDigits(a.buildingNo);
  const a2: string[] = [a.district.trim()];
  const sa = normalizeShortAddress(a.shortAddress);
  if (sa) a2.push(`Short address: ${sa}`);
  const ad = asciiDigits(a.additionalNo);
  if (ad) a2.push(`Additional no. ${ad}`);
  return {
    firstName, lastName,
    address1: `${a.street.trim()}, building ${b}`,
    address2: a2.join(SEP),
    city: a.city.trim(), zip: asciiDigits(a.postalCode), country: 'SA', countryCode: 'SA',
    phone: '+' + (toInternationalMobile(a.mobile) || asciiDigits(a.mobile)),
  };
}

export type ShopifyAddressLike = Partial<{
  firstName: string | null; lastName: string | null; name: string | null;
  address1: string | null; address2: string | null; city: string | null; zip: string | null; phone: string | null;
}>;

/** Inverse of toShopifyAddress. Lat/lng/notes are not stored by Shopify, so they come back empty. */
export function fromShopifyAddress(m: ShopifyAddressLike): SaudiAddress {
  const out = emptyAddress();
  out.fullName = (m.name ?? [m.firstName, m.lastName].filter(Boolean).join(' ')).trim();
  const a1 = (m.address1 ?? '').trim();
  const bm = a1.match(/^(.*?),?\s*building\s+(\d{4})\s*$/i);
  out.street = bm ? bm[1].trim() : a1;
  out.buildingNo = bm ? bm[2] : '';
  const segs = (m.address2 ?? '').split('·').map((s) => s.trim()).filter(Boolean);
  const rest: string[] = [];
  for (const s of segs) {
    const sh = s.match(/^short address:\s*([A-Za-z]{4}\d{4})$/i);
    const ad = s.match(/^additional no\.?\s*(\d{4})$/i);
    if (sh) out.shortAddress = sh[1].toUpperCase();
    else if (ad) out.additionalNo = ad[1];
    else rest.push(s);
  }
  out.district = rest.join(SEP);
  out.city = (m.city ?? '').trim();
  out.postalCode = (m.zip ?? '').trim();
  out.mobile = normalizeMobile(m.phone ?? '') || (m.phone ?? '');
  return out;
}

export const googleMapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
