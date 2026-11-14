import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import { useAuth } from './AuthProvider';
import { AddressesSection, OrdersSection, PreferencesSection, PrescriptionsSection, ProfileSection, RewardsSection, SecurityPrivacySection } from './AccountSections';
import { Notice, Pill, ScreenHeader, useAuthNav } from './kit';
import { useAuthStrings } from './strings';

export default function AccountScreen() {
  const nav = useAuthNav();
  const insets = useSafeAreaInsets();
  const { row } = useI18n();
  const s = useAuthStrings();
  const { status, profile, offline, locked, unlock, reload, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const asked = useRef(false);

  // Signed out (or the session ended while this screen was open): hand over to the sign-in screen.
  useEffect(() => { if (status === 'signedOut') nav.replace('SignIn'); }, [status, nav]);

  // Ask for the fingerprint / face once when the screen opens locked; afterwards the button does it.
  useEffect(() => {
    if (status === 'signedIn' && locked && !asked.current) { asked.current = true; void unlock(); }
  }, [status, locked, unlock]);

  // Signed in but nothing cached yet (first launch offline right after sign-in): try once more.
  useEffect(() => { if (status === 'signedIn' && !profile && !locked) void reload(); }, [status, profile, locked, reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  }, [reload]);

  const confirmSignOut = () => Alert.alert(s('signOutQ'), undefined, [
    { text: s('cancel'), style: 'cancel' },
    { text: s('signOut'), style: 'destructive', onPress: () => { setSigningOut(true); void signOut().finally(() => setSigningOut(false)); } },
  ]);

  const center = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={s('account')} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>{children}</View>
    </View>
  );

  if (status !== 'signedIn') return center(<ActivityIndicator color={colors.red} />);

  if (locked) {
    return center(<>
      <View style={st.lock}><Ionicons name="lock-closed" size={30} color={colors.red} /></View>
      <T style={{ fontFamily: font.black, fontSize: 20, textAlign: 'center' }}>{s('locked')}</T>
      <T style={{ color: colors.muted, textAlign: 'center' }}>{s('lockedSub')}</T>
      <Button title={s('unlock')} icon="finger-print-outline" onPress={() => { void unlock(); }} style={{ alignSelf: 'stretch' }} />
      <Button title={s('signOut')} variant="ghost" onPress={confirmSignOut} loading={signingOut} style={{ alignSelf: 'stretch' }} />
    </>);
  }

  if (!profile) {
    return center(<>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.muted} />
      <T style={{ color: colors.muted, textAlign: 'center' }}>{s('errNetwork')}</T>
      <Button title={s('retry')} variant="ghost" onPress={onRefresh} loading={refreshing} style={{ alignSelf: 'stretch' }} />
      <Button title={s('signOut')} variant="ghost" onPress={confirmSignOut} loading={signingOut} style={{ alignSelf: 'stretch' }} />
    </>);
  }

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.displayName;
  const initials = (profile.firstName.trim()[0] ?? profile.displayName.trim()[0] ?? '').toUpperCase() + (profile.lastName.trim()[0] ?? '').toUpperCase();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={s('account')} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} colors={[colors.red]} />}>
        <LinearGradient colors={[colors.red, colors.maroon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, shadow, { flexDirection: row }]}>
          <View style={st.avatar}>
            {initials ? <Text style={{ fontFamily: font.black, fontSize: 20, color: colors.maroon }}>{initials}</Text> : <Ionicons name="person" size={24} color={colors.maroon} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ color: '#fff', fontFamily: font.black, fontSize: 19 }} numberOfLines={1}>{s('hello', { name })}</T>
            {profile.email ? <T style={{ color: '#FFE3E0', fontSize: 13 }} numberOfLines={1}>{profile.email}</T> : null}
            {offline ? <View style={{ flexDirection: row, marginTop: 4 }}><Pill text={s('offline')} tone="warn" /></View> : null}
          </View>
        </LinearGradient>

        {offline ? <Notice tone="info" text={s('errNetwork')} /> : null}

        <OrdersSection profile={profile} />
        <ProfileSection profile={profile} />
        <AddressesSection profile={profile} />
        <PrescriptionsSection profile={profile} />
        <RewardsSection profile={profile} />
        <PreferencesSection profile={profile} />
        <SecurityPrivacySection profile={profile} />

        <Button title={s('signOut')} icon="log-out-outline" variant="ghost" onPress={confirmSignOut} loading={signingOut} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  lock: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FDEBEC', alignItems: 'center', justifyContent: 'center' },
});
