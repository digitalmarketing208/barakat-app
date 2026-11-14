// Dark metallic card surface with a slow diagonal shine. Shared by the member card and the plan cards.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, shadow } from '../theme';
import { alpha } from '../account/kit';
import { Metal, MetalKind, metalFor } from './cardTheme';

/** Embossed lettering: dark shadow pressed under light text. */
export const emboss = (m: Metal): TextStyle => ({ textShadowColor: m.emboss, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5, letterSpacing: 0.3 });

export function MetalCard({ kind, style, children }: { kind: MetalKind; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const m = metalFor(kind);
  const [w, setW] = useState(0);
  const [still, setStill] = useState(false);
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);
  useEffect(() => {
    if (!w || still) return;
    x.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(4200),
      Animated.timing(x, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [w, still, x]);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  return (
    <View onLayout={onLayout} style={[s.wrap, shadow, { borderColor: alpha(m.edge, 0.6) }, style]}>
      <LinearGradient colors={m.stops} locations={[0, 0.35, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[alpha(colors.card, 0.16), alpha(colors.card, 0)]} style={s.sheen} pointerEvents="none" />
      {w > 0 && !still ? (
        <Animated.View pointerEvents="none" style={[s.shine, { width: w * 0.3, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.4, w * 1.2] }) }, { rotate: '18deg' }] }]}>
          <LinearGradient colors={[alpha(colors.card, 0), alpha(colors.card, 0.14), alpha(colors.card, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      <View style={s.body}>{children}</View>
    </View>
  );
}

/** Ring progress (svg). value 0..1. */
export function Ring({ size, stroke, value, color, track, children }: { size: number; stroke: number; value: number; color: string; track: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 64 },
  shine: { position: 'absolute', top: -40, bottom: -40, left: 0 },
  body: { padding: 18, gap: 12 },
});
