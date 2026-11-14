import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { Button, Empty, ErrorState, Price, Skeleton, T } from '../ui';
import { Product, money, sized } from '../shopify';
import type { RootParams } from '../types';
import { fetchCards, quickVariant } from '../product/api';
import { Bouncy, Snack, Snackbar } from '../product/motion';
import { useS } from '../product/strings';
import { tint } from '../product/tint';

const SITE = 'https://barakatoptical.com.sa';

export default function WishlistScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const insets = useSafeAreaInsets();
  const { t, row, rtl, lang } = useI18n();
  const s = useS();
  const { width } = useWindowDimensions();
  const { wishlist, toggleWish, addToCart, cart } = useStore();
  const [byHandle, setByHandle] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [tries, setTries] = useState(0);
  const snackId = useRef(0);
  const loadedLang = useRef(lang);
  const cardW = (width - 16 * 2 - 12) / 2;

  const handles = useMemo(() => wishlist.slice(0, 60), [wishlist]);
  const key = handles.join(',');
  // Only products we have not loaded yet are requested, so removing a favourite never refetches the grid.
  useEffect(() => {
    const fresh = loadedLang.current !== lang;
    loadedLang.current = lang;
    const have = fresh ? {} : byHandle;
    const missing = handles.filter((h) => !have[h]);
    if (!missing.length) { setLoading(false); return; }
    let alive = true;
    if (fresh || !Object.keys(have).length) setLoading(true);
    setFailed(false);
    fetchCards(missing, lang === 'ar' ? 'AR' : 'EN')
      .then((r) => { if (alive) setByHandle({ ...have, ...Object.fromEntries(r.map((p) => [p.handle, p])) }); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, lang, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => handles.map((h) => byHandle[h]).filter((p): p is Product => !!p), [handles, byHandle]);
  const say = useCallback((x: Omit<Snack, 'id'>) => setSnack({ ...x, id: ++snackId.current }), []);

  const shareList = () => {
    if (!items.length) return;
    const body = items.map((p) => `• ${p.title} — ${money(p.priceRange.minVariantPrice)} ${t('sar')}\n${SITE}/products/${p.handle}`).join('\n\n');
    Share.share({ message: `${s('shareHead')}\n\n${body}` }).catch(() => {});
  };

  const remove = useCallback((p: Product) => {
    toggleWish(p.handle);
    say({ text: s('removed', { t: p.title }), icon: 'heart-dislike-outline', action: s('undo'), onAction: () => toggleWish(p.handle) });
  }, [toggleWish, say, s]);

  const move = useCallback(async (p: Product) => {
    const v = quickVariant(p);
    if (!v) { nav.navigate('Product', { handle: p.handle }); return; } // colour / size / lenses are chosen on the product page
    setAdding(p.handle);
    try {
      await addToCart(v.id);
      toggleWish(p.handle);
      say({ text: s('moved'), icon: 'bag-check-outline', action: s('viewCart'), onAction: () => nav.navigate('Cart') });
    } catch { say({ text: s('addFailed'), icon: 'alert-circle-outline' }); }
    finally { setAdding(null); }
  }, [addToCart, toggleWish, say, s, nav]);

  const cartCount = cart?.totalQuantity ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: row, alignItems: 'center', gap: 10, backgroundColor: colors.card }}>
        <Pressable onPress={() => nav.goBack()} style={w.round} accessibilityRole="button" accessibilityLabel={s('back')}>
          <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.black, fontSize: 20 }}>{t('wishlist')}</T>
          {wishlist.length > 0 && <T style={{ color: colors.muted, fontSize: 12 }}>{s('wishCount', { n: wishlist.length })}</T>}
        </View>
        {items.length > 0 && (
          <Pressable onPress={shareList} style={w.round} accessibilityRole="button" accessibilityLabel={s('shareList')}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
        )}
        <Pressable onPress={() => nav.navigate('Cart')} style={w.round} accessibilityRole="button" accessibilityLabel={`${t('cart')} ${cartCount}`}>
          <Ionicons name="bag-outline" size={20} color={colors.text} />
          {cartCount > 0 && <View style={[w.badge, rtl ? { left: -2 } : { right: -2 }]}><Text style={{ fontFamily: font.black, fontSize: 10, color: colors.card }}>{cartCount > 99 ? '99+' : cartCount}</Text></View>}
        </Pressable>
      </View>

      {wishlist.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 }}>
          <Empty icon="heart-outline" text={`${t('wishlistEmpty')}\n${s('wishHint')}`} />
          <Button title={s('browse')} icon="glasses-outline" onPress={() => nav.navigate('Tabs', { screen: 'Shop' })} />
        </View>
      ) : loading ? (
        <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 12, padding: 16 }}>
          {Array.from({ length: Math.min(6, wishlist.length) }, (_x, i) => <Skeleton key={i} style={{ width: cardW, height: 250 }} />)}
        </View>
      ) : failed && !items.length ? (
        <ErrorState message={t('loadError')} onRetry={() => setTries((n) => n + 1)} />
      ) : (
        <FlatList data={items} keyExtractor={(p) => p.handle} numColumns={2} key={rtl ? 'rtl' : 'ltr'} showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16, flexDirection: row }} contentContainerStyle={{ gap: 12, paddingTop: 16, paddingBottom: insets.bottom + 90 }}
          initialNumToRender={6} windowSize={7}
          renderItem={({ item, index }) => (
            <WishCard p={item} width={cardW} index={index} busy={adding === item.handle} onOpen={() => nav.navigate('Product', { handle: item.handle })}
              onRemove={() => remove(item)} onMove={() => move(item)} />
          )} />
      )}
      <Snackbar snack={snack} onHide={() => setSnack(null)} bottom={insets.bottom + 16} />
    </View>
  );
}

const WishCard = memo(function WishCard({ p, width, index, busy, onOpen, onRemove, onMove }: {
  p: Product; width: number; index: number; busy: boolean; onOpen: () => void; onRemove: () => void; onMove: () => void;
}) {
  const { t, row, rtl } = useI18n();
  const s = useS();
  const quick = !!quickVariant(p);
  const sold = !p.availableForSale;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)} style={[w.card, shadow, { width }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={p.title}>
        <View style={w.img}>
          {!!p.featuredImage?.url && <Image source={sized(p.featuredImage.url, 480)} cachePolicy="memory-disk" recyclingKey={p.id} style={StyleSheet.absoluteFill} contentFit="contain" transition={180} />}
          {sold && <View style={[w.sold, rtl ? { right: 6 } : { left: 6 }]}><Text style={{ color: colors.card, fontFamily: font.bold, fontSize: 11 }}>{t('soldOut')}</Text></View>}
        </View>
        <View style={{ paddingHorizontal: 10, paddingTop: 8, gap: 3 }}>
          <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 13, minHeight: 40 }}>{p.title}</T>
          <Price p={p} size={15} />
        </View>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={[w.heart, shadow, rtl ? { left: 8 } : { right: 8 }]} accessibilityRole="button" accessibilityLabel={s('removeWish')}>
        <Ionicons name="heart" size={18} color={colors.red} />
      </Pressable>
      <Bouncy onPress={onMove} disabled={busy || sold} style={[w.move, { flexDirection: row, opacity: sold ? 0.45 : 1 }]} accessibilityRole="button"
        accessibilityLabel={`${quick ? s('moveToCart') : s('choose')}: ${p.title}`}>
        {busy ? <ActivityIndicator size="small" color={colors.red} /> : (<>
          <Ionicons name={quick ? 'bag-add-outline' : 'options-outline'} size={15} color={colors.red} />
          <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, color: colors.red }}>{quick ? s('moveToCart') : s('choose')}</Text>
        </>)}
      </Bouncy>
    </Animated.View>
  );
});

const w = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, paddingBottom: 10 },
  img: { height: 140, margin: 8, marginBottom: 0, borderRadius: radius.sm, backgroundColor: colors.card, overflow: 'hidden' },
  heart: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  sold: { position: 'absolute', bottom: 6, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 6 },
  move: { height: 36, marginHorizontal: 10, marginTop: 10, borderRadius: radius.pill, backgroundColor: tint.redSoft, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
});
