import { Linking, Platform } from 'react-native';
import type { Branch } from './branches';
import { CONTACT } from './config';

export const callBranch = (b: Branch) => Linking.openURL(`tel:${b.tel || CONTACT.tollFree}`);
export const directions = (b: Branch) =>
  Linking.openURL(Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${b.lat},${b.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`);
export const whatsapp = (text: string) =>
  Linking.openURL(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`);
