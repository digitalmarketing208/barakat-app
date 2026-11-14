import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { SORTS } from '../catalog';
import { Sheet } from './Sheet';
import { useDir } from './dir';
import { useD } from './strings';
import { haptic } from './motion';
import { alpha } from './tint';

export function SortSheet({ visible, value, onPick, onClose }: { visible: boolean; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const { row } = useDir();
  const d = useD();
  return (
    <Sheet visible={visible} onClose={onClose} title={d('sortTitle')}>
      <View accessibilityRole="radiogroup" style={{ gap: 6, paddingBottom: 8 }}>
        {SORTS.map((x) => {
          const on = x.id === value;
          return (
            <Pressable key={x.id} onPress={() => { haptic.tap(); onPick(x.id); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ flexDirection: row, alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: on ? alpha(colors.red, 0.08) : colors.card }}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.red : colors.muted} />
              <T style={{ flex: 1, fontFamily: on ? font.bold : font.medium, fontSize: 15, color: on ? colors.red : colors.text }}>{t(x.label)}</T>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
