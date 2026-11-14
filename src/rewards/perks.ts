// Member perks per tier. EVERY perk below is PROPOSED: not yet approved by management and not yet backed by the
// POS or the Rewards server. No prices or quantities are promised here. The owner confirms the list, then each
// perk's `status` changes to 'live' (or the perk is removed). `from` is the lowest tier that gets it.
import type { Lang, TierName } from './rewardsApi';

export interface Perk {
  id: string;
  from: TierName;
  status: 'proposed' | 'live';
  icon: string; // Ionicons name
  text: Record<Lang, string>;
}

export const PERKS: Perk[] = [
  { id: 'birthday', from: 'member', status: 'proposed', icon: 'gift-outline', text: { ar: 'هدية في شهر ميلادك', en: 'A gift in your birthday month' } },
  { id: 'adjust', from: 'member', status: 'proposed', icon: 'construct-outline', text: { ar: 'تعديل وصيانة مجانية للنظارة', en: 'Free adjustment and repair' } },
  { id: 'eyetest', from: 'silver', status: 'proposed', icon: 'calendar-outline', text: { ar: 'أولوية في حجز فحص النظر', en: 'Priority eye-test booking' } },
  { id: 'queue', from: 'silver', status: 'proposed', icon: 'flash-outline', text: { ar: 'مسار سريع بلا انتظار في الفرع', en: 'Skip-the-queue lane in branch' } },
  { id: 'early', from: 'gold', status: 'proposed', icon: 'sparkles-outline', text: { ar: 'وصول مبكر للقطع الجديدة', en: 'Early access to new arrivals' } },
  { id: 'concierge', from: 'gold', status: 'proposed', icon: 'logo-whatsapp', text: { ar: 'مسؤول واتساب باسمه يخدمك', en: 'A named WhatsApp contact for you' } },
];

const RANK: Record<TierName, number> = { member: 0, silver: 1, gold: 2 };
export const perkUnlocked = (p: Perk, tier: TierName): boolean => RANK[tier] >= RANK[p.from];
/** Perks for the tier, unlocked first (in list order), then the ones the next tiers add. */
export const perksFor = (tier: TierName): { perk: Perk; unlocked: boolean }[] =>
  PERKS.map((perk) => ({ perk, unlocked: perkUnlocked(perk, tier) })).sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
