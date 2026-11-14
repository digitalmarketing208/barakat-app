import React, { memo, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line as SLine, Path, Rect, Text as SText } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { REVIEWS } from '../siteData';
import { BRANCHES } from '../branches';
import { useBranchStock } from '../erp/useBranchStock';
import { Bouncy } from './motion';
import { Fit, fitClass } from './fit';
import { SKey, useS } from './strings';
import { tint } from './tint';

/** Front view of a frame with the three printed measurements marked A / B / C. */
export function FrameDiagram({ width = 280 }: { width?: number }) {
  const mark = { stroke: colors.red, strokeWidth: 1.5 };
  const label = { fill: colors.red, fontFamily: font.black, fontSize: 13, textAnchor: 'middle' as const };
  return (
    <Svg width={width} height={(width * 124) / 300} viewBox="0 0 300 124" accessibilityLabel="frame diagram">
      <Rect x={40} y={34} width={90} height={56} rx={22} fill={tint.redSoft} stroke={colors.text} strokeWidth={3} />
      <Rect x={170} y={34} width={90} height={56} rx={22} fill={tint.redSoft} stroke={colors.text} strokeWidth={3} />
      <Path d="M130 54 Q150 38 170 54" fill="none" stroke={colors.text} strokeWidth={3} />
      <Path d="M40 48 L12 42 M260 48 L288 42" fill="none" stroke={colors.text} strokeWidth={3} strokeLinecap="round" />
      <SLine x1={40} y1={104} x2={130} y2={104} {...mark} /><SLine x1={40} y1={99} x2={40} y2={109} {...mark} /><SLine x1={130} y1={99} x2={130} y2={109} {...mark} />
      <SText x={85} y={121} {...label}>A</SText>
      <SLine x1={130} y1={22} x2={170} y2={22} {...mark} /><SLine x1={130} y1={17} x2={130} y2={27} {...mark} /><SLine x1={170} y1={17} x2={170} y2={27} {...mark} />
      <SText x={150} y={14} {...label}>B</SText>
      <SText x={280} y={30} {...label}>C</SText>
    </Svg>
  );
}

/** Store promo line and customer rating from product metafields. Renders nothing when neither exists. */
export const ProductNotes = memo(function ProductNotes({ promo, rating }: { promo?: string; rating?: { value: number; count: number } }) {
  const { row } = useI18n();
  const s = useS();
  if (!promo && !rating) return null;
  return (
    <View style={{ gap: 8 }}>
      {!!rating && (
        <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }} accessibilityLabel={`${s('ratingLabel')} ${rating.value}`}>
          <Ionicons name="star" size={16} color={colors.amber} />
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.text }}>{rating.value.toFixed(1)}</Text>
          {rating.count > 0 && <T style={{ color: colors.muted, fontSize: 12.5 }}>({rating.count})</T>}
        </View>
      )}
      {!!promo && (
        <View style={{ flexDirection: row, alignItems: 'center', gap: 8, backgroundColor: tint.redSoft, borderRadius: radius.md, padding: 10 }}>
          <Ionicons name="pricetag-outline" size={16} color={colors.red} />
          <T style={{ flex: 1, fontSize: 13, fontFamily: font.medium }}>{promo}</T>
        </View>
      )}
    </View>
  );
});

/** Frame measurements for this product. Renders nothing when the product carries no size data. */
export const FrameFit = memo(function FrameFit({ fit, onGuide }: { fit: Fit | null; onGuide: () => void }) {
  const { row, rtl } = useI18n();
  const s = useS();
  if (!fit) return null;
  const stats = ([['A', 'fitLens', fit.lens], ['B', 'fitBridge', fit.bridge], ['C', 'fitTemple', fit.temple], ['', 'fitWidth', fit.width], ['', 'fitHeight', fit.height]] as [string, SKey, number | undefined][])
    .filter((x): x is [string, SKey, number] => x[2] != null);
  const cls = fitClass(fit);
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[c.card, shadow]}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
        <Ionicons name="resize-outline" size={20} color={colors.red} />
        <T style={{ flex: 1, fontFamily: font.black, fontSize: 16 }}>{s('fitTitle')}</T>
        <Pressable onPress={onGuide} hitSlop={10} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: font.bold, color: colors.red, fontSize: 13 }}>{s('openGuide')}</Text>
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={14} color={colors.red} />
        </Pressable>
      </View>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {stats.map(([letter, key, val]) => (
          <View key={key} style={c.stat}>
            <T style={{ color: colors.muted, fontSize: 11.5, textAlign: 'center' }} numberOfLines={1}>{letter ? `${letter} · ` : ''}{s(key)}</T>
            <Text style={{ fontFamily: font.black, fontSize: 18, color: colors.text, textAlign: 'center' }}>{val}<Text style={{ fontFamily: font.medium, fontSize: 11, color: colors.muted }}> {s('mm')}</Text></Text>
          </View>
        ))}
      </View>
      {cls && (
        <View style={[c.verdict, { flexDirection: row }]}>
          <Ionicons name="happy-outline" size={18} color={colors.success} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold, fontSize: 13 }}>{s(cls)}</T>
            <T style={{ color: colors.muted, fontSize: 11.5 }}>{s('fitNote')}</T>
          </View>
        </View>
      )}
    </Animated.View>
  );
});

/** Body of the size-guide sheet. */
export function SizeGuide({ fit, onWebsite, onWhatsApp }: { fit: Fit | null; onWebsite: () => void; onWhatsApp: () => void }) {
  const { row } = useI18n();
  const s = useS();
  const cls = fit ? fitClass(fit) : null;
  const parts: [string, SKey, SKey, number | undefined][] = [['A', 'sg1', 'sg1b', fit?.lens], ['B', 'sg2', 'sg2b', fit?.bridge], ['C', 'sg3', 'sg3b', fit?.temple]];
  const sizes: [SKey, SKey, string][] = [['sgSmall', 'sgUnder', 'fitNarrow'], ['sgMed', 'sgMid', 'fitMedium'], ['sgLarge', 'sgOver', 'fitWide']];
  return (
    <>
      <T style={{ color: colors.muted, fontSize: 13.5 }}>{s('sgIntro')}</T>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}><FrameDiagram /></View>
      {parts.map(([letter, title, body, val]) => (
        <View key={letter} style={{ flexDirection: row, gap: 12, alignItems: 'flex-start' }}>
          <View style={c.letter}><Text style={{ fontFamily: font.black, color: colors.card }}>{letter}</Text></View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold }}>{s(title)}{val != null ? ` · ${val} ${s('mm')}` : ''}</T>
            <T style={{ color: colors.muted, fontSize: 13 }}>{s(body)}</T>
          </View>
        </View>
      ))}
      <View style={c.table}>
        <View style={[c.tr, { flexDirection: row, backgroundColor: colors.bg }]}>
          <T style={[c.td, { fontFamily: font.bold, fontSize: 12.5 }]}>{s('sgFaceCol')}</T>
          <T style={[c.td, { fontFamily: font.bold, fontSize: 12.5 }]}>{s('sgLensCol')}</T>
        </View>
        {sizes.map(([name, range, key]) => (
          <View key={name} style={[c.tr, { flexDirection: row }, cls === key && { backgroundColor: tint.successSoft }]}>
            <T style={[c.td, cls === key && { fontFamily: font.bold }]}>{s(name)}</T>
            <T style={[c.td, { color: colors.muted }, cls === key && { fontFamily: font.bold, color: colors.text }]}>{s(range)}</T>
          </View>
        ))}
      </View>
      <View style={[c.tip, { flexDirection: row }]}>
        <Ionicons name="bulb-outline" size={20} color={colors.maroon} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold, fontSize: 13 }}>{s('sgTipT')}</T>
          <T style={{ color: colors.muted, fontSize: 12.5 }}>{s('sgTip')}</T>
        </View>
      </View>
      <LinkRow icon="logo-whatsapp" label={s('sgHelp')} onPress={onWhatsApp} />
      <LinkRow icon="globe-outline" label={s('sgFull')} onPress={onWebsite} />
    </>
  );
}

export function LinkRow({ icon, label, onPress, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; sub?: string }) {
  const { row, rtl } = useI18n();
  return (
    <Bouncy onPress={onPress} scaleTo={0.98} style={[c.link, { flexDirection: row }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={colors.red} />
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold, fontSize: 14 }}>{label}</T>
        {!!sub && <T style={{ color: colors.muted, fontSize: 12 }}>{sub}</T>}
      </View>
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
    </Bouncy>
  );
}

/** Square quick action (try on, prescription, eye test, WhatsApp). Two sit side by side. */
export function ActionTile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Bouncy onPress={onPress} style={[c.tile, shadow]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={c.tileIcon}><Ionicons name={icon} size={20} color={colors.red} /></View>
      <T numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 13, textAlign: 'center' }}>{label}</T>
    </Bouncy>
  );
}

const etaDate = (lang: string) => {
  try {
    const d = new Date(Date.now() + 48 * 3600 * 1000);
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }).format(d);
  } catch { return null; }
};

/** Delivery promise (48 hours, as on the website) with the date it works out to. */
export function DeliveryCard() {
  const { t, row, lang } = useI18n();
  const s = useS();
  const by = useMemo(() => etaDate(lang), [lang]);
  return (
    <View style={[c.eta, { flexDirection: row }]}>
      <Ionicons name="rocket-outline" size={22} color={colors.red} />
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold, fontSize: 13.5 }}>{t('deliveryEta')}</T>
        {!!by && <T style={{ fontFamily: font.medium, fontSize: 12.5, color: colors.maroon }}>{s('etaBy', { d: by })}</T>}
        <T style={{ color: colors.muted, fontSize: 12 }}>{t('freeShipNote')}</T>
      </View>
    </View>
  );
}

const branchName = (id: string) => {
  const k = id.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return BRANCHES.find((b) => { const n = b.name.toLowerCase(); return n === k || n.includes(k) || k.includes(n); })?.name ?? id;
};

/** Branch pickup availability from the ERP gateway. Completely silent when the gateway is not configured. */
export function PickupCard({ handle, onBranches }: { handle: string; onBranches: () => void }) {
  const { row, rtl } = useI18n();
  const s = useS();
  const { data, enabled } = useBranchStock(handle);
  if (!enabled || !data) return null;
  const inStock = data.filter((b) => b.qty > 0);
  return (
    <View style={[c.card, shadow, { marginTop: 6 }]}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <Ionicons name="storefront-outline" size={20} color={inStock.length ? colors.success : colors.muted} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold, fontSize: 13.5 }}>{s('pickupTitle')}</T>
          <T style={{ color: inStock.length ? colors.success : colors.muted, fontSize: 12.5 }}>{inStock.length ? s('pickupIn', { n: inStock.length }) : s('pickupNone')}</T>
        </View>
        <Pressable onPress={onBranches} hitSlop={10} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: font.bold, color: colors.red, fontSize: 13 }}>{s('pickupSee')}</Text>
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={14} color={colors.red} />
        </Pressable>
      </View>
      {inStock.length > 0 && (
        <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
          {inStock.slice(0, 6).map((b) => (
            <View key={b.branchId} style={c.branch}><T style={{ fontSize: 12, fontFamily: font.medium }}>{branchName(b.branchId)}</T></View>
          ))}
          {inStock.length > 6 && <View style={c.branch}><T style={{ fontSize: 12, fontFamily: font.medium }}>+{inStock.length - 6}</T></View>}
        </View>
      )}
    </View>
  );
}

/** Customer Google reviews (verbatim, from the website). `seed` rotates which ones lead on each product. */
export const Reviews = memo(function Reviews({ seed }: { seed: string }) {
  const { t, row, rtl } = useI18n();
  const s = useS();
  const { width } = useWindowDimensions();
  const cardW = Math.min(320, width * 0.78);
  const list = useMemo(() => {
    let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const start = h % REVIEWS.length;
    return [...REVIEWS.slice(start), ...REVIEWS.slice(0, start)].slice(0, 8);
  }, [seed]);
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 12, gap: 2 }}>
        <T style={{ fontFamily: font.black, fontSize: 20 }}>{t('reviewsTitle')}</T>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
          <Ionicons name="logo-google" size={14} color={colors.muted} />
          <T style={{ color: colors.muted, fontSize: 12.5 }}>{s('verified')}</T>
        </View>
      </View>
      <FlatList horizontal inverted={rtl} data={list} keyExtractor={(r) => r.name} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }} snapToInterval={cardW + 12} decelerationRate="fast"
        renderItem={({ item }) => (
          <View style={[c.review, shadow, { width: cardW }]}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 2 }}>
              {[0, 1, 2, 3, 4].map((k) => <Ionicons key={k} name="star" size={15} color={colors.amber} />)}
              <View style={{ flex: 1 }} />
              <T style={{ color: colors.muted, fontSize: 11 }}>{s('googleReview')}</T>
            </View>
            {/* Review text is Arabic as written by the customer, so it always reads right-to-left. */}
            <Text numberOfLines={5} style={c.reviewText}>{item.text}</Text>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
              <View style={c.avatar}><Text style={{ fontFamily: font.black, color: colors.maroon }}>{item.name.trim().charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <T numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 13 }}>{item.name}</T>
                <T numberOfLines={1} style={{ color: colors.muted, fontSize: 11.5 }}>{item.where}</T>
              </View>
            </View>
          </View>
        )} />
    </View>
  );
});

const c = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 12, marginTop: 8 },
  stat: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  verdict: { backgroundColor: tint.successSoft, borderRadius: radius.sm, padding: 10, alignItems: 'center', gap: 10 },
  letter: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden' },
  tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  td: { flex: 1, paddingVertical: 9, paddingHorizontal: 12, fontSize: 13 },
  tip: { backgroundColor: tint.amberSoft, borderRadius: radius.sm, padding: 12, gap: 10, alignItems: 'flex-start' },
  link: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 14, alignItems: 'center', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: tint.redSoft, alignItems: 'center', justifyContent: 'center' },
  eta: { backgroundColor: tint.redSoft, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 12, marginTop: 6 },
  branch: { backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  review: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 10 },
  reviewText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 21, color: colors.text, textAlign: 'right', writingDirection: 'rtl', minHeight: 63 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
});
