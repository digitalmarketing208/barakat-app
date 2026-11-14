import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { cachePrune } from '../offline';
import { startNetWatch } from '../net/watch';
import { installGlobalErrorLog } from './errorLog';
import { startPrefetch, stopPrefetch } from './prefetch';
import { autoSyncCatalog } from '../catalog-offline/sync';
import { initOffers, refreshOffers } from '../offers';

/** App start-up side effects: connectivity watcher, error log, cache clean-up and the Wi-Fi prefetch. Renders nothing. */
export function Boot() {
  const { lang } = useI18n();
  useEffect(() => { installGlobalErrorLog(); startNetWatch(); initOffers(); void refreshOffers(); }, []);
  useEffect(() => {
    // Wait until the first screen has painted and settled so start-up stays fast.
    const id = setTimeout(() => startPrefetch(lang), 3000);
    // Offline catalog (only when the user turned it on): throttled to once per 24h, Wi-Fi only.
    const id2 = setTimeout(() => autoSyncCatalog(lang === 'ar' ? 'AR' : 'EN'), 20000);
    return () => { clearTimeout(id); clearTimeout(id2); stopPrefetch(); };
  }, [lang]);
  useEffect(() => {
    const id = setTimeout(() => { cachePrune(); }, 15000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
