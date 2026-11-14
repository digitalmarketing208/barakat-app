import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { useI18n } from '../i18n';
import { useNet } from './useNet';
import { retryNow } from './watch';

/**
 * Wraps the app. Shows a slim strip under the status bar while offline / showing saved data, and a short
 * "back online" confirmation. The strip takes over the top safe-area inset, so screens below need no changes.
 */
export function NetFrame({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { t, row } = useI18n();
  const { offline, savedData } = useNet();
  const [back, setBack] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // "back online" flash: shown when connectivity returns after an offline spell, cleared when it drops again
  const [prevOffline, setPrevOffline] = useState(offline);
  if (prevOffline !== offline) {
    setPrevOffline(offline);
    setBack(!offline);
  }
  useEffect(() => {
    if (!back) return;
    const id = setTimeout(() => setBack(false), 2500);
    return () => clearTimeout(id);
  }, [back]);

  const mode = offline ? 'offline' : savedData ? 'saved' : back ? 'back' : null;
  const retry = async () => {
    if (retrying || mode === 'back') return;
    setRetrying(true);
    try { await retryNow(); } finally { setTimeout(() => setRetrying(false), 800); }
  };
  const label = retrying ? t('netRetrying') : mode === 'offline' ? t('netOffline') : mode === 'saved' ? t('netSaved') : t('netBack');
  const childInsets = React.useMemo(() => (mode ? { ...insets, top: 0 } : insets), [mode, insets]);

  return (
    <View style={{ flex: 1 }}>
      {mode && (
        <Pressable onPress={retry} accessibilityRole="button" accessibilityLiveRegion="polite" accessibilityLabel={label}
          style={[s.bar, { paddingTop: insets.top + 5, backgroundColor: mode === 'back' ? colors.success : colors.dark }]}>
          <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name={mode === 'back' ? 'checkmark-circle' : mode === 'saved' ? 'refresh' : 'cloud-offline'} size={15} color="#fff" />
            <Text style={s.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
          </View>
        </Pressable>
      )}
      <SafeAreaInsetsContext.Provider value={childInsets}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { paddingBottom: 6, paddingHorizontal: 16 },
  text: { color: '#fff', fontFamily: font.medium, fontSize: 12.5, flexShrink: 1 },
});
