import React, { useEffect } from 'react';
import { Dimensions, Pressable, PressableProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, radius } from '../theme';
import { useI18n } from '../i18n';
import { alpha, clear } from './tint';

export const haptic = {
  tap: () => { Haptics.selectionAsync().catch(() => {}); },
  light: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
};

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };
const APressable = Animated.createAnimatedComponent(Pressable);

type PSProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>; children?: React.ReactNode; to?: number; haptics?: boolean;
};
/** Pressable that springs down a little under the finger (runs on the UI thread; instant with reduce-motion). */
export function PressableScale({ style, children, to = 0.96, haptics, onPress, onPressIn, onPressOut, ...rest }: PSProps) {
  const v = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => { v.set(withSpring(to, SPRING)); onPressIn?.(e); }}
      onPressOut={(e) => { v.set(withSpring(1, SPRING)); onPressOut?.(e); }}
      onPress={(e) => { if (haptics) haptic.tap(); onPress?.(e); }}
      style={[style, st]}>
      {children}
    </APressable>
  );
}

/** Fade + rise entrance. Skipped entirely when the user asked the system to reduce motion. */
export function Enter({ children, delay = 0, style, on = true }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; /** false = render the wrapper without animating */ on?: boolean }) {
  const reduce = useReducedMotion();
  return <Animated.View style={style} entering={reduce || !on ? undefined : FadeInDown.delay(delay).duration(380)}>{children}</Animated.View>;
}

const W = Dimensions.get('window').width;
const BAND = 140;

/** Shimmer placeholder: a soft highlight sweeps across in the reading direction. Static with reduce-motion. */
export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const { rtl } = useI18n();
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduce) return;
    x.set(-1);
    x.set(withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(x);
  }, [reduce, x]);
  const sign = rtl ? -1 : 1;
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: sign * x.value * W }] }));
  return (
    <View style={[s.base, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      {!reduce && (
        <Animated.View style={[s.band, st]}>
          <LinearGradient colors={[clear, alpha(colors.card, 0.75), clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  base: { backgroundColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND, pointerEvents: 'none' },
});
