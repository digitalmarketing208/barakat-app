import { useCallback } from 'react';
import { useI18n } from '../i18n';

// Strings owned by the product / cart / wishlist experience (src/i18n.tsx holds the shared ones).
const S = {
  ar: {
    back: 'رجوع', close: 'إغلاق', zoomHint: 'قرّب بإصبعين أو انقر مرتين للتكبير', photo: 'صورة',
    total: 'الإجمالي', frame: 'الإطار', lens: 'العدسات', frameOnly: 'السعر', viewCart: 'عرض السلة',
    addedView: 'تمت الإضافة · عرض السلة', addFailed: 'تعذّرت الإضافة، حاول مرة أخرى',
    fitTitle: 'مقاس الإطار', fitLens: 'عرض العدسة', fitBridge: 'الجسر', fitTemple: 'طول الذراع', fitWidth: 'عرض الإطار', fitHeight: 'ارتفاع العدسة',
    mm: 'ملم', fitNarrow: 'يناسب الوجه الصغير', fitMedium: 'يناسب الوجه المتوسط', fitWide: 'يناسب الوجه العريض',
    fitNote: 'تقدير استرشادي حسب عرض العدسة', openGuide: 'دليل المقاسات',
    sgTitle: 'دليل حجم الإطار', sgIntro: 'كل إطار يحمل ثلاثة أرقام مثل 52 □ 18 – 140 تجدها داخل ذراع نظارتك الحالية.',
    sg1: 'عرض العدسة', sg1b: 'الرقم الأول: عرض العدسة الواحدة بالمليمتر (عادة 40 إلى 62).',
    sg2: 'الجسر', sg2b: 'الرقم الثاني: المسافة بين العدستين فوق الأنف (عادة 14 إلى 24).',
    sg3: 'طول الذراع', sg3b: 'الرقم الثالث: طول الذراع من المفصل حتى نهايته خلف الأذن (عادة 120 إلى 150).',
    sgTipT: 'نصيحة سريعة', sgTip: 'قارن الأرقام بنظارة مريحة لديك. فرق 2 ملم في عرض العدسة لا يؤثر غالباً على الراحة.',
    sgSmall: 'صغير', sgMed: 'متوسط', sgLarge: 'عريض', sgLensCol: 'عرض العدسة', sgFaceCol: 'حجم الوجه',
    sgUnder: 'أقل من 50 ملم', sgMid: '50 إلى 54 ملم', sgOver: '55 ملم فأكثر',
    sgFull: 'الدليل الكامل على الموقع', sgHelp: 'اسأل أخصائي عبر واتساب',
    etaBy: 'يصلك بحلول {d}', pickupTitle: 'الاستلام من الفرع', pickupIn: 'متوفر في {n} فرع', pickupNone: 'غير متوفر في الفروع حالياً', pickupSee: 'عرض الفروع', pickupLeft: 'متوفر {n}',
    askMsg: 'مرحباً، لدي سؤال عن هذا المنتج:', sizeMsg: 'مرحباً، أحتاج مساعدة في اختيار المقاس المناسب:',
    googleReview: 'تقييم Google', verified: 'تقييمات حقيقية من عملائنا على Google',
    items: '{n} منتج', pair: 'نظارة كاملة', pairTotal: 'إجمالي النظارة', withLens: 'مع العدسات', rx: 'وصفة طبية', rxYes: 'نعم', rxNo: 'لا', sendRx: 'أرسل الوصفة',
    forFrame: 'للإطار', saveLater: 'احفظ لوقت لاحق', remove: 'حذف', removed: 'تم حذف {t}', saved: 'تم الحفظ في المفضلة', undo: 'تراجع',
    upsellTitle: 'أكمل طلبك', add: 'أضف', savedTitle: 'محفوظ لوقت لاحق', moveToCart: 'انقل إلى السلة', choose: 'اختر الخيارات', moved: 'تمت الإضافة إلى السلة',
    noteTitle: 'ملاحظة على الطلب', notePh: 'مثال: يرجى الاتصال قبل التوصيل', noteSaved: 'تُرسل مع الطلب', noteFail: 'تعذّر حفظ الملاحظة على الطلب', goOn: 'متابعة بدونها', swipeHint: 'اسحب المنتج جانباً لحذفه',
    promoTitle: 'كود الخصم', promoPh: 'أدخل الكود', apply: 'تطبيق', promoApplied: 'سيُطبّق الكود {c} عند إتمام الشراء', promoRemove: 'إزالة الكود', promoChecking: 'جارٍ التحقق من الكود', promoValid: 'تم تطبيق الكود {c}', promoInvalid: 'الكود غير صالح أو لا ينطبق على سلتك', promoOffline: 'لا يوجد اتصال، سيتم التحقق من الكود {c} عند إتمام الشراء', afterDiscount: 'الإجمالي بعد الخصم', ratingLabel: 'تقييم العملاء',
    shipFree: 'توصيل مجاني', shipCalc: 'يُحسب الشحن عند إتمام الشراء', secure: 'دفع آمن عبر Shopify', away: 'باقي {n} ر.س', each: 'للقطعة',
    shareList: 'مشاركة القائمة', shareHead: 'قائمة مفضلتي من بركات للبصريات', removeWish: 'إزالة من المفضلة', wishCount: '{n} منتج', browse: 'تصفّح المنتجات',
    wishHint: 'اضغط على القلب في أي منتج ليظهر هنا', addAll: 'أضف الكل إلى السلة',
  },
  en: {
    back: 'Back', close: 'Close', zoomHint: 'Pinch or double-tap to zoom', photo: 'Photo',
    total: 'Total', frame: 'Frame', lens: 'Lenses', frameOnly: 'Price', viewCart: 'View cart',
    addedView: 'Added · View cart', addFailed: 'Could not add to cart, please try again',
    fitTitle: 'Frame fit', fitLens: 'Lens width', fitBridge: 'Bridge', fitTemple: 'Temple length', fitWidth: 'Frame width', fitHeight: 'Lens height',
    mm: 'mm', fitNarrow: 'Suits narrow faces', fitMedium: 'Suits medium faces', fitWide: 'Suits wide faces',
    fitNote: 'A guide based on lens width', openGuide: 'Size guide',
    sgTitle: 'Frame size guide', sgIntro: 'Every frame carries three numbers such as 52 □ 18 – 140, printed inside the temple arm of your current glasses.',
    sg1: 'Lens width', sg1b: 'First number: the width of one lens in millimetres (usually 40 to 62).',
    sg2: 'Bridge', sg2b: 'Second number: the gap between the lenses over your nose (usually 14 to 24).',
    sg3: 'Temple length', sg3b: 'Third number: the arm length from the hinge to its tip behind your ear (usually 120 to 150).',
    sgTipT: 'Quick tip', sgTip: 'Compare the numbers with a pair that already feels comfortable. A 2 mm difference in lens width rarely changes the fit.',
    sgSmall: 'Narrow', sgMed: 'Medium', sgLarge: 'Wide', sgLensCol: 'Lens width', sgFaceCol: 'Face size',
    sgUnder: 'Under 50 mm', sgMid: '50 to 54 mm', sgOver: '55 mm and above',
    sgFull: 'Full guide on the website', sgHelp: 'Ask a specialist on WhatsApp',
    etaBy: 'Arrives by {d}', pickupTitle: 'Store pickup', pickupIn: 'Available in {n} branches', pickupNone: 'Not in branches right now', pickupSee: 'See branches', pickupLeft: '{n} available',
    askMsg: 'Hello, I have a question about this product:', sizeMsg: 'Hello, I need help choosing the right size:',
    googleReview: 'Google review', verified: 'Real reviews from our customers on Google',
    items: '{n} items', pair: 'Complete pair', pairTotal: 'Pair total', withLens: 'With lenses', rx: 'Prescription', rxYes: 'Yes', rxNo: 'No', sendRx: 'Send prescription',
    forFrame: 'For frame', saveLater: 'Save for later', remove: 'Remove', removed: 'Removed {t}', saved: 'Saved to wishlist', undo: 'Undo',
    upsellTitle: 'Complete your order', add: 'Add', savedTitle: 'Saved for later', moveToCart: 'Move to cart', choose: 'Choose options', moved: 'Added to cart',
    noteTitle: 'Order note', notePh: 'e.g. please call before delivery', noteSaved: 'Sent with your order', noteFail: 'Could not save the note on your order', goOn: 'Continue without it', swipeHint: 'Swipe an item sideways to remove it',
    promoTitle: 'Promo code', promoPh: 'Enter code', apply: 'Apply', promoApplied: 'Code {c} will be applied at checkout', promoRemove: 'Remove code', promoChecking: 'Checking code', promoValid: 'Code {c} applied', promoInvalid: 'This code is invalid or does not apply to your cart', promoOffline: 'You are offline: code {c} will be checked at checkout', afterDiscount: 'Total after discount', ratingLabel: 'Customer rating',
    shipFree: 'Free delivery', shipCalc: 'Shipping calculated at checkout', secure: 'Secure checkout by Shopify', away: 'SAR {n} to go', each: 'each',
    shareList: 'Share list', shareHead: 'My Barakat Optical wishlist', removeWish: 'Remove from wishlist', wishCount: '{n} items', browse: 'Browse products',
    wishHint: 'Tap the heart on any product to see it here', addAll: 'Add all to cart',
  },
} as const;

export type SKey = keyof typeof S.en;

export function useS() {
  const { lang } = useI18n();
  return useCallback((k: SKey, vars?: Record<string, string | number>) => {
    let s: string = S[lang][k] ?? S.en[k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  }, [lang]);
}
