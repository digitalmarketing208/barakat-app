// ERP gateway client. Talks ONLY to the backend proxy at EXPO_PUBLIC_ERP_API; no ERP credentials live in the app.
// Every call returns null when the env var is unset (feature silently off), times out after 8s,
// accepts JSON only, and throws ErpError carrying a typed ErrorCode on failure.
import type { ErrorCode } from '../rewards/rewardsApi';
import type { BranchQty, BranchStockQuery, OrderStatus } from './types';

const BASE = (process.env.EXPO_PUBLIC_ERP_API ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;

export const erpEnabled = BASE.length > 0;

export class ErpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message?: string, status = 0) {
    super(message || code);
    this.name = 'ErpError';
    this.code = code;
    this.status = status;
  }
}

const codeFor = (status: number): ErrorCode =>
  status === 400 ? 'bad_request' : status === 401 || status === 403 ? 'unauthorized' : status === 404 ? 'not_found' : 'server';

async function call<T>(path: string, init?: { body?: unknown }): Promise<T | null> {
  if (!erpEnabled) return null;
  // AbortController + timer rather than AbortSignal.timeout(), which React Native's runtime may not provide.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(BASE + path, {
        method: init?.body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        signal: ctrl.signal,
      });
    } catch {
      throw new ErpError('network'); // offline, DNS, or 8s timeout
    }
    if (!res.ok) throw new ErpError(codeFor(res.status), undefined, res.status);
    if (!(res.headers.get('content-type') || '').includes('application/json')) throw new ErpError('server', 'non-JSON response', res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ErpError(ctrl.signal.aborted ? 'network' : 'server', 'invalid JSON', res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

export const erp = {
  /** Per-branch stock for a SKU or product handle. GET /v1/stock?sku=|handle= */
  branchStock(q: string | BranchStockQuery): Promise<BranchQty[] | null> {
    const o: BranchStockQuery = typeof q === 'string' ? { handle: q } : q;
    const key = o.sku ? `sku=${encodeURIComponent(o.sku)}` : o.handle ? `handle=${encodeURIComponent(o.handle)}` : '';
    if (!key) return Promise.reject(new ErpError('bad_request', 'sku or handle required'));
    return call<BranchQty[]>(`/v1/stock?${key}`);
  },

  /** Order status. POST (not GET) so the mobile number never lands in URLs or server logs. POST /v1/order-status */
  orderStatus(orderNo: string, mobile: string): Promise<OrderStatus | null> {
    return call<OrderStatus>('/v1/order-status', { body: { orderNo, mobile } });
  },

  /**
   * Membership is NOT served by the ERP gateway: use the existing Rewards API (src/rewards/rewardsApi.ts).
   * The Rewards backend maps to LS Central Member Management (docs/ls-central-mapping.md in barakat-rewards).
   */
  member(_mobile: string): null {
    return null;
  },
};
