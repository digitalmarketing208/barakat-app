// Presentational pieces of the Rewards flow. They live at module level (never inside a component body)
// so React keeps their state and TextInputs keep focus between renders.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { ProgressBar, alpha, onBrand, tap } from '../account/kit';
import type { Member, PublicConfig, TierName } from './rewardsApi';
import { readQueue } from '../receipts/queue';
import { metalFor } from './cardTheme';
import { MetalCard, emboss } from './Metallic';
import { perksFor } from './perks';
import { firstName } from './redeemLogic';
import { tierLabel } from './tierLabels';
import { Strings, fmt, fmtDate, nf, pick } from './strings';

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={[s.card, shadow]}>{children}</View>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <T style={{ fontFamily: font.black, fontSize: 18, color: colors.maroon }}>{children}</T>;
}

export function Small({ children }: { children: React.ReactNode }) {
  return <T style={{ fontSize: 13, color: colors.muted }}>{children}</T>;
}

export function ErrLine({ msg }: { msg: string }) {
  return msg ? <T style={{ color: colors.red, fontFamily: font.bold }} accessibilityLiveRegion="polite">{msg}</T> : null;
}

export type BtnKind = 'red' | 'maroon' | 'line' | 'link';
export function Btn({ label, onPress, kind = 'red', disabled, busy, icon }: {
  label: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { row } = useI18n();
  const off = !!disabled || !!busy;
  const fg = kind === 'red' || kind === 'maroon' ? onBrand : colors.maroon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy: !!busy }} onPress={onPress} disabled={off}
      style={({ pressed }) => [
        kind === 'link' ? s.link : s.btn, { flexDirection: row },
        kind === 'red' && { backgroundColor: colors.red },
        kind === 'maroon' && { backgroundColor: colors.maroon },
        kind === 'line' && { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.maroon },
        off && { opacity: 0.5 }, pressed && { opacity: 0.8 },
      ]}>
      {busy && kind !== 'link' ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={kind === 'link' ? s.linkText : [s.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { row } = useI18n();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => { tap(); onChange(!value); }} style={[s.check, { flexDirection: row }]}>
      <View style={[s.box, value && { backgroundColor: colors.red }]}>{value ? <Ionicons name="checkmark" size={16} color={onBrand} /> : null}</View>
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

export function Field({ label, value, onChange, placeholder, numeric, otp, maxLength, ltr }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; otp?: boolean; maxLength?: number; ltr?: boolean;
}) {
  const { align, rtl } = useI18n();
  return (
    <View style={{ gap: 6 }}>
      <T style={{ fontFamily: font.bold }}>{label}</T>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted}
        keyboardType={numeric ? 'number-pad' : 'default'} textContentType={otp ? 'oneTimeCode' : undefined} autoComplete={otp ? 'sms-otp' : undefined}
        maxLength={maxLength} accessibilityLabel={label}
        // numbers stay left-to-right but sit on the reading-start side
        style={[s.input, { textAlign: align, writingDirection: ltr ? 'ltr' : rtl ? 'rtl' : 'ltr' }, otp && s.otp]}
      />
    </View>
  );
}

export function Segmented<K extends string>({ items, value, onChange }: { items: { id: K; label: string; icon: keyof typeof Ionicons.glyphMap }[]; value: K; onChange: (k: K) => void }) {
  const { row } = useI18n();
  return (
    <View style={[s.seg, { flexDirection: row }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable key={it.id} onPress={() => { tap(); onChange(it.id); }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
            style={[s.segItem, { flexDirection: row }, on && { backgroundColor: colors.maroon }]}>
            <Ionicons name={it.icon} size={16} color={on ? onBrand : colors.muted} />
            <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 13, color: on ? onBrand : colors.muted }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Counts from the previous value to `value` (points balance). */
export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const v = new Animated.Value(from.current);
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    const a = Animated.timing(v, { toValue: value, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start(() => { from.current = value; setShown(value); });
    return () => { a.stop(); v.removeListener(id); from.current = value; };
  }, [value, ms]);
  return shown;
}

const TIER_ICON: Record<TierName, keyof typeof Ionicons.glyphMap> = { member: 'person', silver: 'medal', gold: 'trophy' };
const TIERS: TierName[] = ['member', 'silver', 'gold'];

function TierNode({ tier, reached, current, index }: { tier: TierName; reached: boolean; current: boolean; index: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    v.setValue(0);
    const a = Animated.spring(v, { toValue: 1, delay: 250 + index * 300, useNativeDriver: true, speed: 12, bounciness: current ? 14 : 6 });
    a.start();
    return () => a.stop();
  }, [v, index, current, reached]);
  return (
    <Animated.View style={[s.node, reached ? { backgroundColor: tier === 'gold' ? colors.amber : colors.red, borderColor: colors.card } : { backgroundColor: colors.card, borderColor: colors.line },
      current && s.nodeCurrent, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, current ? 1.15 : 1] }) }] }]}>
      <Ionicons name={TIER_ICON[tier]} size={14} color={reached ? (tier === 'gold' ? colors.dark : onBrand) : colors.muted} />
    </Animated.View>
  );
}

/** Animated member > silver > gold ladder. Plan floors can lift the tier above what spend alone gives. */
export function TierProgress({ member, cfg, t }: { member: Member; cfg: PublicConfig; t: Strings }) {
  const { row, rtl } = useI18n();
  const rank = Math.max(0, TIERS.indexOf(member.tier));
  const edge = (i: number) => (i === 1 ? 'center' : (i === 0) !== rtl ? 'flex-start' : 'flex-end');
  const { silver_sar: sv, gold_sar: gd } = cfg.tiers;
  const sp = member.tier_spend_sar;
  const bySpend = sp >= gd ? 1 : sp >= sv ? 0.5 + (0.5 * (sp - sv)) / Math.max(1, gd - sv) : (0.5 * sp) / Math.max(1, sv);
  const value = Math.max(bySpend, rank / 2);
  const nt = member.next_tier;
  const tierName = (n: string) => pick(t, 'tier_' + n, n);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: 30, justifyContent: 'center' }}>
        <View style={{ marginHorizontal: 15 }}><ProgressBar value={value} height={8} /></View>
        <View style={[StyleSheet.absoluteFill, { flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }]}>
          {TIERS.map((n, i) => <TierNode key={n} tier={n} index={i} reached={i <= rank} current={i === rank} />)}
        </View>
      </View>
      <View style={{ flexDirection: row, justifyContent: 'space-between' }}>
        {TIERS.map((n, i) => (
          <View key={n} style={{ flex: 1, alignItems: edge(i) }}>
            <Text style={{ fontFamily: i === rank ? font.black : font.medium, fontSize: 13, color: i <= rank ? colors.maroon : colors.muted }}>{tierName(n)}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 11, color: colors.muted }}>{i === 0 ? '0' : nf(i === 1 ? sv : gd)}</Text>
          </View>
        ))}
      </View>
      <Small>{fmt(t.tierSpend, { v: nf(sp) })}</Small>
      <T style={{ fontFamily: font.medium }}>{nt ? fmt(t.nextTier, { s: nf(nt.remaining_sar), t: tierName(nt.name) }) : t.topTier}</T>
    </View>
  );
}

const localMobile = (m: string) => (m.startsWith('966') ? '0' + m.slice(3) : m);

/** Member card: dark metallic per tier with a slow shine, embossed lettering, greeting, balance and the till QR (tap to enlarge). */
export function MemberCard({ member, t }: { member: Member; t: Strings }) {
  const { row, rtl, lang } = useI18n();
  const [big, setBig] = useState(false);
  const points = useCountUp(member.points.usable);
  const plan = member.plan ?? null;
  const number = localMobile(member.mobile);
  const m = metalFor(member.tier);
  const em = emboss(m);
  const first = firstName(member.name);
  return (
    <>
      <MetalCard kind={member.tier}>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/brand/logo-mark-white.png')} style={{ width: 30, height: 30 }} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <T style={{ color: m.textSoft, fontSize: 12 }}>{t.memberCard}</T>
            <Text numberOfLines={1} style={[{ color: m.text, fontFamily: font.bold, fontSize: 16, textAlign: rtl ? 'right' : 'left' }, em]}>{first ? fmt(t.welcomeBack, { n: first }) : member.name}</Text>
          </View>
          <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end', gap: 4 }}>
            <View style={[s.badge, { flexDirection: row, backgroundColor: alpha(m.accent, 0.2), borderColor: alpha(m.accent, 0.55), borderWidth: 1 }]}>
              <Ionicons name={TIER_ICON[member.tier] ?? 'person'} size={12} color={m.accent} />
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: m.accent }}>{tierLabel(member.tier, lang)}</Text>
            </View>
            {plan ? (
              <View style={[s.badge, { flexDirection: row, backgroundColor: alpha(colors.card, 0.14) }]}>
                <Ionicons name="diamond" size={11} color={m.text} />
                <Text style={{ fontFamily: font.bold, fontSize: 11, color: m.text }}>{plan.code === 'max' ? 'Max' : plan.code === 'plus' ? 'Plus' : plan.code}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: row, alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <T style={{ color: m.textSoft, fontSize: 13 }}>{t.usable}</T>
            <Text style={[{ color: m.text, fontFamily: font.black, fontSize: 38, textAlign: rtl ? 'right' : 'left' }, em]} accessibilityLabel={`${nf(member.points.usable)} ${t.points}`}>
              {nf(points)} <Text style={{ fontFamily: font.bold, fontSize: 14 }}>{t.points}</Text>
            </Text>
            <T style={{ color: m.accent, fontFamily: font.bold }}>{fmt(t.worth, { v: nf(member.points.value_sar) })}</T>
          </View>
          <Pressable onPress={() => { tap(); setBig(true); }} accessibilityRole="button" accessibilityLabel={t.tapToEnlarge} style={s.qr}>
            <QRCode value={member.mobile} size={84} color={colors.dark} backgroundColor={colors.card} />
            <Text style={s.qrNum}>{number}</Text>
          </Pressable>
        </View>

        <View style={[s.cardFoot, { flexDirection: row, borderTopColor: alpha(m.accent, 0.3) }]}>
          <Text style={[s.footText, { color: m.textSoft }]}>{t.pending}: {nf(member.points.pending)}</Text>
          <Text style={[s.footText, { flexShrink: 1, color: m.textSoft }]}>
            {member.next_expiry ? fmt(t.expiry, { n: nf(member.next_expiry.points), d: fmtDate(member.next_expiry.date, lang) }) : t.noExpiry}
          </Text>
        </View>
      </MetalCard>

      <Modal visible={big} transparent animationType="fade" onRequestClose={() => setBig(false)} statusBarTranslucent>
        <Pressable style={s.backdrop} onPress={() => setBig(false)} accessibilityRole="button" accessibilityLabel={t.close}>
          <View style={s.qrBig}>
            <T style={{ fontFamily: font.black, fontSize: 18, color: colors.maroon, textAlign: 'center' }}>{member.name}</T>
            <QRCode value={member.mobile} size={240} color={colors.dark} backgroundColor={colors.card} />
            <Text style={[s.qrNum, { fontSize: 20 }]}>{number}</Text>
            <T style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>{t.showAtTill}</T>
            <Btn kind="line" label={t.close} onPress={() => setBig(false)} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Perks of the member's tier (list in perks.ts, all proposed), with the ones the next tiers add shown as locked. */
export function PerksCard({ member, t }: { member: Member; t: Strings }) {
  const { row, lang } = useI18n();
  return (
    <Card>
      <H2>{t.perksTitle}</H2>
      {perksFor(member.tier).map(({ perk, unlocked }) => (
        <View key={perk.id} style={{ flexDirection: row, alignItems: 'center', gap: 10, opacity: unlocked ? 1 : 0.55 }}>
          <View style={[s.perkIc, { backgroundColor: alpha(unlocked ? colors.maroon : colors.muted, 0.1) }]}>
            <Ionicons name={(unlocked ? perk.icon : 'lock-closed-outline') as keyof typeof Ionicons.glyphMap} size={18} color={unlocked ? colors.maroon : colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.medium }}>{perk.text[lang]}</T>
            {!unlocked ? <Small>{fmt(t.perkLocked, { t: tierLabel(perk.from, lang) })}</Small> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Receipt claims saved on the phone and not yet sent. Separate from the balance: nothing here is points yet. */
export function PendingReceipts({ t, refreshKey }: { t: Strings; refreshKey?: unknown }) {
  const { row } = useI18n();
  const [n, setN] = useState(0);
  useEffect(() => { let alive = true; void readQueue().then((q) => { if (alive) setN(q.length); }); return () => { alive = false; }; }, [refreshKey]);
  if (!n) return null;
  return (
    <View style={[s.pendingBox, { flexDirection: row }]}>
      <Ionicons name="receipt-outline" size={18} color={colors.maroon} />
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold, color: colors.maroon }}>{fmt(t.pendingReceipts, { n: nf(n) })}</T>
        <Small>{t.pendingReceiptsNote}</Small>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  perkIc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pendingBox: { backgroundColor: colors.beige, borderRadius: radius.md, padding: 12, gap: 10, alignItems: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, gap: 12 },
  btn: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontFamily: font.bold, fontSize: 16, textAlign: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { color: colors.maroon, fontFamily: font.medium, textDecorationLine: 'underline', fontSize: 14, textAlign: 'center' },
  check: { alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.red, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular, color: colors.text, backgroundColor: colors.card },
  otp: { textAlign: 'center', fontSize: 22, fontFamily: font.bold, letterSpacing: 6 },
  seg: { backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, gap: 4, borderWidth: 1, borderColor: colors.line },
  segItem: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  node: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nodeCurrent: { shadowColor: colors.red, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  memberCard: { borderRadius: radius.lg, padding: 18 },
  badge: { alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  qr: { backgroundColor: colors.card, borderRadius: radius.md, padding: 8, alignItems: 'center', gap: 4 },
  qrNum: { color: colors.dark, fontFamily: font.bold, fontSize: 12, letterSpacing: 1, writingDirection: 'ltr' },
  cardFoot: { flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: alpha(colors.card, 0.2) },
  footText: { color: onBrand, fontFamily: font.regular, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: alpha(colors.dark, 0.88), alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrBig: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 22, alignItems: 'center', gap: 12, alignSelf: 'stretch' },
});
