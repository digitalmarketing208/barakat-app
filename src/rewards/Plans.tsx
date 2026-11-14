// Barakat Plus / Max plans. Used inside the Rewards flow (with the member's real plan and benefit counters
// from the API) and by the standalone Plans screen. Prices are not part of the Rewards API: the figures
// below are indicative only and are always labelled as such.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { alpha } from '../account/kit';
import { Member, PublicConfig } from './rewardsApi';
import { Small } from './parts';
import { PlanCards } from './PlanCards';
import { strings } from './strings';

export { INDICATIVE_PRICE_SAR } from './PlanCards';

export function PlansPanel({ member, cfg, footer }: { member: Member | null; cfg: PublicConfig; footer?: React.ReactNode }) {
  const { lang, row } = useI18n();
  const t = strings[lang];
  const active = member?.plan ?? null;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <T style={{ fontFamily: font.black, fontSize: 20, color: colors.maroon }}>{t.plansTitle}</T>
        <Small>{t.plansSub}</Small>
      </View>

      {member && !active ? (
        <View style={[s.none, { flexDirection: row }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.maroon} />
          <T style={{ flex: 1, fontSize: 13, color: colors.maroon }}>{t.planNone}</T>
        </View>
      ) : null}

      <PlanCards member={member} cfg={cfg} />

      <View style={[s.none, { flexDirection: row, backgroundColor: alpha(colors.amber, 0.18) }]}>
        <Ionicons name="pricetag-outline" size={18} color={colors.maroon} />
        <T style={{ flex: 1, fontSize: 12, color: colors.maroon }}>{t.planIndicativeNote}</T>
      </View>
      {footer}
    </View>
  );
}

const s = StyleSheet.create({
  none: { backgroundColor: colors.beige, borderRadius: radius.md, padding: 12, gap: 8, alignItems: 'center' },
});
