// Pure helpers for the wallet-style redeem flow (no React Native, tested in membership.test.ts).
import type { PublicConfig } from './rewardsApi';

export type HoldStatus = 'held' | 'used' | 'expired' | 'cancelled';
export const isHoldStatus = (x: unknown): x is HoldStatus => x === 'held' || x === 'used' || x === 'expired' || x === 'cancelled';

/** Largest redeemable amount: usable balance rounded down to the step. 0 when below the minimum. */
export function maxRedeemPoints(usable: number, cfg: Pick<PublicConfig, 'min_redeem' | 'step_redeem'>): number {
  const m = Math.floor(Math.max(0, usable) / cfg.step_redeem) * cfg.step_redeem;
  return m >= cfg.min_redeem ? m : 0;
}
/** Snap a requested amount to the allowed range and step. */
export function clampPoints(want: number, usable: number, cfg: Pick<PublicConfig, 'min_redeem' | 'step_redeem'>): number {
  const max = maxRedeemPoints(usable, cfg);
  if (!max) return cfg.min_redeem;
  const stepped = Math.round(want / cfg.step_redeem) * cfg.step_redeem;
  return Math.min(max, Math.max(cfg.min_redeem, stepped));
}
export const discountSar = (points: number, cfg: Pick<PublicConfig, 'point_value_sar'>): number => Math.round(points * cfg.point_value_sar * 100) / 100;
/** The 50% cap: the invoice must be at least this much for the whole discount to apply. */
export const minInvoiceSar = (points: number, cfg: Pick<PublicConfig, 'point_value_sar' | 'cap_percent'>): number =>
  Math.round(((points * cfg.point_value_sar * 100) / cfg.cap_percent) * 100) / 100;

/** Seconds until the QR is replaced: the server's expires_in, kept inside 5..90 s (the contract default is 60). */
export const refreshSeconds = (expiresIn: unknown): number => {
  const n = Number(expiresIn);
  return Number.isFinite(n) && n > 0 ? Math.min(90, Math.max(5, Math.floor(n))) : 60;
};

export function firstName(name: string | null | undefined): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
