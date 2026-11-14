import { useEffect, useMemo, useReducer, useState } from 'react';
import { useI18n } from '../i18n';
import { isOffline, subscribeNet } from '../net/status';
import { trustedNow } from './clock';
import { getManifest, nextBoundary, activeOffers } from './engine';
import { checkoutNote, countdown, pricesAsOf } from './format';
import { initOffers, offersMeta, persistClock, refreshOffers, subscribeOffers } from './manifest';
import type { Offer, OfferKind } from './types';

/**
 * Live offers. Re-renders every 30 s and at the exact next start/end moment (setTimeout to the nearest boundary),
 * so an offer disappears the second it ends, even with no internet. Refreshes from Shopify on mount and on reconnect.
 */
export function useOffers(kinds?: OfferKind[]) {
  const { lang } = useI18n();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [offline, setOffline] = useState(isOffline());
  useEffect(() => { initOffers(); void refreshOffers(); return subscribeOffers(bump); }, []);
  useEffect(() => subscribeNet(() => { const o = isOffline(); setOffline(o); if (!o) void refreshOffers(); }), []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (t) clearTimeout(t);
      const nb = nextBoundary(trustedNow());
      // setTimeout max is ~24.8 days; cap and re-arm via the 30 s ticker anyway.
      if (nb !== null) t = setTimeout(() => { bump(); arm(); }, Math.min(Math.max(nb - trustedNow() + 50, 50), 2 ** 31 - 1));
    };
    arm();
    let n = 0;
    const id = setInterval(() => { bump(); arm(); if (++n % 2 === 0) persistClock(); }, 30000);
    return () => { clearInterval(id); if (t) clearTimeout(t); };
  }, []);
  const now = trustedNow();
  const m = getManifest();
  const { fetchedAt } = offersMeta();
  return useMemo(() => ({
    now, lang, offline, manifest: m,
    offers: activeOffers(now, kinds, m),
    asOfNote: offline ? pricesAsOf(fetchedAt, lang) : null,
    checkoutNote: checkoutNote(lang),
    /** 'Ends in 2d 4h' for one offer. */
    endsIn: (o: Offer) => countdown(Date.parse(o.endsAt) - now, lang),
    title: (o: Offer) => (lang === 'ar' ? o.titleAr : o.titleEn),
    badge: (o: Offer) => (lang === 'ar' ? o.badgeAr : o.badgeEn),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [now, lang, offline, m, fetchedAt]);
}
