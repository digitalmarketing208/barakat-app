// Run: npx tsx src/wallet/wallet.test.ts
// tiny assert helpers so the file type-checks without @types/node
import { buildApplePass, buildLoyaltyClass, buildLoyaltyObject, buildRotatingBarcode, buildSaveToWalletClaims, rgbString } from './index';

const fail = (m: string): never => { throw new Error(m); };
const assert = {
  equal: (a: unknown, b: unknown) => { if (a !== b) fail(`expected ${String(b)}, got ${String(a)}`); },
  ok: (v: unknown, m?: string) => { if (!v) fail(m || 'not ok'); },
  deepEqual: (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail('deepEqual failed'); },
  throws: (f: () => unknown) => { try { f(); } catch { return; } fail('did not throw'); },
};

const cls = buildLoyaltyClass({
  issuerId: '3388000000000000001', classSuffix: 'barakat_rewards', issuerName: { ar: 'البركات للبصريات', en: 'Barakat Optical' },
  programName: { ar: 'مكافآت البركات', en: 'Barakat Rewards' }, programLogoUrl: 'https://example.com/logo.png', hexBackgroundColor: '#3B0204',
});
assert.equal(cls.id, '3388000000000000001.barakat_rewards');
assert.equal(cls.localizedProgramName.translatedValues[0].language, 'ar');
assert.throws(() => buildLoyaltyClass({ ...{ issuerId: '1', issuerName: { ar: '', en: '' }, programName: { ar: '', en: '' }, programLogoUrl: '', hexBackgroundColor: '#000000' }, classSuffix: 'bad id!' }));

const rb = buildRotatingBarcode({ values: ['t1', 't2'], startIso: '2026-11-14T10:00:00Z' });
assert.equal(rb.initialRotatingBarcodeValues.periodMillis, '60000');
assert.deepEqual(rb.initialRotatingBarcodeValues.values, ['t1', 't2']);
assert.throws(() => buildRotatingBarcode({ values: [], startIso: 'x' }));

const obj = buildLoyaltyObject({
  issuerId: '3388000000000000001', classSuffix: 'barakat_rewards', objectSuffix: 'm12', memberId: 'm12', memberName: 'Ahmed',
  tierLabel: { ar: 'ذهبي', en: 'Gold' }, points: 2000.4, rotating: { values: ['tok'], startIso: '2026-11-14T10:00:00Z' }, planName: 'Barakat Max', planEndsAt: '2027-12-01',
});
assert.equal(obj.classId, cls.id);
assert.equal(obj.loyaltyPoints.balance.int, 2000);
assert.equal(obj.secondaryLoyaltyPoints.balance.string, 'Gold');
assert.ok('rotatingBarcode' in obj && !('barcode' in obj));
assert.ok(!JSON.stringify(obj).includes('9665'), 'no mobile number in the object');
const stat = buildLoyaltyObject({ issuerId: '1', classSuffix: 'c', objectSuffix: 'o', memberId: 'o', memberName: 'A', tierLabel: { ar: 'عضو', en: 'Member' }, points: -5, staticBarcodeValue: 'M-12' });
assert.equal(stat.loyaltyPoints.balance.int, 0);
assert.ok('barcode' in stat);

const claims = buildSaveToWalletClaims({ issuerEmail: 'svc@example.iam.gserviceaccount.com', classes: [cls], objects: [obj] });
assert.equal(claims.typ, 'savetowallet');
assert.equal(claims.payload.loyaltyObjects?.length, 1);

assert.equal(rgbString('#3B0204'), 'rgb(59, 2, 4)');
const pass = buildApplePass({
  passTypeIdentifier: 'pass.example.barakat', teamIdentifier: 'TEAM123456', organizationName: 'Barakat Optical', serialNumber: 'm12', description: 'Barakat Rewards',
  memberName: 'Ahmed', points: 2000, tierLabel: { ar: 'ذهبي', en: 'Gold' }, lang: 'ar', backgroundColor: '#3B0204', foregroundColor: '#FFFFFF', labelColor: '#E0DDCE', memberCode: 'M-12',
});
assert.equal(pass.formatVersion, 1);
assert.equal(pass.generic.primaryFields[0].value, 2000);
assert.equal(pass.generic.secondaryFields[0].value, 'ذهبي');
assert.equal(pass.barcodes[0].format, 'PKBarcodeFormatQR');
assert.ok(!('webServiceURL' in pass));
(globalThis as { console?: { log: (m: string) => void } }).console?.log('wallet tests ok');
