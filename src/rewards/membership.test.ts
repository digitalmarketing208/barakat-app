// Run: npx tsx src/rewards/membership.test.ts   (pure helpers only, no React Native)
// tiny assert helpers so the file type-checks without @types/node
import { clampPoints, discountSar, firstName, maxRedeemPoints, minInvoiceSar, refreshSeconds } from './redeemLogic';
import { mix, metalFor, shade } from './cardTheme';
import { perksFor } from './perks';
import { tierLabel } from './tierLabels';

const fail = (m: string): never => { throw new Error(m); };
const assert = {
  equal: (a: unknown, b: unknown) => { if (a !== b) fail(`expected ${String(b)}, got ${String(a)}`); },
  ok: (v: unknown, m?: string) => { if (!v) fail(m || 'not ok'); },
  deepEqual: (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail('deepEqual failed'); },
  throws: (f: () => unknown) => { try { f(); } catch { return; } fail('did not throw'); },
};

const cfg = { min_redeem: 1000, step_redeem: 500, point_value_sar: 0.01, cap_percent: 50 };
assert.equal(maxRedeemPoints(900, cfg), 0);
assert.equal(maxRedeemPoints(2740, cfg), 2500);
assert.equal(clampPoints(1200, 3000, cfg), 1000);
assert.equal(clampPoints(9999, 2740, cfg), 2500);
assert.equal(clampPoints(1750, 3000, cfg), 2000);
assert.equal(discountSar(1500, cfg), 15);
assert.equal(minInvoiceSar(1000, cfg), 20);
assert.equal(refreshSeconds(60), 60);
assert.equal(refreshSeconds(1), 5);
assert.equal(refreshSeconds(1000), 90);
assert.equal(refreshSeconds(undefined), 60);
assert.equal(firstName('  Ahmed Ali '), 'Ahmed');
assert.equal(firstName(''), '');
assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
assert.equal(shade('#000000', 1), '#FFFFFF');
for (const k of ['member', 'silver', 'gold', 'plus', 'max'] as const) assert.equal(metalFor(k).stops.length, 4);
assert.equal(perksFor('member').filter((p) => p.unlocked).length, 2);
assert.equal(perksFor('gold').every((p) => p.unlocked), true);
assert.ok(perksFor('gold').every((p) => p.perk.status === 'proposed'));
assert.equal(tierLabel('silver', 'en'), 'Silver');
assert.equal(tierLabel('x', 'en'), 'x');
(globalThis as { console?: { log: (m: string) => void } }).console?.log('membership tests ok');
