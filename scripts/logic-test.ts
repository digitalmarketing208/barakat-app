// Run: npx tsx scripts/logic-test.ts   (pure-logic checks that need no device or Shopify token)
import { BRANCHES, distanceKm, hoursFor, isOpen, ksaNow, fmt12 } from '../src/branches';
import { __test } from '../src/shopify';
import { CATEGORIES, FACE_MAP, SHAPES } from '../src/catalog';
import { computeFit, smoothFit, applyAdjust, orderedEyes, FRAME_TO_EYE, IMAGE_FILL, Fit } from '../src/tryon/fit';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok  ', m); };

ok(BRANCHES.length === 35, `35 branches (got ${BRANCHES.length})`);
ok(BRANCHES.every((b) => /^\d\d:\d\d-\d\d:\d\d$/.test(b.hours) && /^\d\d:\d\d-\d\d:\d\d$/.test(b.fri)), 'all hours well-formed');
ok(BRANCHES.every((b) => b.lat > 16 && b.lat < 33 && b.lng > 34 && b.lng < 56), 'all coords inside Saudi Arabia');

// Riyadh -> Olaya branch is close, Riyadh -> Jeddah is ~850 km
const olaya = BRANCHES.find((b) => b.name === 'Olaya Kingdom')!;
const jed = BRANCHES.find((b) => b.name === 'Jeddah-Thahalya')!;
ok(distanceKm(olaya.lat, olaya.lng, jed.lat, jed.lng) > 800 && distanceKm(olaya.lat, olaya.lng, jed.lat, jed.lng) < 1000, 'Riyadh-Jeddah distance sane');

// 2026-10-09 is a Friday. 13:00 KSA = 10:00 UTC -> closed (Friday opens 16:00); 17:00 KSA open.
ok(ksaNow(new Date('2026-10-09T10:00:00Z')).day === 5, 'Friday detected in KSA time');
ok(!isOpen(olaya, new Date('2026-10-09T10:00:00Z')), 'Olaya closed Friday 13:00');
ok(isOpen(olaya, new Date('2026-10-09T14:00:00Z')), 'Olaya open Friday 17:00');
// Saturday 2026-10-10 10:30 KSA
ok(isOpen(olaya, new Date('2026-10-10T07:30:00Z')), 'Olaya open Saturday 10:30');
// UTC late evening on Thursday is already Friday in KSA
ok(ksaNow(new Date('2026-10-08T21:30:00Z')).day === 5, 'UTC Thu 21:30 is KSA Friday 00:30');
ok(hoursFor(olaya, 5) === olaya.fri, 'friday hours picked');
ok(fmt12('16:00', false) === '4:00 PM' && fmt12('00:30', false) === '12:30 AM' && fmt12('09:30', true) === '9:30 ص', '12h formatting AR/EN');

// GraphQL @inContext rewrite
const a = __test.rewrite('query Cols { collections(first:1){nodes{id}} }');
ok(a.startsWith('query Cols($language: LanguageCode) @inContext(language: $language) {'), 'rewrite no-arg query');
const b = __test.rewrite('query Products($query: String, $first: Int!) { products { nodes { id } } }');
ok(b.includes('$first: Int!, $language: LanguageCode) @inContext'), 'rewrite query with args');
const c = __test.rewrite('mutation Add($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd { cart { id } } }');
ok(c.includes('$lines: [CartLineInput!]!, $language: LanguageCode) @inContext'), 'rewrite mutation with list arg');

// Finder maps only reference real shapes
const shapeIds = new Set(SHAPES.map((s) => s.id));
ok(Object.values(FACE_MAP).every((f) => f.shapes.every((s) => shapeIds.has(s))), 'FACE_MAP shapes exist');
ok(CATEGORIES.length === 5, 'categories');

// ---- Try-on fit maths ----
const V = { w: 390, h: 800 };
const face = (l: [number, number], r: [number, number], extra = {}) => ({
  leftEye: { x: l[0], y: l[1] }, rightEye: { x: r[0], y: r[1] },
  bounds: { x: 100, y: 200, width: 190, height: 240 }, ...extra,
});
const lvl = computeFit(face([150, 300], [250, 300]), V)!;
ok(lvl.cx === 200 && lvl.cy === 300 && lvl.rotDeg === 0, 'level eyes: centred between eyes, no roll');
ok(Math.abs(lvl.width - (100 * FRAME_TO_EYE) / IMAGE_FILL) < 1e-9, 'frame width = eye distance x ratio / image fill');
const tilt = computeFit(face([150, 300], [250, 317.6327]), V)!; // atan(17.6327/100) = 10 deg
ok(Math.abs(tilt.rotDeg - 10) < 0.01, `tilted face rolls +10 deg (got ${tilt.rotDeg.toFixed(2)})`);
const swapped = computeFit(face([250, 317.6327], [150, 300]), V)!; // detector labels reversed (mirror)
ok(Math.abs(swapped.rotDeg - tilt.rotDeg) < 1e-9 && swapped.cx === tilt.cx, 'left/right label swap gives identical result');
ok(computeFit(face([150, 300], [250, 300]), V)!.width < computeFit(face([120, 300], [280, 300]), V)!.width, 'closer face = bigger frame');
ok(computeFit(face([150, 300], [250, 300], { yawDeg: 40 }), V)!.scaleX < 0.8 && computeFit(face([150, 300], [250, 300], { yawDeg: 0 }), V)!.scaleX === 1, 'head turn narrows the frame');
ok(computeFit(face([150, 300], [250, 300], { yawDeg: 85 }), V)!.scaleX === 0.6, 'extreme yaw clamped');
const nolm = computeFit({ bounds: { x: 100, y: 200, width: 200, height: 240 } }, V)!;
ok(!nolm.fromLandmarks && nolm.rotDeg === 0 && nolm.cx === 200, 'no landmarks: bounds fallback, no roll');
ok(computeFit(face([200, 300], [205, 300]), V) === null, 'tiny/degenerate face rejected');
ok(computeFit(face([NaN, 1], [2, 3]), V) !== undefined, 'NaN landmarks do not throw');
ok(computeFit(face([-900, 300], [-800, 300]), V) === null, 'far off-screen face rejected');
// smoothing
let f: Fit | null = null; const target = lvl;
for (let i = 0; i < 40; i++) f = smoothFit(f, { ...target, cx: 300 });
ok(Math.abs(f!.cx - 300) < 0.5, 'smoothing converges to the target');
const still = smoothFit({ ...target }, { ...target, cx: target.cx + 0.2 });
ok(Math.abs(still.cx - target.cx) < 0.05, 'tiny movement is damped (no jitter)');
const wrap = smoothFit({ ...target, rotDeg: 175 }, { ...target, rotDeg: -175 });
ok(wrap.rotDeg > 175 || wrap.rotDeg < -170, 'angle smoothing takes the short way round 180');
const adj = applyAdjust(lvl, { dx: 10, dy: -5, scale: 1.1 });
ok(adj.cx === lvl.cx + 10 && adj.cy === lvl.cy - 5 && Math.abs(adj.width - lvl.width * 1.1) < 1e-9, 'manual fine-tune layers on auto fit');
ok(orderedEyes(face([250, 1], [150, 1])).a.x === 150, 'eyes ordered by screen x');

process.exit(fail ? 1 : 0);
