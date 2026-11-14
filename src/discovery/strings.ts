import { useCallback } from 'react';
import { useI18n } from '../i18n';

const S = {
  searchRecent: ['عمليات البحث الأخيرة', 'Recent searches'],
  clear: ['مسح', 'Clear'],
  cancel: ['إلغاء', 'Cancel'],
  popularBrands: ['علامات رائجة', 'Popular brands'],
  browse: ['تصفّح حسب الفئة', 'Browse by category'],
  suggestions: ['اقتراحات', 'Suggestions'],
  products: ['منتجات', 'Products'],
  collections: ['مجموعات', 'Collections'],
  seeAll: ['عرض كل النتائج لـ «{q}»', 'See all results for “{q}”'],
  noSuggest: ['لا توجد اقتراحات، اضغط بحث لعرض كل النتائج', 'No suggestions. Press search to see all results'],
  filtersTitle: ['التصفية', 'Filters'],
  sortTitle: ['الترتيب حسب', 'Sort by'],
  gender: ['الفئة', 'Gender'],
  shape: ['شكل الإطار', 'Frame shape'],
  priceRange: ['السعر', 'Price range'],
  brand: ['العلامة', 'Brand'],
  availability: ['التوفر', 'Availability'],
  inStockOnly: ['المتوفر فقط', 'In stock only'],
  showResults: ['عرض النتائج', 'Show results'],
  resetAll: ['مسح الكل', 'Clear all'],
  under: ['أقل من {n}', 'Under {n}'],
  over: ['أكثر من {n}', 'Over {n}'],
  grid: ['عرض شبكي', 'Grid view'],
  list: ['عرض قائمة', 'List view'],
  endOfList: ['وصلت لنهاية القائمة', 'You have seen everything'],
  tryOther: ['جرّب كلمة أخرى أو خفّف التصفية', 'Try another word or remove a filter'],
  continueTitle: ['أكمل من حيث توقفت', 'Continue where you left off'],
  continueCta: ['أكمل', 'Continue'],
  lastViewed: ['آخر ما شاهدته', 'Last viewed'],
  backTo: ['العودة إلى {x}', 'Back to {x}'],
  searchFor: ['بحث: {x}', 'Search: {x}'],
  recentSub: ['منتجات شاهدتها مؤخراً', 'Frames you looked at lately'],
  shopNow: ['تسوّق الآن', 'Shop now'],
  bookNow: ['احجز الآن', 'Book now'],
  heroNewEyebrow: ['موسم جديد', 'New season'],
  heroNewTitle: ['وصل حديثاً', 'Just arrived'],
  heroNewSub: ['تشكيلة الموسم الجديدة', 'The new season collection'],
  eyeEyebrow: ['مجاناً في جميع الفروع', 'Free at every branch'],
  eyeTitle: ['افحص نظرك الآن مجاناً', 'Get your free eye test'],
  eyeSub: ['فحص نظر مع أخصائي في أقرب فرع إليك', 'An eye exam with a specialist at your nearest branch'],
  eyeNearest: ['الأقرب: {x}', 'Nearest: {x}'],
  gamerEyebrow: ['قيمر فيجن', 'Gamer Vision'],
  gamerTitle: ['نظارات القيمرز بعدسات برتقالية', 'Gaming glasses with orange lenses'],
  gamerSub: ['فلتر الضوء الأزرق وراحة أطول أمام الشاشة', 'Blue-light filter and longer comfort at the screen'],
  gamerCta: ['تسوّق القيمرز', 'Shop gamer'],
  search: ['بحث', 'Search'],
  remove: ['إزالة', 'Remove'],
  close: ['إغلاق', 'Close'],
} as const;

export type DKey = keyof typeof S;

export function useD() {
  const { lang } = useI18n();
  return useCallback((k: DKey, vars?: Record<string, string | number>) => {
    let s: string = S[k][lang === 'ar' ? 0 : 1];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  }, [lang]);
}
