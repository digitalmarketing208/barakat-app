import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import RewardsScreen from '../rewards/RewardsScreen';
import { REWARDS_API } from '../rewards/session';
import { colors } from '../theme';
import { ScreenHeader, useL } from '../account/kit';

export default function RewardsRoute() {
  const nav = useNavigation();
  const L = useL();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={L('مكافآت البركات', 'Barakat Rewards')} onBack={() => nav.goBack()} />
      <RewardsScreen apiBase={REWARDS_API} />
    </View>
  );
}
