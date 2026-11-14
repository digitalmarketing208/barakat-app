import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n, useIsOffline } from '../i18n';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { Button, Empty, T } from '../ui';
import { Product, money, sized } from '../shopify';
import { CONTACT } from '../config';
import type { RootParams } from '../types';
import { Group, attr, groupLines, isLensLine, restoreLines } from '../product/cartGroups';
import { Upsell, applyPromoCode, checkoutWithCode, fetchCards, fetchUpsells, quickVariant, saveOrderNote } from '../product/api';
import { FreeDeliveryBar, MiniCard, SwipeRow } from '../product/CartParts';
import { AnimatedNumber, Snack, Snackbar } from '../product/motion';
import { useS } from '../product/strings';
import { tint } from '../product/tint';
import { checkoutNote, offersMeta, pricesAsOf, useOfferNow } from '../offers';

const NOTE_KEY = 'cartNote', PROMO_KEY = 'cartPromo';

export default function CartScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const insets = useSafeAreaInsets();
  const { t, row, rtl, lang, align } = useI18n();
  const s = useS();
  const offline = useIsOffline();
  useOfferNow(); // re-render so the as-of note stays current
  const { cart, cartBusy, cartPending, setQty, removeLine, addLines, addToCart, wishlist, isWished, toggleWish } = useStore();
  const L = lang === 'ar' ? 'AR' : 'EN';
  const [err, setErr] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [snack, setSnack] = useState<Snack | null>(null);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [saved, setSaved] = useState<Product[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  // Result of checking the code on Shopify: valid (with the discounted total for that subtotal), invalid, or not checkable offline.
  const [promoCheck, setPromoCheck] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'offline'>('idle');
  const [promoTotal, setPromoTotal] = useState<{ total: number; forSubtotal: number } | null>(null);
  const [going, setGoing] = useState(false);
  const [kb, setKb] = useState(0);
  const [barH, setBarH] = useState(150);
  const scroll = useRef<ScrollView>(null);
  const syncedNote = useRef('');
  const snackId = useRef(0);

  const lines = useMemo(() => cart?.lines ?? [], [cart]);
  const groups = useMemo(() => groupLines(lines).filter((g) => !hidden.has(g.key)), [lines, hidden]);
  const subtotal = cart ? Number(cart.cost.subtotalAmount.amount) : 0;
  const cartId = cart?.id;
  const inCart = useMemo(() => [...new Set(lines.filter((l) => !isLensLine(l)).map((l) => l.merchandise.product.handle))].sort(), [lines]);
  const inCartKey = inCart.join(',');

  const say = useCallback((x: Omit<Snack, 'id'>) => setSnack({ ...x, id: ++snackId.current }), []);

  // Note and promo code are remembered for this cart only, so they can never leak into a later order.
  useEffect(() => {
    if (!cartId) return;
    let alive = true;
    AsyncStorage.multiGet([NOTE_KEY, PROMO_KEY]).then((kv) => {
      if (!alive) return;
      for (const [k, v] of kv) {
        if (!v) continue;
        try {
          const j = JSON.parse(v) as { cartId: string; value: string };
          if (j.cartId !== cartId || !j.value) continue;
          if (k === NOTE_KEY) setNote(j.value); else setPromo(j.value);
        } catch { /* ignore a corrupt entry */ }
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [cartId]);
  const remember = (key: string, value: string) => { if (cartId) AsyncStorage.setItem(key, JSON.stringify({ cartId, value })).catch(() => {}); };

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  // Smart add-ons: refreshed when the set of products in the bag changes.
  useEffect(() => {
    if (!inCartKey) return;
    let alive = true;
    fetchUpsells(inCart, inCart, L).then((u) => { if (alive) setUpsells(u); }).catch(() => {});
    return () => { alive = false; };
  }, [inCartKey, L]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved for later = wishlist items that are not in the bag.
  const savedHandles = useMemo(() => wishlist.filter((h) => !inCart.includes(h)).slice(0, 10), [wishlist, inCart]);
  const savedKey = savedHandles.join(',');
  useEffect(() => {
    if (!savedKey) return;
    let alive = true;
    fetchCards(savedHandles, L).then((r) => { if (alive) setSaved(r); }).catch(() => {});
    return () => { alive = false; };
  }, [savedKey, L]); // eslint-disable-line react-hooks/exhaustive-deps
  const upsellsShown = inCartKey ? upsells : [];
  const savedShown = useMemo(() => saved.filter((x) => savedHandles.includes(x.handle)), [saved, savedHandles]);

  const act = async (fn: () => Promise<void>) => { setErr(false); try { await fn(); } catch { setErr(true); } };

  const undo = (g: Group) => act(() => addLines(restoreLines(g)));
  const removeGroup = async (g: Group, why: 'remove' | 'save') => {
    setErr(false);
    setHidden((h) => new Set(h).add(g.key)); // optimistic: the row leaves immediately
    const handle = g.main.merchandise.product.handle;
    if (why === 'save' && !isWished(handle)) toggleWish(handle);
    try {
      await removeLine(g.main.id); // the store removes the paired lens line with its frame
      say({ text: why === 'save' ? s('saved') : s('removed', { t: g.main.merchandise.product.title }), icon: why === 'save' ? 'heart' : 'trash-outline', action: s('undo'), onAction: () => undo(g) });
    } catch { setErr(true); }
    finally { setHidden((h) => { const n = new Set(h); n.delete(g.key); return n; }); }
  };
  const changeQty = (g: Group, q: number) => (q <= 0 ? removeGroup(g, 'remove') : act(() => setQty(g.main.id, q)));

  const quickAdd = async (product: Product, fromSaved: boolean) => {
    const v = quickVariant(product);
    if (!v) { nav.navigate('Product', { handle: product.handle }); return; }
    setAdding(product.handle); setErr(false);
    try {
      await addToCart(v.id);
      if (fromSaved && isWished(product.handle)) toggleWish(product.handle);
      say({ text: s('moved'), icon: 'bag-check-outline' });
    } catch { setErr(true); }
    finally { setAdding(null); }
  };

  const applyPromo = async () => {
    const code = promoInput.trim().replace(/\s+/g, '').toUpperCase();
    if (!code || !cart || promoCheck === 'checking') return;
    Keyboard.dismiss();
    setPromoCheck('checking');
    const r = await applyPromoCode(cart.id, code);
    if (r.status === 'invalid') { setPromoCheck('invalid'); return; }
    setPromo(code); setPromoInput(''); remember(PROMO_KEY, code);
    if (r.status === 'applied') { setPromoCheck('valid'); setPromoTotal({ total: r.total, forSubtotal: subtotal }); }
    else setPromoCheck('offline');
  };
  const clearPromo = () => {
    setPromo(null); setPromoCheck('idle'); setPromoTotal(null);
    AsyncStorage.removeItem(PROMO_KEY).catch(() => {});
    if (cart) applyPromoCode(cart.id, null).catch(() => {});
  };
  const discounted = promoCheck === 'valid' && promoTotal && promoTotal.forSubtotal === subtotal && promoTotal.total < subtotal ? promoTotal.total : null;

  const { syncCart } = useAuth();
  const openCheckout = async () => {
    if (!cart) return;
    await syncCart(cart.id).catch(() => {});
    const url = checkoutWithCode(cart.checkoutUrl, promo);
    WebBrowser.openBrowserAsync(url, { toolbarColor: colors.maroon, controlsColor: colors.card })
      .catch(() => Linking.openURL(url).catch(() => setErr(true)));
  };
  const checkout = async () => {
    if (!cart || going) return;
    setErr(false); Keyboard.dismiss();
    const text = note.trim();
    if (text !== syncedNote.current) {
      setGoing(true);
      try { await saveOrderNote(cart.id, text); syncedNote.current = text; }
      catch { setGoing(false); say({ text: s('noteFail'), icon: 'alert-circle-outline', action: s('goOn'), onAction: openCheckout }); return; }
      setGoing(false);
    }
    openCheckout();
  };

  const pad = kb > 0 ? kb + 24 : barH + 24;
  const focusScroll = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250);

  const rail = (title: string, data: Product[], cta: string, icon: keyof typeof Ionicons.glyphMap, fromSaved: boolean) => (
    <Animated.View layout={LinearTransition} entering={FadeIn} style={{ marginTop: 10 }}>
      <T style={c.h}>{title}</T>
      <FlatList horizontal inverted={rtl} data={data} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingVertical: 8 }} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <MiniCard product={item} cta={quickVariant(item) ? cta : s('choose')} icon={quickVariant(item) ? icon : 'options-outline'} busy={adding === item.handle}
            onCta={() => quickAdd(item, fromSaved)} onOpen={() => nav.navigate('Product', { handle: item.handle })} />
        )} />
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: row, alignItems: 'center', gap: 12, backgroundColor: colors.card }}>
        <Pressable onPress={() => nav.goBack()} style={c.back} accessibilityRole="button" accessibilityLabel={s('back')}>
          <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
        </Pressable>
        <T style={{ fontFamily: font.black, fontSize: 20, flex: 1 }}>{t('cart')}</T>
        {!!cart && cart.totalQuantity > 0 && <T style={{ color: colors.muted, fontSize: 13 }}>{s('items', { n: cart.totalQuantity })}</T>}
      </View>

      {groups.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: insets.bottom + 24 }}>
          <Empty icon="bag-outline" text={t('cartEmpty')} />
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <Button title={t('startShopping')} onPress={() => nav.navigate('Tabs', { screen: 'Shop' })} />
          </View>
          {savedShown.length > 0 && rail(s('savedTitle'), savedShown, s('moveToCart'), 'bag-add-outline', true)}
        </ScrollView>
      ) : (<>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: pad }}>
          <View style={{ paddingHorizontal: 16 }}><FreeDeliveryBar subtotal={subtotal} /></View>

          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
            {groups.map((g) => (
              <Animated.View key={g.key} layout={LinearTransition.duration(220)} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                <SwipeRow onRemove={() => removeGroup(g, 'remove')} disabled={cartBusy} label={s('remove')}>
                  <GroupCard g={g} busy={cartBusy} onQty={(q) => changeQty(g, q)} onRemove={() => removeGroup(g, 'remove')} onSave={() => removeGroup(g, 'save')}
                    onOpen={() => nav.navigate('Product', { handle: g.main.merchandise.product.handle })} onRx={() => nav.navigate('Prescription')} />
                </SwipeRow>
              </Animated.View>
            ))}
            <Animated.View layout={LinearTransition} style={{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="swap-horizontal" size={14} color={colors.muted} />
              <T style={{ color: colors.muted, fontSize: 11.5 }}>{s('swipeHint')}</T>
            </Animated.View>
          </View>

          {upsellsShown.length > 0 && rail(s('upsellTitle'), upsellsShown.map((u) => u.product), s('add'), 'add', false)}
          {savedShown.length > 0 && rail(s('savedTitle'), savedShown, s('moveToCart'), 'bag-add-outline', true)}

          <Animated.View layout={LinearTransition} style={{ paddingHorizontal: 16, gap: 12, marginTop: 14 }}>
            <View style={[c.box, shadow]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                <Ionicons name="pricetag-outline" size={18} color={colors.red} />
                <T style={{ fontFamily: font.bold, flex: 1 }}>{s('promoTitle')}</T>
              </View>
              {promo ? (
                <View style={[c.applied, { flexDirection: row }]}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <T style={{ flex: 1, fontSize: 13, fontFamily: font.medium }}>{promoCheck === 'valid' ? s('promoValid', { c: promo }) : promoCheck === 'offline' ? s('promoOffline', { c: promo }) : s('promoApplied', { c: promo })}</T>
                  <Pressable onPress={clearPromo} hitSlop={10} accessibilityRole="button" accessibilityLabel={s('promoRemove')}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: row, gap: 8 }}>
                  <TextInput value={promoInput} onChangeText={setPromoInput} onSubmitEditing={applyPromo} onFocus={focusScroll} placeholder={s('promoPh')} placeholderTextColor={colors.muted}
                    autoCapitalize="characters" autoCorrect={false} returnKeyType="done" maxLength={40} accessibilityLabel={s('promoTitle')}
                    style={[c.input, { flex: 1, textAlign: align, height: 46 }]} />
                  <Pressable onPress={applyPromo} disabled={!promoInput.trim() || promoCheck === 'checking'} accessibilityRole="button" style={[c.apply, { opacity: promoInput.trim() && promoCheck !== 'checking' ? 1 : 0.45 }]}>
                    <Text style={{ fontFamily: font.bold, color: colors.card }}>{promoCheck === 'checking' ? s('promoChecking') : s('apply')}</Text>
                  </Pressable>
                </View>
              )}
              {!promo && promoCheck === 'invalid' && <T style={{ color: colors.red, fontSize: 12.5 }}>{s('promoInvalid')}</T>}
            </View>

            <View style={[c.box, shadow]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                <Ionicons name="create-outline" size={18} color={colors.red} />
                <T style={{ fontFamily: font.bold, flex: 1 }}>{s('noteTitle')}</T>
                {!!note.trim() && <T style={{ color: colors.muted, fontSize: 11.5 }}>{s('noteSaved')}</T>}
              </View>
              <TextInput value={note} onChangeText={(v) => { setNote(v); remember(NOTE_KEY, v); }} onFocus={focusScroll} placeholder={s('notePh')} placeholderTextColor={colors.muted}
                multiline maxLength={300} textAlignVertical="top" accessibilityLabel={s('noteTitle')}
                style={[c.input, { minHeight: 76, paddingTop: 10, textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr' }]} />
            </View>

            <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.muted} />
              <T style={{ color: colors.muted, fontSize: 12 }}>{s('secure')}</T>
            </View>
          </Animated.View>
        </ScrollView>

        {kb === 0 && (
          <View onLayout={(e) => setBarH(e.nativeEvent.layout.height)} style={[c.bar, { paddingBottom: insets.bottom + 12 }, shadow]}>
            {err && <T style={{ color: colors.red, textAlign: 'center', marginBottom: 6 }}>{t('loadError')}</T>}
            {offline && (
              <View style={{ marginBottom: 6, gap: 2 }}>
                <T style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>{pricesAsOf(offersMeta().fetchedAt, lang)}</T>
                <T style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>{checkoutNote(lang)}</T>
                {cartPending > 0 && <T style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>{t('cartPending')}</T>}
                <T style={{ color: colors.red, textAlign: 'center', fontSize: 12 }}>{t('cartOfflineCheckout')}</T>
              </View>
            )}
            <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
              <T style={{ fontFamily: font.medium }}>{t('subtotal')}</T>
              <View style={{ flexDirection: row, alignItems: 'baseline', gap: 4 }}>
                <AnimatedNumber value={subtotal} style={{ fontFamily: font.black, fontSize: 22, lineHeight: 30, color: colors.text }} />
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.text }}>{t('sar')}</Text>
              </View>
            </View>
            {discounted != null && (
              <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <T style={{ color: colors.success, fontFamily: font.medium, fontSize: 13 }}>{s('afterDiscount')}</T>
                <T style={{ color: colors.success, fontFamily: font.black, fontSize: 16 }}>{money({ amount: String(discounted) })} {t('sar')}</T>
              </View>
            )}
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name={subtotal >= CONTACT.freeDeliveryOver ? 'checkmark-circle' : 'cube-outline'} size={14} color={subtotal >= CONTACT.freeDeliveryOver ? colors.success : colors.muted} />
              <T style={{ flex: 1, fontSize: 12, color: subtotal >= CONTACT.freeDeliveryOver ? colors.success : colors.muted }}>
                {subtotal >= CONTACT.freeDeliveryOver ? s('shipFree') : s('shipCalc')}
              </T>
              {!!promo && (
                <View style={[c.code, { flexDirection: row }]}>
                  <Ionicons name="pricetag" size={11} color={colors.success} />
                  <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: colors.success }}>{promo}</Text>
                </View>
              )}
            </View>
            <Button title={t('checkout')} icon="lock-closed-outline" loading={cartBusy || going} onPress={checkout} />
          </View>
        )}
      </>)}

      <Snackbar snack={snack} onHide={() => setSnack(null)} bottom={groups.length === 0 ? insets.bottom + 16 : kb > 0 ? kb + 12 : barH + 12} />
    </View>
  );
}

/** One cart row: a product, and the lens add-on paired with it shown as part of the same card. */
function GroupCard({ g, busy, onQty, onRemove, onSave, onOpen, onRx }: {
  g: Group; busy: boolean; onQty: (q: number) => void; onRemove: () => void; onSave: () => void; onOpen: () => void; onRx: () => void;
}) {
  const { t, row, rtl } = useI18n();
  const s = useS();
  const l = g.main;
  const orphanLens = isLensLine(l);
  const lensName = attr(l, 'Lens') ?? g.lens?.merchandise.product.title;
  const rx = attr(l, 'Prescription');
  const price = (m: { amount: string }) => `${money(m)} ${t('sar')}`;
  const extra = (l.attributes ?? []).filter((a) => !a.key.startsWith('_') && a.value && !['Lens', 'Prescription', 'For frame'].includes(a.key));
  return (
    <View style={[c.card, shadow]}>
      {!!g.lens && (
        <View style={[c.pairTag, { flexDirection: row, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="glasses" size={13} color={colors.maroon} />
          <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: colors.maroon }}>{s('pair')}</Text>
        </View>
      )}
      <View style={{ flexDirection: row, gap: 12 }}>
        <Pressable onPress={onOpen} disabled={orphanLens} accessibilityRole="button" accessibilityLabel={l.merchandise.product.title}>
          <Image source={sized(l.merchandise.image?.url, 220)} cachePolicy="memory-disk" style={c.img} contentFit="contain" transition={120} />
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 14 }}>{l.merchandise.product.title}</T>
          {l.merchandise.title !== 'Default Title' && <T style={{ color: colors.muted, fontSize: 12 }}>{l.merchandise.title}</T>}
          {orphanLens && <T style={{ color: colors.muted, fontSize: 12 }}>{s('forFrame')}: {attr(l, 'For frame')}</T>}
          {extra.map((a) => <T key={a.key} style={{ color: colors.muted, fontSize: 12 }}>{a.key}: {a.value}</T>)}
          <T style={{ fontFamily: font.bold, fontSize: 13.5, color: g.lens ? colors.text : colors.red }}>{price(l.merchandise.price)}</T>
        </View>
      </View>

      {!!g.lens && (
        <View style={[c.lens, { flexDirection: row }]}>
          <View style={c.lensIcon}><Ionicons name="add" size={16} color={colors.red} /></View>
          <View style={{ flex: 1 }}>
            <T numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 13 }}>{s('lens')}: {lensName}</T>
            {!!rx && <T style={{ color: colors.muted, fontSize: 12 }}>{s('rx')}: {rx === 'Yes' ? s('rxYes') : s('rxNo')}</T>}
          </View>
          <T style={{ fontFamily: font.bold, fontSize: 13.5 }}>{price(g.lens.merchandise.price)}</T>
        </View>
      )}
      {!!g.lens && rx === 'Yes' && (
        <Pressable onPress={onRx} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
          <Ionicons name="document-text-outline" size={15} color={colors.red} />
          <Text style={{ fontFamily: font.bold, fontSize: 12.5, color: colors.red }}>{s('sendRx')}</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
        {orphanLens ? <Text style={{ fontFamily: font.bold, color: colors.muted }}>×{l.quantity}</Text> : (
          <View style={[c.stepper, { flexDirection: row }]}>
            <Pressable style={c.qty} disabled={busy} onPress={() => onQty(l.quantity - 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={l.quantity === 1 ? s('remove') : 'decrease'}>
              <Ionicons name={l.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={colors.text} />
            </Pressable>
            <Text style={{ fontFamily: font.bold, minWidth: 22, textAlign: 'center', color: colors.text }} accessibilityLabel={`${l.quantity}`}>{l.quantity}</Text>
            <Pressable style={c.qty} disabled={busy} onPress={() => onQty(l.quantity + 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="increase">
              <Ionicons name="add" size={16} color={colors.text} />
            </Pressable>
          </View>
        )}
        <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
          {!!g.lens && <T style={{ color: colors.muted, fontSize: 11.5 }}>{s('pairTotal')}</T>}
          <Text style={{ fontFamily: font.black, fontSize: 17, color: colors.red }}>{price({ amount: String(g.total) })}</Text>
        </View>
      </View>

      <View style={[c.actions, { flexDirection: row }]}>
        {!orphanLens && (
          <Pressable onPress={onSave} disabled={busy} hitSlop={6} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 5 }}>
            <Ionicons name="heart-outline" size={15} color={colors.maroon} />
            <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: colors.maroon }}>{s('saveLater')}</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onRemove} disabled={busy} hitSlop={6} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 5 }}>
          <Ionicons name="trash-outline" size={15} color={colors.muted} />
          <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: colors.muted }}>{s('remove')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const c = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  h: { fontFamily: font.black, fontSize: 17, paddingHorizontal: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, gap: 10 },
  pairTag: { alignItems: 'center', gap: 5, backgroundColor: colors.beige, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  img: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.card },
  lens: { alignItems: 'center', gap: 10, backgroundColor: tint.redSoft, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: tint.redLine, borderStyle: 'dashed' },
  lensIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepper: { alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderRadius: radius.pill, padding: 4 },
  qty: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  actions: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 10 },
  box: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 10 },
  input: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.line },
  apply: { height: 46, paddingHorizontal: 18, borderRadius: radius.sm, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  applied: { alignItems: 'center', gap: 8, backgroundColor: tint.successSoft, borderRadius: radius.sm, padding: 10 },
  code: { alignItems: 'center', gap: 4, backgroundColor: tint.successSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: 16, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
