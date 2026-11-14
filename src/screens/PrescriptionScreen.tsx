import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import { whatsapp } from '../links';
import type { RootParams } from '../types';
import { FadeIn, ScreenHeader, alpha, onBrand, tap, useL } from '../account/kit';
import { SavedRx, listRx, mimeOf, removeRx, saveRx, setRxOrder } from '../account/rxStore';
import { applyReminders, loadReminders, ymNow } from '../account/reminders';

function Step({ n, done, title, sub, children }: { n: number; done: boolean; title: string; sub: string; children: React.ReactNode }) {
  const { row } = useI18n();
  return (
    <View style={[s.card, shadow]}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <View style={[s.stepNo, done && { backgroundColor: colors.success }]}>
          {done ? <Ionicons name="checkmark" size={16} color={onBrand} /> : <T style={{ color: onBrand, fontFamily: font.black, fontSize: 13, textAlign: 'center' }}>{n}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold, fontSize: 15 }}>{title}</T>
          <T style={{ color: colors.muted, fontSize: 12 }}>{sub}</T>
        </View>
      </View>
      {children}
    </View>
  );
}

export default function PrescriptionScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { t, row, rtl, lang, align } = useI18n();
  const L = useL();
  const [saved, setSaved] = useState<SavedRx[]>([]);
  const [current, setCurrent] = useState<SavedRx | null>(null);
  const [orderNo, setOrderNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentMsg, setSentMsg] = useState(false);
  const [sentPhoto, setSentPhoto] = useState(false);
  const [remind, setRemind] = useState(false);

  useEffect(() => {
    let alive = true;
    listRx().then((l) => { if (alive) { setSaved(l); setCurrent((c) => c ?? l[0] ?? null); setOrderNo((o) => o || l[0]?.orderNo || ''); } });
    loadReminders().then((r) => { if (alive) setRemind(r.rx); });
    return () => { alive = false; };
  }, []);

  const select = (r: SavedRx) => { tap(); setCurrent(r); setOrderNo(r.orderNo ?? ''); setSentMsg(false); setSentPhoto(false); };

  const store = async (uri: string) => {
    setBusy(true);
    try {
      const item = await saveRx(uri);
      setSaved(await listRx());
      setCurrent(item); setSentMsg(false); setSentPhoto(false);
    } catch {
      Alert.alert(L('تعذر حفظ الصورة', 'Could not save the photo'), L('حاول مرة أخرى', 'Please try again'));
    } finally { setBusy(false); }
  };

  const fromLibrary = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!r.canceled && r.assets[0]) await store(r.assets[0].uri);
    } catch { Alert.alert(t('loadError')); }
  };
  const fromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(L('نحتاج إذن الكاميرا', 'Camera access is needed'), L('اسمح بالكاميرا من الإعدادات لتصوير وصفتك', 'Allow the camera in Settings to photograph your prescription'), [
          { text: L('إلغاء', 'Cancel'), style: 'cancel' },
          { text: L('الإعدادات', 'Settings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
        return;
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!r.canceled && r.assets[0]) await store(r.assets[0].uri);
    } catch { Alert.alert(t('loadError')); }
  };

  const remove = (r: SavedRx) => {
    Alert.alert(L('حذف الوصفة؟', 'Delete this prescription?'), L('ستُحذف الصورة من هذا الجهاز فقط', 'The photo is removed from this phone only'), [
      { text: L('إلغاء', 'Cancel'), style: 'cancel' },
      { text: L('حذف', 'Delete'), style: 'destructive', onPress: async () => {
        const next = await removeRx(r.id);
        setSaved(next);
        if (current?.id === r.id) { setCurrent(next[0] ?? null); setOrderNo(next[0]?.orderNo ?? ''); setSentMsg(false); setSentPhoto(false); }
      } },
    ]);
  };

  const cleanOrder = orderNo.trim().replace(/^#+/, '');
  // Step 1: open the Barakat chat with the order number (WhatsApp links cannot carry a file).
  const sendMessage = async () => {
    const order = cleanOrder ? L(`\nرقم الطلب: #${cleanOrder}`, `\nOrder number: #${cleanOrder}`) : '';
    if (current) void setRxOrder(current.id, cleanOrder);
    try { await whatsapp(t('rxMsg') + order); setSentMsg(true); }
    catch { Alert.alert(L('تعذر فتح واتساب', 'Could not open WhatsApp'), L('تأكد من تثبيت واتساب ثم حاول مرة أخرى', 'Check that WhatsApp is installed and try again')); }
  };
  // Step 2: share the photo; the Barakat chat opened in step 1 is now at the top of WhatsApp's list.
  const sendPhoto = async () => {
    if (!current) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      await Sharing.shareAsync(current.uri, { dialogTitle: t('rxSend'), mimeType: mimeOf(current.uri) });
      setSentPhoto(true);
    } catch { Alert.alert(L('تعذرت مشاركة الصورة', 'Could not share the photo'), L('أرفق الصورة من داخل محادثة واتساب', 'Attach the photo from inside the WhatsApp chat instead')); }
  };

  const toggleRemind = async (on: boolean) => {
    tap();
    setRemind(on);
    const st = await loadReminders();
    const applied = await applyReminders({ ...st, rx: on, rxDate: on ? ymNow() : st.rxDate }, lang);
    setRemind(applied.rx);
    if (on && !applied.rx) Alert.alert(L('الإشعارات متوقفة', 'Notifications are off'), L('فعّل الإشعارات من الإعدادات لتصلك التذكيرات', 'Turn notifications on in Settings to get reminders'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('rxTitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={s.preview}>
          {current ? (
            <FadeIn k={current.id} style={{ width: '100%', height: '100%' }}>
              <Image source={current.uri} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={t('rxTitle')} />
            </FadeIn>
          ) : (
            <>
              <Ionicons name="document-text-outline" size={56} color={colors.line} />
              <T style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>{t('uploadRxSub')}</T>
            </>
          )}
        </View>

        <View style={{ flexDirection: row, gap: 10 }}>
          <Button style={{ flex: 1, paddingHorizontal: 10 }} title={t('rxCamera')} icon="camera-outline" variant="ghost" onPress={fromCamera} loading={busy} />
          <Button style={{ flex: 1, paddingHorizontal: 10 }} title={L('من الصور', 'From photos')} icon="images-outline" variant="ghost" onPress={fromLibrary} loading={busy} />
        </View>

        {saved.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
              <T style={{ color: colors.muted, fontSize: 12, flex: 1 }}>{L('وصفاتك محفوظة على هذا الجهاز فقط', 'Your prescriptions are saved on this phone only')}</T>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, flexDirection: row, flexGrow: 1, justifyContent: 'flex-start' }}>
              {saved.map((r) => {
                const on = current?.id === r.id;
                return (
                  <Pressable key={r.id} onPress={() => select(r)} onLongPress={() => remove(r)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t('rxTitle')} ${new Date(r.addedAt).toLocaleDateString(rtl ? 'ar-SA-u-ca-gregory' : 'en-GB')}`}
                    style={[s.thumb, on && { borderColor: colors.red }]}>
                    <Image source={r.uri} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <Pressable onPress={() => remove(r)} hitSlop={8} style={[s.del, rtl ? { left: 4 } : { right: 4 }]} accessibilityRole="button" accessibilityLabel={L('حذف', 'Delete')}>
                      <Ionicons name="close" size={14} color={onBrand} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {current && (
          <>
            <View style={[s.card, shadow]}>
              <T style={{ fontFamily: font.bold }}>{L('رقم الطلب (اختياري)', 'Order number (optional)')}</T>
              <TextInput value={orderNo} onChangeText={(v) => { setOrderNo(v); setSentMsg(false); }} placeholder="#1234" placeholderTextColor={colors.muted}
                keyboardType="number-pad" maxLength={12} accessibilityLabel={L('رقم الطلب', 'Order number')}
                style={[s.input, { textAlign: align, writingDirection: 'ltr' }]} />
              <T style={{ color: colors.muted, fontSize: 12 }}>{L('تجده في رسالة تأكيد الطلب. يساعدنا على ربط وصفتك بطلبك مباشرة', 'You will find it in your order confirmation. It lets us match the prescription to your order right away')}</T>
            </View>

            <Step n={1} done={sentMsg} title={L('افتح محادثة البركات', 'Open the Barakat chat')} sub={L('نرسل رسالة جاهزة برقم طلبك', 'A ready message with your order number')}>
              <Button title={t('rxSend')} icon="logo-whatsapp" onPress={sendMessage} />
            </Step>
            <Step n={2} done={sentPhoto} title={L('أرفق صورة الوصفة', 'Attach the prescription photo')} sub={L('اختر واتساب ثم محادثة البركات', 'Choose WhatsApp, then the Barakat chat')}>
              <Button title={L('مشاركة الصورة', 'Share the photo')} icon="share-outline" variant={sentMsg ? 'primary' : 'ghost'} onPress={sendPhoto} />
            </Step>

            <View style={[s.card, shadow, { flexDirection: row, alignItems: 'center' }]}>
              <View style={s.ic}><Ionicons name="notifications-outline" size={20} color={colors.red} /></View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.bold }}>{L('ذكّرني قبل انتهاء الوصفة', 'Remind me before it expires')}</T>
                <T style={{ color: colors.muted, fontSize: 12 }}>{L('تنبيه واحد بعد نحو سنة من اليوم', 'One reminder about a year from today')}</T>
              </View>
              <Switch value={remind} onValueChange={toggleRemind} trackColor={{ true: colors.red, false: colors.line }} thumbColor={colors.card} />
            </View>
          </>
        )}

        <T style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>{t('rxNote')}</T>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  preview: { height: 250, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12 },
  stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 72, height: 92, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card },
  del: { position: 'absolute', top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: alpha(colors.dark, 0.7), alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular, color: colors.text, backgroundColor: colors.bg },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(colors.red, 0.09), alignItems: 'center', justifyContent: 'center' },
});
