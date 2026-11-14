import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Linking, Pressable, StyleSheet, Text, View, ViewToken } from 'react-native';
import Animated, {
  Easing, SharedValue, cancelAnimation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { colors, font, radius, shadow } from './theme';
import { useI18n } from './i18n';
import { T } from './ui';
import { BRANDS, EYE_TEST_BACKDROP, EYE_TEST_BANNER, FOOTER_LINKS, GAMER_BACKDROP, Go, HERO, HERO_RATIO, HeroKey, REVIEWS, SOCIAL, STRAP, TILES } from './siteData';
import { Located } from './useNearest';
import { fmt12, hoursFor, isOpen, ksaNow } from './branches';
import { callBranch, directions } from './links';
import { PressableScale, Shimmer, haptic } from './discovery/motion';
import { BannerCopy, NativeBanner } from './discovery/Promos';
import { useDir } from './discovery/dir';
import { DKey, useD } from './discovery/strings';
import { alpha, white } from './discovery/tint';
import { activeOffers, useOfferNow } from './offers';

const W = Dimensions.get('window').width;
const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));

export const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={{ paddingHorizontal: 20, marginTop: 28, marginBottom: 12 }}>
    <T style={{ fontFamily: font.black, fontSize: 21 }} accessibilityRole="header">{title}</T>
    {!!sub && <T style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{sub}</T>}
  </View>
);

// Rotating promo strap, same texts as the website's top bar.
export function Strap() {
  const { lang } = useI18n();
  const { row } = useDir();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const a = useSharedValue(1);
  const now = useOfferNow();
  // Live strap offers first; each disappears at its end time (trusted clock), the fixed texts stay.
  const list = [...activeOffers(now, ['strap']).map((o) => (lang === 'ar' ? o.titleAr : o.titleEn)).filter(Boolean), ...STRAP[lang]];
  useEffect(() => {
    const id = setInterval(() => {
      a.set(withTiming(0, { duration: 220 }));
      setTimeout(() => { setI((n) => (n + 1) % list.length); a.set(withTiming(1, { duration: 260 })); }, reduce ? 0 : 230);
    }, 3600);
    return () => clearInterval(id);
  }, [a, list.length, reduce]);
  const st = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ translateY: (1 - a.value) * 6 }] }));
  return (
    <View style={{ backgroundColor: colors.red, paddingVertical: 8, alignItems: 'center', flexDirection: row, justifyContent: 'center', gap: 8 }}>
      <Ionicons name="sparkles" size={14} color={white} />
      <Animated.Text style={[{ color: white, fontFamily: font.bold, fontSize: 13 }, st]}>{list[i % list.length]}</Animated.Text>
    </View>
  );
}

// ---- Hero carousel -------------------------------------------------------------------------------

const AUTO = 5200;     // time each slide stays before auto-advancing
const RESUME = 2600;   // auto-play restarts this long after the finger lifts
const GAP = 12;
const VIEW_CFG = { itemVisiblePercentThreshold: 60 };
const HERO_COPY: Record<HeroKey, { keys: [DKey, DKey, DKey, DKey]; icon: keyof typeof Ionicons.glyphMap; tone: 'brand' | 'gamer' }> = {
  new: { keys: ['heroNewEyebrow', 'heroNewTitle', 'heroNewSub', 'shopNow'], icon: 'sparkles', tone: 'brand' },
  eye: { keys: ['eyeEyebrow', 'eyeTitle', 'eyeSub', 'bookNow'], icon: 'eye-outline', tone: 'brand' },
  gamer: { keys: ['gamerEyebrow', 'gamerTitle', 'gamerSub', 'gamerCta'], icon: 'game-controller-outline', tone: 'gamer' },
};
const useCopy = () => {
  const d = useD();
  return (k: [DKey, DKey, DKey, DKey]): BannerCopy => ({ eyebrow: d(k[0]), title: d(k[1]), sub: d(k[2]), cta: d(k[3]) });
};

type HeroItem = (typeof HERO)[number] & { offer?: boolean };
type SlideProps = { item: HeroItem; index: number; x: SharedValue<number>; y?: SharedValue<number>; bw: number; h: number; sign: number; onGo: (g: Go) => void };

const Slide = React.memo(function Slide({ item, index, x, y, bw, h, sign, onGo }: SlideProps) {
  const { lang } = useI18n();
  const copy = useCopy();
  const src = item.img[lang];
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // No artwork for this language (or it failed to load): draw the banner natively with translated text.
  const native = !item.offer && (!src || failed);
  // Artwork carries text near its edges, so it only drifts a little; text-free photos can move more.
  const px = native ? 26 : 8, py = native ? 22 : 8;
  const step = bw + GAP;
  const layer = useAnimatedStyle(() => ({
    transform: [
      { translateX: sign * interpolate(x.value, [(index - 1) * step, index * step, (index + 1) * step], [-px, 0, px], 'clamp') },
      { translateY: y ? interpolate(y.value, [0, 320], [0, py], 'clamp') : 0 },
    ],
  }));
  const card = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(x.value, [(index - 1) * step, index * step, (index + 1) * step], [0.95, 1, 0.95], 'clamp') }],
  }));
  const meta = HERO_COPY[item.key] ?? HERO_COPY.new;
  const c = item.offer ? { eyebrow: '', title: item.go.title ?? '', sub: '', cta: '' } : copy(meta.keys);
  const box = { position: 'absolute' as const, left: -px, right: -px, top: -py, bottom: 0 };
  return (
    <Animated.View style={[{ width: bw, height: h }, card]}>
      <PressableScale to={0.98} onPress={() => { haptic.tap(); onGo(item.go); }} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.sub}`}
        style={[{ flex: 1, borderRadius: radius.lg, backgroundColor: colors.dark }, shadow]}>
        <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden' }}>
          {native ? (
            <NativeBanner copy={c} icon={meta.icon} tone={meta.tone} style={StyleSheet.absoluteFill}>
              <Animated.View style={[box, layer]}>
                <Image source={item.backdrop} style={{ flex: 1 }} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" transition={250} />
              </Animated.View>
            </NativeBanner>
          ) : (
            <>
              {!loaded && <Shimmer style={[StyleSheet.absoluteFill, { borderRadius: 0 }]} />}
              <Animated.View style={[box, layer]}>
                <Image source={src} style={{ flex: 1 }} contentFit="cover" cachePolicy="memory-disk" priority={index === 0 ? 'high' : 'normal'} transition={250}
                  onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
              </Animated.View>
            </>
          )}
        </View>
      </PressableScale>
    </Animated.View>
  );
});

function Dot({ on, p }: { on: boolean; p: SharedValue<number> }) {
  const { alignStart } = useDir();
  const w = useSharedValue(on ? 26 : 7);
  useEffect(() => { w.set(withTiming(on ? 26 : 7, { duration: 240 })); }, [on, w]);
  const box = useAnimatedStyle(() => ({ width: w.value }));
  const fill = useAnimatedStyle(() => ({ width: `${(on ? p.value : 0) * 100}%` }));
  return (
    <Animated.View style={[s.dotBox, box, { alignItems: alignStart, backgroundColor: on ? alpha(colors.red, 0.25) : colors.line }]}>
      {on && <Animated.View style={[s.dotFill, fill]} />}
    </Animated.View>
  );
}

/**
 * Home hero: language-specific banners with a parallax drift, auto-play that pauses while touched
 * (and when the tab is not focused or the user prefers reduced motion), and progress dots.
 */
export function HeroCarousel({ onGo, scrollY }: { onGo: (g: Go) => void; scrollY?: SharedValue<number> }) {
  const { row, flip, lang } = useDir();
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [idx, setIdx] = useState(0);
  const [held, setHeld] = useState(false);
  const ref = useRef<FlatList<HeroItem>>(null);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);
  const x = useSharedValue(0);
  const p = useSharedValue(reduce ? 1 : 0);
  const bw = W - 40, h = Math.round(bw / HERO_RATIO), step = bw + GAP;
  const now = useOfferNow();
  // Banner offers (with an image) join the carousel only while live per the trusted clock.
  const slides = useMemo<HeroItem[]>(() => [
    ...activeOffers(now, ['banner']).filter((o) => o.bannerImage).map((o) => ({
      key: o.id as HeroKey, img: { ar: o.bannerImage!, en: o.bannerImage! }, backdrop: o.bannerImage!,
      go: { collection: o.link?.collection, title: lang === 'ar' ? o.titleAr : o.titleEn } as Go, offer: true,
    })),
    ...HERO,
  ], [now, lang]);
  const n = slides.length;
  const playing = !held && focused && !reduce && n > 1;

  useEffect(() => {
    if (!playing) { cancelAnimation(p); if (reduce) p.set(1); return; }
    p.set(0);
    p.set(withTiming(1, { duration: AUTO, easing: Easing.linear }));
    const id = setTimeout(() => {
      const m = (idx + 1) % n;
      ref.current?.scrollToIndex({ index: m, animated: true });
      setIdx(m);
    }, AUTO);
    return () => clearTimeout(id);
  }, [playing, idx, n, p, reduce]);
  useEffect(() => () => { if (resume.current) clearTimeout(resume.current); }, []);

  const hold = () => { if (resume.current) clearTimeout(resume.current); setHeld(true); };
  const release = () => {
    if (resume.current) clearTimeout(resume.current);
    resume.current = setTimeout(() => setHeld(false), RESUME);
  };
  const onScroll = useAnimatedScrollHandler((e) => { x.value = e.contentOffset.x; });
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (i != null) setIdx(i);
  }, []);
  const renderItem = useCallback(({ item, index }: { item: HeroItem; index: number }) => (
    <Slide item={item} index={index} x={x} y={scrollY} bw={bw} h={h} sign={flip ? -1 : 1} onGo={onGo} />
  ), [x, scrollY, bw, h, flip, onGo]);

  return (
    <View style={{ marginTop: 16 }} onTouchStart={hold} onTouchEnd={release} onTouchCancel={release}>
      <Animated.FlatList
        ref={ref} data={slides} keyExtractor={(it) => `${it.key}-${lang}`} renderItem={renderItem}
        horizontal inverted={flip} showsHorizontalScrollIndicator={false}
        snapToInterval={step} decelerationRate="fast" disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}
        getItemLayout={(_d, i) => ({ length: step, offset: step * i, index: i })}
        onScroll={onScroll} scrollEventThrottle={16}
        onScrollBeginDrag={hold} onMomentumScrollEnd={release}
        onViewableItemsChanged={onViewable} viewabilityConfig={VIEW_CFG}
        initialNumToRender={2}
      />
      <View style={{ flexDirection: row, justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {slides.map((it, k) => <Dot key={it.key} on={k === idx} p={p} />)}
      </View>
    </View>
  );
}

export function CategoryTiles({ onGo }: { onGo: (g: Go) => void }) {
  const { t } = useI18n();
  const { row, arrow } = useDir();
  const tw = (W - 40 - 12) / 2;
  return (
    <View>
      <SectionTitle title={t('yourWay')} />
      <View style={{ flexDirection: row, flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 }}>
        {TILES.map((x, k) => {
          const label = t(x.key);
          const wide = k === 0;
          return (
            <PressableScale key={x.key} haptics onPress={() => onGo({ ...x.go, title: label })} accessibilityRole="button" accessibilityLabel={label}
              style={[{ width: wide ? W - 40 : tw, height: wide ? 170 : 190, borderRadius: radius.lg, backgroundColor: colors.dark }, shadow]}>
              <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden' }}>
                <Image source={x.img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                <View style={s.tileShade} />
                <View style={{ position: 'absolute', bottom: 12, left: 14, right: 14, flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: white, fontFamily: font.black, fontSize: 16 }}>{label}</Text>
                  <View style={s.tileArrow}><Ionicons name={arrow} size={14} color={colors.red} /></View>
                </View>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

export function Promises() {
  const { t } = useI18n();
  const { row } = useDir();
  const items: { icon: keyof typeof Ionicons.glyphMap; a: any; b: any }[] = [
    { icon: 'ribbon-outline', a: 'p1', b: 'p1s' }, { icon: 'rocket-outline', a: 'p2', b: 'p2s' },
    { icon: 'lock-closed-outline', a: 'p3', b: 'p3s' }, { icon: 'headset-outline', a: 'p4', b: 'p4s' },
  ];
  return (
    <View>
      <SectionTitle title={t('promisesTitle')} />
      <View style={{ flexDirection: row, flexWrap: 'wrap', paddingHorizontal: 14 }}>
        {items.map((p) => (
          <View key={p.a} style={{ width: '50%', padding: 6 }}>
            <View style={[s.promise, shadow]}>
              <View style={s.promiseIcon}><Ionicons name={p.icon} size={22} color={colors.red} /></View>
              <T style={{ fontFamily: font.bold, fontSize: 13, textAlign: 'center' }}>{t(p.a)}</T>
              <T style={{ color: colors.muted, fontSize: 11.5, textAlign: 'center' }}>{t(p.b)}</T>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function RailHeading({ title, sub, onAll }: { title: string; sub?: string; onAll?: () => void }) {
  const { t } = useI18n();
  const { row, fwd } = useDir();
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: 28, marginBottom: 12, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.black, fontSize: 20 }} accessibilityRole="header">{title}</T>
        {!!sub && <T style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{sub}</T>}
      </View>
      {onAll && (
        <Pressable onPress={() => { haptic.tap(); onAll(); }} hitSlop={10} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 2, paddingBottom: 4 }}>
          <Text style={{ fontFamily: font.bold, color: colors.red }}>{t('viewAll')}</Text>
          <Ionicons name={fwd} size={16} color={colors.red} />
        </Pressable>
      )}
    </View>
  );
}

/** Free eye test promo. Uses the website artwork when it exists in the active language, else a native banner. */
export function EyeTestBanner(p: { onPress: () => void; nearest?: string }) {
  const { lang } = useI18n();
  // Remount per language so the artwork's load / fail state starts clean.
  return <EyeTestArt key={lang} {...p} />;
}
function EyeTestArt({ onPress, nearest }: { onPress: () => void; nearest?: string }) {
  const { lang } = useI18n();
  const d = useD();
  const copy = useCopy();
  const src = EYE_TEST_BANNER[lang];
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const c = copy(HERO_COPY.eye.keys);
  const bw = W - 40;
  return (
    <PressableScale to={0.98} haptics onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.sub}`}
      style={[{ marginHorizontal: 20, marginTop: 28, borderRadius: radius.lg, backgroundColor: colors.dark }, shadow]}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        {src && !failed ? (
          <View style={{ width: bw, height: Math.round(bw / HERO_RATIO) }}>
            {!loaded && <Shimmer style={[StyleSheet.absoluteFill, { borderRadius: 0 }]} />}
            <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250}
              onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
          </View>
        ) : (
          <NativeBanner copy={c} icon="eye-outline" backdrop={EYE_TEST_BACKDROP} note={nearest ? d('eyeNearest', { x: nearest }) : undefined} style={{ width: bw, height: 230 }} />
        )}
      </View>
    </PressableScale>
  );
}

/** Gamer Vision promo: dark card with the amber (orange-lens) accent, text drawn natively in both languages. */
export function GamerPromo({ onPress }: { onPress: () => void }) {
  const copy = useCopy();
  const c = copy(HERO_COPY.gamer.keys);
  return (
    <PressableScale to={0.98} haptics onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.sub}`}
      style={[{ marginHorizontal: 20, marginTop: 28, borderRadius: radius.lg, backgroundColor: colors.dark }, shadow]}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        <NativeBanner copy={c} icon="game-controller-outline" tone="gamer" backdrop={GAMER_BACKDROP} style={{ height: 230 }} />
      </View>
    </PressableScale>
  );
}

export function Brands({ onBrand }: { onBrand: (handle: string, name: string) => void }) {
  const { t } = useI18n();
  const { flip } = useDir();
  return (
    <View>
      <SectionTitle title={t('brandsTitle')} />
      <FlatList horizontal inverted={flip} data={BRANDS} keyExtractor={(b) => b.handle} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 8 }} initialNumToRender={5} windowSize={5}
        renderItem={({ item }) => (
          <PressableScale haptics onPress={() => onBrand(item.handle, item.name)} accessibilityRole="button" accessibilityLabel={item.name} style={[s.brand, shadow]}>
            <Image source={item.img} style={{ width: 84, height: 48 }} contentFit="contain" cachePolicy="memory-disk" transition={150} />
          </PressableScale>
        )} />
    </View>
  );
}

export function Reviews() {
  const { t } = useI18n();
  const { row, flip } = useDir();
  return (
    <View>
      <SectionTitle title={t('reviewsTitle')} />
      <FlatList horizontal inverted={flip} data={REVIEWS} keyExtractor={(r) => r.name} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 6 }} snapToInterval={W * 0.78 + 12} decelerationRate="fast"
        renderItem={({ item }) => (
          <View style={[s.review, shadow, { width: W * 0.78 }]}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 2, marginBottom: 8 }}>
              {[0, 1, 2, 3, 4].map((k) => <Ionicons key={k} name="star" size={15} color={colors.amber} />)}
              <View style={{ flex: 1 }} />
              <Ionicons name="logo-google" size={16} color={colors.muted} />
            </View>
            <T style={{ fontSize: 13.5, flex: 1 }} numberOfLines={5}>{item.text}</T>
            <T style={{ fontFamily: font.bold, fontSize: 13, marginTop: 10 }} numberOfLines={1}>{item.name}</T>
            <T style={{ color: colors.muted, fontSize: 11.5 }} numberOfLines={1}>{item.where}</T>
          </View>
        )} />
    </View>
  );
}

export function BranchesRail({ list, onAll }: { list: Located[]; onAll: () => void }) {
  const { t, rtl } = useI18n();
  const { row, flip } = useDir();
  return (
    <View>
      <RailHeading title={t('ourBranches')} onAll={onAll} />
      <FlatList horizontal inverted={flip} data={list} keyExtractor={(b) => b.name} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 6 }} initialNumToRender={4}
        renderItem={({ item: b, index }) => {
          const [o, c] = hoursFor(b, ksaNow().day).split('-');
          return (
            <View style={[s.branch, shadow]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
                <Ionicons name="location" size={16} color={colors.red} />
                {index === 0 && b.km != null && <Text style={{ fontFamily: font.bold, fontSize: 11, color: colors.red }}>{t('nearest')} · {b.km.toFixed(1)} {t('km')}</Text>}
              </View>
              <T style={{ fontFamily: font.black, fontSize: 15, marginTop: 4 }} numberOfLines={1}>{b.name}</T>
              <T style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{b.addr}</T>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 6, marginTop: 6 }}>
                <View style={[s.dot, { backgroundColor: isOpen(b) ? colors.success : colors.muted }]} />
                <T style={{ fontSize: 11.5 }}>{isOpen(b) ? t('openNow') : t('closed')} · {fmt12(o, rtl)} – {fmt12(c, rtl)}</T>
              </View>
              <View style={{ flexDirection: row, gap: 8, marginTop: 10 }}>
                <Pressable style={s.mini} onPress={() => callBranch(b)} accessibilityRole="button" accessibilityLabel={t('call')}><Ionicons name="call" size={14} color={white} /></Pressable>
                <Pressable style={[s.mini, { backgroundColor: colors.maroon }]} onPress={() => directions(b)} accessibilityRole="button" accessibilityLabel={t('directions')}><Ionicons name="navigate" size={14} color={white} /></Pressable>
              </View>
            </View>
          );
        }} />
    </View>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  const { row } = useDir();
  return (
    <View style={{ marginTop: 34, backgroundColor: colors.dark, paddingTop: 26, paddingBottom: 40, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {FOOTER_LINKS.map((l) => (
          <Pressable key={l.k} onPress={() => open(l.url)} accessibilityRole="link" style={s.fLink}>
            <Text style={{ color: colors.beige, fontFamily: font.medium, fontSize: 12.5 }}>{t(l.k)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: row, gap: 12, marginTop: 20, justifyContent: 'center' }}>
        {SOCIAL.map((x) => (
          <Pressable key={x.icon} onPress={() => Linking.openURL(x.url)} accessibilityRole="link" accessibilityLabel={x.icon} style={s.soc}>
            <Ionicons name={x.icon} size={18} color={white} />
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.beige, opacity: 0.7, textAlign: 'center', fontFamily: font.regular, fontSize: 11.5, marginTop: 18 }}>© 2026 Barakat Optical · barakatoptical.com.sa</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tileShade: { ...(StyleSheet.absoluteFill as object), backgroundColor: alpha(colors.dark, 0.3) },
  tileArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  promise: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 4, minHeight: 118 },
  promiseIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: alpha(colors.red, 0.09), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brand: { width: 108, height: 72, borderRadius: radius.md, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  review: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, minHeight: 170 },
  branch: { width: 236, backgroundColor: colors.card, borderRadius: radius.md, padding: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotBox: { height: 7, borderRadius: 4, overflow: 'hidden' },
  dotFill: { height: 7, borderRadius: 4, backgroundColor: colors.red },
  mini: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  fLink: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: alpha(colors.beige, 0.28) },
  soc: { width: 38, height: 38, borderRadius: 19, backgroundColor: alpha(colors.card, 0.12), alignItems: 'center', justifyContent: 'center' },
});
