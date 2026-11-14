import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, Extrapolation, SharedValue, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '../theme';
import { useI18n } from '../i18n';
import { T } from '../ui';
import { sized } from '../shopify';
import { useS } from './strings';
import { tint } from './tint';

export type Img = { url: string };
export type Rect = { x: number; y: number; w: number; h: number };

const INLINE_W = 900, FULL_W = 1600, MAX_ZOOM = 4;
const SPRING = { damping: 22, stiffness: 240, mass: 0.9 };

/** Warm the image cache for the photos either side of `i`, so a swipe never shows a blank page. */
const prefetchAround = (images: Img[], i: number, w: number) => {
  const urls = [images[i - 1], images[i + 1]].map((im) => sized(im?.url, w)).filter((u): u is string => !!u);
  if (urls.length) Image.prefetch(urls, 'memory-disk').catch(() => {});
};

/**
 * Product gallery: swipeable inline pager with thumbnails, and a full-screen viewer that grows out of the
 * tapped photo (shared-element style), with pinch / double-tap zoom, swipe between photos and drag to close.
 * `index` is always the logical image index; in Arabic the pages are laid out right-to-left.
 */
export function Gallery({ images, index, onIndex, height = 330, quiet, onOpen }: {
  images: Img[]; index: number; onIndex: (i: number) => void; height?: number;
  /** true while the full-screen viewer covers the page: follow its index without animating */
  quiet?: boolean; onOpen: (origin: Rect) => void;
}) {
  const { rtl, row } = useI18n();
  const s = useS();
  const { width } = useWindowDimensions();
  const n = images.length;
  const listRef = useRef<FlatList<Img>>(null);
  const thumbsRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  // Pages are placed physically: in RTL the first photo sits at the far right.
  const ordered = useMemo(() => (rtl ? [...images].reverse() : images), [images, rtl]);
  const pos = useCallback((i: number) => (rtl ? n - 1 - i : i), [rtl, n]);
  const shownRef = useRef(index);

  // Keep the selected thumbnail in view (thumbs are 56 wide + 8 gap; physical order is mirrored in RTL).
  const syncThumbs = (animated: boolean) =>
    thumbsRef.current?.scrollTo({ x: Math.max(0, pos(index) * 64 - width / 2 + 44), animated });

  useEffect(() => {
    prefetchAround(images, index, INLINE_W);
    if (shownRef.current !== index) {
      shownRef.current = index;
      try { listRef.current?.scrollToIndex({ index: pos(index), animated: !quiet }); } catch { /* not laid out yet */ }
    }
    syncThumbs(true);
  }, [index, images, pos, width, rtl, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = () => {
    frameRef.current?.measureInWindow((x, y, w, h) => onOpen({ x, y, w, h }));
  };

  if (!n) {
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="glasses-outline" size={64} color={colors.line} /></View>;
  }
  return (
    <View>
      <View ref={frameRef} collapsable={false} style={{ width, height }}>
        <FlatList ref={listRef} key={`${n}-${rtl}-${width}`} data={ordered} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          keyExtractor={(im, k) => im.url + k} initialScrollIndex={pos(index)} initialNumToRender={2} windowSize={3} maxToRenderPerBatch={2}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })} onScrollToIndexFailed={() => {}}
          onMomentumScrollEnd={(e) => {
            const p = Math.max(0, Math.min(n - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
            const i = pos(p);
            shownRef.current = i;
            if (i !== index) onIndex(i);
          }}
          renderItem={({ item }) => (
            <Pressable onPress={open} accessibilityRole="imagebutton" accessibilityLabel={s('zoomHint')}>
              <Image source={sized(item.url, INLINE_W)} placeholder={sized(item.url, 120)} placeholderContentFit="contain" cachePolicy="memory-disk"
                style={{ width, height }} contentFit="contain" transition={150} priority="high" />
            </Pressable>
          )} />
        <Pressable onPress={open} hitSlop={8} style={[g.expand, shadow, rtl ? { left: 16 } : { right: 16 }]} accessibilityRole="button" accessibilityLabel={s('zoomHint')}>
          <Ionicons name="expand-outline" size={18} color={colors.text} />
        </Pressable>
        {n > 1 && (
          <View style={[g.count, rtl ? { right: 16 } : { left: 16 }]}>
            <T style={{ fontFamily: font.bold, fontSize: 12, color: colors.card }}>{index + 1} / {n}</T>
          </View>
        )}
      </View>
      {n > 1 && (
        <ScrollView ref={thumbsRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => syncThumbs(false)}
          contentContainerStyle={{ flexDirection: row, gap: 8, paddingHorizontal: 16, paddingVertical: 10, flexGrow: 1, justifyContent: 'flex-start' }}>
          {images.map((im, i) => (
            <Pressable key={im.url + i} onPress={() => onIndex(i)} accessibilityRole="button" accessibilityLabel={`${s('photo')} ${i + 1}`} accessibilityState={{ selected: i === index }}
              style={[g.thumb, { borderColor: i === index ? colors.red : colors.line }]}>
              <Image source={sized(im.url, 120)} cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} contentFit="contain" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---- Full-screen viewer (mounted by the screen at its root so it covers everything) --------------------------------
type ViewerProps = { images: Img[]; index: number; onIndex: (i: number) => void; origin: Rect; onClose: () => void };

export function GalleryViewer({ images, index, onIndex, origin, onClose }: ViewerProps) {
  const { rtl, row } = useI18n();
  const s = useS();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const n = images.length;
  const dir = rtl ? -1 : 1; // physical direction of "next photo"

  const progress = useSharedValue(0);   // 0 = sitting in the page, 1 = full screen
  const strip = useSharedValue(-index * W * dir);
  const active = useSharedValue(index);
  const scale = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0);
  const s0 = useSharedValue(1), tx0 = useSharedValue(0), ty0 = useSharedValue(0), strip0 = useSharedValue(0);
  const dismiss = useSharedValue(0);
  const pinching = useSharedValue(false);
  const mode = useSharedValue(0); // 0 undecided, 1 paging, 2 dismissing, 3 panning a zoomed photo, 4 ignored (pinching)
  const closing = useSharedValue(false);

  useEffect(() => { progress.set(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })); }, [progress]);
  useEffect(() => { prefetchAround(images, index, FULL_W); }, [images, index]);
  // Follow index changes that did not come from a swipe here (keeps the strip honest after rotation too).
  useEffect(() => {
    if (active.value !== index) { active.set(index); scale.set(1); tx.set(0); ty.set(0); }
    strip.set(withSpring(-index * W * dir, SPRING));
  }, [index, W, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    scale.set(withTiming(1, { duration: 180 })); tx.set(withTiming(0, { duration: 180 })); ty.set(withTiming(0, { duration: 180 }));
    dismiss.set(withTiming(0, { duration: 240 }));
    progress.set(withTiming(0, { duration: 240, easing: Easing.inOut(Easing.cubic) }, (done) => { if (done) runOnJS(onClose)(); }));
  }, [onClose, scale, tx, ty, dismiss, progress, closing]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]);

  const clampXY = (sc: number, x: number, y: number) => {
    'worklet';
    const mx = (W * (sc - 1)) / 2, my = (H * (sc - 1)) / 2;
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      // A page swipe or dismiss that started with the first finger gives way to the pinch.
      if (mode.value === 1) strip.set(withSpring(-active.value * W * dir, SPRING));
      if (mode.value === 2) dismiss.set(withSpring(0, SPRING));
      mode.set(4); pinching.set(true);
      cancelAnimation(tx); cancelAnimation(ty);
      s0.set(scale.value); tx0.set(tx.value); ty0.set(ty.value);
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_ZOOM * 1.25, Math.max(0.7, s0.value * e.scale));
      const k = next / s0.value;
      // Keep the point under the fingers still while the photo scales.
      const fx = e.focalX - W / 2, fy = e.focalY - H / 2;
      scale.set(next);
      tx.set(fx - k * (fx - tx0.value));
      ty.set(fy - k * (fy - ty0.value));
    })
    .onEnd(() => {
      const target = Math.min(MAX_ZOOM, Math.max(1, scale.value));
      const c = clampXY(target, target === 1 ? 0 : tx.value, target === 1 ? 0 : ty.value);
      scale.set(withSpring(target, SPRING)); tx.set(withSpring(c.x, SPRING)); ty.set(withSpring(c.y, SPRING));
    })
    .onFinalize(() => { pinching.set(false); });

  const goTo = (i: number) => {
    'worklet';
    const k = Math.min(n - 1, Math.max(0, i));
    if (k !== active.value) { active.set(k); scale.set(1); tx.set(0); ty.set(0); runOnJS(onIndex)(k); }
    strip.set(withSpring(-k * W * dir, SPRING));
  };

  const pan = Gesture.Pan().maxPointers(2).minDistance(6)
    .onStart(() => {
      mode.set(pinching.value ? 4 : 0);
      cancelAnimation(tx); cancelAnimation(ty); cancelAnimation(strip);
      tx0.set(tx.value); ty0.set(ty.value); strip0.set(-active.value * W * dir);
    })
    .onUpdate((e) => {
      if (mode.value === 4) return;
      if (mode.value === 0) mode.set(scale.value > 1.02 ? 3 : Math.abs(e.translationX) >= Math.abs(e.translationY) ? 1 : 2);
      if (mode.value === 3) {
        const c = clampXY(scale.value, tx0.value + e.translationX, ty0.value + e.translationY);
        tx.set(c.x); ty.set(c.y);
      } else if (mode.value === 1) {
        // Rubber-band past the first and last photo.
        const raw = strip0.value + e.translationX, lo = Math.min(0, -(n - 1) * W * dir), hi = Math.max(0, -(n - 1) * W * dir);
        strip.set(raw < lo ? lo + (raw - lo) * 0.3 : raw > hi ? hi + (raw - hi) * 0.3 : raw);
      } else if (mode.value === 2) {
        dismiss.set(e.translationY);
      }
    })
    .onEnd((e) => {
      const m = mode.value; mode.set(0);
      if (m === 3) {
        const mx = (W * (scale.value - 1)) / 2, my = (H * (scale.value - 1)) / 2;
        tx.set(withDecay({ velocity: e.velocityX, clamp: [-mx, mx] }));
        ty.set(withDecay({ velocity: e.velocityY, clamp: [-my, my] }));
      } else if (m === 1) {
        const moved = e.translationX * dir; // negative = towards the next photo
        const step = moved < -W * 0.22 || e.velocityX * dir < -600 ? 1 : moved > W * 0.22 || e.velocityX * dir > 600 ? -1 : 0;
        goTo(active.value + step);
      } else if (m === 2) {
        if (Math.abs(dismiss.value) > 110 || Math.abs(e.velocityY) > 900) runOnJS(close)();
        else dismiss.set(withSpring(0, SPRING));
      }
    })
    .onFinalize(() => { mode.set(0); });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(260)
    .onEnd((e) => {
      if (scale.value > 1.02) { scale.set(withSpring(1, SPRING)); tx.set(withSpring(0, SPRING)); ty.set(withSpring(0, SPRING)); return; }
      const target = 2.5, fx = e.x - W / 2, fy = e.y - H / 2;
      const c = clampXY(target, fx - target * fx, fy - target * fy);
      scale.set(withSpring(target, SPRING)); tx.set(withSpring(c.x, SPRING)); ty.set(withSpring(c.y, SPRING));
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  // Shared-element feel: the stage starts exactly over the inline photo and grows to fill the screen.
  const startScale = Math.min(1, origin.h / Math.min(W, H));
  const startY = origin.y + origin.h / 2 - H / 2;
  const stage = useAnimatedStyle(() => {
    const pull = Math.abs(dismiss.value);
    return {
      transform: [
        { translateY: interpolate(progress.value, [0, 1], [startY, 0]) + dismiss.value },
        { scale: interpolate(progress.value, [0, 1], [startScale, 1]) * interpolate(pull, [0, H * 0.5], [1, 0.8], Extrapolation.CLAMP) },
      ],
    };
  });
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value * interpolate(Math.abs(dismiss.value), [0, H * 0.4], [1, 0.25], Extrapolation.CLAMP) }));
  const chrome = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.6, 1], [0, 1], Extrapolation.CLAMP) * interpolate(Math.abs(dismiss.value), [0, 80], [1, 0], Extrapolation.CLAMP) }));
  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: strip.value }] }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 30 }]} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }, backdrop]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[StyleSheet.absoluteFill, stage]} collapsable={false}>
          <Animated.View style={[StyleSheet.absoluteFill, stripStyle]}>
            {images.map((im, i) => (
              <ZoomPage key={im.url + i} url={im.url} i={i} left={i * W * dir} W={W} H={H} near={Math.abs(i - index) <= 1}
                active={active} scale={scale} tx={tx} ty={ty} />
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, chrome]}>
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={close} style={[g.round, shadow]} hitSlop={8} accessibilityRole="button" accessibilityLabel={s('close')}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          {n > 1 && <View style={g.pill}><T style={{ fontFamily: font.bold, fontSize: 13, color: colors.card }}>{index + 1} / {n}</T></View>}
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 18, left: 0, right: 0, alignItems: 'center', gap: 10 }}>
          {n > 1 && n <= 12 && (
            <View style={{ flexDirection: row, gap: 6 }}>
              {images.map((_im, i) => <View key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.red : colors.line }} />)}
            </View>
          )}
          <T style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{s('zoomHint')}</T>
        </View>
      </Animated.View>
    </View>
  );
}

const ZoomPage = memo(function ZoomPage({ url, i, left, W, H, near, active, scale, tx, ty }: {
  url: string; i: number; left: number; W: number; H: number; near: boolean;
  active: SharedValue<number>; scale: SharedValue<number>; tx: SharedValue<number>; ty: SharedValue<number>;
}) {
  const st = useAnimatedStyle(() => (active.value === i
    ? { transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }
    : { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left, width: W, height: H }, st]}>
      {near && (
        <Image source={sized(url, FULL_W)} placeholder={sized(url, INLINE_W)} placeholderContentFit="contain" cachePolicy="memory-disk"
          style={{ width: W, height: H }} contentFit="contain" transition={120} />
      )}
    </Animated.View>
  );
});

const g = StyleSheet.create({
  thumb: { width: 56, height: 56, borderRadius: radius.sm, borderWidth: 1.5, overflow: 'hidden', backgroundColor: colors.card },
  expand: { position: 'absolute', bottom: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: tint.glass, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', bottom: 14, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: tint.scrim, alignItems: 'center', justifyContent: 'center' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 12, height: 28, borderRadius: 14, backgroundColor: tint.scrim, alignItems: 'center', justifyContent: 'center' },
});
