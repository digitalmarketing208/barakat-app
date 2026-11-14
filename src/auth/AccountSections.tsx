// The cards that make up the account screen. Each one owns its own form state and error line.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from '@react-navigation/native';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import { useStore } from '../store';
import { money, sized } from '../shopify';
import type { NewLine } from '../shopify';
import { whatsapp } from '../links';
import { createRewardsClient, normaliseMobile } from '../rewards/rewardsApi';
import type { Member } from '../rewards/rewardsApi';
import { AUTH } from './config';
import { useAuth } from './AuthProvider';
import { CustomerUserError } from './customerApi';
import type { Address, Order, Profile } from './customerApi';
import { isAuthError } from './errors';
import { Card, Divider, Field, LinkButton, Notice, Pill, useAuthNav } from './kit';
import { emptyEye, listRx, removeRx, rxSummary, saveRx } from './prescriptions';
import type { EyeRx, SavedRx } from './prescriptions';
import { AuthKey, useAuthStrings } from './strings';

type S = ReturnType<typeof useAuthStrings>;

const errText = (e: unknown, s: S): string => {
  if (e instanceof CustomerUserError && e.message) return e.message;
  if (isAuthError(e, 'network')) return s('errNetwork');
  if (isAuthError(e, 'expired')) return s('errExpired');
  return s('errSave');
};

const confirm = (title: string, ok: string, cancel: string, onOk: () => void) =>
  Alert.alert(title, undefined, [{ text: cancel, style: 'cancel' }, { text: ok, style: 'destructive', onPress: onOk }]);

// ---------- profile ----------
function ProfileLine({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  const s = useAuthStrings();
  const { row } = useI18n();
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 30 }}>
      <T style={{ color: colors.muted, fontSize: 13 }}>{label}</T>
      <Text selectable style={{ fontFamily: font.medium, fontSize: 14, color: value ? colors.text : colors.muted, flexShrink: 1, writingDirection: ltr ? 'ltr' : undefined }} numberOfLines={1}>
        {value ? (ltr ? `\u200E${value}` : value) : s('notSet')}
      </Text>
    </View>
  );
}

export function ProfileSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const { row } = useI18n();
  const { updateName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const open = () => { setFirst(profile.firstName); setLast(profile.lastName); setErr(''); setEditing(true); };
  const save = async () => {
    setBusy(true); setErr('');
    try { await updateName(first.trim(), last.trim()); setEditing(false); }
    catch (e) { setErr(errText(e, s)); }
    finally { setBusy(false); }
  };

  return (
    <Card title={s('profile')} icon="person-outline" action={!editing ? <LinkButton title={s('edit')} onPress={open} /> : undefined}>
      {editing ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: row, gap: 10 }}>
            <Field label={s('firstName')} value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" maxLength={60} />
            <Field label={s('lastName')} value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" maxLength={60} />
          </View>
          {err ? <Notice text={err} /> : null}
          <View style={{ flexDirection: row, gap: 10 }}>
            <Button title={s('save')} onPress={save} loading={busy} style={{ flex: 1, height: 46 }} />
            <Button title={s('cancel')} onPress={() => setEditing(false)} variant="ghost" disabled={busy} style={{ flex: 1, height: 46 }} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <ProfileLine label={s('firstName')} value={profile.firstName} />
          <ProfileLine label={s('lastName')} value={profile.lastName} />
          <ProfileLine label={s('email')} value={profile.email} ltr />
          <ProfileLine label={s('phone')} value={profile.phone} ltr />
          <T style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{s('contactNote')}</T>
        </View>
      )}
    </Card>
  );
}

// ---------- addresses ----------
type AddressForm = { id?: string; firstName: string; lastName: string; address1: string; address2: string; city: string; zip: string; phone: string; makeDefault: boolean };

export function AddressesSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const { row, lang } = useI18n();
  const { saveAddress, deleteAddress, setDefaultAddress } = useAuth();
  const [form, setForm] = useState<AddressForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 'form' or an address id
  const [err, setErr] = useState('');

  const openNew = () => {
    setErr('');
    setForm({ firstName: profile.firstName, lastName: profile.lastName, address1: '', address2: '', city: '', zip: '', phone: profile.phone, makeDefault: profile.addresses.length === 0 });
  };
  const openEdit = (a: Address) => {
    setErr('');
    setForm({ id: a.id, firstName: a.firstName, lastName: a.lastName, address1: a.address1, address2: a.address2, city: a.city, zip: a.zip, phone: a.phoneNumber, makeDefault: a.id === profile.defaultAddressId });
  };
  const set = (k: keyof AddressForm) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async () => {
    if (!form) return;
    if (!form.firstName.trim() || !form.address1.trim() || !form.city.trim()) { setErr(s('needAddress')); return; }
    let phoneNumber: string | undefined;
    if (form.phone.trim()) {
      const sa = normaliseMobile(form.phone);
      const intl = form.phone.replace(/[\s-]/g, '');
      if (sa) phoneNumber = '+' + sa;
      else if (/^\+[1-9]\d{6,14}$/.test(intl)) phoneNumber = intl;
      else { setErr(s('phoneInvalid')); return; }
    }
    setBusy('form'); setErr('');
    try {
      await saveAddress({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), address1: form.address1.trim(), address2: form.address2.trim(),
        city: form.city.trim(), zip: form.zip.trim(), countryCode: 'SA', phoneNumber,
      }, { id: form.id, makeDefault: form.makeDefault && form.id !== profile.defaultAddressId });
      setForm(null);
    } catch (e) { setErr(errText(e, s)); }
    finally { setBusy(null); }
  };

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setErr('');
    try { await fn(); } catch (e) { setErr(errText(e, s)); } finally { setBusy(null); }
  };
  const remove = (a: Address) => {
    if (a.id === profile.defaultAddressId && profile.addresses.length > 1) { setErr(s('defaultDeleteNote')); return; }
    confirm(s('deleteAddressQ'), s('remove'), s('cancel'), () => { void act(a.id, () => deleteAddress(a.id)); });
  };

  return (
    <Card title={s('addresses')} icon="location-outline" action={!form ? <LinkButton title={s('add')} icon="add" onPress={openNew} /> : undefined}>
      {!profile.fresh.addresses ? <View style={{ marginBottom: 10 }}><Notice tone="info" text={s('staleNote')} /></View> : null}
      {form ? (
        <View style={{ gap: 10 }}>
          <T style={{ fontFamily: font.bold }}>{form.id ? s('editAddress') : s('addAddress')}</T>
          <View style={{ flexDirection: row, gap: 10 }}>
            <Field label={s('firstName')} value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" maxLength={60} />
            <Field label={s('lastName')} value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" maxLength={60} />
          </View>
          <Field label={s('address1')} value={form.address1} onChangeText={set('address1')} autoComplete="address-line1" maxLength={120} />
          <Field label={s('address2')} value={form.address2} onChangeText={set('address2')} autoComplete="address-line2" maxLength={120} />
          <View style={{ flexDirection: row, gap: 10 }}>
            <Field label={s('city')} value={form.city} onChangeText={set('city')} maxLength={60} />
            <Field label={s('zip')} value={form.zip} onChangeText={set('zip')} keyboardType="number-pad" autoComplete="postal-code" maxLength={10} ltr />
          </View>
          <Field label={s('phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" maxLength={20} placeholder="05XXXXXXXX" ltr />
          <T style={{ color: colors.muted, fontSize: 12 }}>{s('country')}</T>
          <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <T style={{ flex: 1 }}>{s('setAsDefault')}</T>
            <Switch value={form.makeDefault} onValueChange={(v) => setForm((f) => (f ? { ...f, makeDefault: v } : f))}
              disabled={!!form.id && form.id === profile.defaultAddressId} trackColor={{ true: colors.red, false: colors.line }} accessibilityLabel={s('setAsDefault')} />
          </View>
          {err ? <Notice text={err} /> : null}
          <View style={{ flexDirection: row, gap: 10 }}>
            <Button title={s('save')} onPress={submit} loading={busy === 'form'} style={{ flex: 1, height: 46 }} />
            <Button title={s('cancel')} onPress={() => { setForm(null); setErr(''); }} variant="ghost" disabled={busy === 'form'} style={{ flex: 1, height: 46 }} />
          </View>
        </View>
      ) : (
        <View>
          {profile.addresses.length === 0 ? <T style={{ color: colors.muted }}>{s('noAddresses')}</T> : null}
          {profile.addresses.map((a, i) => {
            const isDefault = a.id === profile.defaultAddressId;
            return (
              <View key={a.id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ gap: 4, opacity: busy === a.id ? 0.5 : 1 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                    <T style={{ fontFamily: font.bold, flex: 1 }} numberOfLines={1}>{[a.firstName, a.lastName].filter(Boolean).join(' ') || a.city}</T>
                    {isDefault ? <Pill text={s('defaultAddress')} tone="good" /> : null}
                  </View>
                  <T style={{ color: colors.muted, fontSize: 13 }}>{[a.address1, a.address2, a.city, a.zip, a.country].filter(Boolean).join(lang === 'ar' ? '، ' : ', ')}</T>
                  {a.phoneNumber ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted, writingDirection: 'ltr', textAlign: row === 'row' ? 'left' : 'right' }}>{`‎${a.phoneNumber}`}</Text> : null}
                  <View style={{ flexDirection: row, gap: 18, marginTop: 4 }}>
                    <LinkButton title={s('edit')} icon="create-outline" onPress={() => openEdit(a)} disabled={!!busy} />
                    {!isDefault ? <LinkButton title={s('makeDefault')} icon="star-outline" onPress={() => act(a.id, () => setDefaultAddress(a.id))} disabled={!!busy} /> : null}
                    <LinkButton title={s('remove')} icon="trash-outline" color={colors.muted} onPress={() => remove(a)} disabled={!!busy} />
                  </View>
                </View>
              </View>
            );
          })}
          {err ? <View style={{ marginTop: 10 }}><Notice text={err} /></View> : null}
        </View>
      )}
    </Card>
  );
}

// ---------- orders ----------
const FIN: Record<string, [AuthKey, 'good' | 'warn' | 'bad' | 'neutral']> = {
  PAID: ['stPaid', 'good'], PENDING: ['stPending', 'warn'], REFUNDED: ['stRefunded', 'neutral'], PARTIALLY_REFUNDED: ['stPartRefunded', 'neutral'],
  VOIDED: ['stVoided', 'bad'], AUTHORIZED: ['stAuthorized', 'warn'], PARTIALLY_PAID: ['stPartPaid', 'warn'], EXPIRED: ['stExpired', 'bad'],
};
const FUL: Record<string, [AuthKey, 'good' | 'warn' | 'bad' | 'neutral']> = {
  FULFILLED: ['ffFulfilled', 'good'], UNFULFILLED: ['ffUnfulfilled', 'warn'], OPEN: ['ffUnfulfilled', 'warn'], RESTOCKED: ['ffUnfulfilled', 'neutral'],
  PARTIALLY_FULFILLED: ['ffPartial', 'warn'], IN_PROGRESS: ['ffInProgress', 'warn'], PENDING_FULFILLMENT: ['ffInProgress', 'warn'],
  ON_HOLD: ['ffOnHold', 'neutral'], SCHEDULED: ['ffScheduled', 'neutral'],
};

export function OrdersSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const nav = useAuthNav();
  const { row, lang, t } = useI18n();
  const { addLines } = useStore();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; tone: 'good' | 'bad' } | null>(null);
  const orders = all ? profile.orders : profile.orders.slice(0, 3);

  const date = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso.slice(0, 10); }
  };

  const reorder = async (o: Order) => {
    const stamp = Date.now().toString(36);
    // Lens add-ons stay paired with their frame: the pairing id is kept but made unique for this reorder.
    const lines: NewLine[] = o.lines.filter((l) => !!l.variantId).map((l) => ({
      variantId: l.variantId as string, quantity: l.quantity,
      attributes: l.attributes.length ? l.attributes.map((a) => (a.key === '_group' ? { key: a.key, value: `${a.value}-${stamp}` } : a)) : undefined,
    }));
    if (!lines.length) { setMsg({ id: o.id, text: s('reorderNone'), tone: 'bad' }); return; }
    setBusy(o.id); setMsg(null);
    let added = 0;
    try { await addLines(lines); added = lines.length; }
    catch {
      // One sold-out item must not block the rest.
      // A frame and its lens add-on (same `_group`) go in together or not at all: never a lens without its frame.
      const groupOf = (l: NewLine) => l.attributes?.find((a) => a.key === '_group')?.value;
      const sets = new Map<string, NewLine[]>();
      lines.forEach((l, i) => { const k = groupOf(l) ?? `#${i}`; sets.set(k, [...(sets.get(k) ?? []), l]); });
      for (const set of sets.values()) { try { await addLines(set); added += set.length; } catch { /* skip unavailable */ } }
    }
    setBusy(null);
    if (added === 0) { setMsg({ id: o.id, text: s('reorderNone'), tone: 'bad' }); return; }
    setMsg({ id: o.id, text: added === lines.length ? s('reorderDone') : s('reorderPartial', { a: added, b: lines.length }), tone: 'good' });
    if (added === lines.length) nav.navigate('Cart');
  };

  const openStatus = (o: Order) => {
    WebBrowser.openBrowserAsync(o.statusPageUrl, { toolbarColor: colors.maroon, controlsColor: '#fff' }).catch(() => Linking.openURL(o.statusPageUrl).catch(() => {}));
  };

  return (
    <Card title={s('orders')} icon="cube-outline">
      {!profile.fresh.orders ? <View style={{ marginBottom: 10 }}><Notice tone="info" text={s('staleNote')} /></View> : null}
      {profile.orders.length === 0 ? <T style={{ color: colors.muted }}>{s('noOrders')}</T> : null}
      {orders.map((o, i) => {
        const fin = o.financialStatus ? FIN[o.financialStatus] : undefined;
        const ful = o.fulfillmentStatus ? FUL[o.fulfillmentStatus] : undefined;
        const count = o.lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <View key={o.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontFamily: font.black, fontSize: 15, color: colors.text }}>{`‎${o.name}`}</Text>
                <T style={{ color: colors.muted, fontSize: 12 }}>{date(o.processedAt)}</T>
              </View>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
                {o.cancelledAt ? <Pill text={s('stCancelled')} tone="bad" /> : (<>
                  {ful ? <Pill text={s(ful[0])} tone={ful[1]} /> : null}
                  {fin ? <Pill text={s(fin[0])} tone={fin[1]} /> : null}
                </>)}
              </View>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
                {o.lines.slice(0, 4).map((l) => (
                  <View key={l.id} style={st.thumb}>
                    {l.image ? <Image source={sized(l.image, 120)} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" accessibilityLabel={l.title} />
                      : <Ionicons name="glasses-outline" size={20} color={colors.line} />}
                  </View>
                ))}
                <View style={{ flex: 1 }}>
                  <T style={{ color: colors.muted, fontSize: 12 }}>{s('items', { n: count })}</T>
                  <Text style={{ fontFamily: font.black, color: colors.red, fontSize: 14, textAlign: row === 'row' ? 'left' : 'right' }}>{money(o.total)} {t('sar')}</Text>
                </View>
              </View>
              {msg?.id === o.id ? <Notice text={msg.text} tone={msg.tone} /> : null}
              <View style={{ flexDirection: row, gap: 18, alignItems: 'center' }}>
                <LinkButton title={s('track')} icon="navigate-outline" onPress={() => openStatus(o)} />
                {busy === o.id ? <ActivityIndicator color={colors.red} /> : <LinkButton title={s('reorder')} icon="repeat-outline" onPress={() => reorder(o)} disabled={!!busy} />}
              </View>
            </View>
          </View>
        );
      })}
      {profile.orders.length > 3 ? (
        <View style={{ marginTop: 12, alignItems: 'center' }}>
          <LinkButton title={all ? s('showLess') : s('showAll', { n: profile.orders.length })} onPress={() => setAll((v) => !v)} />
        </View>
      ) : null}
    </Card>
  );
}

// ---------- saved prescriptions (local, encrypted) ----------
type RxForm = { id?: string; label: string; date: string; right: EyeRx; left: EyeRx; pd: string; notes: string };
const today = () => new Date().toISOString().slice(0, 10);

export function PrescriptionsSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const nav = useAuthNav();
  const { row } = useI18n();
  const [list, setList] = useState<SavedRx[]>([]);
  const [form, setForm] = useState<RxForm | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { let on = true; listRx(profile.id).then((l) => { if (on) setList(l); }); return () => { on = false; }; }, [profile.id]);

  const labels = useMemo(() => ({ right: s('rxRight'), left: s('rxLeft'), pd: 'PD' }), [s]);
  const submit = async () => {
    if (!form) return;
    if (!form.label.trim()) { setErr(s('rxNeedLabel')); return; }
    setBusy(true); setErr('');
    const next = await saveRx(profile.id, { ...form, label: form.label.trim(), notes: form.notes.trim() });
    setBusy(false);
    if (!next) { setErr(s('rxSaveFail')); return; }
    setList(next); setForm(null);
  };
  const eyeRow = (side: 'right' | 'left') => {
    const e = form![side];
    const set = (k: keyof EyeRx) => (v: string) => setForm((f) => (f ? { ...f, [side]: { ...f[side], [k]: v } } : f));
    return (
      <View style={{ gap: 6 }}>
        <T style={{ fontFamily: font.bold, fontSize: 13 }}>{s(side === 'right' ? 'rxRight' : 'rxLeft')}</T>
        {/* Optical values always read left to right, in both languages. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="SPH" value={e.sph} onChangeText={set('sph')} keyboardType="numbers-and-punctuation" maxLength={7} placeholder="-1.25" ltr />
          <Field label="CYL" value={e.cyl} onChangeText={set('cyl')} keyboardType="numbers-and-punctuation" maxLength={7} placeholder="-0.50" ltr />
          <Field label="AXIS" value={e.axis} onChangeText={set('axis')} keyboardType="number-pad" maxLength={3} placeholder="90" ltr />
          <Field label="ADD" value={e.add} onChangeText={set('add')} keyboardType="numbers-and-punctuation" maxLength={6} placeholder="+1.00" ltr />
        </View>
      </View>
    );
  };

  return (
    <Card title={s('rx')} icon="document-text-outline"
      action={!form ? <LinkButton title={s('add')} icon="add" onPress={() => { setErr(''); setForm({ label: '', date: today(), right: emptyEye(), left: emptyEye(), pd: '', notes: '' }); }} /> : undefined}>
      {form ? (
        <View style={{ gap: 10 }}>
          <T style={{ fontFamily: font.bold }}>{form.id ? s('rxEdit') : s('rxAdd')}</T>
          <Field label={s('rxLabel')} value={form.label} onChangeText={(v) => setForm((f) => (f ? { ...f, label: v } : f))} maxLength={50} />
          {eyeRow('right')}
          {eyeRow('left')}
          <View style={{ flexDirection: row, gap: 10 }}>
            <Field label={s('rxPd')} value={form.pd} onChangeText={(v) => setForm((f) => (f ? { ...f, pd: v } : f))} keyboardType="numbers-and-punctuation" maxLength={8} placeholder="63" ltr />
            <Field label={s('rxDate')} value={form.date} onChangeText={(v) => setForm((f) => (f ? { ...f, date: v } : f))} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="2026-01-31" ltr />
          </View>
          <Field label={s('rxNotes')} value={form.notes} onChangeText={(v) => setForm((f) => (f ? { ...f, notes: v } : f))} maxLength={200} multiline />
          {err ? <Notice text={err} /> : null}
          <View style={{ flexDirection: row, gap: 10 }}>
            <Button title={s('save')} onPress={submit} loading={busy} style={{ flex: 1, height: 46 }} />
            <Button title={s('cancel')} onPress={() => setForm(null)} variant="ghost" disabled={busy} style={{ flex: 1, height: 46 }} />
          </View>
        </View>
      ) : (
        <View>
          {list.length === 0 ? <T style={{ color: colors.muted }}>{s('rxEmpty')}</T> : null}
          {list.map((rx, i) => (
            <View key={rx.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <T style={{ fontFamily: font.bold, flex: 1 }} numberOfLines={1}>{rx.label}</T>
                  {rx.date ? <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{rx.date}</Text> : null}
                </View>
                <T style={{ color: colors.muted, fontSize: 13 }}>{rxSummary(rx, labels)}</T>
                {rx.notes ? <T style={{ color: colors.muted, fontSize: 12 }}>{rx.notes}</T> : null}
                <View style={{ flexDirection: row, gap: 18, marginTop: 4, flexWrap: 'wrap' }}>
                  <LinkButton title={s('edit')} icon="create-outline" onPress={() => { setErr(''); setForm({ id: rx.id, label: rx.label, date: rx.date, right: { ...rx.right }, left: { ...rx.left }, pd: rx.pd, notes: rx.notes }); }} />
                  <LinkButton title={s('rxSend')} icon="logo-whatsapp" onPress={() => { whatsapp(`${s('rxShareIntro')}\n${rx.label}\n${rxSummary(rx, labels)}${rx.notes ? `\n${rx.notes}` : ''}`).catch(() => {}); }} />
                  <LinkButton title={s('remove')} icon="trash-outline" color={colors.muted}
                    onPress={() => confirm(s('rxDeleteQ'), s('remove'), s('cancel'), () => { void removeRx(profile.id, rx.id).then(setList); })} />
                </View>
              </View>
            </View>
          ))}
          <Divider />
          <LinkButton title={s('rxUpload')} icon="camera-outline" onPress={() => nav.navigate('Prescription')} />
          <View style={{ flexDirection: row, gap: 6, alignItems: 'center', marginTop: 8 }}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.muted} />
            <T style={{ color: colors.muted, fontSize: 12, flex: 1 }}>{s('rxPrivate')}</T>
          </View>
        </View>
      )}
    </Card>
  );
}

// ---------- communication preferences ----------
export function PreferencesSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const { row } = useI18n();
  const { setEmailMarketing } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? profile.emailMarketing === 'SUBSCRIBED';

  const toggle = async (v: boolean) => {
    setBusy(true); setErr(''); setOptimistic(v);
    try { await setEmailMarketing(v); }
    catch (e) { setErr(errText(e, s)); }
    finally { setOptimistic(null); setBusy(false); }
  };

  return (
    <Card title={s('prefs')} icon="notifications-outline">
      <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold }}>{s('prefEmail')}</T>
          <T style={{ color: colors.muted, fontSize: 12 }}>{profile.email ? s('prefEmailSub') : s('prefNoEmail')}</T>
        </View>
        <Switch value={on} onValueChange={toggle} disabled={busy || !profile.email} trackColor={{ true: colors.red, false: colors.line }} accessibilityLabel={s('prefEmail')} />
      </View>
      {err ? <View style={{ marginTop: 10 }}><Notice text={err} /></View> : null}
      {profile.phone ? (<>
        <Divider />
        <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold }}>{s('prefSms')}</T>
            <T style={{ color: colors.muted, fontSize: 12 }}>{s('prefSmsNote')}</T>
          </View>
          <Pill text={profile.smsMarketing === 'SUBSCRIBED' ? s('prefSmsOn') : s('prefSmsOff')} tone={profile.smsMarketing === 'SUBSCRIBED' ? 'good' : 'neutral'} />
        </View>
      </>) : null}
    </Card>
  );
}

// ---------- Barakat Rewards (read only) ----------
const REWARDS_API = process.env.EXPO_PUBLIC_REWARDS_API || 'https://barakat-rewards.digitalmarketing-b5c.workers.dev';
const REWARDS_TOKEN_KEY = 'boRewardsToken'; // written by src/rewards/RewardsScreen.tsx after the mobile is verified there

type RewardsState = { kind: 'loading' } | { kind: 'unlinked' } | { kind: 'verified-not-member' } | { kind: 'member'; member: Member } | { kind: 'error' };

export function RewardsSection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const nav = useAuthNav();
  const { row } = useI18n();
  const [state, setState] = useState<RewardsState>({ kind: 'loading' });

  // Re-read every time the screen is shown, so linking inside the Rewards screen shows up on the way back.
  useFocusEffect(useCallback(() => {
    let on = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(REWARDS_TOKEN_KEY).catch(() => null);
        if (!token) { if (on) setState({ kind: 'unlinked' }); return; }
        // Only the read endpoint is used here: joining, redeeming and consent stay in the Rewards screen.
        const me = await createRewardsClient({ apiBase: REWARDS_API, getToken: () => token }).me();
        if (on) setState(me.member ? { kind: 'member', member: me.member } : { kind: 'verified-not-member' });
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (on) setState(code === 'unauthorized' ? { kind: 'unlinked' } : { kind: 'error' });
      }
    })();
    return () => { on = false; };
  }, []));

  const open = () => nav.navigate('Rewards');
  const tier: Record<Member['tier'], AuthKey> = { member: 'tierMember', silver: 'tierSilver', gold: 'tierGold' };
  const accountMobile = normaliseMobile(profile.phone);

  return (
    <Card title={s('rewards')} icon="gift-outline">
      {state.kind === 'loading' ? <ActivityIndicator color={colors.red} /> : null}
      {state.kind === 'member' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.black, fontSize: 22, color: colors.red, textAlign: row === 'row' ? 'left' : 'right' }}>{s('rewardsPoints', { n: state.member.points.usable.toLocaleString('en-US') })}</Text>
              {state.member.points.pending > 0 ? <T style={{ color: colors.muted, fontSize: 12 }}>{s('rewardsPending', { n: state.member.points.pending.toLocaleString('en-US') })}</T> : null}
            </View>
            <Pill text={s(tier[state.member.tier] ?? 'tierMember')} tone={state.member.tier === 'gold' ? 'warn' : 'neutral'} />
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: colors.muted, writingDirection: 'ltr', textAlign: row === 'row' ? 'left' : 'right' }}>{`‎+${state.member.mobile}`}</Text>
          {accountMobile && accountMobile !== state.member.mobile ? <Notice tone="info" text={s('rewardsMismatch')} /> : null}
          <LinkButton title={s('rewardsOpen')} icon="open-outline" onPress={open} />
        </View>
      ) : null}
      {state.kind === 'unlinked' ? (
        <View style={{ gap: 10 }}>
          <T style={{ color: colors.muted }}>{s('rewardsLinkSub')}</T>
          <Button title={s('rewardsLink')} icon="phone-portrait-outline" variant="dark" onPress={open} style={{ height: 46 }} />
        </View>
      ) : null}
      {state.kind === 'verified-not-member' ? (
        <View style={{ gap: 10 }}>
          <T style={{ color: colors.muted }}>{s('rewardsNotMember')}</T>
          <LinkButton title={s('rewardsOpen')} icon="open-outline" onPress={open} />
        </View>
      ) : null}
      {state.kind === 'error' ? (
        <View style={{ gap: 10 }}>
          <T style={{ color: colors.muted }}>{s('rewardsError')}</T>
          <LinkButton title={s('rewardsOpen')} icon="open-outline" onPress={open} />
        </View>
      ) : null}
    </Card>
  );
}

// ---------- security, privacy, sign out ----------
export function SecurityPrivacySection({ profile }: { profile: Profile }) {
  const s = useAuthStrings();
  const { row } = useI18n();
  const { biometric, setBiometric, signOut } = useAuth();
  const [note, setNote] = useState('');

  const toggleBio = async (v: boolean) => {
    setNote('');
    const ok = await setBiometric(v);
    if (v && !ok && !biometric.available) setNote(s('biometricUnavailable'));
  };
  const deleteMsg = s('deleteMsg', { email: profile.email || profile.phone || '-' });

  return (
    <Card title={s('privacy')} icon="shield-checkmark-outline">
      <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold }}>{s('biometric')}</T>
          <T style={{ color: colors.muted, fontSize: 12 }}>{biometric.available ? s('biometricSub') : s('biometricUnavailable')}</T>
        </View>
        <Switch value={biometric.enabled} onValueChange={toggleBio} disabled={!biometric.available} trackColor={{ true: colors.red, false: colors.line }} accessibilityLabel={s('biometric')} />
      </View>
      {note ? <View style={{ marginTop: 10 }}><Notice tone="info" text={note} /></View> : null}
      <Divider />
      <T style={{ fontFamily: font.bold }}>{s('deleteAccount')}</T>
      <T style={{ color: colors.muted, fontSize: 12 }}>{s('deleteAccountSub')}</T>
      <View style={{ flexDirection: row, gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
        <LinkButton title={s('deleteViaWhatsapp')} icon="logo-whatsapp" onPress={() => { whatsapp(deleteMsg).catch(() => {}); }} />
        {AUTH.privacyEmail ? (
          <LinkButton title={s('deleteViaEmail')} icon="mail-outline"
            onPress={() => { Linking.openURL(`mailto:${AUTH.privacyEmail}?subject=${encodeURIComponent(s('deleteSubject'))}&body=${encodeURIComponent(deleteMsg)}`).catch(() => {}); }} />
        ) : null}
      </View>
      <Divider />
      <Pressable onPress={() => confirm(s('wipeQ'), s('remove'), s('cancel'), () => { void signOut({ wipeLocal: true }); })} accessibilityRole="button" accessibilityLabel={s('wipeLocal')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <T style={{ fontFamily: font.bold, color: colors.red }}>{s('wipeLocal')}</T>
        <T style={{ color: colors.muted, fontSize: 12 }}>{s('wipeLocalSub')}</T>
      </Pressable>
    </Card>
  );
}

const st = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
