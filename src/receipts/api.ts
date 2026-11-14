// Receipt claims client (Rewards API v1.2: POST /me/receipts, GET /me/receipts).
// Same auth approach as src/rewards/rewardsApi.ts: customer token from SecureStore (via session.ts), Bearer header,
// AbortController timeout that also covers the body read, `{ ok, error, message }` envelope.
import { REWARDS_API, readToken } from '../rewards/session';

export type ReceiptErrorCode =
  | 'receipt_invalid' | 'receipt_not_barakat' | 'receipt_too_old' | 'receipt_future' | 'receipt_amount' | 'limit_reached' | 'not_configured'
  | 'duplicate' | 'frozen' | 'not_member' | 'unauthorized' | 'bad_request' | 'not_allowed'
  // client-side codes (not sent by the API)
  | 'network' | 'server' | 'config';

const KNOWN: ReceiptErrorCode[] = [
  'receipt_invalid', 'receipt_not_barakat', 'receipt_too_old', 'receipt_future', 'receipt_amount', 'limit_reached', 'not_configured',
  'duplicate', 'frozen', 'not_member', 'unauthorized', 'bad_request', 'not_allowed',
];

export class ReceiptError extends Error {
  readonly code: ReceiptErrorCode;
  readonly status: number;
  constructor(code: ReceiptErrorCode, message?: string, status = 0) {
    super(message || code);
    this.name = 'ReceiptError';
    this.code = code;
    this.status = status;
  }
}

/** True when retrying the same QR later can succeed (no connection, server trouble, signed out). */
export const isRetryable = (e: unknown): boolean =>
  e instanceof ReceiptError && (e.code === 'network' || e.code === 'server' || e.code === 'unauthorized' || e.code === 'not_configured' || e.code === 'frozen');

export interface ReceiptClaim {
  id: number;
  status: 'pending';
  /** 10 characters; the member can show it at the till */
  match_key: string;
  /** receipt date, YYYY-MM-DD (Riyadh) */
  date: string;
  total_sar: number;
  /** total x current rate; the final points are set when the branch or the POS match confirms the purchase */
  expected_points: number;
  expires_at: string;
}
export interface ClaimResponse { claim: ReceiptClaim }

export interface ClaimRow {
  id: number;
  status: 'pending' | 'confirmed' | 'expired' | 'rejected';
  match_key: string;
  date: string;
  total_sar: number;
  points: number | null;
  created: string;
  expires_at: string;
}

export interface ReceiptsClientOptions {
  apiBase?: string;
  /** defaults to the stored customer token */
  getToken?: () => string | null | Promise<string | null>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12000;

async function call<T>(path: string, body: Record<string, unknown> | undefined, o: ReceiptsClientOptions): Promise<T> {
  const base = (o.apiBase ?? REWARDS_API).replace(/\/+$/, '');
  if (!base) throw new ReceiptError('config');
  const token = await (o.getToken ? o.getToken() : readToken());
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs && o.timeoutMs > 0 ? o.timeoutMs : DEFAULT_TIMEOUT_MS);
  let res: Response;
  let data: { ok?: boolean; error?: string; message?: string } | null = null;
  try {
    try {
      res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    } catch {
      throw new ReceiptError('network'); // offline, DNS or timeout
    }
    try { data = await res.json(); } catch { if (ctrl.signal.aborted) throw new ReceiptError('network'); data = null; }
  } finally {
    clearTimeout(timer);
  }
  if (!data || data.ok !== true) {
    const raw = data?.error || (res.status === 401 ? 'unauthorized' : 'server');
    throw new ReceiptError((KNOWN as string[]).includes(raw) ? (raw as ReceiptErrorCode) : 'server', data?.message, res.status);
  }
  return data as unknown as T;
}

/** Sends the raw QR string (base64 TLV). The server decodes and validates it itself; points come after confirmation. */
export function claimReceipt(payload: { qr: string }, o: ReceiptsClientOptions = {}): Promise<ClaimResponse> {
  return call<ClaimResponse>('/me/receipts', { qr: payload.qr }, o);
}

export function listClaims(o: ReceiptsClientOptions = {}): Promise<{ claims: ClaimRow[] }> {
  return call<{ claims: ClaimRow[] }>('/me/receipts', undefined, o);
}
