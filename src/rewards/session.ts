// Rewards session shared by the Rewards flow and the Plans screen:
// API base, the customer token (SecureStore) and the last /me answer (AsyncStorage, for offline use at the till).
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONFIG, MeResponse, Member, PublicConfig, createRewardsClient } from './rewardsApi';

export const REWARDS_API = process.env.EXPO_PUBLIC_REWARDS_API || 'https://barakat-rewards.digitalmarketing-b5c.workers.dev';
export const STORE_URL = 'https://barakatoptical.com.sa';

const TOKEN_KEY = 'boRewardsToken';
const ME_KEY = 'rewards.me.v1';
const ME_AT_KEY = 'rewards.me.at.v1';

export async function readToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}
export async function writeToken(v: string | null): Promise<void> {
  try {
    if (v) await SecureStore.setItemAsync(TOKEN_KEY, v);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch { /* storage unavailable: session lasts until the app closes */ }
}

export async function readCachedMe(): Promise<MeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_KEY);
    const o = raw ? (JSON.parse(raw) as MeResponse) : null;
    return o && o.member ? o : null;
  } catch { return null; }
}
/** When the cached /me answer was saved (ms), for the 'balance as of' line while offline. */
export async function readCachedAt(): Promise<number | null> {
  try { const n = Number(await AsyncStorage.getItem(ME_AT_KEY)); return n > 0 ? n : null; } catch { return null; }
}
export async function writeCachedMe(v: MeResponse | null): Promise<void> {
  try {
    if (v && v.member) { await AsyncStorage.setItem(ME_KEY, JSON.stringify(v)); await AsyncStorage.setItem(ME_AT_KEY, String(Date.now())); }
    else { await AsyncStorage.removeItem(ME_KEY); await AsyncStorage.removeItem(ME_AT_KEY); }
  } catch { /* cache is best effort */ }
}

/**
 * Read-only snapshot for screens outside the Rewards flow (e.g. Plans): the signed-in member, if any, and the
 * public config. Never signs the user out and never shows an error; it falls back to the cached member.
 */
export function useMemberSnapshot(apiBase: string = REWARDS_API) {
  const [member, setMember] = useState<Member | null>(null);
  const [cfg, setCfg] = useState<PublicConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await readToken();
      const api = createRewardsClient({ apiBase, getToken: () => token });
      api.getConfig().then((c) => { if (alive) setCfg({ ...DEFAULT_CONFIG, ...c }); }).catch(() => {});
      if (!token) return;
      const cached = await readCachedMe();
      if (alive && cached) setMember(cached.member);
      try {
        const me = await api.me();
        if (!alive) return;
        setMember(me.member);
        void writeCachedMe(me);
      } catch { /* keep the cached member */ }
    })();
    return () => { alive = false; };
  }, [apiBase]);
  return { member, cfg };
}
