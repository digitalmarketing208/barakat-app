import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { AUTH } from './config';
import { useAuth } from './AuthProvider';
import { Icon, Notice, useAuthNav } from './kit';
import { AuthKey, useAuthStrings } from './strings';
import type { AuthErrorCode } from './errors';

const ERR: Record<AuthErrorCode, AuthKey | null> = {
  cancelled: null, // closing the page is a choice, not an error
  network: 'errNetwork', config: 'errConfig', unavailable: 'errUnavailable', expired: 'errExpired', locked: 'errServer', server: 'errServer',
};

type Method = 'email' | 'shop' | 'google';

function MethodButton({ title, icon, bg, fg, border, onPress, loading, dimmed, disabled }: {
  title: string; icon: Icon; bg: string; fg: string; border?: string; onPress: () => void; loading: boolean; dimmed: boolean; disabled: boolean;
}) {
  const { row } = useI18n();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [st.btn, { backgroundColor: bg, flexDirection: row, borderWidth: border ? 1.5 : 0, borderColor: border, opacity: dimmed ? 0.5 : pressed ? 0.85 : 1 }]}>
      {loading ? <ActivityIndicator color={fg} /> : (<>
        <Ionicons name={icon} size={20} color={fg} />
        <Text style={{ fontFamily: font.bold, fontSize: 16, color: fg }}>{title}</Text>
      </>)}
    </Pressable>
  );
}

export default function SignInScreen() {
  const nav = useAuthNav();
  const insets = useSafeAreaInsets();
  const { row, rtl, lang } = useI18n();
  const s = useAuthStrings();
  const { status, configured, signIn, busy } = useAuth();
  const [error, setError] = useState<AuthKey | null>(null);
  const [active, setActive] = useState<Method | null>(null);

  // Already signed in (or just finished): this screen has nothing left to do.
  useEffect(() => { if (status === 'signedIn') nav.replace('Account'); }, [status, nav]);

  const leave = () => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs', { screen: 'Home' }));

  // Shopify's hosted page shows every method the store has switched on; the buttons only set expectations.
  const go = async (m: Method) => {
    if (busy) return;
    setError(null); setActive(m);
    const r = await signIn();
    setActive(null);
    if (!r.ok) setError(ERR[r.reason]);
  };

  const btn = (m: Method) => ({ onPress: () => { void go(m); }, loading: active === m, dimmed: !configured || (busy && active !== m), disabled: busy || !configured });
  const benefits: [Icon, AuthKey][] = [['cube-outline', 'benefit1'], ['location-outline', 'benefit2'], ['lock-closed-outline', 'benefit3']];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <LinearGradient colors={[colors.dark, colors.maroon]} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 34, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <View style={{ flexDirection: row }}>
            <Pressable onPress={leave} style={st.close} hitSlop={8} accessibilityRole="button" accessibilityLabel={s('back')}>
              <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={22} color="#fff" />
            </Pressable>
          </View>
          <Image source={require('../../assets/brand/logo-lockup-white.png')} style={{ width: 200, height: 29, alignSelf: 'center', marginTop: 10 }} contentFit="contain" accessibilityLabel="Barakat Optical" />
          <T style={{ color: '#fff', fontFamily: font.black, fontSize: 24, textAlign: 'center', marginTop: 22 }}>{s('welcome')}</T>
          <T style={{ color: colors.beige, fontSize: 14, textAlign: 'center', marginTop: 6 }}>{s('welcomeSub')}</T>
        </LinearGradient>

        <View style={[st.sheet, shadow]}>
          {benefits.map(([icon, key]) => (
            <View key={key} style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
              <View style={st.tick}><Ionicons name={icon} size={16} color={colors.red} /></View>
              <T style={{ flex: 1, fontSize: 14 }}>{s(key)}</T>
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 22 }}>
          {!configured ? <Notice tone="info" text={s('errConfig')} /> : null}
          {error ? <Notice text={s(error)} /> : null}
          <MethodButton {...btn('email')} title={s('withEmail')} icon="mail-outline" bg={colors.red} fg="#fff" />
          <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: -4 }}>{s('emailNote')}</T>
          {AUTH.shopLogin ? <MethodButton {...btn('shop')} title={s('withShop')} icon="bag-handle-outline" bg="#5433EB" fg="#fff" /> : null}
          {AUTH.googleLogin ? <MethodButton {...btn('google')} title={s('withGoogle')} icon="logo-google" bg="#fff" fg={colors.text} border={colors.line} /> : null}

          <View style={{ flexDirection: row, alignItems: 'center', gap: 10, marginVertical: 4 }}>
            <View style={st.rule} /><Ionicons name="glasses-outline" size={18} color={colors.line} /><View style={st.rule} />
          </View>

          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel={s('guest')}
            style={({ pressed }) => [st.btn, { borderWidth: 1.5, borderColor: colors.maroon, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: colors.maroon }}>{s('guest')}</Text>
          </Pressable>
          <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: -4 }}>{s('guestNote')}</T>

          <View style={{ flexDirection: row, alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
            <T style={{ flex: 1, fontSize: 12, color: colors.muted }}>{s('secureNote')}</T>
          </View>
          <Pressable onPress={() => Linking.openURL(`https://${AUTH.domain}/${lang === 'ar' ? '' : 'en/'}policies/privacy-policy`).catch(() => {})} hitSlop={8} accessibilityRole="link">
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.red, textAlign: 'center' }}>{s('privacyLink')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  sheet: { marginHorizontal: 20, marginTop: -18, backgroundColor: '#fff', borderRadius: radius.md, padding: 16, gap: 12 },
  tick: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDEBEC', alignItems: 'center', justifyContent: 'center' },
  btn: { height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 22 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
});
