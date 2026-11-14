import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { Button, ErrorState, ProductCard, SectionHeader, Skeleton, T } from '../ui';
import { NewLine, Product, ShopifyConfigError, Variant, fetchProduct, fetchProducts, money, sized } from '../shopify';
import { EMPTY_LENS, LensPicker, LensState, lensAlert, lensName, useLensAddons } from '../LensPicker';
import { whatsapp } from '../links';
import type { RootParams } from '../types';
import { Gallery, GalleryViewer, Rect } from '../product/Gallery';
import { StickyBar } from '../product/StickyBar';
import { ActionTile, DeliveryCard, FrameFit, LinkRow, ProductNotes, PickupCard, Reviews, SizeGuide } from '../product/Sections';
import { Sheet } from '../product/motion';
import { Extras, fetchCards, fetchExtras } from '../product/api';
import { parseFit } from '../product/fit';
import { useS } from '../product/strings';
import { tint } from '../product/tint';
import { countdown, displayVariantPrice, offerForProduct, useOfferNow } from '../offers';

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const imgKey = (u?: string | null) => (u ? u.split('?')[0] : '');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SITE = 'https://barakatoptical.com.sa';
const GALLERY_H = 330;

export default function ProductScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { handle } = useRoute<RouteProp<RootParams, 'Product'>>().params;
  const { t, row, lang, rtl } = useI18n();
  const s = useS();
  const { cart, addToCart, addLines, cartBusy, isWished, toggleWish, pushRecent, recent } = useStore();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [p, setP] = useState<Product | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'config' | 'missing'>('loading');
  const [sel, setSel] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const [addErr, setAddErr] = useState(false);
  const [adding, setAdding] = useState(false);
  const [lensState, setLensState] = useState<LensState>(EMPTY_LENS);
  const [extras, setExtras] = useState<Extras | null>(null);
  const offerNow = useOfferNow();
  const [viewer, setViewer] = useState<Rect | null>(null);
  const [guide, setGuide] = useState(false);
  const [barH, setBarH] = useState(96);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFrame = p ? /eyeglass|sunglass|optical frame/i.test(p.productType) && !/contact lens/i.test(p.productType) : false;
  const isContact = p ? /contact lens/i.test(p.productType) : false;
  const addons = useLensAddons(isFrame);

  const load = () => {
    setState('loading');
    fetchProduct(handle, lang === 'ar' ? 'AR' : 'EN').then((prod) => {
      if (!prod) { setState('missing'); return; }
      setP(prod);
      const first = prod.variants.find((v) => v.availableForSale) ?? prod.variants[0];
      setSel(Object.fromEntries((first?.selectedOptions ?? []).map((o) => [o.name, o.value])));
      setState('ok'); pushRecent(handle);
      if (prod.productType) {
        fetchProducts({ query: `product_type:"${prod.productType}" AND available_for_sale:true`, first: 8, lang: lang === 'ar' ? 'AR' : 'EN' })
          .then((r) => setSimilar(r.products.filter((x) => x.handle !== handle))).catch(() => {});
      }
    }).catch((e) => setState(e instanceof ShopifyConfigError ? 'config' : 'error'));
  };
  useEffect(() => { queueMicrotask(load); }, [handle, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    fetchExtras(handle).then((x) => { if (alive) setExtras(x); });
    return () => { alive = false; };
  }, [handle]);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);

  const variant: Variant | undefined = useMemo(() => p?.variants.find((v) => v.selectedOptions.length > 0 && v.selectedOptions.every((o) => sel[o.name] === o.value)), [p, sel]);

  // Per option value: does a variant exist / is it in stock, given the other selected options.
  const optInfo = useMemo(() => {
    const info: Record<string, Record<string, { exists: boolean; avail: boolean }>> = {};
    if (!p) return info;
    for (const v of p.variants) {
      for (const o of v.selectedOptions) {
        if (!v.selectedOptions.every((x) => x.name === o.name || sel[x.name] === x.value)) continue;
        const slot = ((info[o.name] ??= {})[o.value] ??= { exists: false, avail: false });
        slot.exists = true; if (v.availableForSale) slot.avail = true;
      }
    }
    return info;
  }, [p, sel]);

  const setOpt = (name: string, value: string) => {
    if (!p) return;
    Haptics.selectionAsync().catch(() => {});
    let best: Variant | undefined; let bestScore = -1;
    for (const v of p.variants) {
      if (!v.selectedOptions.some((o) => o.name === name && o.value === value)) continue;
      const matches = v.selectedOptions.filter((o) => o.name !== name && sel[o.name] === o.value).length;
      const score = matches * 10 + (v.availableForSale ? 1 : 0);
      if (score > bestScore) { best = v; bestScore = score; }
    }
    if (best) setSel(Object.fromEntries(best.selectedOptions.map((o) => [o.name, o.value])));
    else setSel((c) => ({ ...c, [name]: value }));
  };

  const images = useMemo(() => {
    if (!p) return [] as { url: string }[];
    const base: { url: string }[] = p.images.length ? [...p.images] : p.featuredImage ? [p.featuredImage] : [];
    const seen = new Set(base.map((i) => imgKey(i.url)));
    for (const v of p.variants) {
      const u = v.image?.url;
      if (u && !seen.has(imgKey(u)) && base.length < 30) { seen.add(imgKey(u)); base.push({ url: u }); }
    }
    return base;
  }, [p]);
  const variantImg = variant?.image?.url;
  const imgSig = `${variantImg ?? ''}|${images.length}`;
  const [prevImgSig, setPrevImgSig] = useState(imgSig);
  if (imgSig !== prevImgSig) {
    setPrevImgSig(imgSig);
    const i = variantImg ? images.findIndex((x) => imgKey(x.url) === imgKey(variantImg)) : -1;
    if (i >= 0) setIdx(i);
  }

  const sizeOption = useMemo(() => Object.entries(sel).find(([k]) => /size|مقاس/i.test(k))?.[1], [sel]);
  const fit = useMemo(() => (p && !isContact
    ? parseFit({ metafields: extras?.metafields, tags: p.tags, texts: [variant?.title ?? '', p.title, p.description], sizeOption })
    : null), [p, isContact, extras, variant?.title, sizeOption]);

  // Header fades to a solid bar as the gallery scrolls away.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.set(e.contentOffset.y); });
  const headBg = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [GALLERY_H - 120, GALLERY_H - 20], [0, 1], Extrapolation.CLAMP) }));

  // "Fly to cart": the product photo hops from the add button to the cart icon, which then bumps.
  const fly = useSharedValue(0);
  const bump = useSharedValue(1);
  const startX = width / 2 - 22, startY = height - barH - 20;
  const endX = rtl ? 16 : width - 56, endY = insets.top + 8;
  const flyStyle = useAnimatedStyle(() => {
    const k = fly.value;
    return {
      opacity: k <= 0 || k >= 1 ? 0 : 1,
      transform: [
        { translateX: interpolate(k, [0, 1], [startX, endX]) },
        { translateY: interpolate(k, [0, 1], [startY, endY]) - Math.sin(k * Math.PI) * 70 },
        { scale: interpolate(k, [0, 1], [1, 0.4]) },
      ],
    };
  });
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const celebrate = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    fly.set(0);
    fly.set(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }, () => {
      bump.set(withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 300 })));
    }));
  }, [fly, bump]);

  const closeViewer = useCallback(() => setViewer(null), []);
  const closeGuide = useCallback(() => setGuide(false), []);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ backgroundColor: colors.card, paddingTop: insets.top }}><Skeleton style={{ height: GALLERY_H, borderRadius: 0 }} /></View>
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 14, width: '30%' }} /><Skeleton style={{ height: 26, width: '85%' }} />
          <Skeleton style={{ height: 30, width: '40%' }} /><Skeleton style={{ height: 120 }} /><Skeleton style={{ height: 80 }} />
        </View>
        <Pressable style={[st.round, shadow, { position: 'absolute', top: insets.top + 8 }, rtl ? { right: 16 } : { left: 16 }]} onPress={() => nav.goBack()} accessibilityRole="button" accessibilityLabel={s('back')}>
          <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
        </Pressable>
      </View>
    );
  }
  if (state !== 'ok' || !p) {
    return (
      <View style={[st.center, { paddingTop: insets.top }]}>
        <ErrorState message={state === 'config' ? t('tokenMissing') : state === 'missing' ? t('noResults') : t('loadError')} onRetry={state === 'missing' ? undefined : load} />
        <Button title={s('back')} icon={rtl ? 'chevron-forward' : 'chevron-back'} variant="ghost" onPress={() => nav.goBack()} />
      </View>
    );
  }

  const octx = { collections: extras?.collections };
  const dp = variant ? displayVariantPrice(p, variant, offerNow, octx) : null;
  const price = dp?.price ?? p.priceRange.minVariantPrice;
  const was = dp?.compareAt ?? null;
  const pct = dp?.pct ?? 0;
  const live = offerForProduct(p, offerNow, octx, ['price', 'bogo']);
  const qty = variant?.quantityAvailable;
  const canBuy = !!variant?.availableForSale;
  const realOptions = p.options.filter((o) => !(o.name === 'Title' && o.values.length === 1));
  const addon = lensState.lens ? addons?.[lensState.lens.handle] ?? null : null;
  const lensPrice = isFrame && lensState.lens ? addon?.price ?? lensState.lens.price : 0;
  const recentOthers = recent.filter((h) => h !== handle);
  const wished = isWished(p.handle);
  const cartCount = cart?.totalQuantity ?? 0;

  const add = async () => {
    if (!variant || adding) return;
    setAddErr(false);
    if (isFrame && lensAlert(lensState, lang)) return;
    const lens = isFrame ? lensState.lens : null;
    if (lens && !addon) {
      Alert.alert(lang === 'ar' ? 'العدسات' : 'Lenses', lang === 'ar' ? 'تعذّر تحميل العدسة، حاول مرة أخرى' : 'This lens could not be loaded, please try again');
      return;
    }
    setAdding(true);
    try {
      if (lens && addon) {
        // Frame + lens go in as a pair: both lines share `_group`, the lens line carries "For frame" (see store.tsx).
        const group = uid();
        const lines: NewLine[] = [
          { variantId: variant.id, quantity: 1, attributes: [
            { key: 'Lens', value: lensName(lens, lang) },
            { key: 'Prescription', value: lensState.rx === 'yes' ? 'Yes' : 'No' },
            { key: '_group', value: group }] },
          { variantId: addon.variantId, quantity: 1, attributes: [
            { key: 'For frame', value: p.title },
            { key: '_group', value: group }] },
        ];
        await addLines(lines);
      } else {
        await addToCart(variant.id);
      }
      celebrate();
      setJustAdded(true);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setJustAdded(false), 3200);
      if (lens && lensState.rx === 'yes') {
        Alert.alert(
          lang === 'ar' ? 'أرسل وصفتك الطبية' : 'Send your prescription',
          lang === 'ar' ? 'أرسل صورة الوصفة لفريقنا عبر واتساب لتجهيز عدساتك' : 'Send the prescription photo to our team via WhatsApp so we can prepare your lenses',
          [{ text: lang === 'ar' ? 'لاحقاً' : 'Later', style: 'cancel' },
           { text: lang === 'ar' ? 'إرسال الآن' : 'Send now', onPress: () => nav.navigate('Prescription') }]);
      }
    } catch {
      setAddErr(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally { setAdding(false); }
  };
  const openUrl = (u: string) => { WebBrowser.openBrowserAsync(u).catch(() => {}); };
  const productUrl = `${SITE}/products/${p.handle}`;
  const variantLabel = variant && variant.title !== 'Default Title' ? ` (${variant.title})` : '';
  const ask = (intro: string) => whatsapp(`${intro}\n${p.title}${variantLabel}\n${productUrl}`).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: barH + 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: colors.card, paddingTop: insets.top }}>
          <Gallery images={images} index={Math.min(idx, Math.max(0, images.length - 1))} onIndex={setIdx} height={GALLERY_H} quiet={!!viewer} onOpen={setViewer} />
        </View>

        <View style={{ padding: 20, gap: 10 }}>
          {p.productType ? <T style={{ color: colors.muted, fontSize: 12, letterSpacing: 0.5 }}>{p.productType}</T> : null}
          <T style={{ fontFamily: font.black, fontSize: 22, lineHeight: 32 }}>{p.title}</T>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: font.black, fontSize: 26, lineHeight: 36, color: colors.red }}>{money(price)} {t('sar')}</Text>
            {was && <Text style={{ fontFamily: font.regular, fontSize: 15, color: colors.muted, textDecorationLine: 'line-through' }}>{money(was)}</Text>}
            {was && pct > 0 && <View style={st.off}><Text style={{ fontFamily: font.black, fontSize: 12, color: colors.card }}>{rtl ? `‏${pct}%-` : `-${pct}%`}</Text></View>}
          </View>
          {!!live && (
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Ionicons name="pricetag" size={14} color={colors.red} />
              <T style={{ fontSize: 13, fontFamily: font.bold, color: colors.red }}>{(lang === 'ar' ? live.badgeAr || live.titleAr : live.badgeEn || live.titleEn)}</T>
              <T style={{ fontSize: 12.5, color: colors.muted }}>{countdown(Date.parse(live.endsAt) - offerNow, lang)}</T>
            </View>
          )}
          <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: !canBuy ? colors.muted : qty != null && qty <= 5 ? colors.amber : colors.success }} />
            <T style={{ fontSize: 13, color: colors.muted }}>{!canBuy ? t('soldOut') : qty != null && qty <= 5 ? t('lowStock') : t('inStock')}</T>
          </View>

          {realOptions.map((o) => (
            <View key={o.name} style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flexDirection: row, alignItems: 'baseline', gap: 6 }}>
                <T style={{ fontFamily: font.bold }}>{o.name}</T>
                {!!sel[o.name] && <T style={{ color: colors.muted, fontSize: 13 }}>{sel[o.name]}</T>}
              </View>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
                {o.values.map((v) => {
                  const inf = optInfo[o.name]?.[v];
                  const out = !inf || !inf.avail;
                  const on = sel[o.name] === v;
                  return (
                    <Pressable key={v} onPress={() => setOpt(o.name, v)} accessibilityRole="button" accessibilityState={{ selected: on, disabled: out }}
                      accessibilityLabel={out ? `${v}, ${t('soldOut')}` : v}
                      style={[st.opt, on && { backgroundColor: colors.red, borderColor: colors.red }, out && !on && { backgroundColor: colors.bg, borderStyle: 'dashed' }]}>
                      <Text style={{ fontFamily: font.medium, fontSize: 14, color: on ? colors.card : out ? colors.muted : colors.text, textDecorationLine: out ? 'line-through' : 'none' }}>{v}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <ProductNotes promo={extras?.promo} rating={extras?.rating} />
          <FrameFit fit={fit} onGuide={() => setGuide(true)} />

          {isFrame && <LensPicker addons={addons} value={lensState} onChange={setLensState} productHandle={p.handle} />}

          {isFrame && (
            <View style={{ flexDirection: row, gap: 10, marginTop: 6 }}>
              <ActionTile icon="camera" label={t('tryOn')} onPress={() => nav.navigate('Tabs', { screen: 'TryOn', params: { handle: p.handle } })} />
              <ActionTile icon="document-text" label={t('uploadRx')} onPress={() => nav.navigate('Prescription')} />
            </View>
          )}

          <DeliveryCard />
          <PickupCard handle={p.handle} onBranches={() => nav.navigate('Tabs', { screen: 'Branches' })} />

          <View style={{ flexDirection: row, gap: 10, marginTop: 6 }}>
            <ActionTile icon="eye-outline" label={t('bookFree')} onPress={() => nav.navigate('Booking')} />
            <ActionTile icon="logo-whatsapp" label={t('askQuestion')} onPress={() => ask(s('askMsg'))} />
          </View>
          {!isContact && !fit && (
            <View style={{ marginTop: 6 }}><LinkRow icon="resize-outline" label={t('sizeGuide')} onPress={() => setGuide(true)} /></View>
          )}

          {p.description ? (<>
            <T style={{ fontFamily: font.bold, marginTop: 14 }}>{t('details')}</T>
            <T style={{ color: colors.muted, lineHeight: 23 }}>{stripHtml(p.description)}</T>
          </>) : null}

          <View style={[st.ship, { gap: 6 }]}>
            <T style={{ fontFamily: font.bold }}>{t('shipReturns')}</T>
            <T style={{ color: colors.muted, fontSize: 13 }}>{t('shipReturnsBody')}</T>
          </View>
        </View>

        <Reviews seed={p.handle} />

        {similar.length > 0 && (<>
          <SectionHeader title={t('similar')} />
          <FlatList horizontal inverted={rtl} data={similar} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}
            renderItem={({ item }) => <ProductCard p={item} width={160} onPress={() => nav.push('Product', { handle: item.handle })} />} />
        </>)}
        {recentOthers.length > 0 && <RecentRail handles={recentOthers.slice(0, 6)} onOpen={(h) => nav.push('Product', { handle: h })} title={t('recentlyViewed')} lang={lang} rtl={rtl} />}
      </Animated.ScrollView>

      {/* Fixed header: floating buttons over the gallery, solid bar with the title once scrolled. */}
      <View pointerEvents="box-none" style={[st.head, { paddingTop: insets.top + 8, flexDirection: row }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.headBg, shadow, headBg]} />
        <Pressable style={[st.round, shadow]} onPress={() => nav.goBack()} accessibilityRole="button" accessibilityLabel={s('back')}>
          <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
        </Pressable>
        <Animated.View pointerEvents="none" style={[{ flex: 1 }, headBg]}>
          <T numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 15 }}>{p.title}</T>
        </Animated.View>
        <View style={{ flexDirection: row, gap: 8 }}>
          <Pressable style={[st.round, shadow]} accessibilityRole="button" accessibilityLabel={t('share')}
            onPress={() => { Share.share({ message: `${p.title}\n${productUrl}` }).catch(() => {}); }}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={[st.round, shadow]} onPress={() => toggleWish(p.handle)} accessibilityRole="button" accessibilityLabel={t('wishlist')} accessibilityState={{ selected: wished }}>
            <Ionicons name={wished ? 'heart' : 'heart-outline'} size={20} color={wished ? colors.red : colors.text} />
          </Pressable>
          <Animated.View style={bumpStyle}>
            <Pressable style={[st.round, shadow]} onPress={() => nav.navigate('Cart')} accessibilityRole="button" accessibilityLabel={`${t('cart')} ${cartCount}`}>
              <Ionicons name="bag-outline" size={20} color={colors.text} />
              {cartCount > 0 && <View style={[st.badge, rtl ? { left: -2 } : { right: -2 }]}><Text style={{ fontFamily: font.black, fontSize: 10, color: colors.card }}>{cartCount > 99 ? '99+' : cartCount}</Text></View>}
            </Pressable>
          </Animated.View>
        </View>
      </View>

      <StickyBar framePrice={Number(price.amount)} lensPrice={lensPrice} canBuy={canBuy} busy={adding || (cartBusy && !justAdded)} added={justAdded} error={addErr}
        onAdd={add} onViewCart={() => nav.navigate('Cart')} onWhatsApp={() => ask(s('askMsg'))} bottomInset={insets.bottom} onHeight={setBarH} />

      <Animated.View pointerEvents="none" style={[st.fly, shadow, { elevation: 14 }, flyStyle]}>
        {!!images[0] && <Image source={sized(images[0].url, 120)} cachePolicy="memory-disk" style={{ width: 36, height: 36 }} contentFit="contain" />}
      </Animated.View>

      <Sheet visible={guide} onClose={closeGuide} title={s('sgTitle')}>
        <SizeGuide fit={fit} onWebsite={() => openUrl(`${SITE}/pages/frame-size-guide`)} onWhatsApp={() => ask(s('sizeMsg'))} />
      </Sheet>

      {viewer && <GalleryViewer images={images} index={idx} onIndex={setIdx} origin={viewer} onClose={closeViewer} />}
    </View>
  );
}

function RecentRail({ handles, onOpen, title, lang, rtl }: { handles: string[]; onOpen: (h: string) => void; title: string; lang: string; rtl: boolean }) {
  const [items, setItems] = useState<Product[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCards(handles, lang === 'ar' ? 'AR' : 'EN')
      .then((r) => { if (alive) setItems(handles.map((h) => r.find((x) => x.handle === h)).filter((x): x is Product => !!x)); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [handles.join(','), lang]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items) return <Skeleton style={{ height: 40, marginHorizontal: 20, marginTop: 20 }} />;
  if (!items.length) return null;
  return (<>
    <SectionHeader title={title} />
    <FlatList horizontal inverted={rtl} data={items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}
      renderItem={({ item }) => <ProductCard p={item} width={160} onPress={() => onOpen(item.handle)} />} />
  </>);
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  head: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  headBg: { backgroundColor: colors.card },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  off: { paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  opt: { paddingHorizontal: 16, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  ship: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginTop: 14 },
  fly: { position: 'absolute', top: 0, left: 0, zIndex: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: tint.redLine, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
