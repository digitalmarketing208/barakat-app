import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius } from '../theme';
import { T } from '../ui';
import { useDir } from './dir';
import { alpha } from './tint';

export type BannerCopy = { eyebrow: string; title: string; sub: string; cta: string };
type Tone = 'brand' | 'gamer';

/**
 * A banner drawn by the app instead of a picture with text burnt in: the copy is real text in the
 * active language (so it is always readable, right-to-left aware and read by screen readers).
 */
export function NativeBanner({ copy, backdrop, icon, tone = 'brand', note, style, children }: {
  copy: BannerCopy; backdrop?: string | null; icon?: keyof typeof Ionicons.glyphMap; tone?: Tone; note?: string;
  style?: StyleProp<ViewStyle>;
  /** Optional replacement for the default backdrop image (e.g. a parallax layer). */
  children?: React.ReactNode;
}) {
  const { row, alignStart, arrow, rtl } = useDir();
  const accent = tone === 'gamer' ? colors.amber : colors.red;
  const onAccent = tone === 'gamer' ? colors.dark : colors.card;
  return (
    <View style={[{ backgroundColor: colors.dark, overflow: 'hidden' }, style]}>
      {children ?? (!!backdrop && <Image source={backdrop} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" transition={250} />)}
      <LinearGradient colors={[alpha(colors.dark, 0.05), alpha(colors.dark, 0.55), alpha(colors.dark, 0.96)]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      {tone === 'gamer' && <LinearGradient colors={[alpha(colors.amber, 0.28), alpha(colors.amber, 0)]} start={{ x: rtl ? 1 : 0, y: 1 }} end={{ x: rtl ? 0 : 1, y: 0 }} style={StyleSheet.absoluteFill} />}
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: alignStart, padding: 18, gap: 4 }}>
        <View style={[s.eyebrow, { flexDirection: row, backgroundColor: alpha(accent, tone === 'gamer' ? 0.2 : 0.9), borderColor: accent }]}>
          {icon && <Ionicons name={icon} size={12} color={tone === 'gamer' ? colors.amber : colors.card} />}
          <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: tone === 'gamer' ? colors.amber : colors.card }}>{copy.eyebrow}</Text>
        </View>
        <T style={{ color: colors.card, fontFamily: font.black, fontSize: 24, alignSelf: 'stretch' }} numberOfLines={2}>{copy.title}</T>
        <T style={{ color: alpha(colors.card, 0.86), fontSize: 13.5, alignSelf: 'stretch' }} numberOfLines={2}>{copy.sub}</T>
        {!!note && <T style={{ color: colors.amber, fontFamily: font.bold, fontSize: 12, alignSelf: 'stretch' }} numberOfLines={1}>{note}</T>}
        <View style={[s.cta, { flexDirection: row, backgroundColor: accent }]}>
          <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: onAccent }}>{copy.cta}</Text>
          <Ionicons name={arrow} size={15} color={onAccent} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, marginBottom: 2 },
  cta: { alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: radius.pill, marginTop: 8 },
});
