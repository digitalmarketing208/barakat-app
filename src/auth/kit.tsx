// Small shared building blocks for the sign-in and account screens.
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import type { RootParams } from '../types';
import { useAuthStrings } from './strings';

/** Works before and after `SignIn` / `Account` are added to RootParams in src/types.ts. */
export type AuthStackParams = RootParams & { SignIn: undefined; Account: undefined };
export type AuthNav = NativeStackNavigationProp<AuthStackParams>;
export const useAuthNav = () => useNavigation<AuthNav>();

export type Icon = keyof typeof Ionicons.glyphMap;

export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const nav = useAuthNav();
  const insets = useSafeAreaInsets();
  const { row, rtl } = useI18n();
  const s = useAuthStrings();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: row, alignItems: 'center', gap: 12, backgroundColor: '#fff' }}>
      <Pressable onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs', { screen: 'Home' }))} style={st.back} hitSlop={8}
        accessibilityRole="button" accessibilityLabel={s('back')}>
        <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
      </Pressable>
      <T style={{ fontFamily: font.black, fontSize: 20, flex: 1 }} numberOfLines={1}>{title}</T>
      {right}
    </View>
  );
}

export function Card({ title, icon, action, children }: { title?: string; icon?: Icon; action?: React.ReactNode; children: React.ReactNode }) {
  const { row } = useI18n();
  return (
    <View style={[st.card, shadow]}>
      {title ? (
        <View style={{ flexDirection: row, alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {icon ? <View style={st.ic}><Ionicons name={icon} size={18} color={colors.red} /></View> : null}
          <T style={{ fontFamily: font.black, fontSize: 17, flex: 1 }}>{title}</T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function LinkButton({ title, onPress, icon, color = colors.red, disabled }: { title: string; onPress: () => void; icon?: Icon; color?: string; disabled?: boolean }) {
  const { row } = useI18n();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: row, alignItems: 'center', gap: 4, minHeight: 32, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      <Text style={{ fontFamily: font.bold, fontSize: 14, color }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ltr, ...p }: TextInputProps & { label: string; ltr?: boolean }) {
  const { align, rtl } = useI18n();
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <T style={{ fontSize: 12, color: colors.muted }}>{label}</T>
      <TextInput
        placeholderTextColor={colors.muted} accessibilityLabel={label} {...p}
        style={[st.input, { textAlign: ltr ? 'left' : align, writingDirection: ltr ? 'ltr' : rtl ? 'rtl' : 'ltr' }, style]} />
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const map = { neutral: ['#F2EEE7', colors.muted], good: ['#E4F5EB', colors.success], warn: ['#FFF1DA', '#9A6200'], bad: ['#FDEBEC', colors.red] } as const;
  return (
    <View style={{ backgroundColor: map[tone][0], borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, color: map[tone][1] }}>{text}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'bad' }: { text: string; tone?: 'bad' | 'good' | 'info' }) {
  const { row } = useI18n();
  const c = tone === 'bad' ? colors.red : tone === 'good' ? colors.success : colors.muted;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: row, gap: 8, alignItems: 'center', backgroundColor: tone === 'bad' ? '#FDEBEC' : tone === 'good' ? '#E4F5EB' : '#F2EEE7', borderRadius: radius.sm, padding: 10 }}>
      <Ionicons name={tone === 'bad' ? 'alert-circle-outline' : tone === 'good' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={18} color={c} />
      <T style={{ flex: 1, fontSize: 13, color: c }}>{text}</T>
    </View>
  );
}

export const Divider = () => <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />;

const st = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16 },
  ic: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FDEBEC', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 8, fontFamily: font.regular, fontSize: 15, color: colors.text },
});
