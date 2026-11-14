import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { Product, sized } from '../shopify';
import { Chip, Price, ProductCard, ProductCardSkeleton, T } from '../ui';
import { CATEGORIES } from '../catalog';
import { fetchByHandles } from './api';
import { LastBrowse, useDiscoveryStore } from './storage';
import { Enter, PressableScale, Shimmer, haptic } from './motion';
import { useDir } from './dir';
import { useD } from './strings';

/** Card data for the user's recently viewed handles; keeps the previous list on screen while refreshing. */
function useRecentProducts() {
  const { recent } = useStore();
  const { lang } = useI18n();
  const [data, setData] = useState<{ key: string; items: Product[] }>({ key: '', items: [] });
  const seq = useRef(0);
  const key = `${lang}|${recent.join('|')}`;
  useEffect(() => {
    if (!recent.length) return;
    const id = ++seq.current;
    fetchByHandles(recent, lang === 'ar' ? 'AR' : 'EN')
      .then((r) => { if (id === seq.current) setData({ key, items: r }); })
      // Personal rails are optional: stay hidden when offline with nothing saved.
      .catch(() => { if (id === seq.current) setData((p) => ({ key, items: p.items })); });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep only products that are still in the recent list, in its order (the newest view comes first at once).
  const items = recent.map((h) => data.items.find((p) => p.handle === h)).filter((p): p is Product => !!p);
  return { items, loading: recent.length > 0 && data.key !== key, count: recent.length };
}

/**
 * "Continue where you left off" (last viewed frame + a shortcut back to the last list browsed)
 * followed by the "Recently viewed" rail. Renders nothing for a first-time user.
 */
export function PersonalSections({ onOpen, onResume }: { onOpen: (handle: string) => void; onResume: (b: LastBrowse) => void }) {
  const { t } = useI18n();
  const { row, flip, arrow } = useDir();
  const d = useD();
  const { items, loading, count } = useRecentProducts();
  const { browse } = useDiscoveryStore();
  const first = items[0];
  const rest = items.slice(1);
  // Category names are translated live; a collection keeps the title it was opened with.
  const catKey = browse?.categoryId ? CATEGORIES.find((c) => c.id === browse.categoryId)?.label : undefined;
  const place = browse?.collection ? browse.title || t('collectionLabel') : catKey ? t(catKey) : undefined;
  const resumeLabel = !browse ? null : browse.query ? d('searchFor', { x: browse.query }) : place ? d('backTo', { x: place }) : null;
  if (!count && !resumeLabel) return null;

  return (
    <View>
      {(count > 0 || !!resumeLabel) && (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <T style={{ fontFamily: font.black, fontSize: 20, marginBottom: 12 }} accessibilityRole="header">{d('continueTitle')}</T>
          {count > 0 && !first && loading && (
            <View style={[s.card, { flexDirection: row }]}>
              <Shimmer style={{ width: 96, height: 96, borderRadius: radius.sm }} />
              <View style={{ flex: 1, gap: 9, justifyContent: 'center' }}>
                <Shimmer style={{ height: 10, width: '35%', borderRadius: 5 }} />
                <Shimmer style={{ height: 13, borderRadius: 6 }} />
                <Shimmer style={{ height: 16, width: '40%', borderRadius: 8 }} />
              </View>
            </View>
          )}
          {!!first && (
            <Enter>
              <PressableScale to={0.98} onPress={() => { haptic.tap(); onOpen(first.handle); }} accessibilityRole="button"
                accessibilityLabel={`${d('continueTitle')}: ${first.title}`} style={[s.card, shadow, { flexDirection: row }]}>
                <View style={s.img}>
                  {!!first.featuredImage?.url && <Image source={sized(first.featuredImage.url, 320)} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={200} />}
                </View>
                <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: 5 }}>
                    <Ionicons name="time-outline" size={13} color={colors.red} />
                    <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: colors.red }}>{d('lastViewed')}</Text>
                  </View>
                  <T numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 14 }}>{first.title}</T>
                  <Price p={first} size={15} />
                </View>
                <View style={s.go}><Ionicons name={arrow} size={18} color={colors.card} /></View>
              </PressableScale>
            </Enter>
          )}
          {!!resumeLabel && browse && (
            <View style={{ flexDirection: row, marginTop: 10 }}>
              <Chip icon="return-down-forward-outline" label={resumeLabel} onPress={() => onResume(browse)} />
            </View>
          )}
        </View>
      )}

      {(rest.length > 0 || (loading && count > 1 && !items.length)) && (
        <View>
          <View style={{ paddingHorizontal: 20, marginTop: 24, marginBottom: 12 }}>
            <T style={{ fontFamily: font.black, fontSize: 20 }} accessibilityRole="header">{t('recentlyViewed')}</T>
            <T style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{d('recentSub')}</T>
          </View>
          {rest.length > 0 ? (
            <FlatList horizontal inverted={flip} data={rest} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false}
              initialNumToRender={3} windowSize={5}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}
              renderItem={({ item }) => <ProductCard p={item} width={150} onOpen={onOpen} />} />
          ) : (
            <View style={{ flexDirection: row, paddingHorizontal: 20, gap: 12 }}>
              {[0, 1, 2].map((i) => <ProductCardSkeleton key={i} width={150} />)}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 10, gap: 12, alignItems: 'center' },
  img: { width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.card, overflow: 'hidden' },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
});
