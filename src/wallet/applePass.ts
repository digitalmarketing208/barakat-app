// Apple Wallet pass.json builder (style "generic": balance and tier). Pure function, no keys and no signing.
// The SERVER adds the images, writes manifest.json, signs it with the Pass Type ID certificate and zips the .pkpass.
// Reference: https://developer.apple.com/documentation/walletpasses/pass
//
// Apple Wallet has NO rotating barcode. The barcode here is static, so it must never grant a discount: use it only
// as a non-secret member code. Redemption stays in the app (single-use rotating QR); see docs/MEMBERSHIP.md.
import type { Localized } from './googleWallet';

export interface ApplePassInput {
  passTypeIdentifier: string; // pass.<reverse-domain>, from the owner's Apple Developer account
  teamIdentifier: string;
  organizationName: string;
  serialNumber: string; // stable per member, never the mobile number
  description: string;
  logoText?: string;
  memberName: string;
  points: number;
  tierLabel: Localized;
  lang: 'ar' | 'en';
  /** '#RRGGBB' values; Apple wants rgb(r, g, b) strings and we convert */
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  /** non-secret member code for the static QR */
  memberCode: string;
  /** enables balance updates by push */
  webServiceURL?: string;
  authenticationToken?: string;
  planName?: string;
  planEndsAt?: string;
}

export const rgbString = (hex: string): string => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

export function buildApplePass(i: ApplePassInput) {
  const pick = (l: Localized) => l[i.lang];
  const L = (ar: string, en: string) => (i.lang === 'ar' ? ar : en);
  return {
    formatVersion: 1,
    passTypeIdentifier: i.passTypeIdentifier,
    teamIdentifier: i.teamIdentifier,
    organizationName: i.organizationName,
    serialNumber: i.serialNumber,
    description: i.description,
    ...(i.logoText ? { logoText: i.logoText } : {}),
    backgroundColor: rgbString(i.backgroundColor),
    foregroundColor: rgbString(i.foregroundColor),
    labelColor: rgbString(i.labelColor),
    ...(i.webServiceURL && i.authenticationToken ? { webServiceURL: i.webServiceURL, authenticationToken: i.authenticationToken } : {}),
    barcodes: [{ format: 'PKBarcodeFormatQR', message: i.memberCode, messageEncoding: 'iso-8859-1', altText: i.memberCode }],
    generic: {
      primaryFields: [{ key: 'balance', label: L('النقاط', 'POINTS'), value: Math.max(0, Math.round(i.points)), numberStyle: 'PKNumberStyleDecimal', changeMessage: L('رصيدك الآن %@ نقطة', 'Your balance is now %@ points') }],
      secondaryFields: [
        { key: 'tier', label: L('الفئة', 'TIER'), value: pick(i.tierLabel) },
        { key: 'name', label: L('العضو', 'MEMBER'), value: i.memberName, textAlignment: 'PKTextAlignmentNatural' },
      ],
      auxiliaryFields: i.planName ? [{ key: 'plan', label: L('الباقة', 'PLAN'), value: i.planName }, ...(i.planEndsAt ? [{ key: 'planEnds', label: L('تنتهي', 'ENDS'), value: i.planEndsAt }] : [])] : [],
      backFields: [{ key: 'terms', label: L('ملاحظة', 'NOTE'), value: L('اعرض الرمز المتجدد من التطبيق عند استخدام النقاط', 'Use the refreshing code in the app to spend points') }],
    },
  };
}
