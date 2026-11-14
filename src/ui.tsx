import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius, shadow } from './theme';
import { useI18n } from './i18n';
import { Product, money, sized } from './shopify';
import { useStore } from './store';
import { PressableScale, Shimmer, haptic } from './discovery/motion';
import { useDir } from './discovery/dir';
import { alpha, white } from './discovery/tint';
import { displayPrice, offerForProduct, useOfferNow } from './offers';

export const T = ({ style, children, ...p }: React.ComponentProps<typeof Text>) => {
  const { align, rtl } = useI18n();
  const fs = (StyleSheet.flatten(style) as TextStyle | undefined)?.fontSize ?? 14;
  // Tajawal has tall ascenders: give every text an explicit line height so Arabic/English never clip
  return <Text {...p} style={[{ fontFamily: font.regular, color: colors.text, textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr', fontSize: fs, lineHeight: Math.round(fs * 1.5) }, style]}>{children}</Text>;
};

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, style }: {
  title: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'ghost' | 'dark';
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { row } = useDir();
  const bg = variant === 'primary' ? colors.red : variant === 'dark' ? colors.maroon : 'transparent';
  const fg = variant === 'ghost' ? colors.red : white;
  return (
    <PressableScale
      onPress={onPress} disabled={disabled || loading} to={0.97}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1, flexDirection: row },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: colors.red }, style]}
      accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}>
      {loading ? <ActivityIndicator color={fg} /> : (<>
        {icon && <Ionicons name={icon} size={20} color={fg} />}
        <Text style={{ color: fg, fontFamily: font.bold, fontSize: 16 }}>{title}</Text>
      </>)}
    </PressableScale>
  );
}

export function Chip({ label, active, onPress, icon, onRemove }: {
  label: string; active?: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap;
  /** Shows a close mark: the chip represents an applied filter that a tap removes. */
  onRemove?: boolean;
}) {
  const { row } = useDir();
  const fg = active ? white : colors.text;
  return (
    <PressableScale onPress={onPress} to={0.94} haptics accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label}
      style={[styles.chip, { flexDirection: row }, active && { backgroundColor: colors.red, borderColor: colors.red }]}>
      {icon && <Ionicons name={icon} size={15} color={fg} />}
      <Text style={{ fontFamily: font.medium, color: fg, fontSize: 14 }}>{label}</Text>
      {onRemove && <Ionicons name="close" size={15} color={fg} />}
    </PressableScale>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { row, fwd } = useDir();
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 26, marginBottom: 12 }}>
      <T style={{ fontFamily: font.black, fontSize: 20 }}>{title}</T>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={{ flexDirection: row, alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: font.bold, color: colors.red }}>{action}</Text>
          <Ionicons name={fwd} size={16} color={colors.red} />
        </Pressable>
      )}
    </View>
  );
}

/** Shimmer placeholder block (kept under its old name so every screen gets the new shimmer). */
export const Skeleton = Shimmer;

/** Placeholder with the exact footprint of ProductCard, so lists do not jump when data arrives. */
export function ProductCardSkeleton({ width }: { width?: number }) {
  return (
    <View style={[styles.card, width ? { width } : { flex: 1 }]}>
      <Shimmer style={{ height: 150, margin: 8, marginBottom: 0, borderRadius: radius.sm }} />
      <View style={{ padding: 12, gap: 8 }}>
        <Shimmer style={{ height: 12, borderRadius: 6 }} />
        <Shimmer style={{ height: 12, width: '60%', borderRadius: 6 }} />
        <Shimmer style={{ height: 16, width: '45%', borderRadius: 8, marginTop: 4 }} />
      </View>
    </View>
  );
}

export function ProductRowSkeleton() {
  const { row } = useDir();
  return (
    <View style={[styles.rowCard, { flexDirection: row }]}>
      <Shimmer style={{ width: 104, height: 104, borderRadius: radius.sm }} />
      <View style={{ flex: 1, gap: 9, justifyContent: 'center' }}>
        <Shimmer style={{ height: 10, width: '30%', borderRadius: 5 }} />
        <Shimmer style={{ height: 12, borderRadius: 6 }} />
        <Shimmer style={{ height: 12, width: '70%', borderRadius: 6 }} />
        <Shimmer style={{ height: 16, width: '40%', borderRadius: 8 }} />
      </View>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 14 }}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.muted} />
      <T style={{ textAlign: 'center', color: colors.muted }}>{message}</T>
      {onRetry && <Button title={t('retry')} onPress={onRetry} variant="ghost" />}
    </View>
  );
}

export function Empty({ icon, text, sub }: { icon: keyof typeof Ionicons.glyphMap; text: string; sub?: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={40} color={colors.muted} /></View>
      <T style={{ color: colors.text, textAlign: 'center', fontFamily: font.bold, fontSize: 16 }}>{text}</T>
      {!!sub && <T style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>{sub}</T>}
    </View>
  );
}

export const Price = ({ p, size = 16 }: { p: Product; size?: number }) => {
  const { t } = useI18n();
  const { row } = useDir();
  const d = displayPrice(p, useOfferNow());
  const min = d.price, max = p.priceRange.maxVariantPrice;
  const was = d.compareAt;
  const onSale = !!was;
  return (
    <View style={{ flexDirection: row, alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      {!d.differsFromShopify && min.amount !== max.amount && <Text style={{ fontFamily: font.regular, fontSize: size - 3, color: colors.muted }}>{t('from')}</Text>}
      <Text style={{ fontFamily: font.black, fontSize: size, color: colors.red }}>{money(min)} {t('sar')}</Text>
      {onSale && <Text style={{ fontFamily: font.regular, fontSize: size - 3, color: colors.muted, textDecorationLine: 'line-through' }}>{money(was!)}</Text>}
    </View>
  );
};

/** Badge for a card: percent while a sale is live, else a live 1+1 badge. Re-renders itself at offer start/end. */
const useSaleBadge = (p: Product): string | null => {
  const { rtl, lang } = useI18n();
  const now = useOfferNow();
  const pct = displayPrice(p, now).pct;
  if (pct > 0) return rtl ? `‏${pct}%-` : `-${pct}%`;
  const b = offerForProduct(p, now, {}, ['bogo']);
  return (b && (lang === 'ar' ? b.badgeAr : b.badgeEn)) || null;
};

// Wishlist heart with a little pop when toggled.
function Heart({ handle, style }: { handle: string; style?: StyleProp<ViewStyle> }) {
  const { isWished, toggleWish } = useStore();
  const { t } = useI18n();
  const wished = isWished(handle);
  const v = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  return (
    <Pressable
      onPress={() => { v.set(withSequence(withTiming(0.7, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 320 }))); toggleWish(handle); }}
      hitSlop={10} style={[styles.heart, style]} accessibilityRole="button" accessibilityLabel={t('wishlist')} accessibilityState={{ selected: wished }}>
      <Animated.View style={st}><Ionicons name={wished ? 'heart' : 'heart-outline'} size={18} color={wished ? colors.red : colors.muted} /></Animated.View>
    </Pressable>
  );
}

type CardProps = {
  p: Product; width?: number;
  onPress?: () => void;
  /** Stable alternative to onPress for long lists (lets the memoised card skip re-renders). */
  onOpen?: (handle: string) => void;
};

export const ProductCard = memo(function ProductCard({ p, onPress, onOpen, width }: CardProps) {
  const { t } = useI18n();
  const { start, end } = useDir();
  const badge = useSaleBadge(p);
  return (
    <PressableScale onPress={() => { haptic.tap(); if (onOpen) onOpen(p.handle); else onPress?.(); }}
      style={[styles.card, shadow, width ? { width } : { flex: 1 }]} accessibilityRole="button" accessibilityLabel={p.title}>
      <View style={styles.cardImg}>
        {!!p.featuredImage?.url && <Image source={sized(p.featuredImage.url, 480)} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} cachePolicy="memory-disk" recyclingKey={p.id} />}
        {!p.availableForSale && (
          <View style={[styles.soldTag, start(6)]}><Text style={{ color: white, fontFamily: font.bold, fontSize: 11 }}>{t('soldOut')}</Text></View>
        )}
        {!!badge && <View style={[styles.saleTag, start(8)]}><Text style={{ color: white, fontFamily: font.black, fontSize: 11 }}>{badge}</Text></View>}
        <Heart handle={p.handle} style={end(8)} />
      </View>
      <View style={{ padding: 12, gap: 4 }}>
        {!!p.vendor && <T numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 10.5, color: colors.muted, letterSpacing: 0.4 }}>{p.vendor.toUpperCase()}</T>}
        <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 13, minHeight: 34 }}>{p.title}</T>
        <Price p={p} size={15} />
      </View>
    </PressableScale>
  );
});

/** Full-width list row: bigger text, brand and stock at a glance. */
export const ProductRow = memo(function ProductRow({ p, onOpen }: { p: Product; onOpen: (handle: string) => void }) {
  const { t } = useI18n();
  const { row, start, end } = useDir();
  const badge = useSaleBadge(p);
  return (
    <PressableScale onPress={() => { haptic.tap(); onOpen(p.handle); }} to={0.98}
      style={[styles.rowCard, shadow, { flexDirection: row }]} accessibilityRole="button" accessibilityLabel={p.title}>
      <View style={styles.rowImg}>
        {!!p.featuredImage?.url && <Image source={sized(p.featuredImage.url, 320)} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} cachePolicy="memory-disk" recyclingKey={p.id} />}
        {!!badge && <View style={[styles.saleTag, { top: 4 }, start(4)]}><Text style={{ color: white, fontFamily: font.black, fontSize: 11 }}>{badge}</Text></View>}
      </View>
      <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
        {!!p.vendor && <T numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 11, color: colors.muted, letterSpacing: 0.4 }}>{p.vendor.toUpperCase()}</T>}
        <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 14.5 }}>{p.title}</T>
        <Price p={p} size={16} />
        <View style={{ flexDirection: row, alignItems: 'center', gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.availableForSale ? colors.success : colors.muted }} />
          <T style={{ fontSize: 11.5, color: colors.muted }}>{p.availableForSale ? t('inStock') : t('soldOut')}</T>
        </View>
      </View>
      <Heart handle={p.handle} style={[{ top: 10 }, end(10)]} />
    </PressableScale>
  );
});

export function Hero({ title, sub, onPress, icon }: { title: string; sub: string; onPress: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  const { row } = useDir();
  return (
    <PressableScale onPress={onPress} to={0.98} haptics accessibilityRole="button" accessibilityLabel={title} style={[{ marginHorizontal: 20, borderRadius: radius.lg, overflow: 'hidden' }, shadow]}>
      <LinearGradient colors={[colors.red, colors.maroon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, flexDirection: row, alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <T style={{ color: white, fontFamily: font.black, fontSize: 19 }}>{title}</T>
          <T style={{ color: alpha(colors.card, 0.86), fontSize: 13, marginTop: 4 }}>{sub}</T>
        </View>
        <View style={styles.heroIcon}><Ionicons name={icon} size={30} color={colors.amber} /></View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  chip: { paddingHorizontal: 16, height: 38, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius.md },
  cardImg: { height: 150, backgroundColor: colors.card, margin: 8, marginBottom: 0, borderRadius: radius.sm, overflow: 'hidden' },
  rowCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: 10, gap: 12, marginHorizontal: 16 },
  rowImg: { width: 104, height: 104, borderRadius: radius.sm, backgroundColor: colors.card, overflow: 'hidden' },
  heart: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  saleTag: { position: 'absolute', top: 8, minWidth: 40, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  soldTag: { position: 'absolute', bottom: 6, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 6 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: alpha(colors.card, 0.14), alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: alpha(colors.muted, 0.1), alignItems: 'center', justifyContent: 'center' },
});
