// Biometric confirmation and the optional brightness boost. Both degrade silently when unavailable.
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BioResult = 'ok' | 'cancelled' | 'unavailable';

/** True when the device has biometrics enrolled (Face ID, fingerprint). Otherwise the screen shows a plain confirm button. */
export async function biometricsReady(): Promise<boolean> {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}

export async function confirmWithBiometrics(promptMessage: string, cancelLabel: string): Promise<BioResult> {
  if (!(await biometricsReady())) return 'unavailable';
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel });
    if (r.success) return 'ok';
    return r.error === 'not_enrolled' || r.error === 'not_available' || r.error === 'passcode_not_set' ? 'unavailable' : 'cancelled';
  } catch { return 'unavailable'; }
}

type BrightnessModule = {
  getBrightnessAsync: () => Promise<number>;
  setBrightnessAsync: (v: number) => Promise<void>;
  restoreSystemBrightnessAsync?: () => Promise<void>;
};
// expo-brightness is optional and not installed yet: the require sits in try/catch so Metro treats it as optional.
function brightnessModule(): BrightnessModule | null {
  try { return require('expo-brightness') as BrightnessModule; } catch { return null; }
}

/** Raises the screen to full brightness while the QR shows; call the returned function to restore. No-op without the module. */
export async function boostBrightness(): Promise<() => void> {
  const B = brightnessModule();
  if (!B) return () => {};
  let before: number | null = null;
  try { before = await B.getBrightnessAsync(); await B.setBrightnessAsync(1); } catch { return () => {}; }
  return () => {
    if (Platform.OS === 'android' && B.restoreSystemBrightnessAsync) B.restoreSystemBrightnessAsync().catch(() => {});
    else if (before !== null) B.setBrightnessAsync(before).catch(() => {});
  };
}
