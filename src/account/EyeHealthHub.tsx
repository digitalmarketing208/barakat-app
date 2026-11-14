// Eye-health hub: three local reminders the customer can switch on and off.
// Rendered inside MoreScreen; needs no route of its own.
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import { alpha, tap, tintRed, useL } from './kit';
import {
  DEFAULT_STATE, ReminderKind, ReminderState, RX_VALID_MONTHS, YM,
  applyReminders, eyeTestDue, loadReminders, rxExpiry, syncReminderLanguage, ymAdd, ymCmp, ymNow,
} from './reminders';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_BACK = 60; // months

export const fmtYM = (a: YM, ar: boolean) => `${(ar ? MONTHS_AR : MONTHS_EN)[a.m]} ${a.y}`;

/** ‹ March 2026 ›  never later than this month, at most five years back. */
function MonthStepper({ value, onChange, label }: { value: YM; onChange: (v: YM) => void; label: string }) {
  const { row, rtl } = useI18n();
  const now = ymNow();
  const canNext = ymCmp(value, now) < 0;
  const canPrev = ymCmp(now, value) < MAX_BACK;
  const L = useL();
  const step = (n: number) => { tap(); onChange(ymAdd(value, n)); };
  return (
    <View style={[s.stepper, { flexDirection: row }]}>
      <T style={{ flex: 1, fontSize: 13, color: colors.muted }}>{label}</T>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => step(-1)} disabled={!canPrev} hitSlop={8} style={[s.stepBtn, !canPrev && s.off]}
          accessibilityRole="button" accessibilityLabel={L('الشهر السابق', 'Previous month')}>
          <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.maroon} />
        </Pressable>
        <T style={{ fontFamily: font.bold, minWidth: 92, textAlign: 'center' }}>{fmtYM(value, rtl)}</T>
        <Pressable onPress={() => step(1)} disabled={!canNext} hitSlop={8} style={[s.stepBtn, !canNext && s.off]}
          accessibilityRole="button" accessibilityLabel={L('الشهر التالي', 'Next month')}>
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.maroon} />
        </Pressable>
      </View>
    </View>
  );
}

function Item({ icon, title, sub, value, onToggle, children, note, noteTone }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; value: boolean; onToggle: (v: boolean) => void;
  children?: React.ReactNode; note?: string; noteTone?: 'ok' | 'warn';
}) {
  const { row } = useI18n();
  return (
    <View style={s.item}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
        <View style={s.ic}><Ionicons name={icon} size={20} color={colors.red} /></View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold }}>{title}</T>
          <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{sub}</T>
        </View>
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: colors.red, false: colors.line }} thumbColor={colors.card}
          accessibilityLabel={title} />
      </View>
      {children}
      {note ? (
        <View style={[s.note, { flexDirection: row, backgroundColor: noteTone === 'warn' ? alpha(colors.amber, 0.2) : alpha(colors.success, 0.1) }]}>
          <Ionicons name={noteTone === 'warn' ? 'alert-circle' : 'checkmark-circle'} size={16} color={noteTone === 'warn' ? colors.maroon : colors.success} />
          <T style={{ flex: 1, fontSize: 12, color: noteTone === 'warn' ? colors.maroon : colors.text }}>{note}</T>
        </View>
      ) : null}
    </View>
  );
}

const clockNow = () => Date.now();

export function EyeHealthHub({ onBook }: { onBook: () => void }) {
  const { lang, rtl, row } = useI18n();
  const L = useL();
  const [st, setSt] = useState<ReminderState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [now] = useState(clockNow); // render-time clock, fixed when the screen opens
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    loadReminders().then((v) => { if (alive) { setSt(v); setReady(true); } });
    return () => { alive = false; };
  }, []);
  // keep the scheduled texts in the app language
  useEffect(() => { if (ready) syncReminderLanguage(lang).catch(() => {}); }, [lang, ready]);

  const commit = async (next: ReminderState, asked?: ReminderKind) => {
    setSt(next); // optimistic; corrected below if the phone refuses
    const applied = await applyReminders(next, lang);
    setSt(applied);
    setDenied(!!asked && next[asked] && !applied[asked] && !(asked === 'rx' && isExpired(next.rxDate, clockNow())));
  };
  const isExpired = (d: YM | null, at: number) => !!d && rxExpiry(d).getTime() <= at;

  const toggle = (k: ReminderKind) => (on: boolean) => {
    tap();
    const next = { ...st, [k]: on } as ReminderState;
    if (on && k === 'eyeTest' && !next.eyeTestDate) next.eyeTestDate = ymNow();
    if (on && k === 'rx' && !next.rxDate) next.rxDate = ymNow();
    void commit(next, on ? k : undefined);
  };

  const date = (d: Date) => fmtYM({ y: d.getFullYear(), m: d.getMonth() }, rtl);
  const testDue = st.eyeTestDate ? eyeTestDue(st.eyeTestDate) : null;
  const testOverdue = !!testDue && testDue.getTime() <= now;
  const rxEnd = st.rxDate ? rxExpiry(st.rxDate) : null;
  const rxOver = isExpired(st.rxDate, now);

  return (
    <View style={[s.card, shadow]}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <Ionicons name="eye" size={22} color={colors.maroon} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.black, fontSize: 17 }}>{L('صحة عينيك', 'Your eye health')}</T>
          <T style={{ color: colors.muted, fontSize: 12 }}>{L('تذكيرات تحفظ نظرك، تتحكم بها أنت', 'Reminders that protect your sight, you stay in control')}</T>
        </View>
      </View>

      <Item icon="timer-outline" value={st.rest} onToggle={toggle('rest')}
        title={L('استراحة 20-20-20', '20-20-20 break')}
        sub={L('كل ٢٠ دقيقة: انظر لمسافة ٦ أمتار لمدة ٢٠ ثانية', 'Every 20 min: look 6 metres away for 20 seconds')}
        note={st.rest ? L('مفعّل. أوقفه عند انتهاء وقت الشاشة', 'On. Switch it off when your screen time ends') : undefined} noteTone="ok" />

      <Item icon="calendar-outline" value={st.eyeTest} onToggle={toggle('eyeTest')}
        title={L('فحص النظر السنوي', 'Yearly eye test')}
        sub={L('نذكّرك كل سنة بموعد فحصك المجاني', 'A yearly nudge for your free eye exam')}
        note={!st.eyeTest || !testDue ? undefined
          : testOverdue ? L('مرّت أكثر من سنة على آخر فحص. احجز فحصك الآن', 'More than a year since your last test. Book one now')
            : L(`التذكير القادم: ${date(testDue)}`, `Next reminder: ${date(testDue)}`)}
        noteTone={testOverdue ? 'warn' : 'ok'}>
        {st.eyeTest && st.eyeTestDate ? (
          <MonthStepper label={L('آخر فحص نظر', 'Last eye test')} value={st.eyeTestDate} onChange={(v) => void commit({ ...st, eyeTestDate: v })} />
        ) : null}
      </Item>

      <Item icon="document-text-outline" value={st.rx} onToggle={toggle('rx')}
        title={L('انتهاء الوصفة الطبية', 'Prescription expiry')}
        sub={L(`ننبّهك قبل مرور ${RX_VALID_MONTHS} شهراً على وصفتك`, `A heads-up before your prescription is ${RX_VALID_MONTHS} months old`)}
        note={!st.rxDate || !rxEnd || (!st.rx && !rxOver) ? undefined
          : rxOver ? L(`وصفتك أقدم من ${RX_VALID_MONTHS} شهراً. ننصح بفحص جديد`, `Your prescription is over ${RX_VALID_MONTHS} months old. A new test is advised`)
            : L(`تنتهي في ${date(rxEnd)} وسنذكّرك قبلها بأسبوعين`, `Expires ${date(rxEnd)}. We remind you two weeks before`)}
        noteTone={rxOver ? 'warn' : 'ok'}>
        {(st.rx || rxOver) && st.rxDate ? (
          <MonthStepper label={L('تاريخ الوصفة', 'Prescription date')} value={st.rxDate} onChange={(v) => void commit({ ...st, rxDate: v, rx: true }, 'rx')} />
        ) : null}
      </Item>

      {denied ? (
        <Pressable onPress={() => { Linking.openSettings().catch(() => {}); }} style={[s.note, { flexDirection: row, backgroundColor: alpha(colors.amber, 0.2) }]} accessibilityRole="button">
          <Ionicons name="notifications-off-outline" size={16} color={colors.maroon} />
          <T style={{ flex: 1, fontSize: 12, color: colors.maroon }}>{L('الإشعارات متوقفة لهذا التطبيق. اضغط لفتح الإعدادات', 'Notifications are off for this app. Tap to open Settings')}</T>
        </Pressable>
      ) : null}

      {(testOverdue && st.eyeTest) || rxOver ? (
        <Button title={L('احجز فحص نظر مجاني', 'Book a free eye exam')} icon="calendar-outline" onPress={onBook} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 14 },
  item: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: tintRed, alignItems: 'center', justifyContent: 'center' },
  stepper: { alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  note: { alignItems: 'center', gap: 8, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 },
});
