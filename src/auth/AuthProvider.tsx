import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18n } from '../i18n';
import { isAuthConfigured } from './config';
import { AuthError, AuthErrorCode, isAuthError, toAuthError } from './errors';
import * as session from './session';
import * as api from './customerApi';
import type { AddressInput, Profile } from './customerApi';
import { clearCartBuyerIdentity, updateCartBuyerIdentity } from './cartIdentity';
import { clearRx } from './prescriptions';
import { vaultGet, vaultRemove, vaultSet } from './vault';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
export type SignInResult = { ok: true } | { ok: false; reason: AuthErrorCode };

type Auth = {
  status: AuthStatus;
  /** false until the owner supplies the Customer Account API client id; the sign-in screen then explains it */
  configured: boolean;
  /** cached profile is shown instantly and offline; null only when signed out */
  profile: Profile | null;
  /** true while the profile on screen is the cached copy because the network failed */
  offline: boolean;
  /** an interactive sign-in is open */
  busy: boolean;
  signIn: (opts?: { loginHint?: string }) => Promise<SignInResult>;
  signOut: (opts?: { wipeLocal?: boolean }) => Promise<void>;
  /** re-fetches the profile; resolves false when it had to keep the cached copy */
  reload: () => Promise<boolean>;
  /** null when signed out, locked or the session cannot be refreshed right now */
  getAccessToken: () => Promise<string | null>;
  // optional biometric re-unlock
  locked: boolean;
  unlock: () => Promise<boolean>;
  biometric: { available: boolean; enabled: boolean };
  setBiometric: (on: boolean) => Promise<boolean>;
  // profile changes (each one refreshes the profile afterwards; they throw AuthError / CustomerUserError)
  updateName: (firstName: string, lastName: string) => Promise<void>;
  saveAddress: (address: AddressInput, opts?: { id?: string; makeDefault?: boolean }) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  setEmailMarketing: (on: boolean) => Promise<void>;
  /** attaches the signed-in customer to the cart so hosted checkout is pre-filled; safe to call for guests */
  syncCart: (cartId?: string | null) => Promise<boolean>;
};

const Ctx = createContext<Auth | null>(null);
const PROFILE = 'profile';
const BIO_KEY = 'auth.bio';
const RELOCK_AFTER = 5 * 60 * 1000;

// expo-local-authentication is optional: typed here and required inside try/catch (Metro treats that as an optional
// dependency), so the app builds and runs without it and the biometric switch simply stays hidden.
type LocalAuthMod = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (o?: { promptMessage?: string; cancelLabel?: string }) => Promise<{ success: boolean }>;
};
const localAuth = (): LocalAuthMod | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-local-authentication') as LocalAuthMod;
    return m && typeof m.authenticateAsync === 'function' ? m : null;
  } catch { return null; }
};
async function biometricAvailable(): Promise<boolean> {
  try {
    const LA = localAuth();
    return !!LA && (await LA.hasHardwareAsync()) && (await LA.isEnrolledAsync());
  } catch { return false; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const [status, setStatusState] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLockedState] = useState(false);
  const [bio, setBioState] = useState({ available: false, enabled: false });
  // Mirrors of the state for callbacks that run outside render (app-state listener, cart sync, token getter).
  // They are written together with the state so they are never a render behind.
  const profileRef = useRef<Profile | null>(null);
  const statusRef = useRef<AuthStatus>('loading');
  const lockedRef = useRef(false);
  const bioRef = useRef(bio);
  const mounted = useRef(true);
  const setStatus = useCallback((v: AuthStatus) => { statusRef.current = v; setStatusState(v); }, []);
  const setLocked = useCallback((v: boolean) => { lockedRef.current = v; setLockedState(v); }, []);
  const setBio = useCallback((v: { available: boolean; enabled: boolean }) => { bioRef.current = v; setBioState(v); }, []);

  const applyProfile = useCallback((p: Profile | null) => {
    profileRef.current = p;
    if (mounted.current) setProfile(p);
    if (p) void vaultSet(PROFILE, p); else void vaultRemove(PROFILE);
  }, []);

  const localSignOut = useCallback(async () => {
    await session.clearTokens();
    applyProfile(null);
    if (mounted.current) { setStatus('signedOut'); setLocked(false); setOffline(false); }
  }, [applyProfile, setLocked, setStatus]);

  const syncCart = useCallback(async (cartId?: string | null): Promise<boolean> => {
    try {
      const p = profileRef.current;
      if (statusRef.current !== 'signedIn' || !p || lockedRef.current) return false;
      const id = cartId ?? (await AsyncStorage.getItem('cartId')); // store.tsx keeps the active cart id here
      if (!id) return false;
      const work = (async () => {
        const token = await session.getAccessToken().catch(() => null);
        return updateCartBuyerIdentity(id, { email: p.email, phone: p.phone, customerAccessToken: token });
      })();
      // Checkout must never wait long for this.
      return await Promise.race([work, new Promise<boolean>((r) => setTimeout(() => r(false), 4000))]);
    } catch { return false; }
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    if (!(await session.hasSession())) { await localSignOut(); return false; }
    try {
      const p = await api.fetchProfile(profileRef.current);
      applyProfile(p);
      if (mounted.current) { setOffline(false); setStatus('signedIn'); }
      return true;
    } catch (e) {
      if (isAuthError(e, 'expired')) { await localSignOut(); return false; }
      // Offline or Shopify hiccup: stay signed in on the cached profile.
      if (mounted.current) setOffline(true);
      return false;
    }
  }, [applyProfile, localSignOut, setStatus]);

  // Start-up: restore the session from secure-store and show the cached profile immediately (works offline).
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const [has, cached, bioPref, bioOk] = await Promise.all([
          session.hasSession(), vaultGet<Profile>(PROFILE), AsyncStorage.getItem(BIO_KEY).catch(() => null), biometricAvailable(),
        ]);
        if (!mounted.current) return;
        const enabled = bioPref === '1' && bioOk;
        setBio({ available: bioOk, enabled });
        if (!has) {
          if (cached) void vaultRemove(PROFILE);
          setStatus('signedOut');
          return;
        }
        if (cached) { profileRef.current = cached; setProfile(cached); }
        setLocked(enabled);
        setStatus('signedIn');
        void reload().then((ok) => { if (ok) void syncCart(); });
      } catch {
        if (mounted.current) setStatus('signedOut');
      }
    })();
    return () => { mounted.current = false; };
  }, [reload, syncCart, setBio, setLocked, setStatus]);

  // Back in the foreground: refresh quietly, and re-lock after a long absence when the biometric lock is on.
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') { leftAt = Date.now(); return; }
      if (st !== 'active' || statusRef.current !== 'signedIn') return;
      if (bioRef.current.enabled && leftAt && Date.now() - leftAt > RELOCK_AFTER) setLocked(true);
      const age = Date.now() - (profileRef.current?.fetchedAt ?? 0);
      if (leftAt && age > 60_000) void reload();
      leftAt = 0;
    });
    return () => sub.remove();
  }, [reload, setLocked]);

  const signIn = useCallback(async (opts?: { loginHint?: string }): Promise<SignInResult> => {
    if (busy) return { ok: false, reason: 'cancelled' };
    setBusy(true);
    try {
      await session.signInInteractive({ locale: lang, loginHint: opts?.loginHint });
      let p: Profile | null = null;
      try { p = await api.fetchProfile(null); } catch (e) { if (isAuthError(e, 'expired')) throw e; }
      applyProfile(p);
      if (mounted.current) { setOffline(!p); setLocked(false); setStatus('signedIn'); }
      if (!p) void reload();
      void syncCart();
      return { ok: true };
    } catch (e) {
      const err = toAuthError(e);
      if (err.code === 'expired') await localSignOut();
      return { ok: false, reason: err.code === 'expired' ? 'server' : err.code };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [applyProfile, busy, lang, localSignOut, reload, syncCart, setLocked, setStatus]);

  const signOut = useCallback(async (opts?: { wipeLocal?: boolean }) => {
    const p = profileRef.current;
    const cartId = await AsyncStorage.getItem('cartId').catch(() => null);
    if (opts?.wipeLocal && p) await clearRx(p.id).catch(() => {});
    applyProfile(null);
    if (mounted.current) { setStatus('signedOut'); setLocked(false); setOffline(false); }
    if (cartId) void clearCartBuyerIdentity(cartId);
    await session.signOutRemote();
  }, [applyProfile, setLocked, setStatus]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (statusRef.current !== 'signedIn' || lockedRef.current) return null;
    try { return await session.getAccessToken(); }
    catch (e) { if (isAuthError(e, 'expired')) await localSignOut(); return null; }
  }, [localSignOut]);

  const prompt = useCallback(async (): Promise<boolean> => {
    try {
      const LA = localAuth();
      if (!LA) return false;
      const r = await LA.authenticateAsync({
        promptMessage: lang === 'ar' ? 'افتح حسابك في بركات' : 'Unlock your Barakat account',
        cancelLabel: lang === 'ar' ? 'إلغاء' : 'Cancel',
      });
      return r.success;
    } catch { return false; }
  }, [lang]);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (!lockedRef.current) return true;
    // If biometrics were removed from the phone the lock cannot be satisfied: fall back to a fresh sign-in.
    if (!(await biometricAvailable())) { await signOut(); return false; }
    const ok = await prompt();
    if (ok && mounted.current) setLocked(false);
    return ok;
  }, [prompt, signOut, setLocked]);

  const setBiometric = useCallback(async (on: boolean): Promise<boolean> => {
    const available = await biometricAvailable();
    if (on && (!available || !(await prompt()))) {
      if (mounted.current) setBio({ available, enabled: false });
      return false;
    }
    await AsyncStorage.setItem(BIO_KEY, on ? '1' : '0').catch(() => {});
    if (mounted.current) setBio({ available, enabled: on });
    return true;
  }, [prompt, setBio]);

  // Every write goes through here: a dead session signs the user out instead of failing forever.
  const mutate = useCallback(async (fn: () => Promise<void>) => {
    if (lockedRef.current) throw new AuthError('locked');
    try { await fn(); }
    catch (e) {
      if (isAuthError(e, 'expired')) await localSignOut();
      throw e;
    }
    await reload();
  }, [localSignOut, reload]);

  const value = useMemo<Auth>(() => ({
    status, configured: isAuthConfigured(), profile, offline, busy, signIn, signOut, reload, getAccessToken,
    locked, unlock, biometric: bio, setBiometric, syncCart,
    updateName: (f, l) => mutate(() => api.updateName(f, l)),
    saveAddress: (address, opts) => mutate(() => (opts?.id ? api.updateAddress(opts.id, address, opts.makeDefault) : api.createAddress(address, !!opts?.makeDefault))),
    deleteAddress: (id) => mutate(() => api.deleteAddress(id)),
    setDefaultAddress: (id) => mutate(() => api.updateAddress(id, null, true)),
    setEmailMarketing: (on) => mutate(() => api.setEmailMarketing(on)),
  }), [status, profile, offline, busy, signIn, signOut, reload, getAccessToken, locked, unlock, bio, setBiometric, syncCart, mutate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const noop = async () => {};
/** Safe outside the provider too: screens that mount before registration simply see a signed-out guest. */
const FALLBACK: Auth = {
  status: 'signedOut', configured: false, profile: null, offline: false, busy: false,
  signIn: async () => ({ ok: false, reason: 'config' }), signOut: noop, reload: async () => false, getAccessToken: async () => null,
  locked: false, unlock: async () => true, biometric: { available: false, enabled: false }, setBiometric: async () => false,
  updateName: noop, saveAddress: noop, deleteAddress: noop, setDefaultAddress: noop, setEmailMarketing: noop, syncCart: async () => false,
};

export const useAuth = (): Auth => useContext(Ctx) ?? FALLBACK;
