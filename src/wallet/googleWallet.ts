// Google Wallet loyalty pass builders (pure functions, no keys, no network). The SERVER signs the save JWT with its
// service-account key and creates the objects through the Wallet REST API; this file only builds the JSON.
// Reference: https://developers.google.com/wallet/retail/loyalty-cards (LoyaltyClass, LoyaltyObject, rotatingBarcode).
// Verify field names against the current reference before going live.

export interface Localized { ar: string; en: string }

export interface LoyaltyClassInput {
  issuerId: string;
  /** suffix after "<issuerId>.", letters, digits, dots, underscores, hyphens */
  classSuffix: string;
  issuerName: Localized;
  programName: Localized;
  programLogoUrl: string;
  /** '#RRGGBB' */
  hexBackgroundColor: string;
  heroImageUrl?: string;
}

const tr = (l: Localized) => ({ language: 'ar', value: l.ar });
const translated = (l: Localized) => ({ defaultValue: { language: 'en', value: l.en }, translatedValues: [tr(l)] });

export function buildLoyaltyClass(i: LoyaltyClassInput) {
  assertSuffix(i.classSuffix);
  return {
    id: `${i.issuerId}.${i.classSuffix}`,
    issuerName: i.issuerName.en,
    localizedIssuerName: translated(i.issuerName),
    programName: i.programName.en,
    localizedProgramName: translated(i.programName),
    programLogo: { sourceUri: { uri: i.programLogoUrl }, contentDescription: { defaultValue: { language: 'en', value: i.programName.en } } },
    hexBackgroundColor: i.hexBackgroundColor,
    ...(i.heroImageUrl ? { heroImage: { sourceUri: { uri: i.heroImageUrl } } } : {}),
    reviewStatus: 'UNDER_REVIEW' as const,
    // lets the pass update when balance changes
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES' as const,
  };
}

export interface RotatingBarcodeInput {
  /** opaque tokens issued by the server, one per period, starting at startIso (never the mobile number) */
  values: string[];
  startIso: string;
  /** default 60000 ms, same cadence as the in-app QR */
  periodMillis?: number;
  /** text under the code */
  alternateText?: string;
}

/** rotatingBarcode with pre-issued values. Wallet shows values[n] during period n and then falls back to the alternate text. */
export function buildRotatingBarcode(r: RotatingBarcodeInput) {
  if (!r.values.length) throw new Error('rotating barcode needs at least one value');
  return {
    type: 'QR_CODE' as const,
    renderEncoding: 'UTF_8' as const,
    ...(r.alternateText ? { alternateText: r.alternateText } : {}),
    initialRotatingBarcodeValues: { startDateTime: r.startIso, values: r.values, periodMillis: String(r.periodMillis ?? 60000) },
  };
}

export interface LoyaltyObjectInput {
  issuerId: string;
  classSuffix: string;
  /** stable per member, never the mobile number; for example "m<id>" */
  objectSuffix: string;
  memberId: string;
  memberName: string;
  tierLabel: Localized;
  points: number;
  pointsLabel?: Localized;
  tierTitle?: Localized;
  /** static fallback when no rotating values are supplied: still an opaque member code */
  staticBarcodeValue?: string;
  rotating?: RotatingBarcodeInput;
  planName?: string;
  planEndsAt?: string; // YYYY-MM-DD
  state?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'COMPLETED';
}

export function buildLoyaltyObject(i: LoyaltyObjectInput) {
  assertSuffix(i.objectSuffix);
  const pointsLabel = i.pointsLabel ?? { ar: 'النقاط', en: 'Points' };
  const tierTitle = i.tierTitle ?? { ar: 'الفئة', en: 'Tier' };
  const barcode = i.rotating
    ? { rotatingBarcode: buildRotatingBarcode(i.rotating) }
    : i.staticBarcodeValue ? { barcode: { type: 'QR_CODE' as const, value: i.staticBarcodeValue, alternateText: '' } } : {};
  return {
    id: `${i.issuerId}.${i.objectSuffix}`,
    classId: `${i.issuerId}.${i.classSuffix}`,
    state: i.state ?? 'ACTIVE',
    accountId: i.memberId,
    accountName: i.memberName,
    loyaltyPoints: { label: pointsLabel.en, localizedLabel: translated(pointsLabel), balance: { int: Math.max(0, Math.round(i.points)) } },
    secondaryLoyaltyPoints: { label: tierTitle.en, localizedLabel: translated(tierTitle), balance: { string: i.tierLabel.en } },
    ...barcode,
    ...(i.planName ? { textModulesData: [{ id: 'plan', header: 'Plan', body: i.planEndsAt ? `${i.planName} · ${i.planEndsAt}` : i.planName }] } : {}),
  };
}

export interface SaveToWalletInput {
  /** service account email, set by the server */
  issuerEmail: string;
  origins?: string[];
  classes?: ReturnType<typeof buildLoyaltyClass>[];
  objects?: ReturnType<typeof buildLoyaltyObject>[];
}
/** The unsigned JWT claims for the "Add to Google Wallet" link. The server signs them (RS256) with its private key. */
export function buildSaveToWalletClaims(i: SaveToWalletInput) {
  return {
    iss: i.issuerEmail,
    aud: 'google' as const,
    typ: 'savetowallet' as const,
    origins: i.origins ?? [],
    payload: { ...(i.classes?.length ? { loyaltyClasses: i.classes } : {}), ...(i.objects?.length ? { loyaltyObjects: i.objects } : {}) },
  };
}

function assertSuffix(s: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error('invalid id suffix: ' + s);
}
