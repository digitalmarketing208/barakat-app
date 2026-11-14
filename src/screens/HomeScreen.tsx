import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font } from '../theme';
import { useI18n } from '../i18n';
import { TopBar } from '../TopBar';
import { ErrorState, ProductCard, ProductCardSkeleton } from '../ui';
import { BranchesRail, Brands, CategoryTiles, EyeTestBanner, GamerPromo, HeroCarousel, Promises, RailHeading, Reviews, SiteFooter, Strap } from '../HomeSections';
import { GAMER_COLLECTION, Go } from '../siteData';
import { useProducts } from '../useProducts';
import { useNearest } from '../useNearest';
import { CONTACT } from '../config';
import type { SortKey } from '../shopify';
import type { RootParams } from '../types';
import { PersonalSections } from '../discovery/HomePersonal';
import { SearchField, SearchOverlay } from '../discovery/SearchOverlay';
import type { LastBrowse } from '../discovery/storage';
import { Enter } from '../discovery/motion';
import { useDir } from '../discovery/dir';

type Nav = NativeStackNavigationProp<RootParams>;
const CARD_W = 165;

function ProductRail({ q, sort, reverse, collection, onOpen }: { q: string; sort: SortKey; reverse?: boolean; collection?: string; onOpen: (h: string) => void }) {
  const { t } = useI18n();
  const { row, flip } = useDir();
  const { items, loading, error, reload } = useProducts(q, sort, reverse, 10, collection);
  if (error) return <ErrorState message={error === 'config' ? t('tokenMissing') : t('loadError')} onRetry={reload} />;
  if (loading) return (
    <View style={{ flexDirection: row, paddingHorizontal: 20, gap: 12, paddingBottom: 12, overflow: 'hidden' }}>
      {[0, 1, 2].map((i) => <ProductCardSkeleton key={i} width={CARD_W} />)}
    </View>
  );
  if (!items.length) return null;
  return (
    <Enter>
      <FlatList horizontal inverted={flip} data={items} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false}
        initialNumToRender={3} maxToRenderPerBatch={4} windowSize={5}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}
        renderItem={({ item }) => <ProductCard p={item} width={CARD_W} onOpen={onOpen} />} />
    </Enter>
  );
}

// Mount heavy sections after a delay so the first paint is fast.
function Later({ ms, children }: { ms: number; children: React.ReactNode }) {
  const [on, setOn] = useState(ms === 0);
  useEffect(() => {
    if (ms === 0) return;
    const id = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return on ? <>{children}</> : <View style={{ minHeight: 120 }} />;
}

// Same sections, in the same order, as the website home page.
type RailKey = 'newArrivals' | 'gamerRail' | 'eyeRail' | 'sunRail' | 'kidsRail' | 'accRail';
const RAILS: { col: string; title: RailKey; sub: 'newArrSub' | 'gamerSub' | 'eyeSub' | 'sunSub' | 'kidsSub' | 'accSub'; sort?: 'CREATED_AT' }[] = [
  { col: 'new-arrivals-all-collections', title: 'newArrivals', sub: 'newArrSub', sort: 'CREATED_AT' },
  { col: GAMER_COLLECTION, title: 'gamerRail', sub: 'gamerSub' },
  { col: 'eyeglasses-all-brands', title: 'eyeRail', sub: 'eyeSub' },
  { col: 'sunglasses-all-brands', title: 'sunRail', sub: 'sunSub' },
  { col: 'kids-collections-all-eyeglasses-and-sunglasses', title: 'kidsRail', sub: 'kidsSub' },
  { col: 'accessories-1', title: 'accRail', sub: 'accSub' },
];

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { t } = useI18n();
  const [searching, setSearching] = useState(false);
  const { list } = useNearest();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });

  const open = useCallback((handle: string) => nav.navigate('Product', { handle }), [nav]);
  const go = useCallback((g: Go) => {
    if (g.booking) return nav.navigate('Booking');
    if (g.collection) nav.navigate('Tabs', { screen: 'Shop', params: { collection: g.collection, title: g.title } });
  }, [nav]);
  const resume = useCallback((b: LastBrowse) => {
    nav.navigate('Tabs', { screen: 'Shop', params: b.collection ? { collection: b.collection, title: b.title } : { query: b.query ?? '', categoryId: b.categoryId } });
  }, [nav]);
  const closeSearch = useCallback(() => setSearching(false), []);
  const nearest = list[0]?.km != null ? list[0].name : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TopBar>
          <SearchField onPress={() => setSearching(true)} />
        </TopBar>
        <Strap />

        <HeroCarousel onGo={go} scrollY={y} />
        <PersonalSections onOpen={open} onResume={resume} />
        <CategoryTiles onGo={go} />
        <Promises />

        {RAILS.map((r, i) => (
          <Later key={r.col} ms={i === 0 ? 0 : 500 * i}><View>
            {r.col === GAMER_COLLECTION && <Enter><GamerPromo onPress={() => go({ collection: r.col, title: t('gamer') })} /></Enter>}
            <RailHeading title={t(r.title)} sub={t(r.sub)} onAll={() => go({ collection: r.col, title: t(r.title) })} />
            <ProductRail q="available_for_sale:true" sort={r.sort ?? 'BEST_SELLING'} reverse={!!r.sort} collection={r.col} onOpen={open} />
          </View></Later>
        ))}

        <Later ms={3200}><Enter>
          <EyeTestBanner onPress={() => nav.navigate('Booking')} nearest={nearest} />
          <Brands onBrand={(h, n) => go({ collection: h, title: n })} />
          <Reviews />
          <BranchesRail list={list} onAll={() => nav.navigate('Tabs', { screen: 'Branches' })} />
          <Pressable onPress={() => Linking.openURL(`tel:${CONTACT.tollFree}`)} accessibilityRole="button" style={{ alignItems: 'center', marginTop: 22 }}>
            <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 13 }}>{t('tollFree')}: ‎800 124 8882</Text>
          </Pressable>
          <SiteFooter />
        </Enter></Later>
      </Animated.ScrollView>

      <SearchOverlay visible={searching} onClose={closeSearch}
        onSubmit={(q) => { setSearching(false); nav.navigate('Tabs', { screen: 'Shop', params: { query: q } }); }}
        onProduct={(h) => { setSearching(false); open(h); }}
        onCollection={(h, title) => { setSearching(false); go({ collection: h, title }); }}
        onCategory={(id) => { setSearching(false); nav.navigate('Tabs', { screen: 'Shop', params: { categoryId: id } }); }} />
    </View>
  );
}
