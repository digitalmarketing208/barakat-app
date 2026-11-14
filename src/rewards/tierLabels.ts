// ONE place for the member tier names shown in the app (card, progress ladder, perks, history).
// The owner will choose the final names: edit only this map. Keys are the API tier codes and never change.
import type { Lang, TierName } from './rewardsApi';

export const TIER_LABELS: Record<TierName, Record<Lang, string>> = {
  member: { ar: 'عضو', en: 'Member' },
  silver: { ar: 'فضي', en: 'Silver' },
  gold: { ar: 'ذهبي', en: 'Gold' },
};

export const tierLabel = (tier: string, lang: Lang): string => TIER_LABELS[tier as TierName]?.[lang] ?? tier;
