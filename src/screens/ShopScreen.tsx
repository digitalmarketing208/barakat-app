import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { TopBar } from '../TopBar';
import { Chip, Empty, ErrorState, ProductCard, ProductCardSkeleton, ProductRow, ProductRowSkeleton, T } from '../ui';
import { CATEGORIES, GENDERS, SHAPES, SORTS } from '../catalog';
import { BRANDS } from '../siteData';
import type { Product } from '../shopify';
import type { RootParams, TabParams } from '../types';
import { useCatalog } from '../discovery/useCatalog';
import { Filters, NO_FILTERS, countActive } from '../discovery/filters';
import { FilterSheet, usePriceLabel } from '../discovery/FilterSheet';
import { SortSheet } from '../discovery/SortSheet';
import { SearchField, SearchOverlay } from '../discovery/SearchOverlay';
import { setLastBrowse, setViewMode, useDiscoveryStore } from '../discovery/storage';
import { Enter, PressableScale, haptic } from '../discovery/motion';
import { useDir } from '../discovery/dir';
import { useD } from '../discovery/strings';
import { alpha, white } from '../discovery/tint';

const W = Dimensions.get('window').width;
const COL_W = (W - 16 * 2 - 12) / 2;
type CatItem = { id: string | null; label: string; icon?: keyof typeof Ionicons.glyphMap };

export default function ShopScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const route = useRoute<RouteProp<TabParams, 'Shop'>>();
  const { t } = useI18n();
  const { row, flip } = useDir();
  const d = useD();
  const priceLabel = usePriceLabel();
  const { view } = useDiscoveryStore();

  const [text, setText] = useState(route.params?.query ?? '');
  const [cat, setCat] = useState<string | null>(route.params?.categoryId ?? null);
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, shapes: route.params?.shapeIds ?? [] });
  const [sortId, setSortId] = useState('web');
  const [col, setCol] = useState<string | null>(route.params?.collection ?? null);
  const [colTitle, setColTitle] = useState(route.params?.title ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'filters' | 'sort' | 'search' | null>(null);
  const listRef = useRef<FlatList<Product>>(null);

  // Every navigation into this tab (home search, tiles, brands, finder results) is a fresh intent.
  const [seen, setSeen] = useState(route.params);
  if (route.params !== seen) {
    setSeen(route.params);
    const p = route.params;
    if (p) {
      setSortId('web');
      setCol(p.collection ?? null); setColTitle(p.collection ? p.title ?? '' : '');
      setText(p.collection ? '' : p.query ?? ''); setCat(p.collection ? null : p.categoryId ?? null);
      setFilters(p.collection ? NO_FILTERS : { ...NO_FILTERS, shapes: p.shapeIds ?? [] });
    }
  }

  const { items, loading, more, error, hasNext, gen, loadMore, reload, refresh } = useCatalog({ text, cat, collection: col, filters, sortId });
  const sort = SORTS.find((x) => x.id === sortId) ?? SORTS[0];
  const active = countActive(filters);

  // Back to the top whenever the list is a different list.
  const listKey = `${text}|${cat}|${col}|${sortId}|${JSON.stringify(filters)}`;
  useEffect(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [listKey]);

  // Remember what was being browsed so Home can offer "continue where you left off".
  useEffect(() => {
    if (col) setLastBrowse({ collection: col, title: colTitle || undefined });
    else if (text) setLastBrowse({ query: text, categoryId: cat ?? undefined });
    else if (cat) { const c = CATEGORIES.find((x) => x.id === cat); if (c) setLastBrowse({ categoryId: cat, title: t(c.label) }); }
  }, [col, colTitle, text, cat, t]);

  const onRefresh = useCallback(async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } }, [refresh]);
  const openProduct = useCallback((handle: string) => nav.navigate('Product', { handle }), [nav]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const pickCat = (id: string | null) => { setCol(null); setColTitle(''); setCat(id); };
  const submitSearch = (q: string) => { setSheet(null); setCol(null); setColTitle(''); setText(q); };

  // Brand choices: the exact vendor names seen in the current list first, then the store's brand list.
  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of filters.brands) seen.set(b.toLowerCase(), b);
    for (const p of items) if (p.vendor && !seen.has(p.vendor.toLowerCase())) seen.set(p.vendor.toLowerCase(), p.vendor);
    for (const b of BRANDS) {
      const k = b.name.toLowerCase();
      if (![...seen.keys()].some((x) => x.startsWith(k))) seen.set(k, b.name);
    }
    return [...seen.values()].slice(0, 28);
  }, [items, filters.brands]);

  const chips = useMemo(() => {
    const out: { key: string; label: string; off: () => void }[] = [];
    if (col) out.push({ key: 'col', label: colTitle || t('collectionLabel'), off: () => { setCol(null); setColTitle(''); } });
    if (text) out.push({ key: 'q', label: `“${text}”`, off: () => setText('') });
    const g = GENDERS.find((x) => x.id === filters.gender);
    if (g && g.id !== 'all') out.push({ key: 'g', label: t(g.label), off: () => setFilters((p) => ({ ...p, gender: 'all' })) });
    for (const x of SHAPES) if (filters.shapes.includes(x.id)) out.push({ key: `s${x.id}`, label: t(x.label), off: () => setFilters((p) => ({ ...p, shapes: p.shapes.filter((y) => y !== x.id) })) });
    if (filters.price) out.push({ key: 'p', label: priceLabel(filters.price), off: () => setFilters((p) => ({ ...p, price: null })) });
    for (const b of filters.brands) out.push({ key: `b${b}`, label: b, off: () => setFilters((p) => ({ ...p, brands: p.brands.filter((y) => y !== b) })) });
    if (filters.inStock) out.push({ key: 'a', label: d('inStockOnly'), off: () => setFilters((p) => ({ ...p, inStock: false })) });
    return out;
  }, [col, colTitle, text, filters, t, d, priceLabel]);
  const clearAll = () => { haptic.light(); setCol(null); setColTitle(''); setText(''); setFilters(NO_FILTERS); };

  const cats = useMemo<CatItem[]>(() => [{ id: null, label: t('all') }, ...CATEGORIES.map((c) => ({ id: c.id as string | null, label: t(c.label), icon: c.icon }))], [t]);

  // The toolbar gains a shadow once the list scrolls under it.
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  const lift = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 24], [0, 1], 'clamp') }));

  // Stagger-in only right after a fresh list arrives (not when cells remount while scrolling back).
  const [settled, setSettled] = useState(0);
  useEffect(() => { const id = setTimeout(() => setSettled(gen), 900); return () => clearTimeout(id); }, [gen]);
  const fresh = settled !== gen;

  const grid = view === 'grid';
  const renderItem = useCallback(({ item, index }: { item: Product; index: number }) => {
    const node = grid ? <ProductCard p={item} width={COL_W} onOpen={openProduct} /> : <ProductRow p={item} onOpen={openProduct} />;
    return index < 8 ? <Enter on={fresh} delay={index * 45}>{node}</Enter> : node;
  }, [grid, openProduct, fresh]);

  const header = (
    <FlatList horizontal inverted={flip} data={cats} keyExtractor={(c) => c.id ?? 'all'} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }} keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <Chip label={item.label} icon={item.icon} active={!col && cat === item.id} onPress={() => pickCat(item.id)} />} />
  );

  const skeleton = grid ? (
    <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => <ProductCardSkeleton key={i} width={COL_W} />)}
    </View>
  ) : (
    <View style={{ gap: 12 }}>{[0, 1, 2, 3, 4].map((i) => <ProductRowSkeleton key={i} />)}</View>
  );

  const footer = more ? (
    <View style={{ gap: 12 }}>
      {grid ? (
        <View style={{ flexDirection: row, gap: 12, paddingHorizontal: 16 }}><ProductCardSkeleton width={COL_W} /><ProductCardSkeleton width={COL_W} /></View>
      ) : <ProductRowSkeleton />}
      <ActivityIndicator color={colors.red} style={{ marginVertical: 8 }} />
    </View>
  ) : !hasNext && items.length > 6 ? (
    <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }}>
      <Ionicons name="checkmark-circle-outline" size={16} color={colors.muted} />
      <T style={{ color: colors.muted, fontSize: 12.5 }}>{d('endOfList')}</T>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar compact>
        <SearchField value={text} onPress={() => setSheet('search')} onClear={() => setText('')} />
      </TopBar>

      {/* Sticky toolbar: filters, sort, layout toggle and the applied-filter chips never scroll away. */}
      <View style={{ zIndex: 2, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <PressableScale haptics onPress={() => setSheet('filters')} accessibilityRole="button"
            accessibilityLabel={active ? `${t('filters')} (${active})` : t('filters')} style={[s.tool, { flexDirection: row }, active > 0 && s.toolOn]}>
            <Ionicons name="options-outline" size={17} color={active ? colors.red : colors.text} />
            <Text style={[s.toolText, active > 0 && { color: colors.red }]}>{t('filters')}</Text>
            {active > 0 && <View style={s.count}><Text style={{ color: white, fontFamily: font.bold, fontSize: 11 }}>{active}</Text></View>}
          </PressableScale>
          <PressableScale haptics onPress={() => setSheet('sort')} accessibilityRole="button" accessibilityLabel={`${t('sort')}: ${t(sort.label)}`}
            style={[s.tool, { flexDirection: row, flexShrink: 1 }]}>
            <Ionicons name="swap-vertical" size={17} color={colors.text} />
            <Text numberOfLines={1} style={[s.toolText, { flexShrink: 1 }]}>{t(sort.label)}</Text>
          </PressableScale>
          <View style={{ flex: 1 }} />
          <View style={[s.toggle, { flexDirection: row }]} accessibilityRole="radiogroup">
            {(['grid', 'list'] as const).map((m) => (
              <PressableScale key={m} to={0.9} onPress={() => { if (view !== m) { haptic.tap(); setViewMode(m); } }} accessibilityRole="radio"
                accessibilityState={{ checked: view === m }} accessibilityLabel={d(m)} style={[s.toggleBtn, view === m && { backgroundColor: colors.red }]}>
                <Ionicons name={m === 'grid' ? 'grid-outline' : 'list-outline'} size={17} color={view === m ? white : colors.muted} />
              </PressableScale>
            ))}
          </View>
        </View>
        {chips.length > 0 && (
          <FlatList horizontal inverted={flip} data={chips} keyExtractor={(c) => c.key} showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10 }} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <Chip label={item.label} active onRemove onPress={item.off} />}
            ListFooterComponent={chips.length > 1 ? <Chip label={d('resetAll')} icon="trash-outline" onPress={clearAll} /> : null} />
        )}
        <Animated.View style={[s.lift, lift]} />
      </View>

      {error ? <ErrorState message={error === 'config' ? t('tokenMissing') : t('loadError')} onRetry={reload} /> : (
        <Animated.FlatList
          ref={listRef} key={view}
          data={loading ? [] : items} keyExtractor={(p) => p.id} numColumns={grid ? 2 : 1}
          ListHeaderComponent={header}
          columnWrapperStyle={grid ? { gap: 12, paddingHorizontal: 16, flexDirection: row } : undefined}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          onScroll={onScroll} scrollEventThrottle={16}
          onEndReached={loadMore} onEndReachedThreshold={0.7}
          initialNumToRender={6} maxToRenderPerBatch={8} windowSize={9} removeClippedSubviews={Platform.OS === 'android'}
          renderItem={renderItem}
          ListEmptyComponent={loading ? skeleton : <Empty icon="search-outline" text={t('noResults')} sub={d('tryOther')} />}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} colors={[colors.red]} progressBackgroundColor={colors.card} />}
        />
      )}

      <FilterSheet visible={sheet === 'filters'} value={filters} brands={brandOptions} onClose={closeSheet}
        onApply={(f) => { setFilters(f); setSheet(null); }} />
      <SortSheet visible={sheet === 'sort'} value={sortId} onClose={closeSheet} onPick={(id) => { setSortId(id); setSheet(null); }} />
      <SearchOverlay visible={sheet === 'search'} initial={text} onClose={closeSheet}
        onSubmit={submitSearch}
        onProduct={(h) => { setSheet(null); openProduct(h); }}
        onCollection={(h, title) => { setSheet(null); setText(''); setCat(null); setFilters(NO_FILTERS); setSortId('web'); setCol(h); setColTitle(title); }}
        onCategory={(id) => { setSheet(null); setText(''); pickCat(id); }} />
    </View>
  );
}

const s = StyleSheet.create({
  tool: { height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 7 },
  toolOn: { borderColor: colors.red, backgroundColor: alpha(colors.red, 0.06) },
  toolText: { fontFamily: font.bold, fontSize: 13.5, color: colors.text },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  toggle: { height: 40, padding: 3, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 2 },
  toggleBtn: { width: 34, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lift: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 1, backgroundColor: colors.line, ...shadow },
});
