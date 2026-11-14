import { I18nManager } from 'react-native';
import { useI18n } from '../i18n';

// The app picks its language itself. React Native mirrors rows and left/right on its own when the
// device runs right-to-left, so we only flip by hand when the app direction differs from the native one.
export function useDir() {
  const { rtl, lang } = useI18n();
  const flip = rtl !== I18nManager.isRTL;
  return {
    lang, rtl, flip,
    row: (flip ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
    // Absolute offsets on the reading-start / reading-end side.
    start: (n: number) => (flip ? { right: n } : { left: n }),
    end: (n: number) => (flip ? { left: n } : { right: n }),
    alignStart: (flip ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start',
    back: (rtl ? 'chevron-forward' : 'chevron-back') as 'chevron-forward' | 'chevron-back',
    fwd: (rtl ? 'chevron-back' : 'chevron-forward') as 'chevron-forward' | 'chevron-back',
    arrow: (rtl ? 'arrow-back' : 'arrow-forward') as 'arrow-back' | 'arrow-forward',
  };
}
