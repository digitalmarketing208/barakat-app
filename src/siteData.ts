// Content mirrored from the live website home page (barakatoptical.com.sa). Collection handles = website URLs.
const CDN = 'https://barakatoptical.com.sa/cdn/shop/files/';
const S = 'https://cdn.shopify.com/s/files/1/0620/6888/3755/files/';
const w = (u: string, n = 700) => `${u}&width=${n}`;

export const GAMER_COLLECTION = 'gamer-vision-blue-light-gaming-glasses';

export type Go = { collection?: string; booking?: boolean; title?: string };

export const STRAP = {
  ar: ['فصل نظارتك تصلك خلال 48 ساعة', 'افحص نظرك الآن مجاناً'],
  en: ['Your glasses delivered within 48 hours', 'Get your free eye test now'],
};

const TILE = {
  optical: `${S}barakat-home-optical-model.jpg?v=1791277860`,
  sun: `${S}barakat-home-sunglasses-model.jpg?v=1791277866`,
  gamer: `${S}barakat-gamer-homepage-mobile.png?v=1791284532`,
};

// Hero banners are designed per language on the website (barakat-ar-* / barakat-en-*). The app picks the
// set for the active language; if a file is missing it draws a native banner (text in the app's language)
// over `backdrop`, a photo that has no text burnt in.
export type HeroKey = 'new' | 'eye' | 'gamer';
const hero = (lang: 'ar' | 'en', slug: string) => w(`${CDN}barakat-${lang}-${slug}-mobile.jpg?v=1791460264`, 1000);
export const HERO_RATIO = 1.25; // width / height of the banner artwork
export const HERO: { key: HeroKey; img: { ar: string | null; en: string | null }; backdrop: string; go: Go }[] = [
  { key: 'new', img: { ar: hero('ar', 'new-arrivals'), en: hero('en', 'new-arrivals') }, backdrop: w(TILE.sun, 900), go: { collection: 'new-arrivals-all-collections' } },
  { key: 'eye', img: { ar: hero('ar', 'eye-test'), en: hero('en', 'eye-test') }, backdrop: w(TILE.optical, 900), go: { booking: true } },
  { key: 'gamer', img: { ar: hero('ar', 'gamer'), en: hero('en', 'gamer') }, backdrop: w(TILE.gamer, 900), go: { collection: GAMER_COLLECTION } },
];
// The lower eye-test banner only exists with Arabic text: English gets the native banner.
export const EYE_TEST_BANNER: { ar: string | null; en: string | null } = { ar: w(`${CDN}barakat-eye-test-mobile-v3.jpg?v=1791717247`, 1000), en: null };
export const EYE_TEST_BACKDROP = w(TILE.optical, 900);
export const GAMER_BACKDROP = w(TILE.gamer, 900);

export const TILES: { key: 'eyeglasses' | 'sunglasses' | 'gamer' | 'kids' | 'contactLenses'; img: string; go: Go }[] = [
  { key: 'eyeglasses', img: w(TILE.optical, 600), go: { collection: 'eyeglasses-all-brands' } },
  { key: 'sunglasses', img: w(TILE.sun, 600), go: { collection: 'sunglasses-all-brands' } },
  { key: 'gamer', img: w(TILE.gamer, 600), go: { collection: GAMER_COLLECTION } },
  { key: 'kids', img: w(`${S}barakat-home-kids-model.jpg?v=1791277872`, 600), go: { collection: 'kids-collections-all-eyeglasses-and-sunglasses' } },
  { key: 'contactLenses', img: w(`${S}barakat-home-contacts-model.jpg?v=1791277877`, 600), go: { collection: 'contact-lenses' } },
];

export const BRANDS: { name: string; handle: string; img: string }[] = [
  ['Givenchy', 'givenchy', '4_ddc95151-8767-4362-9aba-3d1d89e0b2af.png?v=1666597105'],
  ['Tom Ford', 'tom-ford', 'Tom_Ford_17.png?v=1764506591'],
  ['Balenciaga', 'balenciaga', '8_a6c073c6-7534-42e4-996b-daa780b0b9ad.png?v=1666597246'],
  ['Mustang', 'mustang', 'images_1.png?v=1779093949'],
  ['Ultra Lite', 'ultra-lite', 'ULTRA_LITE_NEW_LOGO.jpg?v=1765177301'],
  ['Stepper', 'stepper', '20_8fb421d7-edea-4dfe-82fc-98b412b2bc35.png?v=1666597810'],
  ['Adidas', 'adidas', '15_ec4ce33f-26cd-452d-98e5-04e854b9df9f.png?v=1666597608'],
  ['Selfie', 'selfie', 'SELFIE_logo.png?v=1765177716'],
  ['Aziz', 'aziz-by-barakat', '23_df7f1326-11fc-4fb9-b4fd-c543576496de.png?v=1666597910'],
  ['Cartier', 'cartier', 'bd2c27b2066d0bba682ad232fba7eb4f_2977f61b-ab21-4fb6-b82b-f34217a35d69.png?v=1759325489'],
  ['Dior', 'dior', 'Brand_Logo_Dior_bf2b57bb-b738-4252-97d3-c54bb658a01a.png?v=1724848401'],
  ['West', 'west', 'west_logo_2.png?v=1779093577'],
  ['Rossi Club', 'rossi-club', 'FINAL___ROSSI_CLUB_END_TIP_LOGO___26.04.png?v=1764505554'],
  ['Amarcord', 'amarcord', 'amarcord_logo.png?v=1779093683'],
  ['She', 'she-by-barakat', 'FINAL_She_LOGO_-_04-01-2017_1.png?v=1765177247'],
  ['Fendi', 'fendi', '5_b044f724-0f0e-45f8-81de-087fec6f18f5.png?v=1666597122'],
  ['Monaco', 'monaco', 'original_lOGO___monaco_lite.png?v=1765178089'],
  ['Carrera', 'carrera', 'Brand_Logo_Carrera_9509637e-f126-42f4-93aa-b52b4f6cf1a2.png?v=1724848401'],
  ['Blue Beat', 'blue-beat', 'Untitled-1_06901061-784d-416c-b88d-6a4b096ad0fe.png?v=1759325561'],
  ['Morel', 'morel', 'Brand_Logo_morel_795d33c2-b339-425b-9347-f12e0d41c712.png?v=1724848401'],
  ['R&B', 'r-b', '58a1c447d6b7297aebbcf2c936eb1faa_0f242fa7-3072-4323-807c-cbd5325c3952.png?v=1759325511'],
  ['Calvin Klein', 'calvinklein', 'Brand_Logo_CK_af522e2e-4214-47c4-ba48-4a0becc85330.png?v=1724848400'],
  ['Badaro', 'badaro-by-barakat', '8fbe956cbb56fef216822601bde09b35_969d61fe-db17-4024-894a-32746ff5836c.png?v=1757246969'],
].map(([name, handle, f]) => ({ name, handle, img: w(`${CDN}${f}`, 300) }));

// Real Google reviews shown on the website home page (verbatim).
export const REVIEWS: { name: string; where: string; text: string }[] = [
  { name: 'Mohamed Elsayed', where: 'شارع الستين – الملز، الرياض', text: 'الأستاذ إسلام الموجود في فرع الملز شارع الستين محترم جدا ومتعاون' },
  { name: 'Hassn Al manae', where: 'طريق الملك فهد – المعزاب، خميس مشيط', text: 'شكر خاص للاستاذ محمد فؤاد والاستاذ يوسف على تعاملهم اللطيف والجيد .' },
  { name: 'Mohamed Osama', where: 'طريق أبو بكر الصديق – العارض، الرياض', text: 'محترمين جدا عملت عندهم عدسات لنظارة رياضية عملولى فحص النظر مجانا و خلصو العدسات بسرعة و كانت كويسة جدا' },
  { name: 'WALEED AL-KHALDI', where: 'طريق أبو بكر الصديق – العارض، الرياض', text: 'دقة + سرعة + انجاز + تعامل راقي + مصداقية' },
  { name: 'Bo Kyan Aljafar', where: 'الهفوف', text: 'محل ممتاز ويقبل فيه التامين وفي دكتور لفحص النظر واشكر الموظف ناصر الجعفر شكر خاص عالمساعده' },
  { name: 'm7md', where: 'أنس بن مالك – الياسمين، الرياض', text: 'نوعية عدسات رائعة وكشف أيضا دقيق شكرا للموظف اللطيف أحمد' },
  { name: 'talal talal', where: 'إشبيلية، الرياض', text: 'ممتازين واخيارات كثير والرجال تعاملهمم ممتاز وبالذات خالد العنزي ساعدني بكل شي وماقصر معي' },
  { name: 'Sa D', where: 'شارع العليا، الرياض', text: 'اشكر الاخ محمد عبدالمنعم على ذوقه وترحيبه وكانت تجربه ممتازه جداً' },
  { name: 'بندق محمد', where: 'الجبيل', text: 'من افضل شركات النظارات الله يعطيهم العافيه الشباب ماقصرو' },
  { name: '7amd rasheed', where: 'شارع الستين – الملز، الرياض', text: 'الفرع تعامله جدا رائع واشكر على وجه الخصوص أ. اسلام على صبره وخدمته وابتسامته الجميلة' },
  { name: 'سعد القرني', where: 'طويق – شارع بلال بن رباح، الرياض', text: 'صراحه خامتهم حلوه وأسعارهم مناسبه جدا اليوم أخذت منهم وما أنسى البنات الي ساعدوني على الاختيار' },
  { name: 'Ahmed abdullah', where: 'الجبيل', text: 'تجربه رائعه شكرا للاستاذ ماجد' },
];

const SITE = 'https://barakatoptical.com.sa';
export const FOOTER_LINKS: { k: 'about' | 'sizeGuide' | 'contactUs' | 'blog' | 'trackOrder' | 'jobs' | 'privacy' | 'shipping' | 'terms'; url: string }[] = [
  { k: 'about', url: `${SITE}/pages/about-us` },
  { k: 'sizeGuide', url: `${SITE}/pages/frame-size-guide` },
  { k: 'contactUs', url: `${SITE}/pages/contact` },
  { k: 'blog', url: `${SITE}/blogs/news` },
  { k: 'trackOrder', url: `${SITE}/pages/track-order` },
  { k: 'jobs', url: `${SITE}/pages/jobs` },
  { k: 'privacy', url: `${SITE}/pages/privacy` },
  { k: 'shipping', url: `${SITE}/policies/shipping-policy` },
  { k: 'terms', url: `${SITE}/pages/terms` },
];

export const SOCIAL: { icon: 'logo-instagram' | 'logo-tiktok' | 'logo-snapchat' | 'logo-twitter' | 'logo-youtube' | 'logo-facebook'; url: string }[] = [
  { icon: 'logo-instagram', url: 'https://www.instagram.com/barakatopticalsa/' },
  { icon: 'logo-tiktok', url: 'https://www.tiktok.com/@barakat_optical' },
  { icon: 'logo-snapchat', url: 'https://www.snapchat.com/add/barakat_optical' },
  { icon: 'logo-twitter', url: 'https://x.com/barakat_optical' },
  { icon: 'logo-youtube', url: 'https://www.youtube.com/@BarakatOpticals' },
  { icon: 'logo-facebook', url: 'https://www.facebook.com/barakatopticalksa' },
];
