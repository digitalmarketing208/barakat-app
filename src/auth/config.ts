// Shopify Customer Account API (new customer accounts) settings. Public values only: no secrets live in the app.
import Constants from 'expo-constants';
import { SHOPIFY } from '../config';

export const AUTH = {
  /** Public client id from the Headless channel > Customer Account API settings. */
  clientId: process.env.EXPO_PUBLIC_SHOPIFY_CUSTOMER_CLIENT_ID ?? '',
  /** Numeric shop id. Only used to build the callback scheme when app.json has no `shop.<id>.*` scheme yet. */
  shopId: (process.env.EXPO_PUBLIC_SHOPIFY_SHOP_ID ?? '').replace(/\D/g, ''),
  /** Show "Continue with Google" only when the store's hosted login page really offers it. */
  googleLogin: process.env.EXPO_PUBLIC_GOOGLE_LOGIN === '1',
  /** "Continue with Shop" is offered by the hosted page when Shop sign-in is on; set to 0 to hide the button. */
  shopLogin: process.env.EXPO_PUBLIC_SHOP_LOGIN !== '0',
  /** Optional address for privacy / delete-account requests. WhatsApp is always offered. */
  privacyEmail: process.env.EXPO_PUBLIC_PRIVACY_EMAIL ?? '',
  scopes: ['openid', 'email', 'customer-account-api:full'],
  domain: SHOPIFY.domain,
  callbackPath: 'callback',
};

export const isAuthConfigured = () => !!AUTH.clientId && !!AUTH.domain;

const appSchemes = (): string[] => {
  const raw: unknown = Constants.expoConfig?.scheme;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && !!x);
  return typeof raw === 'string' && raw ? [raw] : [];
};

/**
 * Shopify only accepts mobile callbacks whose scheme is `shop.<shop_id>.<anything>`.
 * The scheme must also be registered natively, so it has to be listed in app.json `scheme`.
 */
export function redirectInfo(): { uri: string; scheme: string; registered: boolean; shopifyValid: boolean } {
  const schemes = appSchemes();
  const shopScheme = schemes.find((x) => /^shop\.\d+\./.test(x));
  const scheme = shopScheme ?? (AUTH.shopId ? `shop.${AUTH.shopId}.app` : schemes[0] ?? '');
  return {
    scheme,
    uri: scheme ? `${scheme}://${AUTH.callbackPath}` : '',
    registered: !!scheme && schemes.includes(scheme),
    shopifyValid: /^shop\.\d+\./.test(scheme),
  };
}
