// Barakat Rewards flow: sign in by WhatsApp code, join, member card with QR, animated tier progress,
// redeem to a discount code, points history and the Plus / Max plans. Follows the app language (AR default, RTL).
// A failed first load never signs the member out: the saved card is shown offline, with a retry.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootParams } from '../types';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { Chip, T } from '../ui';
import { whatsapp } from '../links';
import { FadeIn, alpha, onBrand } from '../account/kit';
import {
  DEFAULT_CONFIG, ErrorCode, HistoryRow, MeResponse, Member, PublicConfig, RedeemConfirmResponse, RewardsError,
  createRewardsClient, normaliseMobile, onlyDigits,
} from './rewardsApi';
import { REWARDS_API, STORE_URL, readCachedAt, readCachedMe, readToken, writeCachedMe, writeToken } from './session';
import { Btn, Card, Check, ErrLine, Field, H2, MemberCard, PendingReceipts, PerksCard, Segmented, Small, TierProgress } from './parts';
import { RedeemWallet } from './RedeemWallet';
import { tierLabel } from './tierLabels';
import { PlansPanel } from './Plans';
import { fmt, fmtDate, nf, pick, strings } from './strings';

type Phase = 'loading' | 'offline' | 'mobile' | 'code' | 'join' | 'member';
type RedeemStep = 'pick' | 'code' | 'done';
type Tab = 'card' | 'history' | 'plans';
type HistFilter = 'all' | 'in' | 'out';

export interface RewardsScreenProps {
  apiBase?: string;
  storeUrl?: string;
}

const codeOf = (e: unknown): ErrorCode => (e instanceof RewardsError ? e.code : 'server');
const isUnauthorized = (e: unknown) => e instanceof RewardsError && e.code === 'unauthorized';
const isOut = (r: HistoryRow) => r.points < 0 || r.type === 'redeem' || r.type === 'expire' || r.type === 'reverse';
const HIST_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  earn: 'bag-check-outline', bonus: 'gift-outline', redeem: 'pricetag-outline', reverse: 'return-up-back-outline', expire: 'time-outline', adjust: 'construct-outline',
};

export default function RewardsScreen({ apiBase = REWARDS_API, storeUrl = STORE_URL }: RewardsScreenProps) {
  const { lang, row, rtl } = useI18n();
  const t = strings[lang];
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const tokenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cfg, setCfg] = useState<PublicConfig>(DEFAULT_CONFIG);
  /** Why the last /me load failed (kept as a code so the text follows the language). */
  const [loadErr, setLoadErr] = useState<ErrorCode | null>(null);
  const [tab, setTab] = useState<Tab>('card');
  const [histFilter, setHistFilter] = useState<HistFilter>('all');

  const [mobile, setMobile] = useState('');
  const [challenge, setChallenge] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');

  const [name, setName] = useState('');
  const [birth, setBirth] = useState<number | null>(null);
  const [referrer, setReferrer] = useState('');
  const [cProgram, setCProgram] = useState(false);
  const [cMarketing, setCMarketing] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [rPoints, setRPoints] = useState(0);
  const [rStep, setRStep] = useState<RedeemStep>('pick');
  const [rChallenge, setRChallenge] = useState('');
  const [rSentTo, setRSentTo] = useState('');
  const [rCode, setRCode] = useState('');
  const [rErr, setRErr] = useState('');
  const [result, setResult] = useState<RedeemConfirmResponse | null>(null);

  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);
  const signOutRef = useRef<(msg?: string) => void>(() => {});
  const getToken = useCallback(() => tokenRef.current, []);
  const onUnauthorized = useCallback(() => signOutRef.current(strings[langRef.current].sessionEnded), []);
  // False positive: getToken/onUnauthorized read the refs only when an API call runs (never while rendering).
  // eslint-disable-next-line react-hooks/refs
  const api = useMemo(() => createRewardsClient({ apiBase, getToken, onUnauthorized }), [apiBase, getToken, onUnauthorized]);

  const textFor = useCallback((c: ErrorCode): string =>
    fmt(pick(t, 'e_' + c, t.e_server), { m: nf(cfg.min_redeem), s: nf(cfg.step_redeem) }), [t, cfg]);
  const errText = useCallback((e: unknown) => textFor(codeOf(e)), [textFor]);

  const signOut = useCallback((msg?: string) => {
    tokenRef.current = null;
    void writeToken(null);
    void writeCachedMe(null);
    setMe(null); setChallenge(''); setCode(''); setResult(null); setRStep('pick'); setErr(''); setLoadErr(null); setTab('card');
    setNotice(msg || '');
    setPhase('mobile');
  }, []);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  const loadMe = useCallback(async () => {
    const o = await api.me();
    setMe(o);
    setLoadErr(null);
    void writeCachedMe(o);
    setCachedAt(Date.now());
    setPhase(o.member ? 'member' : 'join');
  }, [api]);

  // start: config + stored token. Only an `unauthorized` answer ends the session (handled by onUnauthorized);
  // a network or server failure keeps the token and shows the saved card or a retry.
  useEffect(() => {
    let alive = true;
    api.getConfig().then((c) => { if (alive) setCfg({ ...DEFAULT_CONFIG, ...c }); }).catch(() => {});
    (async () => {
      const tk = await readToken();
      if (!alive) return;
      if (!tk) { setPhase('mobile'); return; }
      tokenRef.current = tk;
      const cached = await readCachedMe();
      const at = await readCachedAt();
      if (!alive) return;
      setCachedAt(at);
      if (cached) { setMe(cached); setPhase('member'); }
      try { await loadMe(); } catch (e) {
        if (!alive || isUnauthorized(e)) return;
        setLoadErr(codeOf(e));
        if (!cached) setPhase('offline');
      }
    })();
    return () => { alive = false; };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryLoad = async () => {
    if (busy) return;
    setBusy(true);
    const hadCard = phase === 'member';
    if (!hadCard) setPhase('loading');
    try { await loadMe(); } catch (e) {
      if (!isUnauthorized(e)) { setLoadErr(codeOf(e)); if (!hadCard) setPhase('offline'); }
    } finally { setBusy(false); }
  };

  const member: Member | null = me?.member ?? null;
  const usable = member?.points.usable ?? 0;
  const maxRedeem = Math.floor(usable / cfg.step_redeem) * cfg.step_redeem;
  const canRedeem = maxRedeem >= cfg.min_redeem;

  // keep the chosen redeem amount inside the allowed range whenever the range changes
  const rangeKey = `${member ? 1 : 0}|${canRedeem ? 1 : 0}|${maxRedeem}|${cfg.min_redeem}`;
  const [prevRange, setPrevRange] = useState('');
  if (prevRange !== rangeKey) {
    setPrevRange(rangeKey);
    if (member) setRPoints((p) => (canRedeem ? Math.min(Math.max(p || cfg.min_redeem, cfg.min_redeem), maxRedeem) : cfg.min_redeem));
  }

  async function run(fn: () => Promise<void>, onErr: (m: string) => void = setErr) {
    if (busy) return;
    setBusy(true); onErr(''); setNotice('');
    try { await fn(); } catch (e) {
      if (!(isUnauthorized(e) && tokenRef.current === null)) onErr(errText(e));
    } finally { setBusy(false); }
  }

  // ---------- actions ----------
  const sendCode = () => {
    const m = normaliseMobile(mobile);
    if (!m) { setErr(t.v_mobile); return; }
    void run(async () => {
      const o = await api.requestCode(m, lang);
      setChallenge(o.challenge_id); setSentTo(o.sent_to); setCode(''); setPhase('code');
    });
  };
  const verify = () => {
    const c = onlyDigits(code);
    if (!/^\d{6}$/.test(c)) { setErr(t.v_code); return; }
    void run(async () => {
      const o = await api.verifyCode(challenge, c);
      tokenRef.current = o.token;
      await writeToken(o.token);
      if (!o.member) { setPhase('join'); return; }
      try { await loadMe(); } catch (e) {
        // signed in, but the profile did not load: keep the session and offer a retry
        if (isUnauthorized(e)) throw e;
        setLoadErr(codeOf(e)); setPhase('offline');
      }
    });
  };
  const join = () => {
    const ref = referrer.trim();
    const rm = ref ? normaliseMobile(ref) : '';
    if (name.trim().length < 2) { setErr(t.v_name); return; }
    if (ref && !rm) { setErr(t.v_ref); return; }
    if (!cProgram) { setErr(t.v_consent); return; }
    void run(async () => {
      try {
        const o = await api.join({
          name: name.trim(), lang, consent_program: true, consent_marketing: cMarketing,
          ...(birth ? { birth_month: birth } : {}), ...(rm ? { referrer_mobile: rm } : {}),
        });
        setMe((prev) => ({ member: o.member, invite: null, family: prev?.family ?? [], history: prev?.history ?? [] }));
        setPhase('member');
        setNotice(fmt(t.welcome, { n: nf(o.bonus_points) }));
        loadMe().catch(() => { /* the member from /me/join is already shown */ });
      } catch (e) {
        if (e instanceof RewardsError && e.code === 'already_member') { await loadMe(); return; }
        throw e;
      }
    });
  };
  const redeemRequest = () => void run(async () => {
    const o = await api.redeemRequest(rPoints);
    setRChallenge(o.challenge_id); setRSentTo(o.sent_to); setRCode(''); setRStep('code');
  }, setRErr);
  const redeemConfirm = () => {
    const c = onlyDigits(rCode);
    if (!/^\d{6}$/.test(c)) { setRErr(t.v_code); return; }
    void run(async () => {
      try {
        const o = await api.redeemConfirm(rChallenge, c);
        setResult(o); setRStep('done');
        setMe((prev) => (prev ? { ...prev, member: o.member } : prev));
      } catch (e) {
        if (e instanceof RewardsError && (e.code === 'code_expired' || e.code === 'code_locked')) setRStep('pick');
        throw e;
      }
    }, setRErr);
  };
  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadMe(); } catch (e) { if (!isUnauthorized(e)) setLoadErr(codeOf(e)); }
    setRefreshing(false);
  };

  const history = useMemo(() => {
    const all = me?.history ?? [];
    return histFilter === 'all' ? all : all.filter((r) => (histFilter === 'out') === isOut(r));
  }, [me, histFilter]);

  const histRow = (r: HistoryRow, i: number) => {
    const neg = isOut(r);
    const chan = r.channel === 'web' ? t.ch_web : r.channel === 'app' ? t.ch_app : r.channel ? t.ch_branch : '';
    const status = r.status === 'pending' ? t.status_pending : r.status === 'usable' ? t.status_usable : '';
    const sub = [fmtDate(r.date, lang), r.branch || chan, r.sar ? fmt(t.sarAmount, { v: nf(r.sar) }) : ''].filter(Boolean).join(' · ');
    return (
      <View key={`${r.date}-${r.type}-${i}`} style={[styles.histRow, { flexDirection: row }, i > 0 && styles.histLine]}>
        <View style={[styles.histIc, { backgroundColor: alpha(neg ? colors.red : colors.success, 0.1) }]}>
          <Ionicons name={HIST_ICON[r.type] ?? 'ellipse-outline'} size={18} color={neg ? colors.red : colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold }}>{pick(t, 'type_' + r.type, r.type)}{status ? ' · ' + status : ''}</T>
          <Small>{sub}</Small>
        </View>
        <Text style={{ fontFamily: font.black, fontSize: 15, color: neg ? colors.red : colors.success }}>{'‎' + (neg ? '-' : '+') + nf(Math.abs(r.points))}</Text>
      </View>
    );
  };

  // ---------- render ----------
  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      refreshControl={phase === 'member' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.maroon} colors={[colors.red]} /> : undefined}
    >
      {notice ? (
        <View style={[styles.notice, { flexDirection: row }]}>
          <Ionicons name="sparkles" size={18} color={colors.maroon} />
          <T style={{ flex: 1, fontFamily: font.bold, color: colors.maroon }}>{notice}</T>
        </View>
      ) : null}

      {phase === 'loading' && <ActivityIndicator color={colors.maroon} style={{ marginTop: 60 }} />}

      {phase === 'offline' && (
        <Card>
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Ionicons name="cloud-offline-outline" size={46} color={colors.muted} />
            <T style={{ fontFamily: font.black, fontSize: 18, textAlign: 'center', color: colors.maroon }}>{t.offlineTitle}</T>
            <T style={{ textAlign: 'center', color: colors.muted }}>{textFor(loadErr ?? 'network')}</T>
          </View>
          <Btn label={t.retry} icon="refresh" onPress={retryLoad} busy={busy} />
          <Btn kind="link" label={t.signOut} onPress={() => signOut()} disabled={busy} />
        </Card>
      )}

      {(phase === 'mobile' || phase === 'code') && (
        <>
          <View style={{ gap: 4 }}>
            <View style={[styles.pill, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}><Text style={{ color: onBrand, fontFamily: font.bold, fontSize: 12 }}>{t.program}</Text></View>
            <T style={{ fontFamily: font.black, fontSize: 24, color: colors.maroon }}>{t.title}</T>
          </View>
          <Card>
            {[fmt(t.p1, { r: cfg.rates.member }), t.p2, fmt(t.p3, { s: cfg.rates.silver, g: cfg.rates.gold }), t.p4].map((p, i) => (
              <FadeIn key={i} index={i}>
                <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
                  <View style={styles.num}><Text style={{ color: onBrand, fontFamily: font.black, fontSize: 13 }}>{i + 1}</Text></View>
                  <T style={{ flex: 1, fontFamily: font.bold }}>{p}</T>
                </View>
              </FadeIn>
            ))}
            <Small>{t.qitaf}</Small>
          </Card>
          {phase === 'mobile' ? (
            <Card>
              <Field label={t.mobileLabel} value={mobile} onChange={setMobile} placeholder="05XXXXXXXX" numeric maxLength={16} ltr />
              <Small>{t.mobileHint}</Small>
              <ErrLine msg={err} />
              <Btn label={t.sendCode} icon="logo-whatsapp" onPress={sendCode} busy={busy} />
            </Card>
          ) : (
            <Card>
              <Small>{fmt(t.codeSent, { m: sentTo })}</Small>
              <Field label={t.codeLabel} value={code} onChange={setCode} placeholder="000000" numeric otp maxLength={6} ltr />
              <ErrLine msg={err} />
              <Btn label={t.verify} onPress={verify} busy={busy} />
              <Btn kind="link" label={t.changeNumber} onPress={() => { setErr(''); setPhase('mobile'); }} disabled={busy} />
            </Card>
          )}
        </>
      )}

      {phase === 'join' && (
        <Card>
          <H2>{t.joinTitle}</H2>
          <Small>{fmt(t.joinBonus, { n: nf(cfg.bonuses.join) })}</Small>
          <Field label={t.name} value={name} onChange={setName} maxLength={60} />
          <T style={{ fontFamily: font.bold }}>{t.birthMonth}</T>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {t.months.map((m, i) => <Chip key={m} label={m} active={birth === i + 1} onPress={() => setBirth(birth === i + 1 ? null : i + 1)} />)}
          </View>
          <Field label={t.referrer} value={referrer} onChange={setReferrer} placeholder="05XXXXXXXX" numeric maxLength={16} ltr />
          <Check label={t.consentProgram} value={cProgram} onChange={setCProgram} />
          <Check label={t.consentMarketing} value={cMarketing} onChange={setCMarketing} />
          <ErrLine msg={err} />
          <Btn label={t.joinNow} onPress={join} busy={busy} />
          <Btn kind="link" label={t.signOut} onPress={() => signOut()} disabled={busy} />
        </Card>
      )}

      {phase === 'member' && member && (
        <>
          <MemberCard member={member} t={t} />
          <Btn kind="line" icon="scan-outline" label={t.scanReceipt} onPress={() => nav.navigate('ReceiptScan')} />

          {loadErr ? (
            <Pressable onPress={retryLoad} disabled={busy} accessibilityRole="button" accessibilityLabel={t.retry} style={[styles.stale, { flexDirection: row }]}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.maroon} />
              <T style={{ flex: 1, fontSize: 13, color: colors.maroon }}>{loadErr === 'network' ? t.offlineSaved : textFor(loadErr)}</T>
              {busy ? <ActivityIndicator color={colors.maroon} /> : <Text style={{ fontFamily: font.bold, color: colors.red }}>{t.retry}</Text>}
            </Pressable>
          ) : null}

          <Segmented<Tab> value={tab} onChange={setTab} items={[
            { id: 'card', label: t.tabCard, icon: 'card-outline' },
            { id: 'history', label: t.tabHistory, icon: 'time-outline' },
            { id: 'plans', label: t.tabPlans, icon: 'diamond-outline' },
          ]} />

          {tab === 'card' && (
            <FadeIn k="card" style={{ gap: 14 }}>
              <Card>
                <H2>{t.yourTier}: {tierLabel(member.tier, lang)}</H2>
                <Small>{fmt(t.rate, { r: member.rate })}</Small>
                <TierProgress member={member} cfg={cfg} t={t} />
              </Card>

              <PerksCard member={member} t={t} />
              <PendingReceipts t={t} refreshKey={me} />
              <RedeemWallet client={api} member={member} cfg={cfg} offline={loadErr === 'network'} cachedAt={cachedAt}
                onChanged={() => { void onRefresh(); }} fallback={
              <Card>
                <H2>{t.redeemTitle}</H2>
                {rStep === 'pick' && (
                  <>
                    {!canRedeem ? (
                      <Small>{fmt(t.needMore, { n: nf(cfg.min_redeem - usable), m: nf(cfg.min_redeem) })}</Small>
                    ) : (
                      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Pressable accessibilityRole="button" accessibilityLabel={t.less} disabled={rPoints <= cfg.min_redeem}
                          onPress={() => setRPoints(Math.max(cfg.min_redeem, rPoints - cfg.step_redeem))} style={[styles.stepBtn, rPoints <= cfg.min_redeem && { opacity: 0.35 }]}>
                          <Ionicons name="remove" size={24} color={colors.maroon} />
                        </Pressable>
                        <Text style={styles.stepVal}>{nf(rPoints)} <Text style={{ fontSize: 14 }}>{t.points}</Text></Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={t.more} disabled={rPoints + cfg.step_redeem > maxRedeem}
                          onPress={() => setRPoints(Math.min(maxRedeem, rPoints + cfg.step_redeem))} style={[styles.stepBtn, rPoints + cfg.step_redeem > maxRedeem && { opacity: 0.35 }]}>
                          <Ionicons name="add" size={24} color={colors.maroon} />
                        </Pressable>
                      </View>
                    )}
                    <T>{t.discountValue}: <Text style={styles.bold}>{fmt(t.sarAmount, { v: nf(rPoints * cfg.point_value_sar) })}</Text></T>
                    <T>{t.minOrder}: <Text style={styles.bold}>{fmt(t.sarAmount, { v: nf((rPoints * cfg.point_value_sar * 100) / cfg.cap_percent) })}</Text></T>
                    <ErrLine msg={rErr} />
                    <Btn label={t.sendRedeemCode} onPress={redeemRequest} disabled={!canRedeem} busy={busy} />
                  </>
                )}
                {rStep === 'code' && (
                  <>
                    <Small>{fmt(t.codeSent, { m: rSentTo })}</Small>
                    <Field label={t.confirmCode} value={rCode} onChange={setRCode} placeholder="000000" numeric otp maxLength={6} ltr />
                    <ErrLine msg={rErr} />
                    <Btn label={t.confirmRedeem} onPress={redeemConfirm} busy={busy} />
                    <Btn kind="link" label={t.back} onPress={() => { setRErr(''); setRStep('pick'); }} disabled={busy} />
                  </>
                )}
                {rStep === 'done' && result && (
                  <>
                    <T style={{ fontFamily: font.bold }}>{t.yourCode}</T>
                    <View style={styles.codeBox}><Text selectable style={styles.codeText}>{result.discount_code}</Text></View>
                    <T>{t.discountValue}: <Text style={styles.bold}>{fmt(t.sarAmount, { v: nf(result.sar_value) })}</Text></T>
                    <T>{t.minOrder}: <Text style={styles.bold}>{fmt(t.sarAmount, { v: nf(result.min_order_sar) })}</Text></T>
                    <T>{t.validUntil}: <Text style={styles.bold}>{fmtDate(result.expires_at, lang, true)}</Text></T>
                    <Small>{t.codeNote}</Small>
                    <Btn kind="maroon" icon="share-social-outline" label={t.shareCode} onPress={() => { void Share.share({ message: result.discount_code }); }} />
                    <Btn label={t.applyCheckout} onPress={() => { void Linking.openURL(`${storeUrl.replace(/\/+$/, '')}/discount/${encodeURIComponent(result.discount_code)}?redirect=${lang === 'ar' ? '/cart' : '/en/cart'}`); }} />
                    <Btn kind="link" label={t.anotherRedeem} onPress={() => { setResult(null); setRStep('pick'); void onRefresh(); }} />
                  </>
                )}
                <Small>{t.qitaf}</Small>
              </Card>
} />
            </FadeIn>
          )}

          {tab === 'history' && (
            <FadeIn k="history">
              <Card>
                <H2>{t.history}</H2>
                <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                  <Chip label={t.histAll} active={histFilter === 'all'} onPress={() => setHistFilter('all')} />
                  <Chip label={t.histIn} active={histFilter === 'in'} onPress={() => setHistFilter('in')} />
                  <Chip label={t.histOut} active={histFilter === 'out'} onPress={() => setHistFilter('out')} />
                </View>
                {history.length ? <View>{history.map(histRow)}</View> : <Small>{t.noHistory}</Small>}
              </Card>
            </FadeIn>
          )}

          {tab === 'plans' && (
            <FadeIn k="plans">
              <PlansPanel member={member} cfg={cfg} />
            </FadeIn>
          )}

          <Btn kind="link" label={t.signOut} onPress={() => signOut()} disabled={busy} />
        </>
      )}

      <Pressable accessibilityRole="link" onPress={() => { void whatsapp(lang === 'ar' ? 'مرحباً، لدي استفسار عن مكافآت البركات' : 'Hello, I have a question about Barakat Rewards'); }}
        style={[styles.help, { flexDirection: row }]}>
        <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
        <Text style={{ color: colors.maroon, fontFamily: font.bold, fontSize: 14 }}>{t.help}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  pill: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  notice: { backgroundColor: colors.beige, borderRadius: radius.md, padding: 12, gap: 8, alignItems: 'center' },
  stale: { backgroundColor: alpha(colors.amber, 0.22), borderRadius: radius.md, padding: 12, gap: 10, alignItems: 'center' },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.maroon, alignItems: 'center', justifyContent: 'center' },
  stepVal: { flex: 1, textAlign: 'center', color: colors.maroon, fontSize: 24, fontFamily: font.black },
  bold: { fontFamily: font.black, color: colors.maroon },
  codeBox: { backgroundColor: colors.bg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.maroon, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  codeText: { color: colors.maroon, fontSize: 22, fontFamily: font.black, letterSpacing: 1 },
  histRow: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  histLine: { borderTopWidth: 1, borderTopColor: colors.line },
  histIc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  help: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
