import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { tint } from './tint';

const APress = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down a little under the finger (runs on the UI thread). */
export function Bouncy({ style, children, onPress, disabled, scaleTo = 0.96, ...rest }: Omit<React.ComponentProps<typeof Pressable>, 'style' | 'children'> & { style?: React.ComponentProps<typeof Animated.View>['style']; children?: React.ReactNode; scaleTo?: number }) {
  const v = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  return (
    <APress {...rest} disabled={disabled} onPress={onPress}
      onPressIn={() => { v.set(withTiming(scaleTo, { duration: 90 })); }}
      onPressOut={() => { v.set(withSpring(1, { damping: 12, stiffness: 320 })); }}
      style={[style, st]}>{children}</APress>
  );
}

/** A number that counts to its new value and gives a small pulse, used for live totals. */
export function AnimatedNumber({ value, style, suffix }: { value: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const pulse = useSharedValue(1);
  useEffect(() => {
    const start = from.current, delta = value - start;
    if (!delta) return;
    pulse.set(withSequence(withTiming(1.12, { duration: 120 }), withSpring(1, { damping: 10, stiffness: 260 })));
    const t0 = Date.now(); let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / 320), e = 1 - Math.pow(1 - k, 3);
      const cur = start + delta * e;
      from.current = cur; setShown(cur);
      if (k < 1) raf = requestAnimationFrame(tick); else { from.current = value; setShown(value); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, pulse]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const whole = Number.isInteger(value);
  return (
    <Animated.View style={st}>
      <Text style={style} numberOfLines={1}>{whole ? Math.round(shown) : shown.toFixed(2)}{suffix ? ` ${suffix}` : ''}</Text>
    </Animated.View>
  );
}

export type Snack = { id: number; text: string; action?: string; onAction?: () => void; icon?: keyof typeof Ionicons.glyphMap };

/** Bottom toast with one optional action (undo, view cart). Auto-hides; a new `id` restarts the timer. */
export function Snackbar({ snack, onHide, bottom }: { snack: Snack | null; onHide: () => void; bottom: number }) {
  const { row } = useI18n();
  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(onHide, 5000);
    return () => clearTimeout(id);
  }, [snack?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!snack) return null;
  return (
    <Animated.View key={snack.id} entering={SlideInDown.springify().damping(18).stiffness(220)} exiting={SlideOutDown.duration(180)}
      style={[m.snack, shadow, { bottom, flexDirection: row, elevation: 12 }]} accessibilityLiveRegion="polite">
      <Ionicons name={snack.icon ?? 'checkmark-circle'} size={20} color={colors.amber} />
      <T numberOfLines={2} style={{ flex: 1, color: colors.card, fontFamily: font.medium, fontSize: 13 }}>{snack.text}</T>
      {snack.action && (
        <Pressable hitSlop={10} accessibilityRole="button" onPress={() => { snack.onAction?.(); onHide(); }}>
          <Text style={{ color: colors.amber, fontFamily: font.black, fontSize: 14 }}>{snack.action}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

/** Bottom sheet rendered inside the screen (no native Modal, so gestures and RTL behave the same on both platforms). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { row } = useI18n();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    y.set(0);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose, y]);
  const drag = Gesture.Pan().activeOffsetY([-8, 8])
    .onUpdate((e) => { y.set(Math.max(0, e.translationY)); })
    .onEnd((e) => {
      if (y.value > 110 || e.velocityY > 900) runOnJS(onClose)();
      else y.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 60, elevation: 24 }]} accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: tint.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="close" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(280).easing(Easing.out(Easing.cubic))} exiting={SlideOutDown.duration(200)}
        style={[m.sheet, { maxHeight: height * 0.86, paddingBottom: insets.bottom + 16 }, st]}>
        <GestureDetector gesture={drag}>
          <View>
            <View style={m.grab} />
            <View style={{ flexDirection: row, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, gap: 12 }}>
              <T style={{ flex: 1, fontFamily: font.black, fontSize: 19 }}>{title}</T>
              <Pressable onPress={onClose} hitSlop={10} style={m.x} accessibilityRole="button" accessibilityLabel="close">
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}

const m = StyleSheet.create({
  snack: { position: 'absolute', left: 16, right: 16, zIndex: 50, backgroundColor: colors.dark, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', gap: 10 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: 10, marginBottom: 10 },
  x: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
