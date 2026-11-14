import React from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useI18n } from '../i18n';
import { colors, radius } from '../theme';
import { T } from '../ui';
import type { RootParams } from '../types';
import { ScreenHeader, useL } from '../account/kit';
import { PlansPanel } from '../rewards/Plans';
import { Btn } from '../rewards/parts';
import { useMemberSnapshot } from '../rewards/session';
import { strings } from '../rewards/strings';

// Barakat Plus / Max. Benefits come from the Rewards API (v1.1) and, when the customer is signed in to
// Rewards, the card shows their real plan and remaining uses. Prices are indicative only.
export default function PlansScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { lang, row } = useI18n();
  const L = useL();
  const t = strings[lang];
  const { member, cfg } = useMemberSnapshot();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={L('باقات البركات', 'Barakat plans')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <PlansPanel member={member} cfg={cfg} footer={member ? null : (
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line }}>
            <View style={{ flexDirection: row, gap: 8, alignItems: 'center' }}>
              <Ionicons name="gift-outline" size={20} color={colors.red} />
              <T style={{ flex: 1, fontSize: 13 }}>{t.planSignIn}</T>
            </View>
            <Btn kind="line" label={t.planOpenRewards} onPress={() => nav.navigate('Rewards')} />
          </View>
        )} />
      </ScrollView>
    </View>
  );
}
