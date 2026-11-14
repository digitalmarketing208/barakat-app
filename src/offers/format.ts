// Text helpers (pure). Arabic output uses no dots or commas.
type Lang = 'ar' | 'en';
const arUnit = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;

/** 'Ends in 2d 4h' / 'ينتهي خلال يومين و4 ساعات'. ms = endsAt - trustedNow. */
export function countdown(ms: number, lang: Lang): string {
  if (ms <= 0) return lang === 'ar' ? 'انتهى العرض' : 'Offer ended';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (lang === 'en') {
    if (d > 0) return `Ends in ${d}d ${h}h`;
    if (h > 0) return `Ends in ${h}h ${mi}m`;
    return mi > 0 ? `Ends in ${mi}m` : 'Ends in under a minute';
  }
  const D = (n: number) => arUnit(n, 'يوم', 'يومين', 'أيام', 'يوماً');
  const H = (n: number) => arUnit(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const M = (n: number) => arUnit(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  if (d > 0) return `ينتهي خلال ${D(d)}${h ? ` و${H(h)}` : ''}`;
  if (h > 0) return `ينتهي خلال ${H(h)}${mi ? ` و${M(mi)}` : ''}`;
  return mi > 0 ? `ينتهي خلال ${M(mi)}` : 'ينتهي خلال أقل من دقيقة';
}

const KSA = 3 * 3600 * 1000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Date in Saudi time (UTC+3). */
export function shortDate(ms: number, lang: Lang): string {
  const d = new Date(ms + KSA);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate();
  return lang === 'ar' ? `${da}/${mo + 1}/${y}` : `${da} ${MON[mo]} ${y}`;
}

/** Shown when offline: 'Prices as of 14 Nov 2026'. fetchedAt = when the manifest was last fetched (ms). */
export const pricesAsOf = (fetchedAt: number | null, lang: Lang) =>
  !fetchedAt ? (lang === 'ar' ? 'الأسعار قد تكون غير محدثة' : 'Prices may be out of date')
    : lang === 'ar' ? `الأسعار حسب آخر تحديث ${shortDate(fetchedAt, 'ar')}` : `Prices as of ${shortDate(fetchedAt, 'en')}`;

/** Shown when a displayed price differs from Shopify's (offline). */
export const checkoutNote = (lang: Lang) =>
  lang === 'ar' ? 'السعر النهائي يؤكد عند إتمام الطلب' : 'Final price is confirmed at checkout';
