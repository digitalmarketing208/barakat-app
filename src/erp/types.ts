// ERP gateway contract (see docs/ERP.md). The app never talks to Business Central / LS Central directly.
import type { ErrorCode } from '../rewards/rewardsApi';

export type { ErrorCode };

export interface BranchQty {
  /** Gateway branch id (maps to a Business Central Location Code / LS Store No.) */
  branchId: string;
  qty: number;
}

export type OrderState = 'received' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderStatus {
  status: OrderState;
  /** ISO 8601 */
  updatedAt: string;
  branch?: string;
}

export interface BranchStockQuery {
  /** Provide exactly one. */
  sku?: string;
  handle?: string;
}
