// Eye-health reminders (local notifications only, nothing leaves the phone):
//  - rest:    20-20-20 break, every 20 minutes while switched on
//  - eyeTest: yearly, on the anniversary of the last eye test
//  - rx:      once, two weeks before the prescription is a year old
//  - booking: once, before a booked eye exam (set from BookingScreen)
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const KEY = 'eyeHealth.v1';
const LEGACY_REST_KEY = 'rest';
const CHANNEL = 'eye-health';
const IDS = { rest: 'eye-rest-20-20-20', eyeTest: 'eye-test-yearly', rx: 'rx-expiry', booking: 'booking-reminder' } as const;

export const RX_VALID_MONTHS = 12;
const RX_WARN_DAYS = 14;
const HOUR = 10; // reminders arrive at 10:00 local time

/** Month precision is enough: { y: 2026, m: 0..11 }. */
export type YM = { y: number; m: number };
export type ReminderState = {
  rest: boolean;
  eyeTest: boolean;
  eyeTestDate: YM | null; // last eye test
  rx: boolean;
  rxDate: YM | null; // prescription issue date
  lang: Lang;
};
export type ReminderKind = 'rest' | 'eyeTest' | 'rx';

export const DEFAULT_STATE: ReminderState = { rest: false, eyeTest: false, eyeTestDate: null, rx: false, rxDate: null, lang: 'ar' };

export const ymNow = (d = new Date()): YM => ({ y: d.getFullYear(), m: d.getMonth() });
export const ymAdd = (a: YM, months: number): YM => { const n = a.y * 12 + a.m + months; return { y: Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; };
export const ymCmp = (a: YM, b: YM) => a.y * 12 + a.m - (b.y * 12 + b.m);
const ymDate = (a: YM, day = 1) => new Date(a.y, a.m, day, HOUR, 0, 0, 0);

/** When the next yearly eye test is due (first of the month, a year after the last test). */
export const eyeTestDue = (last: YM) => ymDate(ymAdd(last, 12));
export const rxExpiry = (issued: YM) => ymDate(ymAdd(issued, RX_VALID_MONTHS));

const text = {
  ar: {
    restT: 'استرح قليلاً', restB: 'انظر لمسافة ٦ أمتار لمدة ٢٠ ثانية',
    testT: 'حان موعد فحص النظر السنوي', testB: 'مرّت سنة على آخر فحص. احجز فحصك المجاني في أقرب فرع من البركات',
    rxT: 'وصفتك الطبية تقترب من الانتهاء', rxB: 'جدّد وصفتك بفحص نظر مجاني قبل طلب عدساتك القادمة',
    bookT: 'موعد فحص النظر اليوم', bookB: 'فرع {b} الساعة {t}',
  },
  en: {
    restT: 'Rest your eyes', restB: 'Look 6 metres away for 20 seconds',
    testT: 'Time for your yearly eye test', testB: 'It has been a year since your last test. Book a free exam at your nearest Barakat branch',
    rxT: 'Your prescription is about to expire', rxB: 'Renew it with a free eye exam before your next lens order',
    bookT: 'Your eye exam is today', bookB: '{b} branch at {t}',
  },
} as const;

export async function loadReminders(): Promise<ReminderState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<ReminderState>) };
    // first run after the update: keep the old 20-20-20 switch
    const legacy = await AsyncStorage.getItem(LEGACY_REST_KEY);
    return { ...DEFAULT_STATE, rest: legacy === '1' };
  } catch {
    return DEFAULT_STATE;
  }
}

async function save(s: ReminderState) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
    await AsyncStorage.setItem(LEGACY_REST_KEY, s.rest ? '1' : '0');
  } catch { /* best effort */ }
}

export async function hasPermission(): Promise<boolean> {
  try { return (await Notifications.getPermissionsAsync()).granted; } catch { return false; }
}

/** Asks for notification permission if needed and prepares the Android channel. */
export async function ensurePermission(): Promise<boolean> {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain !== false) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Eye health / صحة العين', importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    return true;
  } catch {
    return false;
  }
}

const cancel = (id: string) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
const tomorrowAt10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(HOUR, 0, 0, 0); return d; };

/**
 * Makes the scheduled notifications match `next` and stores it. Returns the state actually applied:
 * switches that could not be turned on (permission refused, missing date, scheduling error) come back off.
 */
export async function applyReminders(next: ReminderState, lang: Lang): Promise<ReminderState> {
  const out: ReminderState = { ...next, lang };
  const wantsAny = out.rest || out.eyeTest || out.rx;
  const allowed = wantsAny ? await ensurePermission() : false;
  const tx = text[lang];
  await Promise.all([cancel(IDS.rest), cancel(IDS.eyeTest), cancel(IDS.rx)]);
  if (!allowed) { out.rest = false; out.eyeTest = false; out.rx = false; await save(out); return out; }

  if (out.rest) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: IDS.rest,
        content: { title: tx.restT, body: tx.restB },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 20 * 60, repeats: true, channelId: CHANNEL },
      });
    } catch { out.rest = false; }
  }

  if (out.eyeTest) {
    if (!out.eyeTestDate) out.eyeTest = false;
    else {
      try {
        // repeats every year in the month of the last test (JS ranges: January = 0)
        await Notifications.scheduleNotificationAsync({
          identifier: IDS.eyeTest,
          content: { title: tx.testT, body: tx.testB, data: { screen: 'Booking' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.YEARLY, month: out.eyeTestDate.m, day: 1, hour: HOUR, minute: 0, channelId: CHANNEL },
        });
      } catch { out.eyeTest = false; }
    }
  }

  if (out.rx) {
    const expiry = out.rxDate ? rxExpiry(out.rxDate) : null;
    if (!expiry || expiry.getTime() <= Date.now()) out.rx = false; // expired or no date: nothing to schedule
    else {
      const warn = new Date(expiry.getTime() - RX_WARN_DAYS * 86400000);
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: IDS.rx,
          content: { title: tx.rxT, body: tx.rxB, data: { screen: 'Booking' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: warn.getTime() > Date.now() ? warn : tomorrowAt10(), channelId: CHANNEL },
        });
      } catch { out.rx = false; }
    }
  }

  await save(out);
  return out;
}

/** Re-writes the scheduled texts after the app language changed. */
export async function syncReminderLanguage(lang: Lang): Promise<void> {
  const s = await loadReminders();
  if (s.lang === lang || !(s.rest || s.eyeTest || s.rx)) return;
  if (!(await hasPermission())) return;
  await applyReminders(s, lang);
}

/** One-off reminder before a booked eye exam: 2 hours ahead, or 30 minutes when the slot is sooner. */
export async function scheduleBookingReminder(at: Date, branch: string, time: string, lang: Lang): Promise<boolean> {
  const ms = at.getTime() - Date.now();
  const fire = ms > 150 * 60000 ? new Date(at.getTime() - 120 * 60000) : ms > 45 * 60000 ? new Date(at.getTime() - 30 * 60000) : null;
  if (!fire || !(await ensurePermission())) return false;
  try {
    await cancel(IDS.booking);
    await Notifications.scheduleNotificationAsync({
      identifier: IDS.booking,
      content: { title: text[lang].bookT, body: text[lang].bookB.replace('{b}', branch).replace('{t}', time) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire, channelId: CHANNEL },
    });
    return true;
  } catch {
    return false;
  }
}
