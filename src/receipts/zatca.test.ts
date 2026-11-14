// Run: npx tsx src/receipts/zatca.test.ts   (plain Node, no React Native, no test framework)
import { decodeZatca, parseZatcaStamp, pointsFor, receiptAgeDays, utf8Decode, base64ToBytes } from './zatca';

// tiny assert helpers so the file type-checks without @types/node
function check(cond: unknown, msg = 'assertion failed'): asserts cond { if (!cond) throw new Error(msg); }
const eq = (a: unknown, b: unknown, msg?: string) => check(JSON.stringify(a) === JSON.stringify(b), `${msg ?? 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

const enc = new TextEncoder();
const bytesOf = (v: string | Uint8Array) => (typeof v === 'string' ? enc.encode(v) : v);
const cat = (parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 3) { const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0); s += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '='); } return s; };
const tlv = (tag: number, v: string | Uint8Array) => { const b = bytesOf(v); return cat([Uint8Array.from([tag, b.length]), b]); };
const qr = (parts: Uint8Array[]) => toB64(cat(parts));
const VAT = '300123456700003';
const basic = (o: Partial<Record<'seller' | 'vat' | 'ts' | 'total' | 'vatAmt', string>> = {}) => {
  const f = { seller: 'مؤسسة البركات للبصريات', vat: VAT, ts: '2026-12-01T08:30:00Z', total: '1150.00', vatAmt: '150.00', ...o };
  return [tlv(1, f.seller), tlv(2, f.vat), tlv(3, f.ts), tlv(4, f.total), tlv(5, f.vatAmt)];
};

// 1. Phase 1 sample with an Arabic seller name (multi-byte UTF-8)
let r = decodeZatca(qr(basic()));
check(r.ok);
if (r.ok) {
  eq(r.receipt.seller, 'مؤسسة البركات للبصريات');
  eq(r.receipt.vat, VAT);
  eq(r.receipt.total, 1150);
  eq(r.receipt.vatAmount, 150);
  eq(r.receipt.utc, '2026-12-01T08:30:00.000Z');
  eq(r.receipt.phase2, false);
  eq(r.receipt.tags, [1, 2, 3, 4, 5]);
}

// 2. Phase 2 sample: tags 6-9 are binary and must not break decoding
const bin = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 200) & 255);
r = decodeZatca(qr([...basic({ seller: 'Barakat Optical' }), tlv(6, bin(44)), tlv(7, bin(71)), tlv(8, bin(88)), tlv(9, bin(70))]));
check(r.ok);
if (r.ok) { eq(r.receipt.phase2, true); eq(r.receipt.tags, [1, 2, 3, 4, 5, 6, 7, 8, 9]); eq(r.receipt.seller, 'Barakat Optical'); }

// 3. Timestamps: no zone = Saudi time, offsets converted, impossible dates refused
eq(parseZatcaStamp('2026-12-01T11:30:00')?.utc, '2026-12-01T08:30:00.000Z');
eq(parseZatcaStamp('2026-12-01T11:30:00+03:00')?.utc, '2026-12-01T08:30:00.000Z');
eq(parseZatcaStamp('2026-12-01T11:30:00Z')?.wall, '2026-12-01T11:30:00');
eq(parseZatcaStamp('2026-02-31T10:00:00Z'), null);
eq(parseZatcaStamp('01/12/2026'), null);

// 4. Amounts: Arabic digits accepted, junk refused, VAT above total refused
r = decodeZatca(qr(basic({ total: '٢٣٠٫٠٠', vatAmt: '٣٠٫٠٠' })));
check(r.ok && r.receipt.total === 230);
for (const bad of [{ total: 'abc' }, { total: '12.345' }, { total: '-5' }, { vatAmt: '2000.00' }]) {
  const x = decodeZatca(qr(basic(bad)));
  check(!x.ok && x.reason === 'bad_amount', JSON.stringify(bad));
}

// 5. Validation failures
const fail = (s: string, reason: string) => { const x = decodeZatca(s); check(!x.ok && x.reason === reason, `${reason}: got ${JSON.stringify(x)}`); };
fail('', 'not_base64');
fail('not base64 !!', 'not_base64');
fail('https://barakatoptical.com.sa', 'not_base64');
fail(toB64(Uint8Array.from([1, 50, 65])), 'damaged');           // length runs past the end
fail(qr([tlv(1, 'x'), tlv(2, VAT)]), 'missing_fields');
fail(qr(basic({ vat: '12345' })), 'bad_vat');
fail(qr(basic({ ts: 'yesterday' })), 'bad_date');
fail(qr([...basic(), tlv(1, 'again')]), 'damaged');                      // duplicate tag
fail(qr([tlv(1, Uint8Array.from([0xff, 0xfe])), ...basic().slice(1)]), 'damaged'); // invalid UTF-8

// 6. UTF-8 and base64 helpers
eq(utf8Decode(enc.encode('نظارات 👓 ok')), 'نظارات 👓 ok');
eq(utf8Decode(Uint8Array.from([0xe2, 0x82])), null);           // truncated
eq(utf8Decode(Uint8Array.from([0xc0, 0x80])), null);           // overlong
eq([...(base64ToBytes('AQID') as Uint8Array)], [1, 2, 3]);
eq([...(base64ToBytes('AQI') as Uint8Array)], [1, 2]);     // missing padding
eq(base64ToBytes('A'), null);

// 7. Points preview (floor of total x rate) and age
eq(pointsFor(230, 3), 690);
eq(pointsFor(99.99, 5), 499);
eq(pointsFor(1150, 7), 8050);
eq(Math.round(receiptAgeDays('2026-12-01T00:00:00.000Z', Date.parse('2026-12-04T12:00:00Z')) * 10) / 10, 3.5);

console.log('zatca decoder: all checks passed');
