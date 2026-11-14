import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius } from '../theme';
import { T } from '../ui';
import { useDir } from './dir';
import { useD } from './strings';
import { alpha } from './tint';

const H = Dimensions.get('window').height;
const OPEN = { duration: 300, easing: Easing.out(Easing.cubic) };
const SHUT = { duration: 220, easing: Easing.in(Easing.cubic) };

/** Bottom sheet: slides up over a dimmed backdrop, closes by backdrop tap, close button, back key or dragging the handle down. */
export function Sheet({ visible, onClose, title, action, children, footer }: {
  visible: boolean; onClose: () => void; title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { row } = useDir();
  const d = useD();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(H);

  // Mount as soon as it is asked to open; unmount only after the closing slide has finished.
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) { y.set(H); y.set(withTiming(0, OPEN)); return; }
    y.set(withTiming(H, SHUT));
    const id = setTimeout(() => setMounted(false), SHUT.duration + 30);
    return () => clearTimeout(id);
  }, [visible, y]);

  // Dragging the header down follows the finger; a long or fast drag closes the sheet.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { y.set(Math.max(0, g.dy)); },
    onPanResponderRelease: (_e, g) => { if (g.dy > 110 || g.vy > 1.1) onClose(); else y.set(withTiming(0, OPEN)); },
    onPanResponderTerminate: () => { y.set(withTiming(0, OPEN)); },
  }), [y, onClose]);

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const shade = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, H * 0.6], [1, 0], 'clamp') }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.dark, 0.55) }, shade]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={d('close')} />
        </Animated.View>
        <Animated.View style={[s.sheet, { maxHeight: H * 0.86 }, sheet]} accessibilityViewIsModal>
          <View {...pan.panHandlers}>
            <View style={s.grab} />
            <View style={{ flexDirection: row, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
              <T style={{ flex: 1, fontFamily: font.black, fontSize: 19 }} accessibilityRole="header">{title}</T>
              {action && (
                <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
                  <T style={{ fontFamily: font.bold, color: colors.red, fontSize: 14 }}>{action.label}</T>
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={10} style={s.x} accessibilityRole="button" accessibilityLabel={d('close')}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <View style={[s.foot, { paddingBottom: insets.bottom + 12 }, !footer && { paddingTop: 0, borderTopWidth: 0 }]}>{footer}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: 10, marginBottom: 12 },
  x: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  foot: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
});
