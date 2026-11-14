// OAuth 2.0 authorization-code + PKCE session against Shopify's Customer Account API.
// Tokens are kept ONLY in expo-secure-store (Keychain / Android Keystore). Nothing here is logged.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AUTH, isAuthConfigured, redirectInfo } from './config';
import { AuthError, toAuthError } from './errors';

type AuthSessionMod = typeof import('expo-auth-session');
// Loaded lazily so a build that predates these native modules still starts (sign-in then reports `unavailable`).
const authSession = (): AuthSessionMod => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { return require('expo-auth-session') as AuthSessionMod; }
  catch { throw new AuthError('unavailable'); }
};

export type Discovery = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint?: string;
  revocationEndpoint?: string;
  graphqlApi: string;
  at: number;
};
type Tokens = { accessToken: string; expiresAt: number; refreshToken: string | null; idToken: string | null };

const K = { access: 'bo.auth.access', refresh: 'bo.auth.refresh', id: 'bo.auth.id' };
const DISCOVERY_KEY = 'auth.discovery';
const DISCOVERY_TTL = 24 * 3600 * 1000;
const secureOpts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const UA = 'BarakatOpticalApp';

const timeout = (ms: number): AbortSignal | undefined => {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
};

// ---------- discovery ----------
let discovery: Discovery | null = null;
let discoveryJob: Promise<Discovery> | null = null;

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: timeout(10000) });
  if (!res.ok) throw new AuthError(res.status === 404 ? 'config' : 'server', `discovery ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function loadDiscovery(): Promise<Discovery> {
  let cached: Discovery | null = null;
  try {
    const raw = await AsyncStorage.getItem(DISCOVERY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Discovery & { domain?: string }) : null;
    if (parsed && parsed.domain === AUTH.domain && parsed.tokenEndpoint && parsed.graphqlApi) cached = parsed;
  } catch { /* ignore a broken cache */ }
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached;
  try {
    const base = `https://${AUTH.domain}/.well-known`;
    const [oidc, api] = await Promise.all([fetchJson(`${base}/openid-configuration`), fetchJson(`${base}/customer-account-api`)]);
    const d: Discovery = {
      authorizationEndpoint: String(oidc.authorization_endpoint ?? ''),
      tokenEndpoint: String(oidc.token_endpoint ?? ''),
      endSessionEndpoint: oidc.end_session_endpoint ? String(oidc.end_session_endpoint) : undefined,
      revocationEndpoint: oidc.revocation_endpoint ? String(oidc.revocation_endpoint) : undefined,
      graphqlApi: String(api.graphql_api ?? ''),
      at: Date.now(),
    };
    if (!d.authorizationEndpoint || !d.tokenEndpoint || !d.graphqlApi) throw new AuthError('config', 'discovery incomplete');
    AsyncStorage.setItem(DISCOVERY_KEY, JSON.stringify({ ...d, domain: AUTH.domain })).catch(() => {});
    return d;
  } catch (e) {
    if (cached) return cached; // offline: yesterday's endpoints are still good
    throw toAuthError(e);
  }
}

export function getDiscovery(): Promise<Discovery> {
  if (discovery && Date.now() - discovery.at < DISCOVERY_TTL) return Promise.resolve(discovery);
  if (!discoveryJob) {
    discoveryJob = loadDiscovery()
      .then((d) => { discovery = d; return d; })
      .finally(() => { discoveryJob = null; });
  }
  return discoveryJob;
}

// ---------- token storage (secure-store only) ----------
let tokens: Tokens | null = null;
let tokensLoaded = false;

async function persist(t: Tokens) {
  tokens = t; tokensLoaded = true;
  await SecureStore.setItemAsync(K.access, JSON.stringify({ t: t.accessToken, e: t.expiresAt }), secureOpts);
  if (t.refreshToken) await SecureStore.setItemAsync(K.refresh, t.refreshToken, secureOpts);
  else await SecureStore.deleteItemAsync(K.refresh, secureOpts).catch(() => {});
  if (t.idToken) await SecureStore.setItemAsync(K.id, t.idToken, secureOpts);
  else await SecureStore.deleteItemAsync(K.id, secureOpts).catch(() => {});
}

async function loadTokens(): Promise<Tokens | null> {
  if (tokensLoaded) return tokens;
  try {
    const [a, r, i] = await Promise.all([
      SecureStore.getItemAsync(K.access, secureOpts), SecureStore.getItemAsync(K.refresh, secureOpts), SecureStore.getItemAsync(K.id, secureOpts),
    ]);
    const acc = a ? (JSON.parse(a) as { t?: string; e?: number }) : null;
    tokens = acc?.t || r ? { accessToken: acc?.t ?? '', expiresAt: acc?.e ?? 0, refreshToken: r, idToken: i } : null;
  } catch { tokens = null; }
  tokensLoaded = true;
  return tokens;
}

export async function clearTokens(): Promise<void> {
  tokens = null; tokensLoaded = true;
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k, secureOpts).catch(() => {})));
}

export async function hasSession(): Promise<boolean> {
  return !!(await loadTokens());
}

// ---------- sign in ----------
export type SignInOptions = { locale?: 'ar' | 'en'; loginHint?: string };

export async function signInInteractive(opts: SignInOptions = {}): Promise<void> {
  if (!isAuthConfigured()) throw new AuthError('config', 'EXPO_PUBLIC_SHOPIFY_CUSTOMER_CLIENT_ID is not set');
  const redirect = redirectInfo();
  if (!redirect.uri) throw new AuthError('config', 'app.json has no scheme');
  if (__DEV__ && (!redirect.shopifyValid || !redirect.registered)) {
    console.warn('[auth] Shopify needs a callback scheme "shop.<shop_id>.app" listed in app.json `scheme`. See docs/AUTH.md.');
  }
  const AS = authSession();
  const d = await getDiscovery();
  const redirectUri = AS.makeRedirectUri({ native: redirect.uri, scheme: redirect.scheme, path: AUTH.callbackPath });
  const extraParams: Record<string, string> = {};
  if (opts.locale) extraParams.locale = opts.locale;
  if (opts.loginHint) extraParams.login_hint = opts.loginHint;

  let request: InstanceType<AuthSessionMod['AuthRequest']>;
  let result: Awaited<ReturnType<InstanceType<AuthSessionMod['AuthRequest']>['promptAsync']>>;
  try {
    request = new AS.AuthRequest({ clientId: AUTH.clientId, redirectUri, scopes: AUTH.scopes, usePKCE: true, extraParams });
    result = await request.promptAsync({ authorizationEndpoint: d.authorizationEndpoint }, { showInRecents: true });
  } catch (e) {
    // Thrown when the native browser / crypto module is missing or no browser is installed.
    throw e instanceof AuthError ? e : new AuthError('unavailable', String((e as Error)?.message ?? e));
  }
  if (result.type === 'cancel' || result.type === 'dismiss' || result.type === 'locked' || result.type === 'opened') {
    throw new AuthError('cancelled');
  }
  if (result.type !== 'success' || !result.params?.code) {
    const code = result.type === 'error' ? result.params?.error ?? result.error?.code : '';
    if (code === 'access_denied') throw new AuthError('cancelled');
    throw new AuthError('server', code || 'authorization failed');
  }
  try {
    // Public client: no secret, the PKCE verifier proves this app started the flow.
    const tr = await AS.exchangeCodeAsync(
      { clientId: AUTH.clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
      { tokenEndpoint: d.tokenEndpoint },
    );
    if (!tr.accessToken) throw new AuthError('server', 'no access token');
    await persist({
      accessToken: tr.accessToken,
      expiresAt: Date.now() + (tr.expiresIn ?? 3600) * 1000,
      refreshToken: tr.refreshToken ?? null,
      idToken: tr.idToken ?? null,
    });
  } catch (e) {
    throw toAuthError(e);
  }
}

// ---------- silent refresh ----------
let refreshJob: Promise<string> | null = null;

async function refresh(): Promise<string> {
  const cur = await loadTokens();
  if (!cur?.refreshToken) {
    await clearTokens();
    throw new AuthError('expired');
  }
  const d = await getDiscovery();
  let res: Response;
  try {
    res = await fetch(d.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
      body: `grant_type=refresh_token&client_id=${encodeURIComponent(AUTH.clientId)}&refresh_token=${encodeURIComponent(cur.refreshToken)}`,
      signal: timeout(12000),
    });
  } catch (e) {
    throw toAuthError(e);
  }
  let body: { access_token?: string; expires_in?: number; refresh_token?: string; id_token?: string; error?: string } = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok && body.access_token) {
    await persist({
      accessToken: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      refreshToken: body.refresh_token ?? cur.refreshToken, // Shopify may rotate it
      idToken: body.id_token ?? cur.idToken,
    });
    return body.access_token;
  }
  if (res.status === 400 || res.status === 401) {
    // invalid_grant / invalid_token: the refresh token is spent or revoked.
    await clearTokens();
    throw new AuthError('expired', body.error);
  }
  throw new AuthError(res.status >= 500 || res.status === 429 ? 'network' : 'server', body.error || `token ${res.status}`);
}

/** A valid access token, refreshed silently when it is about to expire. Throws AuthError (`expired`, `network`, …). */
export async function getAccessToken(force = false): Promise<string> {
  const cur = await loadTokens();
  if (!cur) throw new AuthError('expired');
  if (!force && cur.accessToken && cur.expiresAt - Date.now() > 60_000) return cur.accessToken;
  if (!refreshJob) refreshJob = refresh().finally(() => { refreshJob = null; });
  return refreshJob;
}

// ---------- sign out ----------
/** Ends the Shopify session (best effort) and wipes the tokens from this device. Never throws. */
export async function signOutRemote(): Promise<void> {
  const cur = await loadTokens().catch(() => null);
  await clearTokens();
  if (!cur?.idToken && !cur?.refreshToken) return;
  try {
    const d = await getDiscovery();
    const jobs: Promise<unknown>[] = [];
    if (cur.refreshToken && d.revocationEndpoint) {
      jobs.push(fetch(d.revocationEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: `token=${encodeURIComponent(cur.refreshToken)}&token_type_hint=refresh_token&client_id=${encodeURIComponent(AUTH.clientId)}`,
        signal: timeout(6000),
      }));
    }
    if (cur.idToken && d.endSessionEndpoint) {
      // Mobile public clients may call the logout URI as a plain API endpoint (200 OK), no redirect needed.
      const sep = d.endSessionEndpoint.includes('?') ? '&' : '?';
      jobs.push(fetch(`${d.endSessionEndpoint}${sep}id_token_hint=${encodeURIComponent(cur.idToken)}`, { headers: { 'User-Agent': UA }, signal: timeout(6000) }));
    }
    await Promise.allSettled(jobs);
  } catch { /* offline: the local sign-out already happened */ }
}
