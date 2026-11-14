// "Use my points" like a wallet tap: pick an amount, confirm with biometrics, hold the points on the server, then
// show a QR that carries only an opaque single-use token and renews itself. The till scans it; the screen closes
// by itself when the till confirms. The balance is never changed locally: it is re-read from the server afterwards.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { alpha, tap } from '../account/kit';
import { metalFor } from './cardTheme';
import { MetalCard, Ring, emboss } from './Metallic';
import { ErrorCode, Member, PublicConfig, RewardsClient, RewardsError } from './rewardsApi';
import { Hold, createRedeemApi } from './redeemApi';
import { biometricsReady, boostBrightness, confirmWithBiometrics } from './device';
import { clampPoints, discountSar, maxRedeemPoints, minInvoiceSar, refreshSeconds } from './redeemLogic';
import { Btn, Card, ErrLine, H2, Small } from './parts';
import { fmt, fmtDate, nf, pick, strings } from './strings';

type Step = 'pick' | 'confirm' | 'qr';
type Outcome = 'used' | 'expired' | 'cancelled' | null;

export interface RedeemWalletProps {
  client: RewardsClient;
  member: Member;
  cfg: PublicConfig;
  /** the last /me load failed for lack of a connection */
  offline: boolean;
  /** when the cached balance was saved (ms) */
  cachedAt: number | null;
  /** re-read /me after a hold ends */
  onChanged: () => void;
  /** shown instead when the server has no wallet-redeem endpoints yet (older WhatsApp-code flow) */
  fallback: React.ReactNode;
}

export function RedeemWallet({ client, member, cfg, offline, cachedAt, onChanged, fallback }: RedeemWalletProps) {
  const { lang, row } = useI18n();
  const t = strings[lang];
  const api = React.useMemo(() => createRedeemApi(client), [client]);
  const usable = member.points.usable;
  const max = maxRedeemPoints(usable, cfg);
  const can = max > 0;
  const [points, setPoints] = useState(() => clampPoints(cfg.min_redeem, usable, cfg));
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hold, setHold] = useState<Hold | null>(null);
  const [heldPoints, setHeldPoints] = useState(0);
  const [bio, setBio] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const [prevRange, setPrevRange] = useState({ usable, cfg });
  if (prevRange.usable !== usable || prevRange.cfg !== cfg) {
    setPrevRange({ usable, cfg });
    setPoints((p) => clampPoints(p, usable, cfg));
  }
  useEffect(() => { void biometricsReady().then(setBio); }, []);

  const errText = (code: ErrorCode) => fmt(pick(t, 'e_' + code, t.e_server), { m: nf(cfg.min_redeem), s: nf(cfg.step_redeem) });

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await confirmWithBiometrics(t.bioPrompt, t.back);
      if (r === 'cancelled') return;
      const h = await api.hold(points);
      setHold(h); setHeldPoints(h.points && h.points > 0 ? h.points : points); setStep('qr');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    } catch (e) {
      if (e instanceof RewardsError && e.code === 'unsupported') setUnsupported(true);
      else setErr(errText(e instanceof RewardsError ? e.code : 'server'));
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, api, points, t]);

  if (unsupported) return <>{fallback}</>;

  const closeQr = () => { setStep('pick'); setHold(null); onChanged(); };

  return (
    <Card>
      <H2>{t.redeemTitle}</H2>
      {offline ? (
        <View style={[s.note, { flexDirection: row }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.maroon} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold, color: colors.maroon }}>{t.needsConn}</T>
            {cachedAt ? <Small>{fmt(t.asOf, { t: fmtDate(new Date(cachedAt).toISOString(), lang, true) })}</Small> : null}
          </View>
        </View>
      ) : null}

      {step === 'pick' && (
        <>
          {!can ? (
            <Small>{fmt(t.needMore, { n: nf(Math.max(0, cfg.min_redeem - usable)), m: nf(cfg.min_redeem) })}</Small>
          ) : (
            <>
              <T style={{ fontFamily: font.bold }}>{t.chooseAmount}</T>
              <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t.less} disabled={points <= cfg.min_redeem}
                  onPress={() => { tap(); setPoints(clampPoints(points - cfg.step_redeem, usable, cfg)); }} style={[s.stepBtn, points <= cfg.min_redeem && { opacity: 0.35 }]}>
                  <Ionicons name="remove" size={24} color={colors.maroon} />
                </Pressable>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={s.stepVal}>{fmt(t.sarAmount, { v: nf(discountSar(points, cfg)) })}</Text>
                  <Small>{nf(points)} {t.points}</Small>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t.more} disabled={points + cfg.step_redeem > max}
                  onPress={() => { tap(); setPoints(clampPoints(points + cfg.step_redeem, usable, cfg)); }} style={[s.stepBtn, points + cfg.step_redeem > max && { opacity: 0.35 }]}>
                  <Ionicons name="add" size={24} color={colors.maroon} />
                </Pressable>
              </View>
              <Small>{t.minOrder}: {fmt(t.sarAmount, { v: nf(minInvoiceSar(points, cfg)) })}</Small>
            </>
          )}
          <ErrLine msg={err} />
          <Btn label={t.useMyPoints} icon="wallet-outline" onPress={() => { tap(); setErr(''); setStep('confirm'); }} disabled={!can || offline} />
        </>
      )}

      {step === 'confirm' && (
        <>
          <T style={{ fontFamily: font.bold }}>{t.confirmTitle}</T>
          <T>{t.discountValue}: <Text style={s.bold}>{fmt(t.sarAmount, { v: nf(discountSar(points, cfg)) })}</Text> · {nf(points)} {t.points}</T>
          <Small>{t.qitaf}</Small>
          <ErrLine msg={err} />
          <Btn label={bio ? t.confirmBio : t.confirmOk} icon={bio ? 'finger-print' : 'checkmark'} onPress={() => { void start(); }} busy={busy} disabled={offline} />
          <Btn kind="link" label={t.back} onPress={() => { setErr(''); setStep('pick'); }} disabled={busy} />
        </>
      )}

      {step === 'qr' && hold ? <QrSession api={api} hold={hold} points={heldPoints} sar={discountSar(heldPoints, cfg)} tier={member.tier} onClose={closeQr} /> : null}
    </Card>
  );
}

function QrSession({ api, hold, points, sar, tier, onClose }: { api: ReturnType<typeof createRedeemApi>; hold: Hold; points: number; sar: number; tier: Member['tier']; onClose: () => void }) {
  const { lang, row } = useI18n();
  const t = strings[lang];
  const m = metalFor(tier);
  const [token, setToken] = useState<string | null>(null);
  const [total, setTotal] = useState(60);
  const [left, setLeft] = useState(60);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [link, setLink] = useState(true);
  const [err, setErr] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const deadline = useRef(0);
  const refreshing = useRef(false);
  const done = useRef<Outcome>(null);

  const finish = useCallback((o: Exclude<Outcome, null>) => {
    if (done.current) return;
    done.current = o; setOutcome(o);
    if (o === 'used') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current || done.current) return;
    refreshing.current = true;
    try {
      const o = await api.token(hold.hold_id);
      const secs = refreshSeconds(o.expires_in);
      deadline.current = Date.now() + secs * 1000;
      setToken(o.token); setTotal(secs); setLeft(secs); setLink(true);
    } catch (e) {
      if (e instanceof RewardsError && (e.code === 'hold_expired' || e.code === 'hold_not_found')) finish('expired');
      else if (e instanceof RewardsError && e.code === 'network') setLink(false);
    } finally { refreshing.current = false; }
  }, [api, hold.hold_id, finish]);

  // fetch on mount / when the hold changes; state is only set after the network answers
  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async: it sets state after awaiting, never synchronously
  useEffect(() => { void refresh(); }, [refresh]);

  // countdown + renewal; an expired token is hidden until a new one arrives
  useEffect(() => {
    const id = setInterval(() => {
      if (done.current) return;
      const secs = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(secs);
      if (secs <= 0) { setToken(null); void refresh(); }
    }, 250);
    return () => clearInterval(id);
  }, [refresh]);

  // poll the hold every 3 s: the till confirming closes this screen
  useEffect(() => {
    const id = setInterval(async () => {
      if (done.current) return;
      try {
        const st = await api.status(hold.hold_id);
        setLink(true);
        if (st.status === 'used') finish('used');
        else if (st.status === 'expired') finish('expired');
        else if (st.status === 'cancelled') finish('cancelled');
      } catch (e) {
        if (e instanceof RewardsError && e.code === 'hold_not_found') finish('expired');
        else setLink(false);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [api, hold.hold_id, finish]);

  // coming back from the background: renew right away
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    let restore: (() => void) | null = null;
    let gone = false;
    void boostBrightness().then((r) => { if (gone) r(); else restore = r; });
    return () => { gone = true; restore?.(); };
  }, []);

  useEffect(() => {
    if (!outcome) return;
    const id = setTimeout(onClose, outcome === 'used' ? 2200 : 3200);
    return () => clearTimeout(id);
  }, [outcome, onClose]);

  const cancel = async () => {
    if (cancelling || outcome) return;
    setCancelling(true); setErr('');
    try { await api.cancel(hold.hold_id); finish('cancelled'); } catch (e) {
      if (e instanceof RewardsError && (e.code === 'hold_not_found' || e.code === 'hold_expired')) finish('expired');
      else setErr(t.e_network);
    } finally { setCancelling(false); }
  };

  const msg = outcome === 'used' ? t.holdUsed : outcome === 'expired' ? t.holdExpired : outcome === 'cancelled' ? t.holdCancelled : '';
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => { void cancel(); }}>
      <View style={s.backdrop}>
        <MetalCard kind={tier}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text style={[{ fontFamily: font.black, fontSize: 20, color: m.text, textAlign: 'center' }, emboss(m)]}>{outcome ? msg : t.qrTitle}</Text>
            {outcome ? (
              <View style={{ height: 250, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={outcome === 'used' ? 'checkmark-circle' : 'information-circle'} size={96} color={m.accent} />
              </View>
            ) : (
              <Ring size={262} stroke={7} value={total ? left / total : 0} color={m.accent} track={alpha(colors.card, 0.18)}>
                <View style={s.qrBox}>
                  {token ? <QRCode value={token} size={200} color={colors.dark} backgroundColor={colors.card} /> : <ActivityIndicator color={colors.maroon} />}
                </View>
              </Ring>
            )}
            <Text style={[{ fontFamily: font.black, fontSize: 30, color: m.accent }, emboss(m)]}>{fmt(t.sarAmount, { v: nf(sar) })}</Text>
            <T style={{ color: m.textSoft }}>{nf(points)} {t.points}{!outcome ? ` · ${fmt(t.secsLeft, { s: nf(left) })}` : ''}</T>
            {!outcome ? <T style={{ color: m.textSoft, fontSize: 12, textAlign: 'center' }}>{t.qrHint}</T> : null}
            {!link && !outcome ? (
              <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color={m.accent} />
                <T style={{ color: m.accent, fontSize: 12 }}>{t.reconnecting}</T>
              </View>
            ) : null}
            {err ? <T style={{ color: m.accent, fontFamily: font.bold }}>{err}</T> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={outcome ? t.close : t.cancelHold} disabled={cancelling}
              onPress={() => { tap(); if (outcome) onClose(); else void cancel(); }} style={[s.cancel, { borderColor: alpha(m.accent, 0.6) }, cancelling && { opacity: 0.5 }]}>
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: m.text }}>{outcome ? t.close : t.cancelHold}</Text>
            </Pressable>
          </View>
        </MetalCard>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: alpha(colors.dark, 0.92), alignItems: 'center', justifyContent: 'center', padding: 20 },
  note: { backgroundColor: colors.beige, borderRadius: radius.md, padding: 12, gap: 8, alignItems: 'center' },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  stepVal: { textAlign: 'center', color: colors.maroon, fontSize: 26, fontFamily: font.black },
  bold: { fontFamily: font.black, color: colors.maroon },
  qrBox: { width: 224, height: 224, borderRadius: radius.md, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 46, borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
