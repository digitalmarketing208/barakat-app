// Wallet-style redeem client. Contract in docs/MEMBERSHIP.md. These endpoints may not exist on the server yet:
// a 404/405/501 on the hold call becomes RewardsError('unsupported'), and the screen then falls back to the
// older WhatsApp-code flow. The QR carries ONLY the opaque token, never a mobile number.
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { RewardsClient, RewardsError } from './rewardsApi';
import { HoldStatus, isHoldStatus } from './redeemLogic';

const DEVICE_KEY = 'barakat.device.v1';
let memoryId: string | null = null;

/** Random uuid kept in secure storage; binds a hold to this device. Falls back to a per-launch id if storage fails. */
export async function getDeviceId(): Promise<string> {
  if (memoryId) return memoryId;
  try {
    const saved = await SecureStore.getItemAsync(DEVICE_KEY);
    if (saved) return (memoryId = saved);
    const id = randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
    return (memoryId = id);
  } catch {
    return (memoryId ??= randomUUID());
  }
}

export interface Hold { hold_id: string; expires_at: string; points?: number }
export interface HoldToken { token: string; expires_in: number }
export interface HoldState { status: HoldStatus; expires_at?: string }

export function createRedeemApi(client: RewardsClient) {
  const { call } = client;
  return {
    hold: async (points: number): Promise<Hold> => {
      const device_id = await getDeviceId();
      try {
        return await call<Hold>('/me/redeem-hold', { points, device_id });
      } catch (e) {
        if (e instanceof RewardsError && (e.status === 404 || e.status === 405 || e.status === 501)) throw new RewardsError('unsupported', undefined, e.status);
        throw e;
      }
    },
    // device_id on every call, so the server can enforce the device binding (setting redeem_device_strict)
    token: async (hold_id: string) => call<HoldToken>('/me/redeem-token', { hold_id, device_id: await getDeviceId() }),
    cancel: async (hold_id: string) => call<{ ok: true }>('/me/redeem-cancel', { hold_id, device_id: await getDeviceId() }),
    status: async (hold_id: string): Promise<HoldState> => {
      const o = await call<{ status?: unknown; expires_at?: string }>('/me/redeem-hold/' + encodeURIComponent(hold_id));
      if (!isHoldStatus(o.status)) throw new RewardsError('server');
      return { status: o.status, expires_at: o.expires_at };
    },
  };
}
export type RedeemApi = ReturnType<typeof createRedeemApi>;
