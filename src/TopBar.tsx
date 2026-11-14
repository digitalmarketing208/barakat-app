import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { colors, font } from './theme';
import { useI18n } from './i18n';
import { useStore } from './store';
import type { RootParams } from './types';
import { PressableScale } from './discovery/motion';
import { useDir } from './discovery/dir';
import { alpha, white } from './discovery/tint';

// Cart badge that pops whenever the count changes, so adding to cart is felt everywhere.
function Badge({ count }: { count: number }) {
  const { end } = useDir();
  const v = useSharedValue(1);
  useEffect(() => {
    if (count > 0) v.set(withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 300 })));
  }, [count, v]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  if (count <= 0) return null;
  return (
    <Animated.View style={[s.badge, end(-2), st]}>
      <Text style={{ color: white, fontSize: 10, fontFamily: font.bold }}>{count > 99 ? '99+' : count}</Text>
    </Animated.View>
  );
}

export function TopBar({ children, compact }: { children?: React.ReactNode; /** Hide the tagline for a shorter bar. */ compact?: boolean }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { lang, setLang, t } = useI18n();
  const { row, end } = useDir();
  const { cart, wishlist } = useStore();
  const count = cart?.totalQuantity ?? 0;
  return (
    <LinearGradient colors={[colors.dark, colors.maroon]} style={{ paddingTop: insets.top + 8, paddingBottom: compact ? 12 : 16, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Image source={require('../assets/brand/logo-lockup-white.png')} style={{ width: 190, height: 27.5 }} contentFit="contain" accessibilityLabel="Barakat Optical" />
          {!compact && <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.beige }}>{t('tagline')}</Text>}
        </View>
        <View style={{ flexDirection: row, gap: 8 }}>
          <PressableScale haptics to={0.9} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} style={s.icon} accessibilityRole="button" accessibilityLabel={t('language')}>
            <Text style={{ color: white, fontFamily: font.bold, fontSize: 13 }}>{lang === 'ar' ? 'EN' : 'ع'}</Text>
          </PressableScale>
          <PressableScale haptics to={0.9} onPress={() => nav.navigate('Wishlist')} style={s.icon} accessibilityRole="button" accessibilityLabel={t('wishlist')}>
            <Ionicons name="heart-outline" size={20} color={white} />
            {wishlist.length > 0 && <View style={[s.dot, end(8)]} />}
          </PressableScale>
          <PressableScale haptics to={0.9} onPress={() => nav.navigate('Cart')} style={s.icon} accessibilityRole="button" accessibilityLabel={t('cart')}>
            <Ionicons name="bag-outline" size={20} color={white} />
            <Badge count={count} />
          </PressableScale>
        </View>
      </View>
      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(colors.card, 0.14), alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dot: { position: 'absolute', top: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
});
