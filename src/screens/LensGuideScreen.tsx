import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import type { RootParams } from '../types';
import { FadeIn, ScreenHeader, tintRed } from '../account/kit';

const GUIDE = [
  { icon: 'eye-outline' as const,
    ar: ['عدسات أحادية الرؤية', 'لتصحيح قصر أو طول النظر بقوة واحدة. الخيار الأنسب للاستخدام اليومي.'],
    en: ['Single vision', 'One power for near- or far-sightedness. The everyday choice.'] },
  { icon: 'layers-outline' as const,
    ar: ['عدسات متعددة البؤر (تدريجية)', 'تنتقل بسلاسة بين النظر البعيد والمتوسط والقريب بدون خط فاصل.'],
    en: ['Progressive', 'Smooth change between far, middle and near with no visible line.'] },
  { icon: 'phone-portrait-outline' as const,
    ar: ['فلتر الضوء الأزرق', 'يقلل إجهاد العين أمام الشاشات والألعاب لفترات طويلة.'],
    en: ['Blue-light filter', 'Reduces eye strain from long screen and gaming sessions.'] },
  { icon: 'sunny-outline' as const,
    ar: ['عدسات متغيرة اللون', 'تغمق في الشمس وتصفو في الداخل، حماية من الأشعة فوق البنفسجية.'],
    en: ['Photochromic', 'Darken in sunlight and clear indoors, with UV protection.'] },
  { icon: 'ellipse-outline' as const,
    ar: ['العدسات اللاصقة', 'يومية أو شهرية أو سنوية. اختر حسب راحتك وطبيعة استخدامك.'],
    en: ['Contact lenses', 'Daily, monthly or yearly. Pick by comfort and how you use them.'] },
];

export default function LensGuideScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { t, row, lang } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('lensGuide')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}>
        {GUIDE.map((g, i) => (
          <FadeIn key={g.en[0]} index={i}>
            <View style={[s.card, shadow]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
                <View style={s.ic}><Ionicons name={g.icon} size={22} color={colors.red} /></View>
                <T style={{ fontFamily: font.black, fontSize: 17, flex: 1 }}>{g[lang][0]}</T>
              </View>
              <T style={{ color: colors.muted, lineHeight: 22 }}>{g[lang][1]}</T>
            </View>
          </FadeIn>
        ))}
        <Button title={t('bookExam')} icon="calendar-outline" onPress={() => nav.navigate('Booking')} style={{ marginTop: 6 }} />
        <Button title={t('uploadRx')} icon="document-text-outline" variant="ghost" onPress={() => nav.navigate('Prescription')} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 10 },
  ic: { width: 42, height: 42, borderRadius: 21, backgroundColor: tintRed, alignItems: 'center', justifyContent: 'center' },
});
