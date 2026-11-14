// First-launch onboarding: 3 slides (welcome + language, what the app does, why we ask for notifications).
// The "seen" flag is stored in AsyncStorage. Mount <OnboardingGate> inside I18nProvider and SafeAreaProvider:
//
//   <I18nProvider><StoreProvider><OnboardingGate><Navigation /></OnboardingGate></StoreProvider></I18nProvider>
//
// or render <Onboarding onDone={...} /> yourself and use hasOnboarded() / resetOnboarding().
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, font, radius } from '../theme';
import { Lang, useI18n } from '../i18n';
import { T } from '../ui';
import { alpha, onBrand, onBrandSoft, tap, useL } from '../account/kit';
import { ensurePermission } from '../account/reminders';

export const ONBOARDING_KEY = 'onboarding.done.v1';

export async function hasOnboarded(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1'; } catch { return true; } // never trap the user if storage fails
}
export async function resetOnboarding(): Promise<void> {
  try { await AsyncStorage.removeItem(ONBOARDING_KEY); } catch { /* ignore */ }
}
async function markDone() {
  try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
}

type Icon = keyof typeof Ionicons.glyphMap;
const SLIDES = 3;

function Feature({ icon, title, sub, index }: { icon: Icon; title: string; sub: string; index: number }) {
  const { row } = useI18n();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 380, delay: 120 + index * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, index]);
  return (
    <Animated.View style={[s.feature, { flexDirection: row, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <View style={s.featureIc}><Ionicons name={icon} size={22} color={colors.amber} /></View>
      <View style={{ flex: 1 }}>
        <T style={{ color: onBrand, fontFamily: font.bold, fontSize: 15 }}>{title}</T>
        <T style={{ color: onBrandSoft, fontSize: 12 }}>{sub}</T>
      </View>
    </Animated.View>
  );
}

function LangChoice({ code, label, sub }: { code: Lang; label: string; sub: string }) {
  const { lang, setLang, row } = useI18n();
  const on = lang === code;
  return (
    <Pressable onPress={() => { tap(); setLang(code); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={[s.lang, { flexDirection: row }, on && { backgroundColor: colors.card, borderColor: colors.card }]}>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.black, fontSize: 17, color: on ? colors.maroon : onBrand }}>{label}</T>
        <T style={{ fontSize: 12, color: on ? colors.muted : onBrandSoft }}>{sub}</T>
      </View>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.red : onBrandSoft} />
    </Pressable>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { row, rtl } = useI18n();
  const L = useL();
  const [i, setI] = useState(0);
  const [asking, setAsking] = useState(false);
  const [v] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);

  // slide + fade between pages; the travel direction follows the reading direction
  const go = (next: number) => {
    if (next === i || next < 0 || next >= SLIDES) return;
    tap();
    Animated.timing(v, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setDir(next > i ? 1 : -1);
      setI(next);
      Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };
  const shift = v.interpolate({ inputRange: [0, 1], outputRange: [28 * dir * (rtl ? -1 : 1), 0] });

  const finish = async () => { await markDone(); onDone(); };
  const allow = async () => {
    if (asking) return;
    setAsking(true);
    await ensurePermission(); // the system prompt is the decision; either answer continues
    setAsking(false);
    await finish();
  };

  const last = i === SLIDES - 1;
  return (
    <LinearGradient colors={[colors.dark, colors.maroon, colors.red]} locations={[0, 0.6, 1]} style={[s.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18 }]}>
      <StatusBar style="light" />
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <Image source={require('../../assets/brand/logo-lockup-white.png')} style={{ width: 170, height: 25 }} contentFit="contain" accessibilityLabel="Barakat Optical" />
        {!last ? (
          <Pressable onPress={() => go(SLIDES - 1)} hitSlop={10} accessibilityRole="button" style={s.skip}>
            <Text style={{ color: onBrand, fontFamily: font.medium, fontSize: 13 }}>{L('تخطي', 'Skip')}</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.View style={{ flex: 1, opacity: v, transform: [{ translateX: shift }] }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 18, paddingVertical: 14 }}>
        {i === 0 && (
          <>
            <View style={s.bigIc}><Ionicons name="glasses" size={46} color={colors.amber} /></View>
            <T style={s.title}>{L('أهلاً بك في البركات للبصريات', 'Welcome to Barakat Optical')}</T>
            <T style={s.sub}>{L('أخصائيون في البصريات منذ 1980. اختر لغتك لنبدأ', 'Optical specialists since 1980. Choose your language to begin')}</T>
            <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
              <LangChoice code="ar" label="العربية" sub="التطبيق باللغة العربية" />
              <LangChoice code="en" label="English" sub="Use the app in English" />
            </View>
          </>
        )}
        {i === 1 && (
          <>
            <T style={s.title}>{L('كل ما تحتاجه لنظرك في مكان واحد', 'Everything for your eyes in one place')}</T>
            <View style={{ gap: 10 }}>
              <Feature index={0} icon="camera" title={L('جرّب النظارة بالكاميرا', 'Try frames on with your camera')} sub={L('شاهد الإطار على وجهك قبل الشراء', 'See the frame on your face before you buy')} />
              <Feature index={1} icon="calendar" title={L('فحص نظر مجاني', 'Free eye exam')} sub={L('احجز في أقرب فرع إليك خلال ثوانٍ', 'Book at your nearest branch in seconds')} />
              <Feature index={2} icon="gift" title={L('مكافآت البركات', 'Barakat Rewards')} sub={L('اكسب نقاطاً على كل ريال واستبدلها بخصومات', 'Earn points on every riyal and turn them into discounts')} />
              <Feature index={3} icon="document-text" title={L('وصفتك الطبية معك دائماً', 'Your prescription, always with you')} sub={L('احفظها وأرسلها لنا مع رقم طلبك', 'Save it and send it to us with your order number')} />
            </View>
          </>
        )}
        {i === 2 && (
          <>
            <View style={s.bigIc}><Ionicons name="notifications" size={44} color={colors.amber} /></View>
            <T style={s.title}>{L('تذكيرات تهتم بنظرك', 'Reminders that look after your eyes')}</T>
            <T style={s.sub}>{L('نطلب إذن الإشعارات لهذه الأسباب فقط، وتتحكم بكل تذكير من صفحة المزيد', 'We ask for notifications only for the reasons below. You control every reminder from the More tab')}</T>
            <View style={{ gap: 10 }}>
              <Feature index={0} icon="eye" title={L('موعد فحص النظر السنوي', 'Your yearly eye test')} sub={L('تذكير واحد في السنة', 'One reminder a year')} />
              <Feature index={1} icon="document-text" title={L('قبل انتهاء وصفتك الطبية', 'Before your prescription expires')} sub={L('لتجدّدها قبل طلب عدساتك', 'So you can renew it before ordering lenses')} />
              <Feature index={2} icon="timer" title={L('استراحة 20-20-20 للعين', '20-20-20 eye breaks')} sub={L('اختيارية وتعمل فقط عند تفعيلها', 'Optional, only when you switch it on')} />
            </View>
            <T style={[s.sub, { fontSize: 12 }]}>{L('لا إعلانات مزعجة. يمكنك إيقاف الإشعارات في أي وقت', 'No spam. You can turn notifications off at any time')}</T>
          </>
        )}
        </ScrollView>
      </Animated.View>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: row, justifyContent: 'center', gap: 6 }} accessibilityLabel={`${i + 1} / ${SLIDES}`}>
          {Array.from({ length: SLIDES }, (_, k) => <View key={k} style={[s.dot, k === i && s.dotOn]} />)}
        </View>
        {last ? (
          <>
            <Pressable onPress={allow} disabled={asking} accessibilityRole="button" style={({ pressed }) => [s.cta, { flexDirection: row, opacity: pressed ? 0.85 : 1 }]}>
              {asking ? <ActivityIndicator color={colors.maroon} /> : (
                <>
                  <Ionicons name="notifications-outline" size={20} color={colors.maroon} />
                  <Text style={s.ctaText}>{L('فعّل التذكيرات', 'Turn on reminders')}</Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={finish} disabled={asking} accessibilityRole="button" style={s.ghost}>
              <Text style={{ color: onBrand, fontFamily: font.bold, fontSize: 15 }}>{L('ليس الآن', 'Not now')}</Text>
            </Pressable>
          </>
        ) : (
          <View style={{ flexDirection: row, gap: 10 }}>
            {i > 0 ? (
              <Pressable onPress={() => go(i - 1)} accessibilityRole="button" accessibilityLabel={L('السابق', 'Back')} style={s.backBtn}>
                <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={22} color={onBrand} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => go(i + 1)} accessibilityRole="button" style={({ pressed }) => [s.cta, { flex: 1, flexDirection: row, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={s.ctaText}>{L('التالي', 'Next')}</Text>
              <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={20} color={colors.maroon} />
            </Pressable>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

/** Shows the onboarding once, then renders the app. While the flag is being read it shows a blank branded screen. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'show' | 'done'>('checking');
  useEffect(() => {
    let alive = true;
    hasOnboarded().then((seen) => { if (alive) setState(seen ? 'done' : 'show'); });
    return () => { alive = false; };
  }, []);
  if (state === 'checking') return <View style={{ flex: 1, backgroundColor: colors.dark }} />;
  if (state === 'show') return <Onboarding onDone={() => setState('done')} />;
  return <>{children}</>;
}

export default OnboardingGate;

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22 },
  skip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: alpha(colors.card, 0.14), alignItems: 'center', justifyContent: 'center' },
  bigIc: { width: 88, height: 88, borderRadius: 44, backgroundColor: alpha(colors.card, 0.12), alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { color: onBrand, fontFamily: font.black, fontSize: 26, textAlign: 'center' },
  sub: { color: onBrandSoft, fontSize: 14, textAlign: 'center' },
  lang: { borderRadius: radius.md, borderWidth: 1.5, borderColor: alpha(colors.card, 0.35), paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  feature: { backgroundColor: alpha(colors.card, 0.1), borderRadius: radius.md, padding: 12, alignItems: 'center', gap: 12 },
  featureIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: alpha(colors.card, 0.12), alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: alpha(colors.card, 0.35) },
  dotOn: { width: 24, backgroundColor: colors.amber },
  cta: { height: 54, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: colors.maroon, fontFamily: font.black, fontSize: 16 },
  ghost: { height: 46, alignItems: 'center', justifyContent: 'center' },
  backBtn: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: alpha(colors.card, 0.4), alignItems: 'center', justifyContent: 'center' },
});
