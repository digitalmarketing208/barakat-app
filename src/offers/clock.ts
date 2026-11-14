// Trusted time: the device clock can be wrong or tampered with, so offer expiry never trusts it alone.
// now = max(device + serverOffset, lastSeenServerTime, deviceFloor, monotonicEstimate). It never goes backwards,
// and every candidate errs towards "later", i.e. towards hiding a sale rather than showing a stale one.
export type ClockSnapshot = { offset: number; lastSeen: number; floor: number };

export class TrustedClock {
  offset = 0;
  /** Latest time the SERVER ever reported (never decreases). */
  lastSeen = 0;
  /** Latest time this clock ever returned since the last server sync (ratchet; survives restarts via snapshot). */
  floor = 0;
  private anchor: { server: number; mono: number } | null = null;
  constructor(private dev: () => number = () => Date.now(), private mono: () => number = defaultMono) {}

  /** Call with the server time (ms) from any successful network response. */
  observe(serverMs: number) {
    if (!Number.isFinite(serverMs) || serverMs <= 0) return;
    this.offset = serverMs - this.dev();
    this.lastSeen = Math.max(this.lastSeen, serverMs);
    this.floor = serverMs; // server is the truth: a forward-tampered device floor is discarded
    this.anchor = { server: serverMs, mono: this.mono() };
  }
  /** HTTP `Date` header, e.g. res.headers.get('date'). Returns true when accepted. */
  observeDateHeader(h: string | null | undefined): boolean {
    const ms = h ? Date.parse(h) : NaN;
    if (!Number.isFinite(ms)) return false;
    this.observe(ms);
    return true;
  }
  now(): number {
    let n = Math.max(this.dev() + this.offset, this.lastSeen, this.floor);
    if (this.anchor) n = Math.max(n, this.anchor.server + (this.mono() - this.anchor.mono));
    this.floor = n;
    return n;
  }
  /** True once at least one server time was seen (this install). */
  get synced() { return this.lastSeen > 0; }
  snapshot(): ClockSnapshot { return { offset: this.offset, lastSeen: this.lastSeen, floor: this.floor }; }
  restore(s: Partial<ClockSnapshot> | null | undefined) {
    if (!s) return;
    if (Number.isFinite(s.offset)) this.offset = s.offset as number;
    if (Number.isFinite(s.lastSeen)) this.lastSeen = Math.max(this.lastSeen, s.lastSeen as number);
    if (Number.isFinite(s.floor)) this.floor = Math.max(this.floor, s.floor as number);
  }
}

function defaultMono(): number {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? p.now() : Date.now();
}

export const clock = new TrustedClock();
/** Trusted "now" in ms. Use this everywhere instead of Date.now() for offers. */
export const trustedNow = () => clock.now();
