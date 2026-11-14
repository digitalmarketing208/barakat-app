import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Lang = 'ar' | 'en';

const dict = {
  ar: {
    tabHome: 'الرئيسية', tabShop: 'تسوّق', tabTryOn: 'جرّب', tabBranches: 'الفروع', tabMore: 'المزيد',
    tagline: 'أخصائيين في البصريات',
    searchPh: 'ابحث عن نظارة أو عدسات…',
    freeExam: 'فحص نظر مجاني في جميع الفروع',
    freeDelivery: 'توصيل مجاني للطلبات فوق ١٥٠ ريال',
    categories: 'التصنيفات', bestSellers: 'الأكثر مبيعاً', newArrivals: 'وصل حديثاً', viewAll: 'عرض الكل',
    eyeglasses: 'نظارات طبية', sunglasses: 'نظارات شمسية', contactLenses: 'عدسات لاصقة', kids: 'أطفال', accessories: 'إكسسوارات',
    smartFinder: 'محدد الإطار الذكي', smartFinderSub: 'اعرف شكل وجهك واحصل على أفضل الإطارات لك',
    tryOn: 'جرّب النظارة بالكاميرا', tryOnSub: 'شاهد الإطار على وجهك قبل الشراء',
    uploadRx: 'ارفع وصفتك الطبية', uploadRxSub: 'أرسلها لنا وسنجهّز عدساتك',
    bookExam: 'احجز فحص نظر مجاني', bookShort: 'احجز', bookExamSub: 'في أقرب فرع إليك',
    nearest: 'أقرب فرع', openNow: 'مفتوح الآن', closed: 'مغلق', call: 'اتصال', directions: 'الاتجاهات', whatsapp: 'واتساب',
    allBranches: 'جميع الفروع', locating: 'جارٍ تحديد موقعك…', km: 'كم',
    addToCart: 'أضف إلى السلة', added: 'تمت الإضافة', soldOut: 'نفدت الكمية', inStock: 'متوفر', lowStock: 'كمية محدودة',
    price: 'السعر', from: 'ابتداءً من', sar: 'ر.س', size: 'المقاس', color: 'اللون', options: 'الخيارات',
    cart: 'السلة', cartEmpty: 'سلتك فارغة', startShopping: 'ابدأ التسوق', subtotal: 'المجموع الفرعي', checkout: 'إتمام الشراء',
    freeDeliveryLeft: 'أضف {n} ريال للحصول على توصيل مجاني', freeDeliveryDone: 'مبروك! توصيل مجاني لطلبك',
    wishlist: 'المفضلة', wishlistEmpty: 'لا توجد منتجات مفضلة بعد',
    filters: 'التصفية', sort: 'الترتيب', sortNew: 'الأحدث', sortPriceLow: 'السعر: الأقل', sortPriceHigh: 'السعر: الأعلى', sortBest: 'الأكثر مبيعاً', sortFeatured: 'المميزة', gamerRail: 'جهّز نظرتك للجولة القادمة', eyeRail: 'نظارات طبية بإطلالة تناسبك', sunRail: 'نظارات شمسية حضورك تحت الشمس', kidsRail: 'إطارات مميزة للصغار', accRail: 'إكسسوارات تكمل أناقتك', chooseLens: 'اختر العدسات (طبية / حماية / جيمرز)', yourWay: 'نظارتك، على طريقتك', promisesTitle: 'وُعودنا لك', p1: 'منتجات أصلية 100٪', p1s: 'رحلة ثقة بدأت عام 1980', p2: 'شحن سريع', p2s: 'داخل المملكة العربية السعودية', p3: 'ادفع بأمان', p3s: 'جميع بيانات الدفع مؤمّنة', p4: 'دعم فني', p4s: 'في خدمتكم دائماً', newArrSub: 'اكتشف اختيارات الموسم الجديدة من بركات', gamerSub: 'إطارات قيمرز مختارة تجمع الحضور والراحة في كل جولة', eyeSub: 'إطارات مختارة تجمع الراحة والأناقة لكل يوم', sunSub: 'تصفّح إطارات شمسية مختارة من أشهر العلامات', kidsSub: 'راحة وثبات وتصاميم مرحة لأيام مليئة بالحركة', accSub: 'تفاصيل عملية تضيف لمسة من الأناقة إلى إطاراتك', brandsTitle: 'علاماتنا التجارية والعالمية', reviewsTitle: 'آراء عملائنا تعكس جودة منتجاتنا', ourBranches: 'فروعنا', gamer: 'نظارات اللاعبين', aboutUs: 'من نحن', sizeGuide: 'دليل حجم الإطار', contactPage: 'اتصل بنا', blog: 'المدونة', trackOrder: 'تتبّع طلبك', jobs: 'الوظائف', privacy: 'سياسة الخصوصية', shipping: 'سياسة الشحن', terms: 'الشروط والأحكام', collectionLabel: 'المجموعة', deliveryEta: 'وقت التوصيل المتوقع خلال 48 ساعة', freeShipNote: 'شحن مجاني عند الطلب بـ150 ريال أو أكثر', shipReturns: 'الشحن والإرجاع', shipReturnsBody: 'الإرجاع خلال 7 أيام عمل · ضمان 12 شهراً · توصيل داخل المملكة', askQuestion: 'اسأل سؤالاً عن هذا المنتج', bookFree: 'احجز فحص نظرك مجاناً',
    all: 'الكل', men: 'رجالي', women: 'نسائي', unisex: 'للجنسين',
    shapes: 'الأشكال', round: 'دائري', square: 'مربع', cat: 'عين القطة', aviator: 'أفييتور', rectangle: 'مستطيل', oval: 'بيضاوي',
    noResults: 'لا توجد نتائج', retry: 'إعادة المحاولة', loadError: 'تعذّر تحميل البيانات. تحقق من الاتصال.',
    tokenMissing: 'لم يتم ضبط مفتاح Shopify Storefront. راجع ملف README.',
    compare: 'مقارنة', recentlyViewed: 'شاهدتها مؤخراً', similar: 'قد يعجبك أيضاً',
    share: 'مشاركة', details: 'التفاصيل',
    // finder
    quizTitle: 'محدد الإطار الذكي', quizQ1: 'ما شكل وجهك؟', quizQ2: 'ما أسلوبك؟', quizQ3: 'لمن النظارة؟',
    faceRound: 'دائري', faceSquare: 'مربع', faceOval: 'بيضاوي', faceHeart: 'قلبي', faceLong: 'طويل',
    styleClassic: 'كلاسيكي', styleBold: 'جريء', styleLight: 'خفيف وناعم', styleSport: 'عملي',
    forMe: 'لي', forKid: 'لطفل',
    quizResult: 'الأنسب لك', quizAgain: 'إعادة الاختبار', seeFrames: 'شاهد الإطارات المقترحة',
    tipRound: 'الإطارات المربعة والمستطيلة تضيف حدّة وتوازناً لوجهك.',
    tipSquare: 'الإطارات الدائرية وإطارات الأفييتور تنعّم ملامحك.',
    tipOval: 'وجهك متوازن ويناسبه معظم الأشكال، جرّب الأفييتور.',
    tipHeart: 'إطارات عين القطة والإطارات الدائرية تناسب جبهتك العريضة.',
    tipLong: 'الإطارات العريضة والكبيرة تقلّل طول الوجه.',
    // try on
    tryOnTitle: 'تجربة افتراضية', tryOnHint: 'اسحب الإطار وكبّره ليناسب وجهك',
    tryOnAuto: 'تتبع تلقائي مفعّل · اسحب للتعديل', tryOnNoFace: 'ضع وجهك داخل الإطار المنقط', reset: 'إعادة ضبط',
    camPerm: 'نحتاج إذن الكاميرا لتجربة النظارة', grant: 'السماح', pickFrame: 'اختر إطاراً', snap: 'التقاط', flip: 'قلب الكاميرا',
    tint: 'لون العدسة', tintClear: 'شفاف', tintBlue: 'فلتر أزرق', tintSun: 'شمسي', tintGamer: 'جيمر برتقالي',
    // rx
    rxTitle: 'الوصفة الطبية', rxPick: 'اختر صورة الوصفة', rxCamera: 'التقط صورة', rxSend: 'أرسل عبر واتساب',
    rxNote: 'سيتواصل معك فريقنا لتأكيد العدسات والسعر.', rxMsg: 'مرحباً، أرغب بتجهيز نظارة طبية. مرفق وصفتي الطبية.',
    // booking
    bookTitle: 'حجز فحص النظر', bookBranch: 'الفرع', bookDay: 'اليوم', bookTime: 'الوقت', bookSend: 'تأكيد عبر واتساب',
    today: 'اليوم', tomorrow: 'غداً', morning: 'صباحاً', afternoon: 'بعد الظهر', evening: 'مساءً',
    // more
    language: 'اللغة', reminders: 'تذكير راحة العين', remindersSub: 'تنبيه كل ٢٠ دقيقة: انظر لمسافة ٦ أمتار لمدة ٢٠ ثانية',
    contactUs: 'تواصل معنا', tollFree: 'الرقم المجاني', orderTrack: 'تتبع الطلب', orderTrackSub: 'أدخل رقم الطلب عبر واتساب',
    about: 'عن البركات', version: 'الإصدار',
    lensGuide: 'دليل العدسات', lensGuideSub: 'اعرف الفرق بين أنواع العدسات',
    hearing: 'مراكز السمع', hearingSub: 'مركز البركات للسمع',
    // connectivity / offline / errors
    netOffline: 'لا يوجد اتصال بالإنترنت · نعرض البيانات المحفوظة', netSaved: 'نعرض البيانات المحفوظة · اضغط لإعادة المحاولة', netBack: 'عاد الاتصال', netRetrying: 'جارٍ إعادة المحاولة…',
    cartPending: 'تغييرات السلة ستُرسل عند عودة الاتصال', cartOfflineCheckout: 'اتصل بالإنترنت لإتمام الشراء',
    errTitle: 'حدث خطأ غير متوقع', errBody: 'نعتذر عن الإزعاج. حاول مرة أخرى، وإذا استمرت المشكلة أعد تشغيل التطبيق.', errRetry: 'حاول مرة أخرى', errRestart: 'إعادة تشغيل التطبيق',
  },
  en: {
    tabHome: 'Home', tabShop: 'Shop', tabTryOn: 'Try on', tabBranches: 'Branches', tabMore: 'More',
    tagline: 'Optical specialists',
    searchPh: 'Search glasses or lenses…',
    freeExam: 'Free eye exam at all branches',
    freeDelivery: 'Free delivery over SAR 150',
    categories: 'Categories', bestSellers: 'Best sellers', newArrivals: 'New arrivals', viewAll: 'View all',
    eyeglasses: 'Eyeglasses', sunglasses: 'Sunglasses', contactLenses: 'Contact lenses', kids: 'Kids', accessories: 'Accessories',
    smartFinder: 'Smart Frame Finder', smartFinderSub: 'Find your face shape and your best frames',
    tryOn: 'Virtual try-on', tryOnSub: 'See the frame on your face before you buy',
    uploadRx: 'Upload your prescription', uploadRxSub: 'Send it and we prepare your lenses',
    bookExam: 'Book a free eye exam', bookShort: 'Book', bookExamSub: 'At your nearest branch',
    nearest: 'Nearest branch', openNow: 'Open now', closed: 'Closed', call: 'Call', directions: 'Directions', whatsapp: 'WhatsApp',
    allBranches: 'All branches', locating: 'Finding your location…', km: 'km',
    addToCart: 'Add to cart', added: 'Added', soldOut: 'Sold out', inStock: 'In stock', lowStock: 'Low stock',
    price: 'Price', from: 'From', sar: 'SAR', size: 'Size', color: 'Color', options: 'Options',
    cart: 'Cart', cartEmpty: 'Your cart is empty', startShopping: 'Start shopping', subtotal: 'Subtotal', checkout: 'Checkout',
    freeDeliveryLeft: 'Add SAR {n} more for free delivery', freeDeliveryDone: 'You got free delivery!',
    wishlist: 'Wishlist', wishlistEmpty: 'No favourites yet',
    filters: 'Filters', sort: 'Sort', sortNew: 'Newest', sortPriceLow: 'Price: low', sortPriceHigh: 'Price: high', sortBest: 'Best selling', sortFeatured: 'Featured', gamerRail: 'Get ready for the next round', eyeRail: 'Eyeglasses that suit your look', sunRail: 'Sunglasses for your presence in the sun', kidsRail: 'Standout frames for little ones', accRail: 'Accessories that complete your style', chooseLens: 'Choose lenses (prescription / protection / gamers)', yourWay: 'Your glasses, your way', promisesTitle: 'Our promises', p1: '100% original products', p1s: 'A journey of trust since 1980', p2: 'Fast shipping', p2s: 'Across Saudi Arabia', p3: 'Pay securely', p3s: 'All payment data is protected', p4: 'Technical support', p4s: 'At your service always', newArrSub: 'Discover the new season picks from Barakat', gamerSub: 'Selected gamer frames that combine presence and comfort in every round', eyeSub: 'Selected frames that combine comfort and style for every day', sunSub: 'Browse selected sunglasses from top brands', kidsSub: 'Comfort, stability and playful designs for active days', accSub: 'Practical details that add a touch of style to your frames', brandsTitle: 'Our brands and global brands', reviewsTitle: 'What our customers say about our quality', ourBranches: 'Our branches', gamer: 'Gamer glasses', aboutUs: 'About us', sizeGuide: 'Frame size guide', contactPage: 'Contact us', blog: 'Blog', trackOrder: 'Track your order', jobs: 'Jobs', privacy: 'Privacy policy', shipping: 'Shipping policy', terms: 'Terms & conditions', collectionLabel: 'Collection', deliveryEta: 'Estimated delivery within 48 hours', freeShipNote: 'Free shipping on orders of SAR 150 or more', shipReturns: 'Shipping & returns', shipReturnsBody: 'Returns within 7 working days · 12-month warranty · delivery across Saudi Arabia', askQuestion: 'Ask a question about this product', bookFree: 'Book your free eye test',
    all: 'All', men: 'Men', women: 'Women', unisex: 'Unisex',
    shapes: 'Shapes', round: 'Round', square: 'Square', cat: 'Cat eye', aviator: 'Aviator', rectangle: 'Rectangle', oval: 'Oval',
    noResults: 'No results', retry: 'Retry', loadError: 'Could not load data. Check your connection.',
    tokenMissing: 'Shopify Storefront token is not set. See the README.',
    compare: 'Compare', recentlyViewed: 'Recently viewed', similar: 'You may also like',
    share: 'Share', details: 'Details',
    quizTitle: 'Smart Frame Finder', quizQ1: 'What is your face shape?', quizQ2: 'What is your style?', quizQ3: 'Who is it for?',
    faceRound: 'Round', faceSquare: 'Square', faceOval: 'Oval', faceHeart: 'Heart', faceLong: 'Long',
    styleClassic: 'Classic', styleBold: 'Bold', styleLight: 'Light & soft', styleSport: 'Practical',
    forMe: 'Me', forKid: 'A child',
    quizResult: 'Best for you', quizAgain: 'Retake quiz', seeFrames: 'See matching frames',
    tipRound: 'Square and rectangle frames add definition and balance.',
    tipSquare: 'Round and aviator frames soften strong features.',
    tipOval: 'Your face is balanced and suits most shapes. Try aviators.',
    tipHeart: 'Cat-eye and round frames suit a wider forehead.',
    tipLong: 'Wide, oversized frames shorten the look of a long face.',
    tryOnTitle: 'Virtual try-on', tryOnHint: 'Drag and pinch the frame to fit your face',
    tryOnAuto: 'Auto-fit on · drag to fine-tune', tryOnNoFace: 'Place your face inside the dotted oval', reset: 'Reset',
    camPerm: 'Camera access is needed to try frames on', grant: 'Allow', pickFrame: 'Pick a frame', snap: 'Capture', flip: 'Flip camera',
    tint: 'Lens tint', tintClear: 'Clear', tintBlue: 'Blue light', tintSun: 'Sun', tintGamer: 'Gamer orange',
    rxTitle: 'Prescription', rxPick: 'Choose prescription photo', rxCamera: 'Take a photo', rxSend: 'Send via WhatsApp',
    rxNote: 'Our team will contact you to confirm lenses and price.', rxMsg: 'Hello, I would like to order prescription glasses. My prescription is attached.',
    bookTitle: 'Book an eye exam', bookBranch: 'Branch', bookDay: 'Day', bookTime: 'Time', bookSend: 'Confirm on WhatsApp',
    today: 'Today', tomorrow: 'Tomorrow', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
    language: 'Language', reminders: 'Eye-rest reminder', remindersSub: 'Every 20 min: look 6 metres away for 20 seconds',
    contactUs: 'Contact us', tollFree: 'Toll-free', orderTrack: 'Track an order', orderTrackSub: 'Send your order number on WhatsApp',
    about: 'About Barakat', version: 'Version',
    lensGuide: 'Lens guide', lensGuideSub: 'Know the difference between lens types',
    hearing: 'Hearing centers', hearingSub: 'Al Barakat Hearing Care Center',
    netOffline: 'No internet connection · showing saved data', netSaved: 'Showing saved data · tap to retry', netBack: 'Back online', netRetrying: 'Retrying…',
    cartPending: 'Cart changes will sync when you are back online', cartOfflineCheckout: 'Connect to the internet to check out',
    errTitle: 'Something went wrong', errBody: 'Sorry about that. Please try again, and restart the app if the problem continues.', errRetry: 'Try again', errRestart: 'Restart the app',
  },
} as const;

export type Key = keyof typeof dict.en;

// Language outside React (error fallback screen, background tasks). Kept in sync by I18nProvider.
let currentLang: Lang = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
const applyLang = (l: Lang) => { currentLang = l; };
export const getLang = (): Lang => currentLang;
/** Translate without the React context (same dictionary as `t`). */
export const tr = (k: Key, lang: Lang = currentLang): string => dict[lang][k] ?? dict.en[k] ?? String(k);

// Connectivity helpers for screens: `const offline = useIsOffline()` / `const { savedData } = useNet()`.
export { useIsOffline, useNet } from './net/useNet';

type Ctx = {
  lang: Lang; rtl: boolean; setLang: (l: Lang) => void;
  t: (k: Key, vars?: Record<string, string | number>) => string;
  row: 'row' | 'row-reverse'; align: 'left' | 'right';
};
const I18n = createContext<Ctx>(null as unknown as Ctx);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const deviceAr = getLocales()[0]?.languageCode === 'ar';
  const [lang, setLangState] = useState<Lang>(deviceAr ? 'ar' : 'en');
  useEffect(() => {
    AsyncStorage.getItem('lang').then((v) => { if (v === 'ar' || v === 'en') { applyLang(v); setLangState(v); } }).catch(() => {});
  }, []);
  useEffect(() => { applyLang(lang); }, [lang]);
  const value = useMemo<Ctx>(() => {
    const rtl = lang === 'ar';
    return {
      lang, rtl,
      setLang: (l) => { applyLang(l); setLangState(l); AsyncStorage.setItem('lang', l).catch(() => {}); },
      t: (k, vars) => {
        let s: string = dict[lang][k] ?? dict.en[k] ?? String(k);
        if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
        return s;
      },
      row: rtl ? 'row-reverse' : 'row',
      align: rtl ? 'right' : 'left',
    };
  }, [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
