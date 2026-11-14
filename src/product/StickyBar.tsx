import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, ZoomIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { money } from '../shopify';
import { AnimatedNumber, Bouncy } from './motion';
import { useS } from './strings';

/**
 * Sticky add-to-cart bar. The total is live (frame + chosen lens) and counts to its new value; after a
 * successful add the button turns green and becomes a shortcut to the cart for a moment.
 */
export function StickyBar({ framePrice, lensPrice, canBuy, busy, added, error, onAdd, onViewCart, onWhatsApp, bottomInset, onHeight }: {
  framePrice: number; lensPrice: number; canBuy: boolean; busy: boolean; added: boolean; error: boolean;
  onAdd: () => void; onViewCart: () => void; onWhatsApp: () => void; bottomInset: number; onHeight?: (h: number) => void;
}) {
  const { t, row } = useI18n();
  const s = useS();
  const ok = useSharedValue(0);
  useEffect(() => { ok.value = withTiming(added ? 1 : 0, { duration: 220 }); }, [added, ok]);
  const btn = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(ok.value, [0, 1], [colors.red, colors.success]) }));
  const total = framePrice + lensPrice;
  const withLens = lensPrice > 0;
  const fmt = (n: number) => money({ amount: String(n) });
  return (
    <Animated.View entering={SlideInDown.duration(320)} onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={[b.bar, shadow, { paddingBottom: bottomInset + 12 }]}>
      {error && <Animated.View entering={FadeIn} exiting={FadeOut}><T style={{ color: colors.red, textAlign: 'center', marginBottom: 8, fontSize: 13 }}>{s('addFailed')}</T></Animated.View>}
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <View style={{ minWidth: 86 }}>
          <T numberOfLines={1} style={{ color: colors.muted, fontSize: 11.5 }}>{withLens ? `${s('frame')} + ${s('lens')}` : s('total')}</T>
          <View style={{ flexDirection: row, alignItems: 'baseline', gap: 4 }}>
            <AnimatedNumber value={total} style={b.total} />
            <Text style={{ fontFamily: font.bold, fontSize: 12, color: colors.text }}>{t('sar')}</Text>
          </View>
          {withLens && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
              <T numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{fmt(framePrice)} + {fmt(lensPrice)}</T>
            </Animated.View>
          )}
        </View>
        <Bouncy onPress={added ? onViewCart : onAdd} disabled={!canBuy || busy} accessibilityRole="button"
          accessibilityLabel={added ? s('viewCart') : canBuy ? t('addToCart') : t('soldOut')} accessibilityState={{ disabled: !canBuy || busy, busy }}
          style={[b.btn, { flexDirection: row, opacity: canBuy ? 1 : 0.45 }, btn]}>
          {busy ? <ActivityIndicator color={colors.card} /> : added ? (
            <Animated.View key="ok" entering={ZoomIn.springify().damping(12)} style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.card} />
              <Text numberOfLines={1} style={b.label}>{s('addedView')}</Text>
            </Animated.View>
          ) : (
            <Animated.View key="add" entering={FadeIn.duration(160)} style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
              <Ionicons name={canBuy ? 'bag-add-outline' : 'close-circle-outline'} size={20} color={colors.card} />
              <Text numberOfLines={1} style={b.label}>{canBuy ? t('addToCart') : t('soldOut')}</Text>
            </Animated.View>
          )}
        </Bouncy>
        <Bouncy onPress={onWhatsApp} style={b.wa} accessibilityRole="button" accessibilityLabel={t('whatsapp')}>
          <Ionicons name="logo-whatsapp" size={22} color={colors.card} />
        </Bouncy>
      </View>
    </Animated.View>
  );
}

const b = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, backgroundColor: colors.card, paddingTop: 12, paddingHorizontal: 16, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  total: { fontFamily: font.black, fontSize: 22, lineHeight: 30, color: colors.red },
  btn: { flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  label: { color: colors.card, fontFamily: font.bold, fontSize: 15.5 },
  wa: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
});
