// Barakat Rewards – typed client for the customer endpoints of the Rewards API (API.md v1).
// No dependencies beyond the global fetch available in React Native.

export type Lang = 'ar' | 'en';
export type TierName = 'member' | 'silver' | 'gold';

export type ErrorCode =
  | 'bad_request' | 'unauthorized' | 'not_found' | 'not_member' | 'already_member' | 'frozen'
  | 'duplicate' | 'min_points' | 'step_points' | 'insufficient_points' | 'cap_exceeded'
  | 'code_wrong' | 'code_expired' | 'code_locked' | 'too_many_codes' | 'not_allowed' | 'family_full'
  // wallet redeem (docs/MEMBERSHIP.md; the server may not ship these yet)
  | 'hold_exists' | 'hold_expired' | 'hold_not_found' | 'device_mismatch'
  // client-side codes (not sent by the API)
  | 'network' | 'server' | 'config' | 'unsupported';

export const API_ERROR_CODES: ErrorCode[] = [
  'bad_request', 'unauthorized', 'not_found', 'not_member', 'already_member', 'frozen', 'duplicate',
  'min_points', 'step_points', 'insufficient_points', 'cap_exceeded', 'code_wrong', 'code_expired',
  'code_locked', 'too_many_codes', 'not_allowed', 'family_full',
  'hold_exists', 'hold_expired', 'hold_not_found', 'device_mismatch',
];

export class RewardsError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message?: string, status = 0) {
    super(message || code);
    this.name = 'RewardsError';
    this.code = code;
    this.status = status;
  }
}

export interface Member {
  id: number;
  /** normalised, 9665XXXXXXXX */
  mobile: string;
  name: string;
  lang: Lang;
  birth_month: number | null;
  tier: TierName;
  tier_spend_sar: number;
  next_tier: { name: TierName; remaining_sar: number } | null;
  points: { usable: number; pending: number; value_sar: number };
  next_expiry: { points: number; date: string } | null;
  household: { is_owner: boolean; size: number; owner_mobile_masked: string };
  /** points per riyal for the current tier */
  rate: number;
  /** not in API.md v1; read only if the API adds it */
  consent_marketing?: boolean;
  /** API v1.1: the household's active paid plan, or null. Absent on older API versions. */
  plan?: MemberPlan | null;
}

export type PlanCode = 'plus' | 'max';
export type BenefitCode = 'bogo' | 'second_lenses' | 'care';
export interface PlanBenefit { code: BenefitCode | string; limit: number; used: number; left: number }
export interface MemberPlan {
  code: PlanCode | string;
  /** YYYY-MM-DD */
  ends_at: string;
  floor?: TierName;
  benefits: PlanBenefit[];
}
/** Plan definition from GET /public/config (v1.1). Prices are not part of the API. */
export interface PlanDef { months: number; floor: TierName; benefits: Record<string, number> }

export type HistoryType = 'earn' | 'bonus' | 'redeem' | 'reverse' | 'expire' | 'adjust';
export type HistoryStatus = 'pending' | 'usable' | 'done';

export interface HistoryRow {
  date: string;
  type: HistoryType;
  points: number;
  sar: number | null;
  channel: string | null;
  branch: string | null;
  status: HistoryStatus;
}

export interface FamilyRow { mobile_masked: string; name: string; is_owner: boolean }

export interface PublicConfig {
  rates: { member: number; silver: number; gold: number };
  tiers: { silver_sar: number; gold_sar: number };
  point_value_sar: number;
  min_redeem: number;
  step_redeem: number;
  cap_percent: number;
  pending_days: number;
  expiry_months: number;
  bonuses: { join: number; eyetest: number; referral: number; lens6: number };
  /** v1.1 */
  plans?: Record<string, PlanDef>;
}

/** Plan defaults from API.md v1.1, used until /public/config answers. */
export const DEFAULT_PLANS: Record<PlanCode, PlanDef> = {
  plus: { months: 12, floor: 'silver', benefits: { bogo: 4 } },
  max: { months: 12, floor: 'gold', benefits: { bogo: 6, second_lenses: 6, care: 1 } },
};

/** Defaults from API.md; replace with GET /public/config when it loads. */
export const DEFAULT_CONFIG: PublicConfig = {
  rates: { member: 3, silver: 5, gold: 7 },
  tiers: { silver_sar: 1500, gold_sar: 4000 },
  point_value_sar: 0.01,
  min_redeem: 1000,
  step_redeem: 500,
  cap_percent: 50,
  pending_days: 14,
  expiry_months: 24,
  bonuses: { join: 2000, eyetest: 500, referral: 5000, lens6: 2000 },
  plans: DEFAULT_PLANS,
};

export interface MeResponse {
  member: Member | null;
  invite: { from_mobile_masked: string } | null;
  family: FamilyRow[];
  history: HistoryRow[];
}
export interface ChallengeResponse { challenge_id: string; sent_to: string }
export interface VerifyResponse { token: string; member: Member | null }
export interface JoinBody {
  name: string;
  lang: Lang;
  birth_month?: number;
  consent_program: true;
  consent_marketing: boolean;
  referrer_mobile?: string;
}
export interface JoinResponse { member: Member; bonus_points: number }
export interface RedeemRequestResponse extends ChallengeResponse { sar_value: number }
export interface RedeemConfirmResponse {
  discount_code: string;
  sar_value: number;
  min_order_sar: number;
  expires_at: string;
  member: Member;
}

/** Accepts 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 009665…, Arabic or Persian digits. Returns 9665XXXXXXXX or ''. */
export function normaliseMobile(input: string): string {
  let d = String(input || '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '966' + d;
  return /^9665\d{8}$/.test(d) ? d : '';
}

export function onlyDigits(input: string): string {
  return String(input || '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

type Json = Record<string, unknown>;

export interface RewardsClientOptions {
  apiBase: string;
  /** returns the stored customer token, or null */
  getToken: () => string | null | Promise<string | null>;
  /** called when the API answers `unauthorized` on an authenticated call */
  onUnauthorized?: () => void;
  /** request timeout in ms (default 12000); a timeout surfaces as RewardsError('network') */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 12000;

export function createRewardsClient(opts: RewardsClientOptions) {
  const base = (opts.apiBase || '').replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

  async function call<T>(path: string, body?: Json, auth = true): Promise<T> {
    if (!base) throw new RewardsError('config');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = await opts.getToken();
      if (t) headers.Authorization = 'Bearer ' + t;
    }
    // AbortController + timer (not AbortSignal.timeout, which React Native's fetch polyfill may lack).
    // The timer also covers reading the body, so a stalled response cannot hang the screen.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    let data: (Json & { ok?: boolean; error?: string; message?: string }) | null = null;
    try {
      try {
        res = await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch {
        throw new RewardsError('network'); // offline, DNS or timeout
      }
      try {
        data = (await res.json()) as Json & { ok?: boolean; error?: string; message?: string };
      } catch {
        if (ctrl.signal.aborted) throw new RewardsError('network');
        data = null;
      }
    } finally {
      clearTimeout(timer);
    }
    if (!data || data.ok !== true) {
      const raw = data?.error || (res.status === 401 ? 'unauthorized' : 'server');
      const code: ErrorCode = (API_ERROR_CODES as string[]).includes(raw) ? (raw as ErrorCode) : 'server';
      if (code === 'unauthorized' && auth) opts.onUnauthorized?.();
      throw new RewardsError(code, data?.message, res.status);
    }
    return data as unknown as T;
  }

  return {
    /** generic authenticated call, used by redeemApi.ts for the wallet endpoints */
    call,
    getConfig: () => call<PublicConfig>('/public/config', undefined, false),
    requestCode: (mobile: string, lang: Lang) =>
      call<ChallengeResponse>('/auth/request', { mobile, lang }, false),
    verifyCode: (challenge_id: string, code: string) =>
      call<VerifyResponse>('/auth/verify', { challenge_id, code }, false),
    me: () => call<MeResponse>('/me'),
    join: (body: JoinBody) => call<JoinResponse>('/me/join', body as unknown as Json),
    redeemRequest: (points: number) =>
      call<RedeemRequestResponse>('/me/redeem/request', { points, channel: 'app' }),
    redeemConfirm: (challenge_id: string, code: string) =>
      call<RedeemConfirmResponse>('/me/redeem/confirm', { challenge_id, code }),
    familyInvite: (mobile: string) => call<{ ok: true }>('/me/family/invite', { mobile }),
    familyAccept: () => call<{ ok: true; member: Member }>('/me/family/accept', {}),
    familyRemove: (mobile: string) => call<{ ok: true }>('/me/family/remove', { mobile }),
    setConsent: (consent_marketing: boolean) => call<{ ok: true }>('/me/consent', { consent_marketing }),
    leave: () => call<{ ok: true }>('/me/leave', {}),
  };
}

export type RewardsClient = ReturnType<typeof createRewardsClient>;
