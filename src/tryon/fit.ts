// Pure maths for placing a glasses image on a tracked face. No React Native imports so it can be unit-tested in Node.
export type Pt = { x: number; y: number };
export type FaceSample = {
  leftEye?: Pt; rightEye?: Pt;
  bounds: { x: number; y: number; width: number; height: number };
  yawDeg?: number;
};
export type Fit = { cx: number; cy: number; width: number; rotDeg: number; scaleX: number; fromLandmarks: boolean };

// An adult frame is about 2.2x the distance between the pupils.
export const FRAME_TO_EYE = 2.2;
// How much of the product photo's width the frame itself occupies (photos have white margins).
export const IMAGE_FILL = 1;

/** Eyes ordered by screen x so mirroring and left/right labelling never flip the roll sign. */
export function orderedEyes(s: FaceSample): { a: Pt; b: Pt; fromLandmarks: boolean } {
  const { leftEye: l, rightEye: r, bounds: bd } = s;
  if (l && r && Number.isFinite(l.x + l.y + r.x + r.y)) {
    return l.x <= r.x ? { a: l, b: r, fromLandmarks: true } : { a: r, b: l, fromLandmarks: true };
  }
  // Fallback when the detector gives no landmarks: eyes sit at ~30% / 70% of face width, ~40% down the face.
  return {
    a: { x: bd.x + bd.width * 0.3, y: bd.y + bd.height * 0.4 },
    b: { x: bd.x + bd.width * 0.7, y: bd.y + bd.height * 0.4 },
    fromLandmarks: false,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Returns where to draw the glasses image (its centre, display width, roll), or null if the face is unusable. */
export function computeFit(s: FaceSample, view: { w: number; h: number }): Fit | null {
  const { a, b, fromLandmarks } = orderedEyes(s);
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < view.w * 0.04) return null; // face too small / garbage
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  if (cx < -view.w * 0.2 || cx > view.w * 1.2 || cy < -view.h * 0.2 || cy > view.h * 1.2) return null;
  const yaw = Math.abs(s.yawDeg ?? 0);
  return {
    cx, cy,
    width: (dist * FRAME_TO_EYE) / IMAGE_FILL,
    rotDeg: fromLandmarks ? (Math.atan2(dy, dx) * 180) / Math.PI : 0,
    scaleX: clamp(Math.cos((Math.min(yaw, 60) * Math.PI) / 180), 0.6, 1),
    fromLandmarks,
  };
}

const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Adaptive smoothing: calm when the head is still (no jitter), responsive when it moves fast. */
export function smoothFit(prev: Fit | null, next: Fit): Fit {
  if (!prev) return next;
  const move = Math.hypot(next.cx - prev.cx, next.cy - prev.cy);
  const dead = prev.width * 0.006;
  const alpha = move < dead ? 0.2 : clamp(0.45 + move / (prev.width * 0.6), 0.45, 0.95);
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  return {
    cx: lerp(prev.cx, next.cx),
    cy: lerp(prev.cy, next.cy),
    width: lerp(prev.width, next.width),
    scaleX: lerp(prev.scaleX, next.scaleX),
    rotDeg: prev.rotDeg + wrapDeg(next.rotDeg - prev.rotDeg) * alpha,
    fromLandmarks: next.fromLandmarks,
  };
}

// ---- UI-thread helpers (Reanimated worklets; plain functions in Node) ----
export const SMOOTH_MS = 55;   // exponential time constant
export const DEAD_PX = 0.2;    // ignore movement smaller than this

/** Time-based exponential step of `cur` toward `target`. `still` (0..1) damps further when the face barely moves. */
export function stepToward(cur: number, target: number, dtMs: number, boost: number, deadZone: number): number {
  'worklet';
  const err = target - cur;
  if (Math.abs(err) < deadZone) return cur;
  const k = Math.min(1, (1 - Math.exp(-Math.max(dtMs, 1) / SMOOTH_MS)) * boost);
  return cur + err * k;
}

/** Shortest-way angle step (degrees). */
export function stepAngle(cur: number, target: number, dtMs: number, boost: number, deadZone: number): number {
  'worklet';
  let d = (target - cur) % 360;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  if (Math.abs(d) < deadZone) return cur;
  const k = Math.min(1, (1 - Math.exp(-Math.max(dtMs, 1) / SMOOTH_MS)) * boost);
  return cur + d * k;
}

/** Speed boost: damp when nearly still, catch up fast when far from target (distance relative to frame width). */
export function speedBoost(distPx: number, widthPx: number): number {
  'worklet';
  const rel = distPx / Math.max(widthPx, 1);
  if (rel < 0.01) return 0.45;
  return Math.min(2.5, 1 + rel * 10);
}

/** User fine-tuning (drag / pinch) layered on top of the automatic fit. */
export function applyAdjust(f: Fit, adj: { dx: number; dy: number; scale: number }): Fit {
  return { ...f, cx: f.cx + adj.dx, cy: f.cy + adj.dy, width: f.width * adj.scale };
}
