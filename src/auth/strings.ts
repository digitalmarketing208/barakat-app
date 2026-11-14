// Arabic / English copy for sign-in and account screens. Kept here so src/i18n.tsx stays untouched.
// Both languages carry exactly the same keys.
import { useCallback } from 'react';
import { useI18n } from '../i18n';

const ar = {
  account: 'حسابي', signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', back: 'رجوع', save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل', remove: 'حذف', add: 'إضافة', retry: 'إعادة المحاولة',
  entrySignedOut: 'سجّل دخولك', entrySignedOutSub: 'طلباتك وعناوينك ووصفاتك في مكان واحد', entrySignedInSub: 'الملف الشخصي والطلبات والعناوين',
  welcome: 'أهلاً بك في بركات', welcomeSub: 'سجّل دخولك مرة واحدة لتتابع طلباتك وتُكمل الشراء أسرع',
  benefit1: 'تتبّع طلباتك وأعد طلبها بضغطة', benefit2: 'عناوينك محفوظة لإتمام شراء أسرع', benefit3: 'وصفاتك الطبية محفوظة بأمان على جوالك',
  withEmail: 'المتابعة بالبريد الإلكتروني', withShop: 'المتابعة عبر Shop', withGoogle: 'المتابعة عبر Google',
  emailNote: 'نرسل رمزاً لمرة واحدة إلى بريدك. بدون كلمة مرور.',
  guest: 'المتابعة كزائر', guestNote: 'يمكنك التصفح والشراء بدون حساب',
  secureNote: 'تسجيل الدخول يتم عبر صفحة Shopify الآمنة. لا نحفظ كلمة مرورك.',
  privacyLink: 'سياسة الخصوصية',
  errCancelled: 'تم إلغاء تسجيل الدخول', errNetwork: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.', errConfig: 'تسجيل الدخول غير مفعّل بعد. يمكنك المتابعة كزائر.',
  errUnavailable: 'حدّث التطبيق لآخر إصدار لتتمكن من تسجيل الدخول.', errServer: 'حدث خطأ غير متوقع. حاول مرة أخرى.', errExpired: 'انتهت الجلسة. سجّل دخولك من جديد.',
  errSave: 'تعذّر الحفظ. حاول مرة أخرى.',
  offline: 'بدون اتصال · بيانات محفوظة', updated: 'تم التحديث', saved: 'تم الحفظ',
  locked: 'الحساب مقفل', lockedSub: 'افتح القفل لعرض بياناتك', unlock: 'فتح القفل', unlockPrompt: 'افتح حسابك في بركات',
  profile: 'الملف الشخصي', firstName: 'الاسم الأول', lastName: 'اسم العائلة', email: 'البريد الإلكتروني', phone: 'رقم الجوال', notSet: 'غير مضاف',
  contactNote: 'لتغيير البريد أو الجوال تواصل معنا عبر واتساب.',
  addresses: 'العناوين المحفوظة', noAddresses: 'لا توجد عناوين محفوظة بعد', addAddress: 'إضافة عنوان', editAddress: 'تعديل العنوان', defaultAddress: 'العنوان الافتراضي',
  makeDefault: 'تعيين كافتراضي', setAsDefault: 'اجعله العنوان الافتراضي', address1: 'الشارع والحي', address2: 'رقم المبنى / الشقة (اختياري)', city: 'المدينة', zip: 'الرمز البريدي (اختياري)',
  country: 'المملكة العربية السعودية', deleteAddressQ: 'حذف هذا العنوان؟', defaultDeleteNote: 'عيّن عنواناً افتراضياً آخر قبل حذف هذا العنوان.',
  needAddress: 'أدخل الاسم والشارع والمدينة', phoneInvalid: 'رقم الجوال غير صحيح. مثال: 05XXXXXXXX',
  orders: 'طلباتي', noOrders: 'لا توجد طلبات بعد', items: '{n} منتج', total: 'الإجمالي', track: 'تفاصيل وتتبّع', reorder: 'إعادة الطلب', showAll: 'عرض الكل ({n})', showLess: 'عرض أقل',
  reorderDone: 'أُضيفت المنتجات إلى السلة', reorderPartial: 'أُضيف {a} من {b}. الباقي غير متوفر حالياً.', reorderNone: 'هذه المنتجات غير متوفرة حالياً', staleNote: 'تعذّر تحديث هذا القسم. نعرض آخر بيانات محفوظة.',
  stPaid: 'مدفوع', stPending: 'بانتظار الدفع', stRefunded: 'مُسترجع', stPartRefunded: 'مُسترجع جزئياً', stVoided: 'ملغي', stAuthorized: 'مُعتمد', stPartPaid: 'مدفوع جزئياً', stExpired: 'منتهي',
  ffFulfilled: 'تم الشحن', ffUnfulfilled: 'قيد التجهيز', ffPartial: 'شُحن جزئياً', ffInProgress: 'جارٍ التجهيز', ffOnHold: 'معلّق', ffScheduled: 'مجدول', stCancelled: 'ملغي',
  rx: 'وصفاتي الطبية', rxEmpty: 'احفظ قياساتك لتجدها عند كل طلب', rxAdd: 'إضافة وصفة', rxEdit: 'تعديل الوصفة', rxLabel: 'اسم الوصفة (مثال: نظارة القراءة)', rxDate: 'تاريخ الفحص',
  rxRight: 'العين اليمنى (OD)', rxLeft: 'العين اليسرى (OS)', rxPd: 'المسافة بين الحدقتين (PD)', rxNotes: 'ملاحظات', rxPrivate: 'تُحفظ مشفّرة على هذا الجوال فقط ولا تُرسل لأي جهة.',
  rxSend: 'إرسال للفرع عبر واتساب', rxUpload: 'رفع صورة وصفة', rxDeleteQ: 'حذف هذه الوصفة؟', rxNeedLabel: 'أدخل اسماً للوصفة', rxShareIntro: 'مرحباً، هذه قياسات وصفتي الطبية:', rxSaveFail: 'تعذّر الحفظ على هذا الجوال',
  prefs: 'تفضيلات التواصل', prefEmail: 'عروض بركات عبر البريد', prefEmailSub: 'خصومات ووصول جديد. يمكنك الإيقاف في أي وقت.', prefNoEmail: 'أضف بريداً إلكترونياً لحسابك لتفعيل هذا الخيار',
  prefSms: 'رسائل الجوال التسويقية', prefSmsOn: 'مشترك', prefSmsOff: 'غير مشترك', prefSmsNote: 'تُدار عند إتمام الشراء أو عبر خدمة العملاء.',
  rewards: 'مكافآت بركات', rewardsLink: 'ربط العضوية برقم الجوال', rewardsLinkSub: 'تحقّق من جوالك مرة واحدة لعرض نقاطك هنا', rewardsOpen: 'فتح المكافآت', rewardsPoints: '{n} نقطة', rewardsPending: '{n} قيد الانتظار',
  rewardsNotMember: 'رقمك موثّق لكنك لست عضواً بعد. انضم من صفحة المكافآت.', rewardsMismatch: 'رقم العضوية يختلف عن رقم جوال حسابك.', rewardsError: 'تعذّر تحميل المكافآت', tierMember: 'عضو', tierSilver: 'فضي', tierGold: 'ذهبي',
  security: 'الأمان', biometric: 'قفل الحساب بالبصمة أو الوجه', biometricSub: 'يُطلب عند فتح حسابك', biometricPrompt: 'تأكيد هويتك', biometricUnavailable: 'أضف بصمة أو قفل شاشة من إعدادات الجوال أولاً',
  privacy: 'الخصوصية والبيانات', deleteAccount: 'طلب حذف الحساب', deleteAccountSub: 'نحذف حسابك وبياناتك خلال المدة النظامية', deleteViaWhatsapp: 'عبر واتساب', deleteViaEmail: 'عبر البريد',
  deleteMsg: 'مرحباً، أرغب بحذف حسابي وبياناتي لدى بركات للبصريات. البريد المسجّل: {email}', deleteSubject: 'طلب حذف حساب',
  wipeLocal: 'حذف بياناتي من هذا الجوال', wipeLocalSub: 'يمسح الوصفات والبيانات المحفوظة ويسجّل خروجك', wipeQ: 'سيُحذف كل ما حُفظ على هذا الجوال (الوصفات والملف المحفوظ) وتُسجَّل خروجك. المتابعة؟',
  signOutQ: 'تسجيل الخروج من حسابك؟', hello: 'أهلاً، {name}',
};

const en: Record<keyof typeof ar, string> = {
  account: 'My account', signIn: 'Sign in', signOut: 'Sign out', back: 'Back', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', add: 'Add', retry: 'Try again',
  entrySignedOut: 'Sign in', entrySignedOutSub: 'Your orders, addresses and prescriptions in one place', entrySignedInSub: 'Profile, orders and addresses',
  welcome: 'Welcome to Barakat', welcomeSub: 'Sign in once to follow your orders and check out faster',
  benefit1: 'Track your orders and reorder in one tap', benefit2: 'Saved addresses for a faster checkout', benefit3: 'Your prescriptions kept safely on your phone',
  withEmail: 'Continue with email', withShop: 'Continue with Shop', withGoogle: 'Continue with Google',
  emailNote: 'We send a one-time code to your email. No password.',
  guest: 'Continue as guest', guestNote: 'You can browse and buy without an account',
  secureNote: 'Sign-in happens on Shopify’s secure page. We never store your password.',
  privacyLink: 'Privacy policy',
  errCancelled: 'Sign-in was cancelled', errNetwork: 'Could not connect. Check your internet and try again.', errConfig: 'Sign-in is not available yet. You can continue as a guest.',
  errUnavailable: 'Update the app to the latest version to sign in.', errServer: 'Something went wrong. Please try again.', errExpired: 'Your session ended. Please sign in again.',
  errSave: 'Could not save. Please try again.',
  offline: 'Offline · saved data', updated: 'Updated', saved: 'Saved',
  locked: 'Account locked', lockedSub: 'Unlock to see your details', unlock: 'Unlock', unlockPrompt: 'Unlock your Barakat account',
  profile: 'Profile', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Mobile number', notSet: 'Not added',
  contactNote: 'To change your email or mobile, message us on WhatsApp.',
  addresses: 'Saved addresses', noAddresses: 'No saved addresses yet', addAddress: 'Add address', editAddress: 'Edit address', defaultAddress: 'Default address',
  makeDefault: 'Set as default', setAsDefault: 'Make this my default address', address1: 'Street and district', address2: 'Building / apartment (optional)', city: 'City', zip: 'Postal code (optional)',
  country: 'Saudi Arabia', deleteAddressQ: 'Delete this address?', defaultDeleteNote: 'Set another default address before deleting this one.',
  needAddress: 'Enter a name, street and city', phoneInvalid: 'That mobile number is not valid. Example: 05XXXXXXXX',
  orders: 'My orders', noOrders: 'No orders yet', items: '{n} items', total: 'Total', track: 'Details & tracking', reorder: 'Reorder', showAll: 'Show all ({n})', showLess: 'Show less',
  reorderDone: 'Items added to your cart', reorderPartial: 'Added {a} of {b}. The rest is unavailable right now.', reorderNone: 'These items are unavailable right now', staleNote: 'Could not refresh this section. Showing the last saved data.',
  stPaid: 'Paid', stPending: 'Payment pending', stRefunded: 'Refunded', stPartRefunded: 'Partly refunded', stVoided: 'Voided', stAuthorized: 'Authorized', stPartPaid: 'Partly paid', stExpired: 'Expired',
  ffFulfilled: 'Shipped', ffUnfulfilled: 'Being prepared', ffPartial: 'Partly shipped', ffInProgress: 'In progress', ffOnHold: 'On hold', ffScheduled: 'Scheduled', stCancelled: 'Cancelled',
  rx: 'My prescriptions', rxEmpty: 'Save your measurements so they are ready for every order', rxAdd: 'Add prescription', rxEdit: 'Edit prescription', rxLabel: 'Prescription name (e.g. Reading glasses)', rxDate: 'Exam date',
  rxRight: 'Right eye (OD)', rxLeft: 'Left eye (OS)', rxPd: 'Pupillary distance (PD)', rxNotes: 'Notes', rxPrivate: 'Stored encrypted on this phone only and never sent anywhere.',
  rxSend: 'Send to a branch on WhatsApp', rxUpload: 'Upload a prescription photo', rxDeleteQ: 'Delete this prescription?', rxNeedLabel: 'Enter a name for the prescription', rxShareIntro: 'Hello, these are my prescription measurements:', rxSaveFail: 'Could not save on this phone',
  prefs: 'Communication preferences', prefEmail: 'Barakat offers by email', prefEmailSub: 'Discounts and new arrivals. Turn off any time.', prefNoEmail: 'Add an email to your account to use this option',
  prefSms: 'Marketing text messages', prefSmsOn: 'Subscribed', prefSmsOff: 'Not subscribed', prefSmsNote: 'Managed at checkout or through customer service.',
  rewards: 'Barakat Rewards', rewardsLink: 'Link membership by mobile', rewardsLinkSub: 'Verify your mobile once to see your points here', rewardsOpen: 'Open Rewards', rewardsPoints: '{n} points', rewardsPending: '{n} pending',
  rewardsNotMember: 'Your number is verified but you are not a member yet. Join from the Rewards page.', rewardsMismatch: 'The membership number differs from your account mobile.', rewardsError: 'Could not load Rewards', tierMember: 'Member', tierSilver: 'Silver', tierGold: 'Gold',
  security: 'Security', biometric: 'Lock account with fingerprint or face', biometricSub: 'Asked when you open your account', biometricPrompt: 'Confirm it is you', biometricUnavailable: 'Add a fingerprint or screen lock in your phone settings first',
  privacy: 'Privacy & data', deleteAccount: 'Request account deletion', deleteAccountSub: 'We delete your account and data within the legal period', deleteViaWhatsapp: 'On WhatsApp', deleteViaEmail: 'By email',
  deleteMsg: 'Hello, I would like to delete my Barakat Optical account and data. Registered email: {email}', deleteSubject: 'Account deletion request',
  wipeLocal: 'Remove my data from this phone', wipeLocalSub: 'Erases saved prescriptions and cached data, then signs you out', wipeQ: 'Everything saved on this phone (prescriptions and cached profile) will be erased and you will be signed out. Continue?',
  signOutQ: 'Sign out of your account?', hello: 'Hi, {name}',
};

export type AuthKey = keyof typeof ar;
const dict = { ar, en };

export function useAuthStrings() {
  const { lang } = useI18n();
  return useCallback((k: AuthKey, vars?: Record<string, string | number>) => {
    let s: string = dict[lang][k] ?? en[k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  }, [lang]);
}
