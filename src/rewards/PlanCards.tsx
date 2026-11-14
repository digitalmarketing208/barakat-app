// One dark-metallic card per paid plan (Barakat Plus = silver tone, Barakat Max = gold on black), in a swipeable
// carousel when both do not fit side by side. The price comes from the live Shopify product (barakat-plus,
// barakat-max); until it loads, an indicative price is shown and labelled so. Subscribe / upgrade puts the plan
// product in the cart for the signed-in member; the Rewards server activates the plan when the paid order has the SKU.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { whatsapp } from '../links';
import { alpha, tap } from '../account/kit';
import * as WebBrowser from 'expo-web-browser';
import { NetworkError, cartCreateLines, fetchProduct, money, Product } from '../shopify';
import { isOffline } from '../net/status';
import type { RootParams } from '../types';
import { metalFor } from './cardTheme';
import { MetalCard, Ring, emboss } from './Metallic';
import { DEFAULT_PLANS, Member, PlanCode, PlanDef, PublicConfig } from './rewardsApi';
import { fmt, fmtDate, nf, pick, strings } from './strings';

/** Indicative yearly prices in SAR, shown only until the live product price loads. */
export const INDICATIVE_PRICE_SAR: Record<PlanCode, number> = { plus: 99, max: 249 };
export const PLAN_HANDLE: Record<PlanCode, string> = { plus: 'barakat-plus', max: 'barakat-max' };
const ORDER: PlanCode[] = ['plus', 'max'];
const GAP = 12;
const MIN_CARD = 320;

type Live = { product: Product; variantId: string; price: string; currency: string } | null;

function usePlanProduct(code: PlanCode, lang: 'ar' | 'en') {
  const [live, setLive] = useState<Live>(null);
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState(`${code}|${lang}`);
  if (seen !== `${code}|${lang}`) { setSeen(`${code}|${lang}`); setFailed(false); }
  useEffect(() => {
    let alive = true;
    fetchProduct(PLAN_HANDLE[code], lang === 'ar' ? 'AR' : 'EN').then((p) => {
      if (!alive) return;
      const v = p?.variants[0];
      if (p && v) setLive({ product: p, variantId: v.id, price: money(v.price), currency: v.price.currencyCode });
      else setFailed(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [code, lang]);
  return { live, failed };
}

function PlanCard({ code, def, cfg, member, width }: { code: PlanCode; def: PlanDef; cfg: PublicConfig; member: Member | null; width?: number }) {
  const { lang, row } = useI18n();
  const t = strings[lang];
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { live, failed } = usePlanProduct(code, lang);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const m = metalFor(code);
  const active = member?.plan ?? null;
  const mine = active?.code === code;
  const higher = active?.code === 'max' && code === 'plus';
  const benefitName = (c: string) => pick(t, 'ben_' + c, c);
  const planWord = code === 'max' ? 'Max' : 'Plus';

  const totalLimit = mine ? active!.benefits.reduce((a, b) => a + b.limit, 0) : 0;
  const totalUsed = mine ? active!.benefits.reduce((a, b) => a + b.used, 0) : 0;

  const cta = mine ? t.planRenew : active && code === 'max' ? t.planUpgrade : t.planSubscribe;

  const subscribe = useCallback(async () => {
    if (busy) return;
    tap();
    setMsg('');
    if (!member) { setMsg(t.planNeedMember); nav.navigate('Rewards'); return; }
    if (!live) { void whatsapp(fmt(t.planMsg, { p: planWord })); return; } // product not available: WhatsApp fallback
    if (isOffline()) { setMsg(t.planNeedsNet); return; }
    setBusy(true);
    try {
      // a separate one-line Storefront cart: the member's own cart is never touched. Checkout opens in the in-app browser.
      const c = await cartCreateLines([{ variantId: live.variantId, quantity: 1, attributes: [{ key: 'Member mobile', value: member.mobile }, { key: 'Plan', value: code }] }]);
      if (!c.checkoutUrl) throw new Error('no checkout url');
      await WebBrowser.openBrowserAsync(c.checkoutUrl);
    } catch (e) {
      if (e instanceof NetworkError) setMsg(t.planNeedsNet);
      else void whatsapp(fmt(t.planMsg, { p: planWord }));
    } finally { setBusy(false); }
  }, [busy, member, live, nav, t, planWord, code]);

  const priceTxt = live ? fmt(t.planPrice, { v: nf(Number(live.price)) }) : fmt(t.planPrice, { v: nf(INDICATIVE_PRICE_SAR[code]) });
  const showIndicative = !live; // dropped once the live price is known
  const ctaBg = code === 'max' ? colors.amber : colors.card;

  return (
    <MetalCard kind={code} style={width ? { width } : undefined}>
      <View style={{ flexDirection: row, alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
            <Ionicons name={code === 'max' ? 'diamond' : 'star'} size={18} color={m.accent} />
            <Text style={[{ fontFamily: font.black, fontSize: 22, color: m.text }, emboss(m)]}>{pick(t, 'planName_' + code)}</Text>
          </View>
          <T style={{ color: m.textSoft, fontSize: 13 }}>{pick(t, 'planPromise_' + code)}</T>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[{ fontFamily: font.black, fontSize: 18, color: m.accent }, emboss(m)]}>{priceTxt}</Text>
          {showIndicative ? (
            <View style={[s.pill, { backgroundColor: alpha(colors.card, 0.14) }]}>
              <Text style={{ fontFamily: font.medium, fontSize: 10, color: m.textSoft }}>{failed ? t.planIndicative : t.planLoading}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {mine ? (
        <View style={[s.activeBox, { flexDirection: row, borderColor: alpha(m.accent, 0.5) }]}>
          <Ring size={58} stroke={6} value={totalLimit ? totalUsed / totalLimit : 0} color={m.accent} track={alpha(colors.card, 0.18)}>
            <Text style={{ fontFamily: font.black, fontSize: 13, color: m.text }}>{nf(totalUsed)}/{nf(totalLimit)}</Text>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={16} color={m.accent} />
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: m.text }}>{t.planStateActive}</Text>
            </View>
            <T style={{ color: m.textSoft, fontSize: 12 }}>{fmt(t.planRenewBy, { d: fmtDate(active!.ends_at, lang) })}</T>
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: row, gap: 8, alignItems: 'flex-start' }}>
          <Ionicons name="checkmark-circle" size={17} color={m.accent} style={{ marginTop: 2 }} />
          <T style={{ flex: 1, color: m.text, fontFamily: font.bold, fontSize: 13 }}>
            {fmt(pick(t, 'planFloor_' + def.floor, t.planFloor_member), { r: cfg.rates[def.floor] ?? cfg.rates.member })}
          </T>
        </View>
        {Object.entries(def.benefits).map(([b, n]) => {
          const ben = mine ? active!.benefits.find((x) => x.code === b) : undefined;
          return (
            <View key={b} style={{ flexDirection: row, gap: 8, alignItems: 'center' }}>
              {ben ? (
                <Ring size={34} stroke={4} value={ben.limit ? ben.used / ben.limit : 0} color={m.accent} track={alpha(colors.card, 0.18)}>
                  <Text style={{ fontFamily: font.bold, fontSize: 11, color: m.text }}>{nf(ben.left)}</Text>
                </Ring>
              ) : <Ionicons name="checkmark-circle" size={17} color={m.accent} />}
              <View style={{ flex: 1 }}>
                <T style={{ color: m.text, fontSize: 13 }}>{benefitName(b)}</T>
                <T style={{ color: m.textSoft, fontSize: 12 }}>
                  {ben ? `${fmt(t.planUsage, { u: nf(ben.used), n: nf(ben.limit) })} · ${fmt(t.benLeft, { l: nf(ben.left), n: nf(ben.limit) })}` : fmt(t.benCount, { n: nf(n) })}
                </T>
              </View>
            </View>
          );
        })}
      </View>

      {msg ? <T style={{ color: m.accent, fontFamily: font.bold, fontSize: 13 }} accessibilityLiveRegion="polite">{msg}</T> : null}
      {higher ? (
        <T style={{ color: m.textSoft, fontSize: 13 }}>{t.planOnPlan}</T>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={cta} accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => { void subscribe(); }}
          style={({ pressed }) => [s.cta, { flexDirection: row, backgroundColor: ctaBg }, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.dark} /> : (
            <>
              <Ionicons name={live ? 'card-outline' : 'logo-whatsapp'} size={18} color={colors.dark} />
              <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.dark }}>{cta}</Text>
            </>
          )}
        </Pressable>
      )}
    </MetalCard>
  );
}

/** Both plan cards: side by side when there is room, otherwise a snapping carousel with dots. */
export function PlanCards({ member, cfg }: { member: Member | null; cfg: PublicConfig }) {
  const { rtl, row } = useI18n();
  const defs: Record<string, PlanDef> = { ...DEFAULT_PLANS, ...(cfg.plans ?? {}) };
  const codes = ORDER.filter((c) => defs[c]);
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);
  const fits = w >= codes.length * MIN_CARD + (codes.length - 1) * GAP;
  const cardW = codes.length > 1 ? Math.round(w * 0.88) : w;
  const step = cardW + GAP;
  // The app lays RTL out with row-reverse (not native RTL), so the carousel runs in reverse order and starts at the right.
  const list = rtl ? [...codes].reverse() : codes;
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(list.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
    setIdx(rtl ? list.length - 1 - i : i);
  };
  useEffect(() => {
    if (rtl && !fits && w) setTimeout(() => ref.current?.scrollToEnd({ animated: false }), 0);
  }, [rtl, fits, w]);

  return (
    <View onLayout={onLayout} style={{ gap: 10 }}>
      {w === 0 ? null : fits ? (
        <View style={{ flexDirection: row, gap: GAP }}>
          {codes.map((c) => <View key={c} style={{ flex: 1 }}><PlanCard code={c} def={defs[c]} cfg={cfg} member={member} /></View>)}
        </View>
      ) : (
        <>
          <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={step} snapToAlignment="start"
            onMomentumScrollEnd={onEnd} contentContainerStyle={{ gap: GAP, paddingEnd: codes.length > 1 ? w - cardW : 0 }}>
            {list.map((c) => <PlanCard key={c} code={c} def={defs[c]} cfg={cfg} member={member} width={cardW} />)}
          </ScrollView>
          {codes.length > 1 ? (
            <View style={{ flexDirection: row, justifyContent: 'center', gap: 6 }} accessible={false}>
              {codes.map((c, i) => <View key={c} style={[s.dot, i === idx && s.dotOn]} />)}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  activeBox: { alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.md, padding: 10 },
  cta: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 20, backgroundColor: colors.maroon },
});
