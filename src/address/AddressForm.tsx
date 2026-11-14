import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { Button, T } from '../ui';
import {
  AddressErrors, FieldKey, SaudiAddress, asciiDigits, emptyAddress, googleMapsLink, isShortAddress, normalizeMobile,
  normalizeShortAddress, validateAddress,
} from './types';
import { useCurrentLocation } from './useCurrentLocation';
import { FIND_SHORT_ADDRESS_URL, NationalAddressException, isNationalAddressEnabled, lookupBest } from './nationalAddress';

const S = {
  ar: {
    useLoc: 'استخدم موقعي الدقيق', locating: 'جاري تحديد موقعك', located: 'تم تحديد الموقع وتعبئة العنوان',
    locFail: 'تعذر تحديد الموقع', locDenied: 'لم يتم السماح بالموقع',
    confirm: 'تأكيد الموقع على الخريطة', accuracy: 'الدقة', meters: 'م', openMap: 'افتح في خرائط جوجل',
    nudge: 'حرّك الدبوس لضبط الموقع', clearPin: 'إزالة الموقع',
    fullName: 'الاسم الكامل', mobile: 'رقم الجوال', city: 'المدينة', district: 'الحي', street: 'الشارع',
    buildingNo: 'رقم المبنى (4 أرقام)', additionalNo: 'الرقم الإضافي (4 أرقام)', postalCode: 'الرمز البريدي (5 أرقام)',
    shortAddress: 'العنوان المختصر (مثال RRRD2929)', notes: 'ملاحظات للتوصيل (اختياري)',
    required: 'هذا الحقل مطلوب', invalid: 'قيمة غير صحيحة',
    e_mobile: 'أدخل رقم جوال سعودي مثل 05xxxxxxxx', e_buildingNo: 'رقم المبنى 4 أرقام', e_additionalNo: 'الرقم الإضافي 4 أرقام',
    e_postalCode: 'الرمز البريدي 5 أرقام', e_shortAddress: 'العنوان المختصر 4 أحرف إنجليزية و4 أرقام',
    lookup: 'تعبئة من العنوان الوطني', looking: 'جاري البحث', found: 'تمت التعبئة من العنوان الوطني',
    notFound: 'لم نجد هذا العنوان', lookFail: 'تعذر الاتصال بالعنوان الوطني', limit: 'تم تجاوز حد الطلبات حاول بعد دقيقة',
    findShort: 'اعرف عنواني المختصر', save: 'حفظ العنوان',
  },
  en: {
    useLoc: 'Use my exact location', locating: 'Finding your location', located: 'Location found, address filled in',
    locFail: 'Could not get your location', locDenied: 'Location permission not granted',
    confirm: 'Confirm location on map', accuracy: 'Accuracy', meters: 'm', openMap: 'Open in Google Maps',
    nudge: 'Move the pin to fine-tune', clearPin: 'Remove location',
    fullName: 'Full name', mobile: 'Mobile number', city: 'City', district: 'District', street: 'Street',
    buildingNo: 'Building no. (4 digits)', additionalNo: 'Additional no. (4 digits)', postalCode: 'Postal code (5 digits)',
    shortAddress: 'Short address (e.g. RRRD2929)', notes: 'Delivery notes (optional)',
    required: 'This field is required', invalid: 'Invalid value',
    e_mobile: 'Enter a Saudi mobile like 05xxxxxxxx', e_buildingNo: 'Building no. is 4 digits', e_additionalNo: 'Additional no. is 4 digits',
    e_postalCode: 'Postal code is 5 digits', e_shortAddress: 'Short address is 4 letters + 4 digits',
    lookup: 'Fill from National Address', looking: 'Looking up', found: 'Filled from National Address',
    notFound: 'Address not found', lookFail: 'National Address service unavailable', limit: 'Request limit reached, retry in a minute',
    findShort: 'Find my short address', save: 'Save address',
  },
};

type Props = {
  initial?: Partial<SaudiAddress>;
  onSubmit: (a: SaudiAddress) => void;
  submitLabel?: string;
  submitting?: boolean;
};

function Field({ label, value, onChangeText, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  const { rtl } = useI18n();
  return (
    <View style={{ marginBottom: 12 }}>
      <T style={{ fontSize: 13, color: colors.muted, fontFamily: font.medium, marginBottom: 4 }}>{label}</T>
      <TextInput
        {...rest} value={value} onChangeText={onChangeText} placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={[st.input, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, error ? { borderColor: colors.red } : null]} />
      {!!error && <T style={{ fontSize: 12, color: colors.red, marginTop: 3 }}>{error}</T>}
    </View>
  );
}

// ~10 m nudge. 1 deg lat ~ 111 km; lng scaled by cos(lat).
const STEP = 0.0001;

/** Map confirm step. Lightweight fallback: no native map module (react-native-maps needs a Google Maps key in the native build). */
function PinConfirm({ lat, lng, accuracy, onMove, onClear, s, rtl }: {
  lat: number; lng: number; accuracy: number | null; onMove: (lat: number, lng: number) => void; onClear: () => void;
  s: typeof S.ar; rtl: boolean;
}) {
  const k = Math.cos((lat * Math.PI) / 180) || 1;
  const btn = (icon: keyof typeof Ionicons.glyphMap, dLat: number, dLng: number) => (
    <Pressable key={icon} onPress={() => onMove(lat + dLat * STEP, lng + (dLng * STEP) / k)} style={st.nudge} accessibilityRole="button" accessibilityLabel={s.nudge}>
      <Ionicons name={icon} size={20} color={colors.red} />
    </Pressable>
  );
  return (
    <View style={st.pinCard}>
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="location" size={22} color={colors.red} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold }}>{s.confirm}</T>
          <T style={{ fontSize: 13, color: colors.muted }}>{lat.toFixed(6)}, {lng.toFixed(6)}{accuracy != null ? `  ·  ${s.accuracy} ~${Math.round(accuracy)} ${s.meters}` : ''}</T>
        </View>
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={s.clearPin} hitSlop={10}>
          <Ionicons name="close-circle" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <T style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>{s.nudge}</T>
      <View style={{ alignItems: 'center', marginVertical: 6 }} accessible={false}>
        {btn("chevron-up", 1, 0)}
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
          {btn("chevron-back", 0, -1)}
          {btn("chevron-forward", 0, 1)}
        </View>
        {btn("chevron-down", -1, 0)}
      </View>
      <Pressable onPress={() => { Linking.openURL(googleMapsLink(lat, lng)).catch(() => {}); }} accessibilityRole="link">
        <T style={{ color: colors.red, fontFamily: font.bold, textDecorationLine: 'underline' }}>{s.openMap}</T>
      </Pressable>
    </View>
  );
}

export function AddressForm({ initial, onSubmit, submitLabel, submitting }: Props) {
  const { lang, rtl } = useI18n();
  const s = S[lang];
  const [a, setA] = useState<SaudiAddress>({ ...emptyAddress(), ...initial });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [looking, setLooking] = useState(false);
  const { locate, busy } = useCurrentLocation();
  const enabled = isNationalAddressEnabled();
  const lastLookup = useRef('');

  const set = useCallback(<K extends keyof SaudiAddress>(k: K, v: SaudiAddress[K]) => setA((p) => ({ ...p, [k]: v })), []);
  const blur = (k: FieldKey) => setTouched((p) => ({ ...p, [k]: true }));
  const errors: AddressErrors = validateAddress(a);
  const errText = (k: FieldKey) => {
    if (!touched[k] || !errors[k]) return undefined;
    if (errors[k] === 'required') return s.required;
    const m = (s as Record<string, string>)['e_' + k];
    return m ?? s.invalid;
  };

  const useMyLocation = async () => {
    setMsg({ text: s.locating, ok: true });
    const r = await locate();
    if (!r) { setMsg({ text: s.locFail, ok: false }); return; }
    setAccuracy(r.accuracy);
    // prefill only what the geocoder returned, never wipe what the user typed with blanks
    setA((p) => ({
      ...p, lat: r.lat, lng: r.lng,
      city: r.city || p.city, district: r.district || p.district, street: r.street || p.street, postalCode: r.postalCode || p.postalCode,
    }));
    setMsg({ text: s.located, ok: true });
  };

  const runLookup = useCallback(async (cur: SaudiAddress) => {
    setLooking(true); setMsg(null);
    try {
      const r = await lookupBest(cur, lang);
      if (!r) { setMsg({ text: s.notFound, ok: false }); return; }
      setA((p) => ({
        ...p, city: r.city || p.city, district: r.district || p.district, street: r.street || p.street,
        buildingNo: r.buildingNo || p.buildingNo, postalCode: r.postalCode || p.postalCode,
        additionalNo: r.additionalNo || p.additionalNo, shortAddress: r.shortAddress || p.shortAddress,
        lat: r.lat ?? p.lat, lng: r.lng ?? p.lng,
      }));
      if (r.lat != null) setAccuracy(null);
      setMsg({ text: s.found, ok: true });
    } catch (e) {
      const code = e instanceof NationalAddressException ? e.code : 'network';
      setMsg({ text: code === 'limit' ? s.limit : code === 'not_found' ? s.notFound : s.lookFail, ok: false });
    } finally { setLooking(false); }
  }, [lang, s]);

  // auto lookup once when a valid short address is typed
  useEffect(() => {
    const sa = normalizeShortAddress(a.shortAddress);
    if (enabled && isShortAddress(sa) && lastLookup.current !== sa) { lastLookup.current = sa; runLookup(a); }
  }, [a.shortAddress, enabled, runLookup, a]);

  const canLookup = enabled && (isShortAddress(a.shortAddress) || (/^\d{4}$/.test(asciiDigits(a.buildingNo)) && /^\d{5}$/.test(asciiDigits(a.postalCode))));

  const submit = () => {
    setTouched({ fullName: true, mobile: true, city: true, district: true, street: true, buildingNo: true, additionalNo: true, postalCode: true, shortAddress: true });
    if (Object.keys(errors).length) return;
    onSubmit({
      ...a, fullName: a.fullName.trim(), mobile: normalizeMobile(a.mobile), city: a.city.trim(), district: a.district.trim(),
      street: a.street.trim(), buildingNo: asciiDigits(a.buildingNo), additionalNo: asciiDigits(a.additionalNo),
      postalCode: asciiDigits(a.postalCode), shortAddress: normalizeShortAddress(a.shortAddress), notes: a.notes.trim(),
    });
  };

  return (
    <View>
      <Button title={busy ? s.locating : s.useLoc} icon="locate" variant="dark" loading={busy} onPress={useMyLocation} style={{ marginBottom: 10 }} />
      {a.lat != null && a.lng != null && (
        <PinConfirm lat={a.lat} lng={a.lng} accuracy={accuracy} s={s} rtl={rtl}
          onMove={(la, ln) => { set('lat', la); set('lng', ln); setAccuracy(null); }}
          onClear={() => { set('lat', null); set('lng', null); setAccuracy(null); }} />
      )}
      {!!msg && <T style={{ fontSize: 13, marginBottom: 8, color: msg.ok ? colors.success : colors.red }} accessibilityLiveRegion="polite">{msg.text}</T>}

      <Field label={s.fullName} value={a.fullName} onChangeText={(v) => set('fullName', v)} onBlur={() => blur('fullName')} error={errText('fullName')}
        textContentType="name" autoComplete="name" autoCapitalize="words" returnKeyType="next" />
      <Field label={s.mobile} value={a.mobile} onChangeText={(v) => set('mobile', v)} onBlur={() => blur('mobile')} error={errText('mobile')}
        textContentType="telephoneNumber" autoComplete="tel" keyboardType="phone-pad" placeholder="05xxxxxxxx" />

      {/* National Address: short address first, it fills most other fields */}
      <Field label={s.shortAddress} value={a.shortAddress} onChangeText={(v) => set('shortAddress', v.toUpperCase())} onBlur={() => blur('shortAddress')}
        error={errText('shortAddress')} autoCapitalize="characters" autoCorrect={false} maxLength={8} placeholder="RRRD2929" />
      {enabled ? (
        <Button title={looking ? s.looking : s.lookup} icon="search" variant="ghost" loading={looking} disabled={!canLookup}
          onPress={() => runLookup(a)} style={{ marginBottom: 12 }} />
      ) : (
        <Pressable onPress={() => { Linking.openURL(FIND_SHORT_ADDRESS_URL).catch(() => {}); }} accessibilityRole="link" style={{ marginBottom: 12 }}>
          <T style={{ color: colors.red, fontFamily: font.bold, textDecorationLine: 'underline' }}>{s.findShort}</T>
        </Pressable>
      )}

      <Field label={s.city} value={a.city} onChangeText={(v) => set('city', v)} onBlur={() => blur('city')} error={errText('city')}
        textContentType="addressCity" autoComplete="postal-address-locality" />
      <Field label={s.district} value={a.district} onChangeText={(v) => set('district', v)} onBlur={() => blur('district')} error={errText('district')}
        textContentType="sublocality" autoComplete="postal-address-extended" />
      <Field label={s.street} value={a.street} onChangeText={(v) => set('street', v)} onBlur={() => blur('street')} error={errText('street')}
        textContentType="streetAddressLine1" autoComplete="street-address" />
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label={s.buildingNo} value={a.buildingNo} onChangeText={(v) => set('buildingNo', asciiDigits(v).replace(/\D/g, ''))}
            onBlur={() => blur('buildingNo')} error={errText('buildingNo')} keyboardType="number-pad" maxLength={4} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={s.additionalNo} value={a.additionalNo} onChangeText={(v) => set('additionalNo', asciiDigits(v).replace(/\D/g, ''))}
            onBlur={() => blur('additionalNo')} error={errText('additionalNo')} keyboardType="number-pad" maxLength={4} />
        </View>
      </View>
      <Field label={s.postalCode} value={a.postalCode} onChangeText={(v) => set('postalCode', asciiDigits(v).replace(/\D/g, ''))}
        onBlur={() => blur('postalCode')} error={errText('postalCode')} keyboardType="number-pad" maxLength={5}
        textContentType="postalCode" autoComplete="postal-code" />
      <Field label={s.notes} value={a.notes} onChangeText={(v) => set('notes', v)} multiline numberOfLines={2} maxLength={200}
        style={{ minHeight: 64, textAlignVertical: 'top' }} />

      <Button title={submitLabel ?? s.save} icon="checkmark" loading={submitting} onPress={submit} />
    </View>
  );
}

const st = StyleSheet.create({
  input: {
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontFamily: font.regular, color: colors.text,
  },
  pinCard: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, marginBottom: 10 },
  nudge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
});
