// Small shared pieces for the account / engagement screens (More, Rewards, Branches, Booking, Prescription…).
// Every colour comes from src/theme.ts; alpha() derives translucent shades from those tokens.
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';

/** '#RRGGBB' theme colour with opacity, e.g. alpha(colors.red, 0.1). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Text/icon colour on red or maroon surfaces. */
export const onBrand = colors.card;
export const onBrandSoft = alpha(colors.card, 0.82);
export const tintRed = alpha(colors.red, 0.09);

/** Local bilingual strings for screens that cannot add keys to src/i18n.tsx: L('عربي', 'English'). */
export function useL() {
  const { lang } = useI18n();
  return useCallback(<V,>(ar: V, en: V): V => (lang === 'ar' ? ar : en), [lang]);
}

export const tap = () => { Haptics.selectionAsync().catch(() => {}); };

/** White header with a direction-aware back button, same look on every stack screen. */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { row, rtl } = useI18n();
  const L = useL();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8, flexDirection: row }]}>
      <Pressable onPress={onBack} hitSlop={8} style={s.back} accessibilityRole="button" accessibilityLabel={L('رجوع', 'Back')}>
        <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
      </Pressable>
      <T numberOfLines={1} style={{ fontFamily: font.black, fontSize: 20, flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}

/** Pressable that shrinks slightly while pressed (native driver). */
export function PressScale({ children, onPress, style, disabled, label, selected }: {
  children: React.ReactNode; onPress: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; label?: string; selected?: boolean;
}) {
  const [v] = useState(() => new Animated.Value(1));
  const to = (n: number) => Animated.spring(v, { toValue: n, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={() => to(0.96)} onPressOut={() => to(1)}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected, disabled: !!disabled }}>
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Fades and lifts its children in; `index` staggers a list. Re-runs when `k` changes. */
export function FadeIn({ children, index = 0, k, style }: { children: React.ReactNode; index?: number; k?: string | number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 320, delay: Math.min(index, 8) * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, index, k]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Horizontal progress bar that animates to `value` (0..1) and fills from the reading-start side. */
export function ProgressBar({ value, height = 10, color = colors.red, track = colors.line }: { value: number; height?: number; color?: string; track?: string }) {
  const { rtl } = useI18n();
  const [v] = useState(() => new Animated.Value(0));
  const pc = Math.max(0, Math.min(1, value));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: pc, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [v, pc]);
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: track, overflow: 'hidden', alignItems: rtl ? 'flex-end' : 'flex-start' }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pc * 100) }}>
      <Animated.View style={{ height, borderRadius: radius.pill, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center', gap: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
