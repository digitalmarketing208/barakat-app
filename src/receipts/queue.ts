// Offline queue for receipt claims: a scan made without a connection (or during a server hiccup) is kept in AsyncStorage
// and retried. The server decides duplicates, so a retry after an unseen success simply answers `duplicate`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptClaim, ReceiptError, claimReceipt, isRetryable } from './api';
import { MAX_AGE_DAYS, receiptAgeDays } from './zatca';

const KEY = 'receipts.pending.v1';
const MAX_QUEUE = 20;

export interface PendingClaim {
  qr: string;
  savedAt: number;
  /** for display only */
  seller: string;
  total: number;
  /** receipt time, ISO UTC; entries older than the API window are dropped */
  utc: string;
}

export async function readQueue(): Promise<PendingClaim[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((x): x is PendingClaim => !!x && typeof x.qr === 'string') : [];
  } catch { return []; }
}
async function writeQueue(q: PendingClaim[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* best effort */ }
}

/** Adds a claim (the same QR is never queued twice). Returns the queue length. */
export async function enqueue(c: Omit<PendingClaim, 'savedAt'>): Promise<number> {
  const q = await readQueue();
  if (!q.some((x) => x.qr === c.qr)) q.push({ ...c, savedAt: Date.now() });
  await writeQueue(q);
  return Math.min(q.length, MAX_QUEUE);
}

export interface FlushResult {
  /** claims the server accepted now */
  sent: ReceiptClaim[];
  /** already on the server (an earlier attempt got through) */
  already: number;
  /** refused for good and removed (too old, not Barakat, limit, ...) */
  dropped: { qr: string; code: string }[];
  /** still waiting */
  left: number;
  /** stopped early: offline or signed out */
  stopped: 'network' | 'unauthorized' | null;
}

let flushing: Promise<FlushResult> | null = null;

/** Retries every queued claim in order. Safe to call often; concurrent calls share one run. */
export function flushQueue(): Promise<FlushResult> {
  if (!flushing) flushing = run().finally(() => { flushing = null; });
  return flushing;
}

async function run(): Promise<FlushResult> {
  const out: FlushResult = { sent: [], already: 0, dropped: [], left: 0, stopped: null };
  const keep: PendingClaim[] = [];
  const q = await readQueue();
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (out.stopped) { keep.push(c); continue; }
    if (receiptAgeDays(c.utc) > MAX_AGE_DAYS) { out.dropped.push({ qr: c.qr, code: 'receipt_too_old' }); continue; }
    try {
      out.sent.push((await claimReceipt({ qr: c.qr })).claim);
    } catch (e) {
      if (e instanceof ReceiptError && e.code === 'duplicate') out.already++;
      else if (isRetryable(e)) {
        keep.push(c);
        if (e instanceof ReceiptError && (e.code === 'network' || e.code === 'unauthorized')) out.stopped = e.code;
      } else out.dropped.push({ qr: c.qr, code: e instanceof ReceiptError ? e.code : 'server' });
    }
  }
  // claims queued while this run was in flight must not be lost
  const seen = new Set(q.map((x) => x.qr));
  for (const x of await readQueue()) if (!seen.has(x.qr)) keep.push(x);
  out.left = keep.length;
  await writeQueue(keep);
  return out;
}
