import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, shadow } from '../theme';
import { useI18n, Key } from '../i18n';
import { Button, T } from '../ui';
import { FACE_MAP, SHAPES } from '../catalog';
import type { RootParams } from '../types';
import { FadeIn, PressScale, ScreenHeader, alpha, onBrand, onBrandSoft, tap } from '../account/kit';

const FACES: { id: string; label: Key }[] = [
  { id: 'round', label: 'faceRound' }, { id: 'square', label: 'faceSquare' }, { id: 'oval', label: 'faceOval' },
  { id: 'heart', label: 'faceHeart' }, { id: 'long', label: 'faceLong' },
];
const STYLES: { id: string; label: Key; shapes: string[]; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'classic', label: 'styleClassic', shapes: ['rectangle', 'round'], icon: 'briefcase-outline' },
  { id: 'bold', label: 'styleBold', shapes: ['cat', 'aviator', 'square'], icon: 'flash-outline' },
  { id: 'light', label: 'styleLight', shapes: ['round', 'cat'], icon: 'leaf-outline' },
  { id: 'sport', label: 'styleSport', shapes: ['rectangle', 'aviator'], icon: 'bicycle-outline' },
];
const WHO: { kid: boolean; label: Key; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kid: false, label: 'forMe', icon: 'person-outline' },
  { kid: true, label: 'forKid', icon: 'happy-outline' },
];
const STEPS = 3;
const ADVANCE_MS = 220; // long enough to see the chosen option light up

function FaceIcon({ id, active }: { id: string; active: boolean }) {
  const c = active ? onBrand : colors.maroon;
  return (
    <Svg width={54} height={64} viewBox="0 0 54 64">
      {id === 'round' && <Ellipse cx={27} cy={32} rx={22} ry={22} stroke={c} strokeWidth={3} fill="none" />}
      {id === 'square' && <Rect x={6} y={10} width={42} height={44} rx={10} stroke={c} strokeWidth={3} fill="none" />}
      {id === 'oval' && <Ellipse cx={27} cy={32} rx={19} ry={26} stroke={c} strokeWidth={3} fill="none" />}
      {id === 'heart' && <Path d="M8 14 Q27 6 46 14 Q44 40 27 58 Q10 40 8 14Z" stroke={c} strokeWidth={3} fill="none" strokeLinejoin="round" />}
      {id === 'long' && <Rect x={12} y={4} width={30} height={56} rx={15} stroke={c} strokeWidth={3} fill="none" />}
    </Svg>
  );
}

/** Three-part progress that fills smoothly from the reading-start side. */
function StepBar({ step }: { step: number }) {
  const { row, rtl } = useI18n();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: Math.min(step + 1, STEPS), duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [v, step]);
  return (
    <View style={{ flexDirection: row, gap: 5 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS, now: Math.min(step + 1, STEPS) }}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={[s.seg, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <Animated.View style={{ height: 6, backgroundColor: colors.red, borderRadius: 3, width: v.interpolate({ inputRange: [i, i + 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }} />
        </View>
      ))}
    </View>
  );
}

function ResultPill({ label, index }: { label: string; index: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.spring(v, { toValue: 1, delay: 260 + index * 120, useNativeDriver: true, speed: 14, bounciness: 12 });
    a.start();
    return () => a.stop();
  }, [v, index]);
  return (
    <Animated.View style={[s.pill, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      <Text style={{ fontFamily: font.bold, color: colors.maroon }}>{label}</Text>
    </Animated.View>
  );
}

export default function FinderScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { t, row, rtl } = useI18n();
  const [step, setStep] = useState(0);
  const [face, setFace] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [kid, setKid] = useState<boolean | null>(null);

  // page transition: fade + slide in the travel direction, mirrored for Arabic
  const [page] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const goTo = (next: number) => {
    Animated.timing(page, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setDir(next >= step ? 1 : -1);
      setStep(next);
      Animated.timing(page, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };
  const shift = page.interpolate({ inputRange: [0, 1], outputRange: [26 * dir * (rtl ? -1 : 1), 0] });

  const result = (() => {
    if (!face || !style) return null;
    const a = FACE_MAP[face].shapes;
    const b = STYLES.find((x) => x.id === style)!.shapes;
    const both = a.filter((x) => b.includes(x));
    const picks = (both.length ? both : a).slice(0, 3);
    return { picks, tip: FACE_MAP[face].tip };
  })();

  const reset = () => { tap(); setFace(null); setStyle(null); setKid(null); goTo(0); };
  const pick = (fn: () => void) => {
    if (timer.current) return; // ignore double taps while advancing
    tap(); fn();
    const next = step + 1;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (next >= STEPS) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      goTo(next);
    }, ADVANCE_MS);
  };
  const back = () => (step > 0 && step < STEPS ? goTo(step - 1) : nav.goBack());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('quizTitle')} onBack={back} right={<StepBar step={step} />} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Animated.View style={{ gap: 16, opacity: page, transform: [{ translateX: shift }] }}>
          {step === 0 && (<>
            <T style={s.q}>{t('quizQ1')}</T>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 12 }}>
              {FACES.map((f, i) => {
                const on = face === f.id;
                return (
                  <FadeIn key={f.id} index={i} style={{ width: '47%' }}>
                    <PressScale onPress={() => pick(() => setFace(f.id))} label={t(f.label)} selected={on} style={[s.opt, shadow, on && s.on]}>
                      <FaceIcon id={f.id} active={on} />
                      <T style={{ fontFamily: font.bold, textAlign: 'center', color: on ? onBrand : colors.text }}>{t(f.label)}</T>
                    </PressScale>
                  </FadeIn>
                );
              })}
            </View>
          </>)}
          {step === 1 && (<>
            <T style={s.q}>{t('quizQ2')}</T>
            {STYLES.map((x, i) => {
              const on = style === x.id;
              return (
                <FadeIn key={x.id} index={i}>
                  <PressScale onPress={() => pick(() => setStyle(x.id))} label={t(x.label)} selected={on} style={[s.row, shadow, { flexDirection: row }, on && s.on]}>
                    <View style={[s.ic, on && { backgroundColor: alpha(colors.card, 0.18) }]}><Ionicons name={x.icon} size={22} color={on ? onBrand : colors.red} /></View>
                    <T style={{ fontFamily: font.bold, fontSize: 16, flex: 1, color: on ? onBrand : colors.text }}>{t(x.label)}</T>
                    <Ionicons name={on ? 'checkmark-circle' : rtl ? 'chevron-back' : 'chevron-forward'} size={on ? 22 : 18} color={on ? onBrand : colors.muted} />
                  </PressScale>
                </FadeIn>
              );
            })}
          </>)}
          {step === 2 && (<>
            <T style={s.q}>{t('quizQ3')}</T>
            {WHO.map((x, i) => {
              const on = kid === x.kid;
              return (
                <FadeIn key={x.label} index={i}>
                  <PressScale onPress={() => pick(() => setKid(x.kid))} label={t(x.label)} selected={on} style={[s.row, shadow, { flexDirection: row }, on && s.on]}>
                    <View style={[s.ic, on && { backgroundColor: alpha(colors.card, 0.18) }]}><Ionicons name={x.icon} size={22} color={on ? onBrand : colors.red} /></View>
                    <T style={{ fontFamily: font.bold, fontSize: 16, flex: 1, color: on ? onBrand : colors.text }}>{t(x.label)}</T>
                  </PressScale>
                </FadeIn>
              );
            })}
          </>)}
          {step >= STEPS && result && (<>
            <LinearGradient colors={[colors.maroon, colors.dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.result, shadow]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
                {face ? <FaceIcon id={face} active /> : null}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={20} color={colors.amber} />
                    <T style={{ color: onBrand, fontFamily: font.black, fontSize: 20 }}>{t('quizResult')}</T>
                  </View>
                  <T style={{ color: onBrandSoft, fontSize: 13 }}>{FACES.find((f) => f.id === face) ? t(FACES.find((f) => f.id === face)!.label) : ''} · {style ? t(STYLES.find((x) => x.id === style)!.label) : ''}</T>
                </View>
              </View>
              <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                {result.picks.map((id, i) => <ResultPill key={id} index={i} label={t(SHAPES.find((x) => x.id === id)!.label)} />)}
              </View>
              <T style={{ color: onBrandSoft, lineHeight: 22 }}>{t(result.tip)}</T>
            </LinearGradient>
            <FadeIn index={3} style={{ gap: 12 }}>
              <Button title={t('seeFrames')} icon="glasses-outline"
                onPress={() => nav.navigate('Tabs', { screen: 'Shop', params: { categoryId: kid ? 'kids' : 'eyeglasses', shapeIds: result.picks } })} />
              <Button title={t('tryOn')} variant="ghost" icon="camera-outline" onPress={() => nav.navigate('Tabs', { screen: 'TryOn' })} />
              <Button title={t('quizAgain')} variant="ghost" icon="refresh-outline" onPress={reset} />
            </FadeIn>
          </>)}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  seg: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  q: { fontFamily: font.black, fontSize: 22, marginBottom: 4 },
  opt: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.card },
  row: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: colors.card },
  on: { backgroundColor: colors.red, borderColor: colors.red },
  ic: { width: 42, height: 42, borderRadius: 21, backgroundColor: alpha(colors.red, 0.09), alignItems: 'center', justifyContent: 'center' },
  result: { borderRadius: radius.lg, padding: 22, gap: 14 },
  pill: { backgroundColor: colors.beige, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
