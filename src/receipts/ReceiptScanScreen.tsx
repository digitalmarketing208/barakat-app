// Scan a purchase receipt: reads the ZATCA e-invoice QR with expo-camera (SDK 57 CameraView), shows what the member would
// earn, then sends the claim. Points are posted only after the branch / POS match confirms the purchase.
// Arabic is the default language (RTL); everything is bilingual through useL().
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { ScreenHeader, alpha, onBrand, tintRed, useL } from '../account/kit';
import { Btn, Card, Small } from '../rewards/parts';
import { createRewardsClient, type Member } from '../rewards/rewardsApi';
import { REWARDS_API, readCachedMe, readToken } from '../rewards/session';
import { nf } from '../rewards/strings';
import { ReceiptClaim, ReceiptError, ReceiptErrorCode, claimReceipt, isRetryable } from './api';
import { enqueue, flushQueue, readQueue } from './queue';
import { MAX_AGE_DAYS, ZatcaFailure, ZatcaReceipt, decodeZatca, pointsFor, receiptAgeDays } from './zatca';

type Phase = 'scan' | 'confirm' | 'sending' | 'done' | 'queued' | 'refused';
type Access = 'checking' | 'ok' | 'signedOut' | 'notMember';

const FRAME = 250;
const CORNER = 34;

export default function ReceiptScanScreen({ apiBase = REWARDS_API }: { apiBase?: string }) {
  const nav = useNavigation();
  const L = useL();
  const { row } = useI18n();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [access, setAccess] = useState<Access>('checking');
  const [member, setMember] = useState<Member | null>(null);
  const [phase, setPhase] = useState<Phase>('scan');
  const [torch, setTorch] = useState(false);
  const [hint, setHint] = useState('');
  const [qr, setQr] = useState('');
  const [receipt, setReceipt] = useState<ZatcaReceipt | null>(null);
  const [claim, setClaim] = useState<ReceiptClaim | null>(null);
  const [refusal, setRefusal] = useState<ReceiptErrorCode | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [flushNote, setFlushNote] = useState('');
  const lock = useRef(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goRewards = () => (nav as unknown as { navigate: (n: string) => void }).navigate('Rewards');

  // ----- who is signed in, and at which rate -----
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await readToken();
      if (!alive) return;
      if (!token) { setAccess('signedOut'); return; }
      const cached = await readCachedMe();
      if (alive && cached?.member) { setMember(cached.member); setAccess('ok'); }
      try {
        const me = await createRewardsClient({ apiBase, getToken: () => token }).me();
        if (!alive) return;
        setMember(me.member);
        setAccess(me.member ? 'ok' : 'notMember');
      } catch (e) {
        if (!alive) return;
        // offline: keep the cached member; signed out only when the API says so
        if (e instanceof Error && (e as { code?: string }).code === 'unauthorized') setAccess('signedOut');
        else if (!cached?.member) setAccess('ok'); // rate unknown, the server still computes the points
      }
    })();
    return () => { alive = false; };
  }, [apiBase]);

  // ----- offline queue -----
  const refreshWaiting = useCallback(async () => setWaiting((await readQueue()).length), []);
  const retryQueue = useCallback(async () => {
    setFlushing(true);
    setFlushNote('');
    try {
      const r = await flushQueue();
      setWaiting(r.left);
      if (r.sent.length + r.already > 0) {
        setFlushNote(L(`تم إرسال ${r.sent.length + r.already} فاتورة محفوظة`, `${r.sent.length + r.already} saved receipt(s) sent`));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (r.stopped === 'network') setFlushNote(L('لا يوجد اتصال بالإنترنت، سنعيد المحاولة لاحقاً', 'Still offline, we will try again later'));
      else if (r.stopped === 'unauthorized') setFlushNote(L('سجّل الدخول إلى مكافآت البركات لإرسال الفواتير المحفوظة', 'Sign in to Barakat Rewards to send the saved receipts'));
    } finally { setFlushing(false); }
  }, [L]);
  useEffect(() => {
    void flushQueue().then((r) => setWaiting(r.left)).catch(() => {});
  }, []);

  // ----- scanning -----
  const showHint = useCallback((msg: string, unlockMs = 2200) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => { setHint(''); lock.current = false; }, unlockMs);
  }, []);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const failText = useCallback((r: ZatcaFailure): string => {
    switch (r) {
      case 'not_base64': return L('هذا ليس رمز فاتورة ضريبية', 'This is not a tax invoice QR code');
      case 'damaged': return L('الرمز غير مكتمل، قرّب الكاميرا وحاول مجدداً', 'The code is incomplete, move closer and try again');
      case 'missing_fields': return L('الرمز لا يحتوي على بيانات فاتورة ضريبية', 'This code has no tax invoice data');
      default: return L('بيانات الفاتورة غير صالحة', 'The invoice data is not valid');
    }
  }, [L]);

  const onScanned = useCallback((e: BarcodeScanningResult) => {
    if (lock.current || phase !== 'scan') return;
    lock.current = true;
    const r = decodeZatca(e.data);
    if (!r.ok) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); showHint(failText(r.reason)); return; }
    if (receiptAgeDays(r.receipt.utc) > MAX_AGE_DAYS) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      showHint(L(`الفاتورة أقدم من ${MAX_AGE_DAYS} يوماً ولا يمكن احتسابها`, `This receipt is older than ${MAX_AGE_DAYS} days and cannot be claimed`), 3200);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setQr(e.data); setReceipt(r.receipt); setHint(''); setTorch(false); setPhase('confirm');
  }, [phase, showHint, failText, L]);

  const reset = () => { lock.current = false; setQr(''); setReceipt(null); setClaim(null); setRefusal(null); setHint(''); setPhase('scan'); void refreshWaiting(); };

  const submit = async () => {
    if (!receipt || phase !== 'confirm') return;
    setPhase('sending');
    try {
      const r = await claimReceipt({ qr }, { apiBase });
      setClaim(r.claim);
      setPhase('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void flushQueue().then((f) => setWaiting(f.left)).catch(() => {});
    } catch (e) {
      const code: ReceiptErrorCode = e instanceof ReceiptError ? e.code : 'server';
      if (isRetryable(e)) {
        setWaiting(await enqueue({ qr, seller: receipt.seller, total: receipt.total, utc: receipt.utc }));
        setRefusal(code);
        setPhase('queued');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setRefusal(code);
        setPhase('refused');
      }
    }
  };

  const refusalText = (c: ReceiptErrorCode): string => {
    switch (c) {
      case 'duplicate': return L('تم تسجيل هذه الفاتورة من قبل ولا يمكن احتسابها مرة أخرى', 'This receipt was already claimed and cannot be used again');
      case 'receipt_too_old': return L(`الفاتورة أقدم من ${MAX_AGE_DAYS} يوماً`, `This receipt is older than ${MAX_AGE_DAYS} days`);
      case 'receipt_not_barakat': return L('هذه الفاتورة ليست من البركات للبصريات', 'This receipt was not issued by Barakat Optical');
      case 'receipt_future': return L('تاريخ الفاتورة غير صحيح، تحقق من الفاتورة', 'The receipt date looks wrong, please check the receipt');
      case 'receipt_amount': return L('مبلغ الفاتورة غير مقبول، راجع أقرب فرع', 'The receipt amount is not accepted, please visit your nearest branch');
      case 'receipt_invalid': return L('تعذّر قراءة الفاتورة، حاول مجدداً أو راجع الفرع', 'We could not read this receipt, try again or ask at the branch');
      case 'limit_reached': return L('وصلت إلى الحد اليومي للفواتير، جرّب غداً', 'You reached the daily receipt limit, try again tomorrow');
      case 'not_member': return L('انضم إلى مكافآت البركات أولاً', 'Join Barakat Rewards first');
      case 'unauthorized': return L('انتهت الجلسة، سجّل الدخول من صفحة المكافآت', 'Your session ended, sign in from the Rewards page');
      case 'frozen': return L('البرنامج متوقف مؤقتاً، حفظنا الفاتورة وسنرسلها لاحقاً', 'The program is paused for now, we saved the receipt and will send it later');
      case 'network': return L('لا يوجد اتصال بالإنترنت، حفظنا الفاتورة وسنرسلها تلقائياً عند عودة الاتصال', 'No connection, we saved the receipt and will send it when you are back online');
      case 'not_configured': case 'server': return L('الخدمة غير متاحة الآن، حفظنا الفاتورة وسنعيد المحاولة', 'The service is unavailable right now, we saved the receipt and will retry');
      default: return L('تعذّر إرسال الفاتورة', 'Could not send the receipt');
    }
  };

  const preview = useMemo(() => {
    if (!receipt) return null;
    const rate = member?.rate;
    return { pts: rate ? pointsFor(receipt.total, rate) : null, rate };
  }, [receipt, member]);

  const title = L('مسح الفاتورة', 'Scan receipt');
  const back = () => (nav as unknown as { goBack: () => void }).goBack();

  // ---------- gates ----------
  if (access === 'checking' || !permission) {
    return <Shell title={title} onBack={back}><View style={s.center}><ActivityIndicator color={colors.red} /></View></Shell>;
  }
  if (access === 'signedOut' || access === 'notMember') {
    return (
      <Shell title={title} onBack={back}>
        <View style={s.pad}>
          <Card>
            <Ionicons name="receipt-outline" size={36} color={colors.red} />
            <T style={s.h}>{access === 'signedOut' ? L('سجّل الدخول إلى مكافآت البركات', 'Sign in to Barakat Rewards') : L('انضم إلى مكافآت البركات', 'Join Barakat Rewards')}</T>
            <Small>{L('اكسب نقاطاً على مشترياتك بمسح رمز QR المطبوع على الفاتورة', 'Earn points on your purchases by scanning the QR code printed on your receipt')}</Small>
            <Btn label={L('فتح مكافآت البركات', 'Open Barakat Rewards')} onPress={goRewards} />
          </Card>
        </View>
      </Shell>
    );
  }
  if (!permission.granted && phase === 'scan') {
    return (
      <Shell title={title} onBack={back}>
        <View style={s.pad}>
          <Card>
            <Ionicons name="camera-outline" size={36} color={colors.red} />
            <T style={s.h}>{L('نحتاج إذن الكاميرا', 'Camera permission needed')}</T>
            <Small>{L('نستخدم الكاميرا فقط لقراءة رمز QR على فاتورتك. لا نحفظ أي صور.', 'We only use the camera to read the QR code on your receipt. No photos are saved.')}</Small>
            {permission.canAskAgain
              ? <Btn label={L('السماح بالكاميرا', 'Allow camera')} icon="camera" onPress={() => { void requestPermission(); }} />
              : <Btn label={L('فتح إعدادات التطبيق', 'Open app settings')} icon="settings-outline" onPress={() => { void Linking.openSettings(); }} />}
          </Card>
        </View>
      </Shell>
    );
  }

  // ---------- scanner ----------
  if (phase === 'scan') {
    return (
      <Shell title={title} onBack={back}>
        <View style={s.cam}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={s.mask} pointerEvents="none">
            <View style={s.dim} />
            <View style={s.midRow}>
              <View style={s.dim} />
              <View style={s.frame}>
                <View style={[s.corner, s.tl]} /><View style={[s.corner, s.tr]} /><View style={[s.corner, s.bl]} /><View style={[s.corner, s.br]} />
              </View>
              <View style={s.dim} />
            </View>
            <View style={[s.dim, { alignItems: 'center', paddingTop: 18, paddingHorizontal: 24 }]}>
              <T style={s.camText}>{L('ضع رمز QR الموجود على الفاتورة داخل الإطار', 'Place the QR code on your receipt inside the frame')}</T>
              {hint ? <View style={s.hint}><T style={s.hintText} accessibilityLiveRegion="polite">{hint}</T></View> : null}
            </View>
          </View>
          <Pressable onPress={() => setTorch((v) => !v)} style={[s.torch, { top: 14 }]} accessibilityRole="button" accessibilityState={{ selected: torch }}
            accessibilityLabel={torch ? L('إطفاء الكشاف', 'Turn torch off') : L('تشغيل الكشاف', 'Turn torch on')}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={torch ? colors.amber : onBrand} />
          </Pressable>
          {waiting > 0 ? (
            <View style={[s.queue, { bottom: insets.bottom + 12, flexDirection: row }]}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.maroon} />
              <T style={{ flex: 1, fontSize: 13, color: colors.maroon, fontFamily: font.bold }}>{L(`${waiting} فاتورة بانتظار الإرسال`, `${waiting} receipt(s) waiting to send`)}</T>
              {flushing ? <ActivityIndicator color={colors.red} /> : <Pressable onPress={() => { void retryQueue(); }} hitSlop={8} accessibilityRole="button"><T style={{ color: colors.red, fontFamily: font.bold }}>{L('إعادة المحاولة', 'Retry')}</T></Pressable>}
            </View>
          ) : flushNote ? (
            <View style={[s.queue, { bottom: insets.bottom + 12 }]}><T style={{ fontSize: 13, color: colors.maroon, fontFamily: font.bold }}>{flushNote}</T></View>
          ) : null}
        </View>
      </Shell>
    );
  }

  // ---------- confirm / result cards ----------
  return (
    <Shell title={title} onBack={back}>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {(phase === 'confirm' || phase === 'sending') && receipt ? (
          <Card>
            <T style={s.h}>{L('تأكيد بيانات الفاتورة', 'Confirm receipt details')}</T>
            <Line label={L('البائع', 'Seller')} value={receipt.seller} />
            <Line label={L('التاريخ', 'Date')} value={`${receipt.wall.slice(0, 10)}  ${receipt.wall.slice(11, 16)}`} ltr />
            <Line label={L('الإجمالي شامل الضريبة', 'Total incl. VAT')} value={`${receipt.total.toFixed(2)} ${L('ر.س', 'SAR')}`} ltr />
            <View style={[s.earn, { backgroundColor: tintRed }]}>
              <T style={{ fontSize: 13, color: colors.muted }}>{L('النقاط التي ستكسبها', 'Points you would earn')}</T>
              <T style={{ fontFamily: font.black, fontSize: 30, color: colors.red }}>{preview?.pts != null ? nf(preview.pts) : '—'}</T>
              <Small>{preview?.rate ? L(`${preview.rate} نقاط لكل ريال حسب فئتك`, `${preview.rate} points per SAR at your tier`) : L('تُحسب النقاط عند التأكيد', 'Points are calculated on confirmation')}</Small>
            </View>
            <Small>{L(`تُضاف النقاط بعد تأكيد الفرع للعملية وتكون قيد الانتظار ثم تتاح بعد مدة الانتظار. إذا دفع التأمين جزءاً من الفاتورة فتُحسب النقاط على المبلغ الذي دفعته أنت فقط.`, `Points are added after the branch confirms the purchase, then wait before they can be used. If insurance paid part of the invoice, points are calculated on the part you paid.`)}</Small>
            <Btn label={L('تأكيد وإرسال', 'Confirm and send')} icon="checkmark-circle-outline" busy={phase === 'sending'} onPress={() => { void submit(); }} />
            <Btn kind="line" label={L('مسح فاتورة أخرى', 'Scan another receipt')} disabled={phase === 'sending'} onPress={reset} />
          </Card>
        ) : null}

        {phase === 'done' && claim ? (
          <Card>
            <SuccessBurst />
            <T style={[s.h, { textAlign: 'center' }]}>{L('تم استلام فاتورتك', 'Receipt received')}</T>
            <T style={{ textAlign: 'center', color: colors.muted }}>
              {L(`ستضاف ${nf(claim.expected_points)} نقطة تقريباً بعد تأكيد الفرع للعملية`, `About ${nf(claim.expected_points)} points will be added once the branch confirms the purchase`)}
            </T>
            <View style={[s.keyBox, { backgroundColor: tintRed }]}>
              <Small>{L('رمز الفاتورة لعرضه عند الكاشير إن لزم', 'Receipt code to show at the till if asked')}</Small>
              <T selectable style={{ fontFamily: font.black, fontSize: 24, letterSpacing: 3, color: colors.maroon, textAlign: 'center' }}>{claim.match_key}</T>
            </View>
            <Btn label={L('مسح فاتورة أخرى', 'Scan another receipt')} icon="scan-outline" onPress={reset} />
            <Btn kind="line" label={L('العودة إلى المكافآت', 'Back to Rewards')} onPress={back} />
          </Card>
        ) : null}

        {phase === 'queued' ? (
          <Card>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.amber} style={{ alignSelf: 'center' }} />
            <T style={[s.h, { textAlign: 'center' }]}>{L('تم حفظ الفاتورة', 'Receipt saved')}</T>
            <T style={{ textAlign: 'center', color: colors.muted }}>{refusal ? refusalText(refusal) : ''}</T>
            <Btn label={L('مسح فاتورة أخرى', 'Scan another receipt')} icon="scan-outline" onPress={reset} />
            {refusal === 'unauthorized' ? <Btn kind="line" label={L('فتح مكافآت البركات', 'Open Barakat Rewards')} onPress={goRewards} /> : null}
          </Card>
        ) : null}

        {phase === 'refused' && refusal ? (
          <Card>
            <Ionicons name={refusal === 'duplicate' ? 'copy-outline' : 'alert-circle-outline'} size={40} color={colors.red} style={{ alignSelf: 'center' }} />
            <T style={[s.h, { textAlign: 'center' }]}>{refusal === 'duplicate' ? L('فاتورة مسجلة مسبقاً', 'Already claimed') : L('تعذّر احتساب الفاتورة', 'Receipt not accepted')}</T>
            <T style={{ textAlign: 'center', color: colors.muted }}>{refusalText(refusal)}</T>
            <Btn label={L('مسح فاتورة أخرى', 'Scan another receipt')} icon="scan-outline" onPress={reset} />
            {refusal === 'not_member' ? <Btn kind="line" label={L('فتح مكافآت البركات', 'Open Barakat Rewards')} onPress={goRewards} /> : null}
          </Card>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={title} onBack={onBack} />
      {children}
    </View>
  );
}

function Line({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  const { row } = useI18n();
  return (
    <View style={[s.line, { flexDirection: row }]}>
      <Small>{label}</Small>
      <T style={{ flex: 1, fontFamily: font.bold, ...(ltr ? { writingDirection: 'ltr' } : null) }}>{value}</T>
    </View>
  );
}

/** Success animation: a green disc springs in, a ring pulses out once, the check fades in. */
function SuccessBurst() {
  const [pop] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [pop, ring]);
  return (
    <View style={s.burst} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.ring, { opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }] }]} />
      <Animated.View style={[s.disc, { transform: [{ scale: pop }] }]}>
        <Animated.View style={{ opacity: pop }}><Ionicons name="checkmark" size={44} color={onBrand} /></Animated.View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, gap: 14 },
  h: { fontFamily: font.black, fontSize: 18, color: colors.maroon },
  cam: { flex: 1, backgroundColor: '#000' },
  mask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dim: { flex: 1, backgroundColor: alpha('#000000', 0.55) },
  midRow: { flexDirection: 'row', height: FRAME },
  frame: { width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.card, borderWidth: 4 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  camText: { color: onBrand, textAlign: 'center', fontFamily: font.bold, fontSize: 15 },
  hint: { marginTop: 12, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
  hintText: { color: onBrand, textAlign: 'center', fontFamily: font.bold, fontSize: 14 },
  torch: { position: 'absolute', end: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: alpha('#000000', 0.5), alignItems: 'center', justifyContent: 'center' },
  queue: { position: 'absolute', start: 16, end: 16, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, alignItems: 'center', gap: 10, ...shadow },
  line: { gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  earn: { borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 2 },
  keyBox: { borderRadius: radius.md, padding: 12, gap: 4 },
  burst: { alignSelf: 'center', width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: colors.success },
  disc: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
});
