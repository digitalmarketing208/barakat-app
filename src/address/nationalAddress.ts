// Saudi Post (SPL) National Address API client. Endpoints are from the official portal, see docs/ADDRESS.md.
// Key comes from EXPO_PUBLIC_NATIONAL_ADDRESS_KEY. With no key every function returns null (feature silently off).
import { asciiDigits, isAdditionalNo, isBuildingNo, isPostalCode, isShortAddress, normalizeShortAddress } from './types';

export const FIND_SHORT_ADDRESS_URL = 'https://splonline.com.sa/en/national-address-1/';
const KEY = process.env.EXPO_PUBLIC_NATIONAL_ADDRESS_KEY ?? '';
const HOST = 'https://apina.address.gov.sa/NationalAddress';
export const isNationalAddressEnabled = () => KEY.length > 0;

export type NationalAddressResult = {
  city: string; district: string; street: string; buildingNo: string; additionalNo: string; postalCode: string;
  shortAddress: string; lat: number | null; lng: number | null;
};
export type NationalAddressError = 'bad_request' | 'unauthorized' | 'limit' | 'not_found' | 'server' | 'network';
export class NationalAddressException extends Error {
  constructor(public code: NationalAddressError, msg?: string) { super(msg ?? code); }
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    if (res.status === 400) throw new NationalAddressException('bad_request');
    if (res.status === 401) throw new NationalAddressException('unauthorized');
    if (res.status === 403 || res.status === 429) throw new NationalAddressException('limit'); // call limit reached
    if (res.status === 404) throw new NationalAddressException('not_found');
    if (!res.ok) throw new NationalAddressException('server');
    return await res.json();
  } catch (e) {
    if (e instanceof NationalAddressException) throw e;
    throw new NationalAddressException('network');
  } finally { clearTimeout(timer); }
}

const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return String(o[k]).trim(); return ''; };
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const firstAddress = (j: any) => (j && j.success !== false && Array.isArray(j.Addresses) ? j.Addresses[0] : null);

function mapRow(r: any, shortAddress = ''): NationalAddressResult {
  return {
    city: pick(r, 'City', 'CityName'), district: pick(r, 'District', 'DistrictName'), street: pick(r, 'Street', 'StreetName'),
    buildingNo: pick(r, 'BuildingNumber'), additionalNo: pick(r, 'AdditionalNumber'),
    postalCode: pick(r, 'PostCode', 'ZipCode', 'PostalCode'),
    shortAddress: normalizeShortAddress(pick(r, 'ShortAddress') || shortAddress),
    lat: num(pick(r, 'Latitude')), lng: num(pick(r, 'Longitude')),
  };
}

/**
 * Short address (e.g. RRRD2929). Uses "National Address By Short Address" (full address) and
 * "Geocodes By Short Address" (lat/lng). Both documented as api_key query parameter; header is sent too.
 */
export async function lookupByShortAddress(short: string, lang: 'ar' | 'en' = 'ar'): Promise<NationalAddressResult | null> {
  if (!KEY) return null;
  const sa = normalizeShortAddress(asciiDigits(short));
  if (!isShortAddress(sa)) throw new NationalAddressException('bad_request');
  const q = `shortaddress=${sa}&format=json&encode=utf8&Language=${lang === 'ar' ? 'Arabic' : 'English'}&api_key=${encodeURIComponent(KEY)}`;
  const h = { api_key: KEY };
  const [addr, geo] = await Promise.all([
    getJson(`${HOST}/NationalAddressByShortAddress/NationalAddressByShortAddress?${q}&page=1`, h),
    getJson(`${HOST}/GeoCodeByShortAddress/GeoCodeByShortlAddress?${q}`, h).catch(() => null), // coords are optional
  ]);
  const row = firstAddress(addr);
  if (!row) return null;
  const out = mapRow(row, sa);
  const g = firstAddress(geo);
  if (g) { out.lat = num(pick(g, 'Latitude')); out.lng = num(pick(g, 'Longitude')); }
  return out;
}

/**
 * Building number + postal code (+ optional additional number). Uses v3.1 "Address Fixed Params"
 * (GET /NationalAddress/v3.1/Address/address-fixed-params, header api_key). The doc page publishes no sample response,
 * so field names are read defensively (same names as the v1 API).
 */
export async function lookupByBuilding(
  buildingNo: string, postalCode: string, additionalNo = '', lang: 'ar' | 'en' = 'ar',
): Promise<NationalAddressResult | null> {
  if (!KEY) return null;
  const b = asciiDigits(buildingNo), z = asciiDigits(postalCode), a = asciiDigits(additionalNo);
  if (!isBuildingNo(b) || !isPostalCode(z) || (a && !isAdditionalNo(a))) throw new NationalAddressException('bad_request');
  let q = `format=json&encode=utf8&language=${lang === 'ar' ? 'A' : 'E'}&buildingnumber=${b}&zipcode=${z}`;
  if (a) q += `&additionalnumber=${a}`;
  const j = await getJson(`${HOST}/v3.1/Address/address-fixed-params?${q}`, { api_key: KEY });
  const row = firstAddress(j) ?? (Array.isArray(j?.addresses) ? j.addresses[0] : null);
  return row ? mapRow(row) : null;
}

/** Picks the right lookup from whatever the user has typed; null when not enough data or feature disabled. */
export function lookupBest(f: { shortAddress: string; buildingNo: string; postalCode: string; additionalNo: string }, lang: 'ar' | 'en') {
  if (!KEY) return Promise.resolve(null);
  if (isShortAddress(f.shortAddress)) return lookupByShortAddress(f.shortAddress, lang);
  if (isBuildingNo(f.buildingNo) && isPostalCode(f.postalCode)) return lookupByBuilding(f.buildingNo, f.postalCode, f.additionalNo, lang);
  return Promise.resolve(null);
}
