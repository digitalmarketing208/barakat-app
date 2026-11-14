import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { TopBar } from '../TopBar';
import { Chip, Empty, T } from '../ui';
import { Branch, fmt12, hoursFor, ksaNow } from '../branches';
import { callBranch, directions, whatsapp } from '../links';
import { Located, useNearest } from '../useNearest';
import type { RootParams } from '../types';
import { alpha, onBrand, useL } from '../account/kit';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const SOON_MIN = 60;

type Status = {
  open: boolean;
  /** open, and closing within the hour */
  closingSoon: boolean;
  /** today's opening and closing, HH:MM */
  from: string; to: string;
  /** HH:MM of the next change: closing time when open, next opening when closed */
  next: string;
  /** the next opening is tomorrow */
  tomorrow: boolean;
};

// Live status from the branch hours in src/branches.ts, always in Saudi time (UTC+3).
function statusOf(b: Branch, at: Date): Status {
  const { day, minutes } = ksaNow(at);
  const [from, to] = hoursFor(b, day).split('-');
  const o = toMin(from), c = toMin(to);
  if (minutes >= o && minutes < c) return { open: true, closingSoon: c - minutes <= SOON_MIN, from, to, next: to, tomorrow: false };
  if (minutes < o) return { open: false, closingSoon: false, from, to, next: from, tomorrow: false };
  return { open: false, closingSoon: false, from, to, next: hoursFor(b, (day + 1) % 7).split('-')[0], tomorrow: true };
}

/** Green dot that breathes while the branch is open. */
function LiveDot({ color, live }: { color: string; live: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!live) { v.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, live]);
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      {live ? <Animated.View style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }] }} /> : null}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function Action({ icon, label, onPress, bg, fg = onBrand, border }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; bg: string; fg?: string; border?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.act, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, border ? { borderWidth: 1.5, borderColor: border } : null]}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={{ color: fg, fontFamily: font.bold, fontSize: 11 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </Pressable>
  );
}

const BranchCard = React.memo(function BranchCard({ b, nearest, now }: { b: Located; nearest: boolean; now: number }) {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { t, row, rtl } = useI18n();
  const L = useL();
  const st = statusOf(b, new Date(now));
  const tone = st.open ? (st.closingSoon ? colors.amber : colors.success) : colors.muted;
  const nextAt = fmt12(st.next, rtl);
  const line = st.open
    ? (st.closingSoon ? L(`يغلق قريباً · ${nextAt}`, `Closing soon · ${nextAt}`) : L(`${t('openNow')} · يغلق ${nextAt}`, `${t('openNow')} · closes ${nextAt}`))
    : L(`${t('closed')} · يفتح ${st.tomorrow ? 'غداً ' : ''}${nextAt}`, `${t('closed')} · opens ${st.tomorrow ? 'tomorrow ' : ''}${nextAt}`);
  const [fo, fc] = b.fri.split('-');
  const [wo, wc] = b.hours.split('-');
  const km = b.km == null ? null : b.km < 10 ? b.km.toFixed(1) : String(Math.round(b.km));
  return (
    <View style={[s.card, shadow, nearest && { borderColor: colors.red }]}>
      {nearest ? (
        <View style={[s.nearest, { flexDirection: row, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="navigate" size={11} color={onBrand} />
          <Text style={{ color: onBrand, fontFamily: font.bold, fontSize: 11 }}>{t('nearest')}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: row, alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.black, fontSize: 17 }}>{b.name}</T>
          <T style={{ color: colors.muted, fontSize: 13 }}>{b.addr}</T>
        </View>
        {km != null ? (
          <View style={[s.km, nearest && { backgroundColor: colors.red }]}>
            <Text style={{ fontFamily: font.bold, fontSize: 12, color: nearest ? onBrand : colors.maroon }}>{km} {t('km')}</Text>
          </View>
        ) : null}
      </View>

      <View style={[s.status, { flexDirection: row, backgroundColor: alpha(tone, 0.12) }]} accessibilityLabel={line}>
        <LiveDot color={tone} live={st.open} />
        <T style={{ flex: 1, fontFamily: font.bold, fontSize: 13, color: st.open && !st.closingSoon ? colors.success : st.open ? colors.maroon : colors.text }}>{line}</T>
      </View>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
        <Ionicons name="time-outline" size={14} color={colors.muted} />
        <T style={{ flex: 1, fontSize: 12, color: colors.muted }}>
          {L(`السبت - الخميس ${fmt12(wo, true)} - ${fmt12(wc, true)} · الجمعة ${fmt12(fo, true)} - ${fmt12(fc, true)}`,
            `Sat - Thu ${fmt12(wo, false)} - ${fmt12(wc, false)} · Fri ${fmt12(fo, false)} - ${fmt12(fc, false)}`)}
        </T>
      </View>

      <View style={{ flexDirection: row, gap: 8, marginTop: 4 }}>
        <Action icon="call" label={t('call')} bg={colors.red} onPress={() => { callBranch(b).catch(() => {}); }} />
        <Action icon="navigate" label={t('directions')} bg={colors.maroon} onPress={() => { directions(b).catch(() => {}); }} />
        <Action icon="logo-whatsapp" label={t('whatsapp')} bg={colors.success}
          onPress={() => { whatsapp(L(`مرحباً، لدي استفسار عن فرع ${b.name}`, `Hello, I have a question about the ${b.name} branch`)).catch(() => {}); }} />
        <Action icon="calendar" label={t('bookShort')} bg={colors.card} fg={colors.red} border={colors.red} onPress={() => nav.navigate('Booking', { branch: b.name })} />
      </View>
    </View>
  );
});

export default function BranchesScreen() {
  const { t, row, align } = useI18n();
  const L = useL();
  const { list, status } = useNearest();
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  // re-evaluate open / closed every 30 seconds while the screen is mounted
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const at = new Date(now);
    return list.filter((b) => (!k || (b.name + ' ' + b.addr).toLowerCase().includes(k)) && (!openOnly || statusOf(b, at).open));
  }, [list, q, openOnly, now]);
  const openCount = useMemo(() => { const at = new Date(now); return list.filter((b) => statusOf(b, at).open).length; }, [list, now]);
  const nearestName = status === 'ok' ? list[0]?.name : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar>
        <View style={[s.search, { flexDirection: row }]}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('allBranches')} placeholderTextColor={colors.muted} returnKeyType="search"
            accessibilityLabel={t('allBranches')} style={{ flex: 1, fontFamily: font.regular, fontSize: 15, textAlign: align, color: colors.text }} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={L('مسح', 'Clear')}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
        </View>
        {status === 'loading' ? <Text style={[s.hint, { textAlign: align }]}>{t('locating')}</Text> : null}
        {status === 'ok' ? <Text style={[s.hint, { textAlign: align }]}>{L('مرتبة من الأقرب إليك', 'Sorted nearest first')}</Text> : null}
        {status === 'denied' ? (
          <Pressable onPress={() => { Linking.openSettings().catch(() => {}); }} accessibilityRole="button">
            <Text style={[s.hint, { textAlign: align, textDecorationLine: 'underline' }]}>{L('فعّل الموقع من الإعدادات لعرض أقرب فرع والمسافة', 'Turn on location in Settings to see your nearest branch and distances')}</Text>
          </Pressable>
        ) : null}
      </TopBar>
      <FlatList
        data={shown} keyExtractor={(b) => b.name} extraData={now}
        renderItem={({ item }) => <BranchCard b={item} now={now} nearest={item.name === nearestName} />}
        ListHeaderComponent={(
          <View style={{ flexDirection: row, gap: 8, alignItems: 'center' }}>
            <Chip label={`${t('all')} (${list.length})`} active={!openOnly} onPress={() => setOpenOnly(false)} />
            <Chip label={`${t('openNow')} (${openCount})`} active={openOnly} onPress={() => setOpenOnly(true)} />
          </View>
        )}
        ListEmptyComponent={<Empty icon="location-outline" text={t('noResults')} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" initialNumToRender={6} windowSize={7}
      />
    </View>
  );
}

const s = StyleSheet.create({
  search: { marginTop: 14, backgroundColor: colors.card, borderRadius: radius.pill, height: 48, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  hint: { color: colors.beige, fontFamily: font.regular, fontSize: 12, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 8, borderWidth: 1.5, borderColor: colors.card },
  nearest: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignItems: 'center', gap: 4 },
  km: { backgroundColor: colors.beige, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  status: { alignItems: 'center', gap: 8, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10 },
  act: { flex: 1, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 },
});
