import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow } from './theme';
import { tint } from './product/tint';
import { useI18n } from './i18n';
import { Button, T } from './ui';
import { Product, fetchProduct } from './shopify';

export type Lens = { handle: string; price: number; ar: string; en: string; descAr: string; descEn: string };
export const LENSES: Lens[] = [
  { handle: 'lens-addon-uv', price: 249, ar: 'حماية من الأشعة فوق البنفسجية', en: 'UV protection', descAr: 'عدسات تحجب الأشعة فوق البنفسجية الضارة', descEn: 'Lenses that block harmful UV rays' },
  { handle: 'lens-addon-blue-cut', price: 500, ar: 'بلو كت', en: 'Blue Cut', descAr: 'حماية من الضوء الأزرق للشاشات', descEn: 'Protection from screen blue light' },
  { handle: 'lens-addon-gamers', price: 349, ar: 'عدسات جيمرز', en: 'Gamers', descAr: 'راحة للعين خلال ساعات اللعب الطويلة', descEn: 'Eye comfort for long gaming sessions' },
  { handle: 'lens-addon-night-driving', price: 599, ar: 'فلتر القيادة الليلية', en: 'Night driving filter', descAr: 'رؤية أوضح وتقليل الوهج أثناء القيادة ليلاً', descEn: 'Clearer vision and less glare when driving at night' },
];

export type LensState = { lens: Lens | null; rx: 'yes' | 'no' | null; rxUri: string | null };
export const EMPTY_LENS: LensState = { lens: null, rx: null, rxUri: null };
export type Addon = { product: Product; variantId: string; price: number };
export type Addons = Record<string, Addon | null>;

const cache = new Map<string, Promise<Addon | null>>();
const loadAddon = (handle: string): Promise<Addon | null> => {
  let pr = cache.get(handle);
  if (!pr) {
    pr = fetchProduct(handle).then((product) => {
      const v = product?.variants.find((x) => x.availableForSale) ?? product?.variants[0];
      return product && v ? { product, variantId: v.id, price: Number(v.price.amount) } : null;
    }).catch(() => null);
    // do not keep failures cached, so the next mount retries
    pr = pr.then((a) => { if (!a) cache.delete(handle); return a; });
    cache.set(handle, pr);
  }
  return pr;
};

/** null while loading; afterwards a map where a failed add-on is null. */
export function useLensAddons(enabled = true): Addons | null {
  const [addons, setAddons] = useState<Addons | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all(LENSES.map((l) => loadAddon(l.handle))).then((r) => {
      if (alive) setAddons(Object.fromEntries(LENSES.map((l, i) => [l.handle, r[i]])));
    });
    return () => { alive = false; };
  }, [enabled]);
  return addons;
}

export const lensName = (l: Lens, lang: string) => (lang === 'ar' ? l.ar : l.en);

/** Message when the selection is incomplete, otherwise null. */
export function lensError(state: LensState, lang: string): string | null {
  const ar = lang === 'ar';
  if (state.rx === 'yes' && !state.lens) return ar ? 'اختر نوع العدسات للمتابعة' : 'Please choose a lens type to continue';
  if (state.lens && !state.rx) return ar ? 'هل تريد تفصيل عدسات طبية؟ اختر نعم أو لا' : 'Please answer whether you want prescription lenses';
  return null;
}
/** Shows the incomplete-selection alert; returns true when the selection is incomplete. */
export function lensAlert(state: LensState, lang: string): boolean {
  const msg = lensError(state, lang);
  if (msg) Alert.alert(lang === 'ar' ? 'العدسات' : 'Lenses', msg);
  return !!msg;
}

type Props = { addons: Addons | null; value: LensState; onChange: (v: LensState) => void; productHandle?: string };

export function LensPicker({ addons, value, onChange, productHandle }: Props) {
  const { lang, row, rtl } = useI18n();
  const ar = lang === 'ar';
  const failed = !!addons && LENSES.every((l) => !addons[l.handle]);

  const pickRx = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!r.canceled && r.assets[0]) onChange({ ...value, rxUri: r.assets[0].uri });
    } catch { Alert.alert(ar ? 'تعذّر فتح الصور' : 'Could not open photos'); }
  };
  const openSite = () => {
    if (!productHandle) return;
    WebBrowser.openBrowserAsync(`https://barakatoptical.com.sa/products/${productHandle}`).catch(() => {});
  };

  return (
    <View style={[s.box, shadow]}>
      <T style={{ fontFamily: font.black, fontSize: 16 }}>{ar ? 'هل تريد تفصيل عدسات طبية؟' : 'Do you want prescription lenses?'}</T>
      <View style={{ flexDirection: row, gap: 10 }}>
        {(['yes', 'no'] as const).map((k) => {
          const on = value.rx === k;
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }}
              onPress={() => onChange(k === 'no' ? { ...value, rx: 'no', rxUri: null } : { ...value, rx: 'yes' })}
              style={[s.yn, on && { backgroundColor: colors.red, borderColor: colors.red }]}>
              <Text style={{ fontFamily: font.bold, color: on ? colors.card : colors.text }}>{k === 'yes' ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')}</Text>
            </Pressable>
          );
        })}
      </View>

      {value.rx === 'yes' && (
        <View style={{ gap: 8 }}>
          <Pressable onPress={pickRx} style={[s.rxBtn, { flexDirection: row }]} accessibilityRole="button">
            {value.rxUri ? <Image source={value.rxUri} style={s.rxImg} contentFit="cover" /> : <Ionicons name="camera-outline" size={22} color={colors.red} />}
            <T style={{ flex: 1, fontFamily: font.medium, fontSize: 13 }}>
              {value.rxUri ? (ar ? 'تم اختيار صورة الوصفة (اضغط للتغيير)' : 'Prescription photo selected (tap to change)') : (ar ? 'أرفق صورة الوصفة الطبية' : 'Attach a photo of your prescription')}
            </T>
          </Pressable>
          <T style={{ color: colors.muted, fontSize: 12 }}>
            {ar ? 'ستُرسل الصورة لفريقنا عبر واتساب بعد الإضافة إلى السلة' : 'You will send the photo to our team via WhatsApp after adding to cart'}
          </T>
        </View>
      )}
      {value.rx === 'no' && <T style={{ color: colors.muted, fontSize: 12 }}>{ar ? 'عدسات عادية بدون وصفة' : 'Plain lenses, no prescription'}</T>}

      <T style={{ fontFamily: font.bold, marginTop: 4 }}>{ar ? 'اختر نوع العدسات' : 'Choose your lens type'}</T>
      {!addons && <ActivityIndicator color={colors.red} />}
      {failed && (
        <View style={{ gap: 8 }}>
          <T style={{ color: colors.muted, fontSize: 12 }}>{ar ? 'تعذّر تحميل العدسات. يمكنك إكمال الطلب من الموقع.' : 'Could not load lenses. You can complete this order on the website.'}</T>
          {productHandle ? <Button variant="ghost" icon="globe-outline" title={ar ? 'افتح في الموقع' : 'Open on website'} onPress={openSite} /> : null}
        </View>
      )}
      {addons && !failed && LENSES.map((l) => {
        const a = addons[l.handle];
        const on = value.lens?.handle === l.handle;
        const price = a?.price ?? l.price;
        return (
          <Pressable key={l.handle} disabled={!a} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !a }}
            onPress={() => onChange({ ...value, lens: on ? null : l })}
            style={[s.lens, { flexDirection: row, opacity: a ? 1 : 0.4 }, on && { borderColor: colors.red, backgroundColor: tint.redSoft }]}>
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.red : colors.muted} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: font.bold, fontSize: 14 }}>{lensName(l, lang)}</T>
              <T style={{ color: colors.muted, fontSize: 12 }}>{ar ? l.descAr : l.descEn}</T>
            </View>
            <Text style={{ fontFamily: font.black, color: colors.red, writingDirection: rtl ? 'rtl' : 'ltr' }}>+{price} {ar ? 'ر.س' : 'SAR'}</Text>
          </Pressable>
        );
      })}
      <T style={{ color: colors.muted, fontSize: 12 }}>{ar ? 'يتم تعديل السعر تلقائياً حسب اختيارك' : 'The price adjusts automatically with your choice'}</T>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 10, marginTop: 8 },
  yn: { flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  rxBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.red, borderRadius: radius.sm, padding: 10, alignItems: 'center', gap: 10 },
  rxImg: { width: 44, height: 44, borderRadius: 8 },
  lens: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, padding: 12, alignItems: 'center', gap: 10 },
});
