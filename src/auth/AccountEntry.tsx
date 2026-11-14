// Drop-in entry points to the account: a row for the More / Home lists and a round icon for the top bar.
// Guests go to SignIn, signed-in customers to Account. Neither ever blocks browsing.
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { useAuth } from './AuthProvider';
import { useAuthNav } from './kit';
import { useAuthStrings } from './strings';

function useEntry() {
  const nav = useAuthNav();
  const s = useAuthStrings();
  const { status, profile } = useAuth();
  const signedIn = status === 'signedIn';
  const name = profile ? profile.firstName || profile.displayName : '';
  return {
    signedIn,
    open: () => nav.navigate(signedIn ? 'Account' : 'SignIn'),
    title: signedIn ? (name ? s('hello', { name }) : s('account')) : s('entrySignedOut'),
    sub: signedIn ? s('entrySignedInSub') : s('entrySignedOutSub'),
  };
}

/** Same look as the rows in MoreScreen. */
export function AccountRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const { row, rtl } = useI18n();
  const e = useEntry();
  return (
    <Pressable onPress={e.open} style={[st.row, shadow, { flexDirection: row }, style]} accessibilityRole="button" accessibilityLabel={e.title}>
      <View style={[st.ic, e.signedIn && { backgroundColor: colors.red }]}>
        <Ionicons name={e.signedIn ? 'person' : 'person-outline'} size={20} color={e.signedIn ? '#fff' : colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold }} numberOfLines={1}>{e.title}</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{e.sub}</T>
      </View>
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Round icon sized like the TopBar buttons (38pt, white glyph on translucent white). */
export function AccountIconButton({ style, color = '#fff' }: { style?: StyleProp<ViewStyle>; color?: string }) {
  const e = useEntry();
  const s = useAuthStrings();
  return (
    <Pressable onPress={e.open} style={[st.icon, style]} hitSlop={6} accessibilityRole="button" accessibilityLabel={e.signedIn ? s('account') : s('signIn')}>
      <Ionicons name={e.signedIn ? 'person' : 'person-outline'} size={20} color={color} />
      {e.signedIn ? <View style={st.dot} /> : null}
    </Pressable>
  );
}

/** Compact text link, e.g. above the checkout button: "Sign in for a faster checkout". Renders nothing when signed in. */
export function SignInHint({ style }: { style?: StyleProp<ViewStyle> }) {
  const { row, lang } = useI18n();
  const e = useEntry();
  const { configured } = useAuth();
  if (e.signedIn || !configured) return null;
  return (
    <Pressable onPress={e.open} style={[{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36 }, style]} accessibilityRole="button">
      <Ionicons name="person-circle-outline" size={18} color={colors.red} />
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.red }}>{lang === 'ar' ? 'سجّل دخولك لإتمام شراء أسرع' : 'Sign in for a faster checkout'}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { backgroundColor: '#fff', borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 12 },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDEBEC', alignItems: 'center', justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
});
