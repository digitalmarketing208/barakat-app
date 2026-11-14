import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, shadow } from '../theme';
import { AccountRow } from '../auth';
import { OfflineCatalogCard } from '../catalog-offline/OfflineCatalogCard';
import { useI18n } from '../i18n';
import { TopBar } from '../TopBar';
import { T } from '../ui';
import { whatsapp } from '../links';
import { CONTACT } from '../config';
import type { RootParams } from '../types';
import { EyeHealthHub } from '../account/EyeHealthHub';
import { alpha, onBrand, onBrandSoft, tintRed, useL } from '../account/kit';

type Icon = keyof typeof Ionicons.glyphMap;

function Row({ icon, title, sub, onPress, right }: { icon: Icon; title: string; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  const { row, rtl } = useI18n();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={title}
      style={({ pressed }) => [s.row, shadow, { flexDirection: row, opacity: pressed ? 0.85 : 1 }]}>
      <View style={s.ic}><Ionicons name={icon} size={20} color={colors.red} /></View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold }}>{title}</T>
        {sub ? <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{sub}</T> : null}
      </View>
      {right ?? (onPress ? <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} /> : null)}
    </Pressable>
  );
}

function Group({ title }: { title: string }) {
  return <T style={{ fontFamily: font.black, fontSize: 15, color: colors.maroon, marginTop: 10, marginHorizontal: 4 }}>{title}</T>;
}

export default function MoreScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { t, row, rtl, lang, setLang } = useI18n();
  const L = useL();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <TopBar />
        <View style={{ padding: 16, gap: 12 }}>
          <AccountRow />
          <OfflineCatalogCard />
          <Pressable onPress={() => nav.navigate('Rewards')} accessibilityRole="button" accessibilityLabel={L('مكافآت البركات', 'Barakat Rewards')}
            style={[{ borderRadius: radius.lg, overflow: 'hidden' }, shadow]}>
            <LinearGradient colors={[colors.red, colors.maroon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { flexDirection: row }]}>
              <View style={s.heroIc}><Ionicons name="gift" size={26} color={colors.amber} /></View>
              <View style={{ flex: 1 }}>
                <T style={{ color: onBrand, fontFamily: font.black, fontSize: 18 }}>{L('مكافآت البركات', 'Barakat Rewards')}</T>
                <T style={{ color: onBrandSoft, fontSize: 12, marginTop: 2 }}>{L('نقاطك، بطاقة العضوية وباقات Plus و Max', 'Your points, member card and Plus / Max plans')}</T>
              </View>
              <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={onBrand} />
            </LinearGradient>
          </Pressable>

          <Row icon="diamond-outline" title="Barakat Plus / Max" sub={L('اشتراكات سنوية بمزايا حصرية', 'Annual plans with exclusive perks')} onPress={() => nav.navigate('Plans')} />

          <Group title={L('خدماتنا', 'Services')} />
          <Row icon="calendar-outline" title={t('bookExam')} sub={t('bookExamSub')} onPress={() => nav.navigate('Booking')} />
          <Row icon="document-text-outline" title={t('uploadRx')} sub={t('uploadRxSub')} onPress={() => nav.navigate('Prescription')} />
          <Row icon="sparkles-outline" title={t('smartFinder')} sub={t('smartFinderSub')} onPress={() => nav.navigate('Finder')} />
          <Row icon="book-outline" title={t('lensGuide')} sub={t('lensGuideSub')} onPress={() => nav.navigate('LensGuide')} />
          <Row icon="heart-outline" title={t('wishlist')} onPress={() => nav.navigate('Wishlist')} />
          <Row icon="cube-outline" title={t('orderTrack')} sub={t('orderTrackSub')}
            onPress={() => whatsapp(L('مرحباً، أرغب بمعرفة حالة طلبي رقم: ', 'Hello, I would like to check my order number: '))} />

          <Group title={L('صحة العين', 'Eye health')} />
          <EyeHealthHub onBook={() => nav.navigate('Booking')} />

          <Group title={L('الإعدادات والتواصل', 'Settings and contact')} />
          <Row icon="language-outline" title={t('language')} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            right={<T style={{ fontFamily: font.bold, color: colors.red }}>{lang === 'ar' ? 'English' : 'العربية'}</T>} />
          <Row icon="ear-outline" title={t('hearing')} sub={t('hearingSub')} onPress={() => Linking.openURL('https://linktr.ee/barakatha')} />
          <Row icon="call-outline" title={t('tollFree')} sub={'‎800 124 8882'} onPress={() => Linking.openURL(`tel:${CONTACT.tollFree}`)} />
          <Row icon="logo-whatsapp" title={t('whatsapp')} sub={'‎+966 55 907 1446'} onPress={() => whatsapp(L('مرحباً', 'Hello'))} />
          <Row icon="globe-outline" title="barakatoptical.com.sa" onPress={() => Linking.openURL('https://barakatoptical.com.sa')} />
          <T style={{ textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 8 }}>{t('about')} · {t('version')} 1.0.0</T>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 12 },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: tintRed, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: 18, alignItems: 'center', gap: 14 },
  heroIc: { width: 52, height: 52, borderRadius: 26, backgroundColor: alpha(colors.card, 0.14), alignItems: 'center', justifyContent: 'center' },
});
