import React, { memo, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, ZoomIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Price, T } from '../ui';
import { Product, sized } from '../shopify';
import { CONTACT } from '../config';
import { Bouncy } from './motion';
import { useS } from './strings';
import { tint } from './tint';

/** Swipe a row sideways (either direction) to remove it. The row flies out, then `onRemove` runs. */
export function SwipeRow({ children, onRemove, disabled, label }: { children: React.ReactNode; onRemove: () => void; disabled?: boolean; label: string }) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
  const pan = Gesture.Pan().enabled(!disabled).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
      const now = Math.abs(e.translationX) > width * 0.35;
      if (now !== armed.value) { armed.value = now; if (now) runOnJS(tick)(); }
    })
    .onEnd((e) => {
      const go = Math.abs(x.value) > width * 0.35 || (Math.abs(e.velocityX) > 1100 && Math.abs(x.value) > 40);
      armed.value = false;
      if (go) x.value = withTiming(Math.sign(x.value || 1) * width, { duration: 170 }, (done) => { if (done) runOnJS(onRemove)(); });
      else x.value = withSpring(0, { damping: 18, stiffness: 220 });
    });
  const card = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const under = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, 20], [0, 1], Extrapolation.CLAMP) }));
  // The bin sits on whichever side the card is uncovering, and grows as the swipe arms.
  const bin = useAnimatedStyle(() => ({
    alignSelf: x.value > 0 ? 'flex-start' : 'flex-end',
    transform: [{ scale: interpolate(Math.abs(x.value), [20, width * 0.35], [0.7, 1.25], Extrapolation.CLAMP) }],
  }));
  return (
    <View accessibilityActions={[{ name: 'delete', label }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') onRemove(); }}>
      <Animated.View style={[StyleSheet.absoluteFill, p.under, under]}>
        <Animated.View style={bin}><Ionicons name="trash" size={22} color={colors.card} /></Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={card}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Free-delivery progress with an animated fill; turns green with a tick when the threshold is reached. */
export const FreeDeliveryBar = memo(function FreeDeliveryBar({ subtotal }: { subtotal: number }) {
  const { t, row } = useI18n();
  const s = useS();
  const goal = CONTACT.freeDeliveryOver;
  const left = Math.max(0, goal - subtotal);
  const done = left <= 0;
  const pct = useSharedValue(0);
  const wasDone = useRef<boolean | null>(null);
  useEffect(() => {
    pct.value = withTiming(Math.min(100, (subtotal / goal) * 100), { duration: 520 });
    if (done && wasDone.current === false) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    wasDone.current = done;
  }, [subtotal, goal, done, pct]);
  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));
  return (
    <View style={[p.fd, shadow]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: goal, now: Math.min(goal, Math.round(subtotal)) }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
        {done
          ? <Animated.View key="ok" entering={ZoomIn.springify().damping(10)}><Ionicons name="checkmark-circle" size={20} color={colors.success} /></Animated.View>
          : <Ionicons name="cube-outline" size={20} color={colors.maroon} />}
        <T style={{ flex: 1, fontFamily: font.bold, fontSize: 13.5, color: done ? colors.success : colors.text }}>
          {done ? t('freeDeliveryDone') : t('freeDeliveryLeft', { n: Math.ceil(left) })}
        </T>
        {!done && <T style={{ color: colors.muted, fontSize: 12 }}>{s('away', { n: Math.ceil(left) })}</T>}
      </View>
      <View style={[p.track, { flexDirection: row }]}>
        <Animated.View style={[{ height: '100%', borderRadius: 5, backgroundColor: done ? colors.success : colors.amber }, fill]} />
      </View>
    </View>
  );
});

/** Compact product card for horizontal rails (upsells, saved for later). */
export const MiniCard = memo(function MiniCard({ product, cta, icon, busy, onCta, onOpen }: {
  product: Product; cta: string; icon: keyof typeof Ionicons.glyphMap; busy?: boolean; onCta: () => void; onOpen: () => void;
}) {
  const { row } = useI18n();
  return (
    <View style={[p.mini, shadow]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={product.title}>
        <View style={p.miniImg}>
          {!!product.featuredImage?.url && <Image source={sized(product.featuredImage.url, 300)} cachePolicy="memory-disk" recyclingKey={product.id} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />}
        </View>
        <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 12.5, minHeight: 38, marginTop: 6 }}>{product.title}</T>
        <Price p={product} size={14} />
      </Pressable>
      <Bouncy onPress={onCta} disabled={busy} style={[p.miniBtn, { flexDirection: row }]} accessibilityRole="button" accessibilityLabel={`${cta}: ${product.title}`}>
        {busy ? <ActivityIndicator size="small" color={colors.red} /> : (<>
          <Ionicons name={icon} size={15} color={colors.red} />
          <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, color: colors.red }}>{cta}</Text>
        </>)}
      </Bouncy>
    </View>
  );
});

const p = StyleSheet.create({
  under: { backgroundColor: colors.red, borderRadius: radius.md, justifyContent: 'center', paddingHorizontal: 22 },
  fd: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 10 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' },
  mini: { width: 150, backgroundColor: colors.card, borderRadius: radius.md, padding: 10, gap: 8 },
  miniImg: { height: 96, borderRadius: radius.sm, backgroundColor: colors.card, overflow: 'hidden' },
  miniBtn: { height: 36, borderRadius: radius.pill, backgroundColor: tint.redSoft, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
});
