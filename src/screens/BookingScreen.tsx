import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { Button, Chip, T } from '../ui';
import { BRANCHES, fmt12, hoursFor, ksaNow } from '../branches';
import { whatsapp } from '../links';
import { useNearest } from '../useNearest';
import type { RootParams } from '../types';
import { ScreenHeader, tap, useL } from '../account/kit';
import { scheduleBookingReminder } from '../account/reminders';

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, '0');

export default function BookingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const route = useRoute<RouteProp<RootParams, 'Booking'>>();
  const { t, row, rtl, lang } = useI18n();
  const L = useL();
  const [remind, setRemind] = useState(true);
  const [reminded, setReminded] = useState(false);
  const { list } = useNearest();
  const [branchName, setBranchName] = useState<string | null>(route.params?.branch ?? null);
  const [offset, setOffset] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const branch = BRANCHES.find((b) => b.name === (branchName ?? list[0]?.name)) ?? BRANCHES[0];

  const [openedAt] = useState(() => Date.now()); // fixed when the screen opens, like the day list below
  const days = useMemo(() => {
    const now = ksaNow(); const out: { offset: number; dow: number; date: number; midnight: number }[] = [];
    const base = new Date(openedAt + 3 * 3600 * 1000);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      // midnight: the absolute instant that day starts in Saudi time (UTC+3)
      out.push({ offset: i, dow: (now.day + i) % 7, date: d.getUTCDate(), midnight: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 3600 * 1000 });
    }
    return out;
  }, [openedAt]);
  const chosen = days[offset];

  const slots = useMemo(() => {
    const [o, c] = hoursFor(branch, chosen.dow).split('-').map(toMin);
    const now = ksaNow().minutes;
    const res: string[] = [];
    // hourly slots, last one at least 45 minutes before closing; today only future slots
    for (let m = Math.ceil(o / 60) * 60; m <= c - 45; m += 60) {
      if (offset === 0 && m <= now + 30) continue;
      res.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
    return res;
  }, [branch, chosen, offset]);

  const dayLabel = (d: { offset: number; dow: number }) => (d.offset === 0 ? t('today') : d.offset === 1 ? t('tomorrow') : (rtl ? DAYS_AR : DAYS_EN)[d.dow]);

  const send = () => {
    if (!slot) return;
    const msg = rtl
      ? `مرحباً، أرغب بحجز فحص نظر مجاني\nالفرع: ${branch.name}\nاليوم: ${DAYS_AR[chosen.dow]} ${chosen.date}\nالوقت: ${fmt12(slot, true)}`
      : `Hello, I would like to book a free eye exam\nBranch: ${branch.name}\nDay: ${DAYS_EN[chosen.dow]} ${chosen.date}\nTime: ${fmt12(slot, false)}`;
    whatsapp(msg).catch(() => {});
    if (remind) {
      const at = new Date(chosen.midnight + toMin(slot) * 60000);
      scheduleBookingReminder(at, branch.name, fmt12(slot, rtl), lang).then(setReminded).catch(() => {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('bookTitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 60 }}>
        <T style={{ fontFamily: font.bold }}>{t('bookBranch')}</T>
        <Pressable onPress={() => setShowAll((x) => !x)} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 16, flexDirection: row, alignItems: 'center', gap: 10 }} accessibilityRole="button">
          <Ionicons name="location" size={20} color={colors.red} />
          <T style={{ flex: 1, fontFamily: font.bold }}>{branch.name}</T>
          <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </Pressable>
        {showAll && (
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, maxHeight: 260, overflow: 'hidden' }}>
            <ScrollView nestedScrollEnabled>
              {list.map((b) => (
                <Pressable key={b.name} onPress={() => { tap(); setBranchName(b.name); setSlot(null); setShowAll(false); setReminded(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.line }} accessibilityRole="button">
                  <T style={{ fontFamily: b.name === branch.name ? font.bold : font.regular }}>{b.name}{b.km != null ? `  ·  ${b.km.toFixed(1)} ${t('km')}` : ''}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <T style={{ fontFamily: font.bold, marginTop: 6 }}>{t('bookDay')}</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: row }}>
          {days.map((d) => <Chip key={d.offset} label={`${dayLabel(d)} ${d.date}`} active={offset === d.offset} onPress={() => { setOffset(d.offset); setSlot(null); }} />)}
        </ScrollView>

        <T style={{ fontFamily: font.bold, marginTop: 6 }}>{t('bookTime')}</T>
        {slots.length === 0 ? <T style={{ color: colors.muted }}>{t('closed')}</T> : (
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {slots.map((sl) => <Chip key={sl} label={fmt12(sl, rtl)} active={slot === sl} onPress={() => setSlot(sl)} />)}
          </View>
        )}
        <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 14, flexDirection: row, alignItems: 'center', gap: 12, marginTop: 6 }}>
          <Ionicons name={reminded ? 'notifications' : 'notifications-outline'} size={20} color={reminded ? colors.success : colors.red} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold }}>{L('ذكّرني قبل الموعد', 'Remind me before the appointment')}</T>
            <T style={{ color: colors.muted, fontSize: 12 }}>{reminded ? L('تم ضبط التذكير على هذا الجهاز', 'Reminder set on this phone') : L('إشعار قبل موعدك بساعتين', 'A notification two hours before your slot')}</T>
          </View>
          <Switch value={remind} onValueChange={(v) => { tap(); setRemind(v); }} trackColor={{ true: colors.red, false: colors.line }} thumbColor={colors.card}
            accessibilityLabel={L('ذكّرني قبل الموعد', 'Remind me before the appointment')} />
        </View>
        <Button style={{ marginTop: 10 }} title={t('bookSend')} icon="logo-whatsapp" disabled={!slot} onPress={send} />
        <T style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>{t('freeExam')}</T>
        <T style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>{L('يُؤكَّد الموعد بعد رد فريقنا على واتساب', 'Your slot is confirmed once our team replies on WhatsApp')}</T>
      </ScrollView>
    </View>
  );
}
