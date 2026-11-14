import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { Chip, Price, T } from '../ui';
import { BRANDS } from '../siteData';
import { CATEGORIES } from '../catalog';
import { sized } from '../shopify';
import { Suggest, predictiveSearch } from './api';
import { addRecentSearch, clearRecentSearches, removeRecentSearch, useDiscoveryStore } from './storage';
import { Enter, PressableScale, Shimmer, haptic } from './motion';
import { useDir } from './dir';
import { useD } from './strings';
import { alpha } from './tint';

export type SearchActions = {
  onSubmit: (q: string) => void;
  onProduct: (handle: string) => void;
  onCollection: (handle: string, title: string) => void;
  onCategory: (id: string) => void;
};

const POPULAR = BRANDS.slice(0, 10);

function Row({ icon, label, onPress, trailing, onTrailing, trailingLabel }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void;
  trailing?: keyof typeof Ionicons.glyphMap; onTrailing?: () => void; trailingLabel?: string;
}) {
  const { row } = useDir();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: colors.line }}
      style={{ flexDirection: row, alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20 }}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <T numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>{label}</T>
      {trailing && (
        <Pressable onPress={onTrailing ?? onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={trailingLabel}>
          <Ionicons name={trailing} size={18} color={colors.muted} />
        </Pressable>
      )}
    </Pressable>
  );
}

const Label = ({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) => {
  const { row } = useDir();
  return (
    <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 22, marginBottom: 8 }}>
      <T style={{ fontFamily: font.black, fontSize: 15 }} accessibilityRole="header">{children}</T>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><Text style={{ fontFamily: font.bold, color: colors.red, fontSize: 13 }}>{action}</Text></Pressable>
      )}
    </View>
  );
};

/** Full-screen search: recent searches, popular brands and live Shopify suggestions while typing. */
export function SearchOverlay({ visible, initial = '', onClose, onSubmit, onProduct, onCollection, onCategory }: SearchActions & {
  visible: boolean; initial?: string; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, lang, align } = useI18n();
  const { row, rtl, back } = useDir();
  const d = useD();
  const store = useDiscoveryStore();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(initial);
  const [got, setGot] = useState<{ key: string; data: Suggest } | null>(null);
  const q = text.trim();
  const key = `${lang}|${q}`;

  // Each time it opens, start from the text the screen behind is showing.
  const [was, setWas] = useState(visible);
  if (was !== visible) { setWas(visible); if (visible) { setText(initial); setGot(null); } }

  // Debounced, abortable suggestions: only the answer for the latest keystroke is shown.
  useEffect(() => {
    if (!visible || q.length < 2) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      predictiveSearch(q, lang === 'ar' ? 'AR' : 'EN', ctl.signal)
        .then((r) => { if (!ctl.signal.aborted) setGot({ key, data: r }); })
        .catch(() => { if (!ctl.signal.aborted) setGot({ key, data: { queries: [], collections: [], products: [] } }); });
    }, 220);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, lang, visible, key]);
  // The previous answer stays on screen while the next one loads, so the list does not flash between letters.
  const res = q.length >= 2 ? got?.data ?? null : null;
  const busy = q.length >= 2 && got?.key !== key;

  const submit = (s: string) => {
    const v = s.trim();
    if (!v) return;
    haptic.tap(); addRecentSearch(v); onSubmit(v);
  };
  const openProduct = (h: string) => { haptic.tap(); if (q.length > 1) addRecentSearch(q); onProduct(h); };
  const empty = !!res && !res.queries.length && !res.collections.length && !res.products.length;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
      onShow={() => setTimeout(() => input.current?.focus(), 60)}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={[s.head, { paddingTop: insets.top + 10, flexDirection: row }]}>
          <Pressable onPress={onClose} hitSlop={10} style={s.back} accessibilityRole="button" accessibilityLabel={d('cancel')}>
            <Ionicons name={back} size={22} color={colors.card} />
          </Pressable>
          <View style={[s.field, { flexDirection: row }]}>
            <Ionicons name="search" size={19} color={colors.muted} />
            <TextInput ref={input} value={text} onChangeText={setText} onSubmitEditing={() => submit(text)} returnKeyType="search"
              placeholder={t('searchPh')} placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none"
              accessibilityLabel={d('search')} selectionColor={colors.red}
              style={{ flex: 1, fontFamily: font.regular, fontSize: 15, textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr', color: colors.text, paddingVertical: 0 }} />
            {text.length > 0 && (
              <Pressable onPress={() => { setText(''); input.current?.focus(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={d('clear')}>
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {q.length < 2 ? (
            <>
              {store.searches.length > 0 && (
                <Enter>
                  <Label action={d('clear')} onAction={() => { haptic.light(); clearRecentSearches(); }}>{d('searchRecent')}</Label>
                  {store.searches.map((x) => (
                    <Row key={x} icon="time-outline" label={x} onPress={() => submit(x)} trailing="close" trailingLabel={d('remove')} onTrailing={() => removeRecentSearch(x)} />
                  ))}
                </Enter>
              )}
              <Enter delay={60}>
                <Label>{d('popularBrands')}</Label>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 }}>
                  {POPULAR.map((b) => <Chip key={b.handle} label={b.name} onPress={() => onCollection(b.handle, b.name)} />)}
                </View>
              </Enter>
              <Enter delay={120}>
                <Label>{d('browse')}</Label>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 }}>
                  {CATEGORIES.map((c) => <Chip key={c.id} icon={c.icon} label={t(c.label)} onPress={() => onCategory(c.id)} />)}
                </View>
              </Enter>
            </>
          ) : (
            <>
              <PressableScale to={0.98} onPress={() => submit(q)} accessibilityRole="button" style={[s.all, { flexDirection: row }]}>
                <Ionicons name="search" size={18} color={colors.red} />
                <T numberOfLines={1} style={{ flex: 1, fontFamily: font.bold, color: colors.red, fontSize: 14.5 }}>{d('seeAll', { q })}</T>
                <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.red} />
              </PressableScale>

              {busy && !res && [0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: row, alignItems: 'center', gap: 12, paddingHorizontal: 20, marginTop: 14 }}>
                  <Shimmer style={{ width: 56, height: 56, borderRadius: radius.sm }} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Shimmer style={{ height: 12, borderRadius: 6 }} />
                    <Shimmer style={{ height: 12, width: '45%', borderRadius: 6 }} />
                  </View>
                </View>
              ))}

              {!!res && res.queries.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {res.queries.map((x) => (
                    <Row key={x} icon="search-outline" label={x} onPress={() => submit(x)}
                      trailing="arrow-up-outline" trailingLabel={x} onTrailing={() => setText(x)} />
                  ))}
                </View>
              )}

              {!!res && res.collections.length > 0 && (
                <>
                  <Label>{d('collections')}</Label>
                  {res.collections.map((c) => <Row key={c.handle} icon="albums-outline" label={c.title} onPress={() => { haptic.tap(); onCollection(c.handle, c.title); }} />)}
                </>
              )}

              {!!res && res.products.length > 0 && (
                <>
                  <Label>{d('products')}</Label>
                  {res.products.map((p) => (
                    <PressableScale key={p.id} to={0.98} onPress={() => openProduct(p.handle)} accessibilityRole="button" accessibilityLabel={p.title}
                      style={[s.prod, shadow, { flexDirection: row }]}>
                      <View style={s.thumb}>
                        {!!p.featuredImage?.url && <Image source={sized(p.featuredImage.url, 160)} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={150} />}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 13.5 }}>{p.title}</T>
                        <Price p={p} size={14} />
                      </View>
                    </PressableScale>
                  ))}
                </>
              )}

              {empty && !busy && (
                <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
                  <View style={s.emptyIcon}><Ionicons name="search-outline" size={30} color={colors.muted} /></View>
                  <T style={{ color: colors.muted, textAlign: 'center', fontSize: 13.5 }}>{d('noSuggest')}</T>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** The tappable search pill shown in the top bar; opens the overlay instead of typing in place. */
export function SearchField({ value, onPress, onClear }: { value?: string; onPress: () => void; onClear?: () => void }) {
  const { t } = useI18n();
  const { row } = useDir();
  const d = useD();
  return (
    <PressableScale to={0.98} onPress={() => { haptic.tap(); onPress(); }} accessibilityRole="search" accessibilityLabel={value || t('searchPh')}
      style={[s.pill, { flexDirection: row }]}>
      <Ionicons name="search" size={20} color={colors.muted} />
      <T numberOfLines={1} style={{ flex: 1, fontSize: 15, color: value ? colors.text : colors.muted }}>{value || t('searchPh')}</T>
      {!!value && onClear && (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={d('clear')}>
          <Ionicons name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  head: { backgroundColor: colors.maroon, paddingHorizontal: 14, paddingBottom: 14, alignItems: 'center', gap: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  all: { alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, paddingHorizontal: 16, height: 48, borderRadius: radius.md, backgroundColor: alpha(colors.red, 0.07) },
  prod: { alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 10, padding: 8, borderRadius: radius.md, backgroundColor: colors.card },
  thumb: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.card, overflow: 'hidden' },
  pill: { marginTop: 14, backgroundColor: colors.card, borderRadius: radius.pill, height: 48, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: alpha(colors.muted, 0.1), alignItems: 'center', justifyContent: 'center' },
});
