import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useI18n } from '../i18n';

export type LocationPrefill = { city: string; district: string; street: string; postalCode: string; lat: number; lng: number; accuracy: number | null };
export type LocationStatus = 'idle' | 'asking' | 'locating' | 'done' | 'denied' | 'blocked' | 'unavailable' | 'error';

const L = {
  ar: {
    title: 'استخدام موقعك الدقيق', body: 'نستخدم موقعك مرة واحدة فقط لتعبئة عنوان التوصيل وتحديد موقعك على الخريطة. لا نتتبع موقعك.',
    ok: 'متابعة', cancel: 'إلغاء', settings: 'فتح الإعدادات',
    blockedTitle: 'إذن الموقع مغلق', blockedBody: 'فعّل إذن الموقع للتطبيق من الإعدادات لاستخدام هذه الميزة.',
  },
  en: {
    title: 'Use your exact location', body: 'We use your location once to fill in your delivery address and place the pin. We never track you.',
    ok: 'Continue', cancel: 'Cancel', settings: 'Open settings',
    blockedTitle: 'Location permission is off', blockedBody: 'Enable location for the app in Settings to use this feature.',
  },
};

const ask = (s: typeof L.ar) => new Promise<boolean>((res) =>
  Alert.alert(s.title, s.body, [
    { text: s.cancel, style: 'cancel', onPress: () => res(false) },
    { text: s.ok, onPress: () => res(true) },
  ], { cancelable: true, onDismiss: () => res(false) }));

/** Permission flow with AR/EN rationale, high-accuracy fix and reverse geocode prefill. */
export function useCurrentLocation() {
  const { lang } = useI18n();
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [result, setResult] = useState<LocationPrefill | null>(null);

  const locate = useCallback(async (): Promise<LocationPrefill | null> => {
    const s = L[lang];
    try {
      setStatus('asking');
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          setStatus('blocked');
          Alert.alert(s.blockedTitle, s.blockedBody, [
            { text: s.cancel, style: 'cancel' }, { text: s.settings, onPress: () => { Linking.openSettings().catch(() => {}); } },
          ]);
          return null;
        }
        if (!(await ask(s))) { setStatus('idle'); return null; }
        perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) { setStatus(perm.canAskAgain ? 'denied' : 'blocked'); return null; }
      }
      if (!(await Location.hasServicesEnabledAsync())) { setStatus('unavailable'); return null; }
      setStatus('locating');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      let city = '', district = '', street = '', postalCode = '';
      try {
        const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (g) {
          city = g.city ?? g.subregion ?? g.region ?? '';
          district = g.district ?? '';
          street = g.street ?? (g.name && g.name !== g.streetNumber ? g.name : '') ?? '';
          postalCode = g.postalCode ?? '';
        }
      } catch { /* geocoder offline: coordinates alone are still useful */ }
      const out = { city, district, street, postalCode, lat, lng, accuracy: accuracy ?? null };
      setResult(out); setStatus('done');
      return out;
    } catch { setStatus('error'); return null; }
  }, [lang]);

  return { locate, status, result, busy: status === 'asking' || status === 'locating' };
}
