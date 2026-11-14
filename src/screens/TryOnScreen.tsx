import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, LayoutChangeEvent, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { cutout } from '../tryon/cutout';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useRoute, RouteProp, useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius } from '../theme';
import { useI18n } from '../i18n';
import { Button, Chip, T } from '../ui';
import { Product, fetchProduct, sized } from '../shopify';
import { useProducts } from '../useProducts';
import { FaceSample, computeFit, speedBoost, stepAngle, stepToward, DEAD_PX } from '../tryon/fit';
import type { RootParams, TabParams } from '../types';

// Real-time tracking is a native module: it is absent in Expo Go and on web, so load it defensively.
type AutoMod = typeof import('../tryon/AutoCamera');
type Shoot = import('../tryon/AutoCamera').ShootFn;
let Auto: AutoMod | null = null;
if (Platform.OS !== 'web') {
  try { Auto = require('../tryon/AutoCamera') as AutoMod; } catch { Auto = null; }
}

const TINTS = [
  { id: 'clear', key: 'tintClear' as const, color: 'transparent', opacity: 0 },
  { id: 'blue', key: 'tintBlue' as const, color: '#6FA8FF', opacity: 0.22 },
  { id: 'sun', key: 'tintSun' as const, color: '#3A2A1A', opacity: 0.45 },
  { id: 'gamer', key: 'tintGamer' as const, color: '#FF8A1F', opacity: 0.4 },
];

type Perm = { granted: boolean; loading: boolean; request: () => void };
type Frozen = { uri: string; mirror: boolean; composite: boolean };
const LOST_MS = 400;

function Shell({ perm, auto }: { perm: Perm; auto: boolean }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const route = useRoute<RouteProp<TabParams, 'TryOn'>>();
  const focused = useIsFocused();
  const { t, row, lang, rtl } = useI18n();
  const L = useCallback((ar: string, en: string) => (lang === 'ar' ? ar : en), [lang]);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [tint, setTint] = useState('clear');
  const [picked, setPicked] = useState<Product | null>(null);
  const [custom, setCustom] = useState<string | null>(null); // frame image chosen from the gallery
  const [tracking, setTracking] = useState(false);
  const [aspect, setAspect] = useState(2);
  const [cut, setCut] = useState<{ uri: string; aspect: number } | null>(null);
  const [cutBusy, setCutBusy] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [camErr, setCamErr] = useState(false);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [outUri, setOutUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const view = useRef({ w: 390, h: 800 });
  const mounted = useRef(true);
  const liveRef = useRef<View>(null);
  const frozenRef = useRef<View>(null);
  const camRef = useRef<CameraView>(null);
  const shootRef = useRef<Shoot | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingRef = useRef(false);
  const lastSeenJs = useRef(0);
  const { items } = useProducts('(product_type:Eyeglasses OR product_type:Sunglasses OR product_type:"Optical Frame") AND available_for_sale:true', 'BEST_SELLING', false, 20);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (lostTimer.current) clearTimeout(lostTimer.current);
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (mounted.current) setAppActive(st === 'active'); });
    return () => sub.remove();
  }, []);

  const say = useCallback((m: string) => {
    if (!mounted.current) return;
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { if (mounted.current) setToast(null); }, 3500);
  }, []);

  useEffect(() => {
    const h = route.params?.handle;
    if (!h) return;
    let live = true;
    fetchProduct(h, lang === 'ar' ? 'AR' : 'EN').then((p) => {
      if (live && p) { setPicked(p); setCustom(null); nav.setParams({ handle: undefined } as never); }
    }).catch(() => {});
    return () => { live = false; };
  }, [route.params?.handle, lang, nav]);
  if (!picked && items.length) setPicked(items[0]); // default to the first best-seller until the user picks one

  // Cut-out source: gallery upload, else the product photo at 640 px.
  const pickedImg = picked?.featuredImage?.url;
  const source = custom ?? sized(pickedImg, 640);
  const [cutFor, setCutFor] = useState<string | null | undefined>(undefined);
  if (cutFor !== source) { setCutFor(source); setCut(null); setCutBusy(!!source); } // new source: drop the old cut-out
  useEffect(() => {
    if (!source) return;
    let live = true;
    cutout(source)
      .then((c) => { if (live) { setCut(c); setAspect(c.aspect); setCutBusy(false); } })
      .catch(() => { if (live) { setCut(null); setCutBusy(false); } }); // fall back to the plain image
    return () => { live = false; };
  }, [source]);

  // ---- Pose: JS thread writes targets, UI thread smooths them every frame ----
  const tx = useSharedValue(195), ty = useSharedValue(300), tw = useSharedValue(240), tr = useSharedValue(0), ts = useSharedValue(1);
  const cx = useSharedValue(195), cy = useSharedValue(300), fw = useSharedValue(240), rot = useSharedValue(0), sx = useSharedValue(1);
  const seen = useSharedValue(0);          // last time a usable face arrived (ms)
  const snap = useSharedValue(true);       // jump straight to target (first detection / reset)
  const hold = useSharedValue(false);      // freeze pose while a photo is shown
  const manual = useSharedValue(!auto);    // no tracking: frame always visible
  const vis = useSharedValue(auto ? 0 : 1);
  const asp = useSharedValue(2);
  const dx = useSharedValue(0), dy = useSharedValue(0), sc = useSharedValue(1), rAdj = useSharedValue(0);
  const sdx = useSharedValue(0), sdy = useSharedValue(0), ssc = useSharedValue(1), sr = useSharedValue(0);
  useEffect(() => { asp.set(aspect); }, [aspect, asp]);
  useEffect(() => { manual.set(!auto); }, [auto, manual]);

  useFrameCallback((fi) => {
    'worklet';
    if (hold.get()) return;
    const dt = fi.timeSincePreviousFrame ?? 16;
    if (snap.get()) {
      cx.set(tx.get()); cy.set(ty.get()); fw.set(tw.get()); rot.set(tr.get()); sx.set(ts.get());
      snap.set(false);
    } else {
      const dist = Math.hypot(tx.get() - cx.get(), ty.get() - cy.get());
      const b = speedBoost(dist, fw.get());
      cx.set(stepToward(cx.get(), tx.get(), dt, b, DEAD_PX));
      cy.set(stepToward(cy.get(), ty.get(), dt, b, DEAD_PX));
      fw.set(stepToward(fw.get(), tw.get(), dt, b, DEAD_PX));
      rot.set(stepAngle(rot.get(), tr.get(), dt, b, 0.05));
      sx.set(stepToward(sx.get(), ts.get(), dt, b, 0.002));
    }
    const want = manual.get() || Date.now() - seen.get() < LOST_MS ? 1 : 0;
    vis.set(vis.get() + ((want - vis.get()) * (1 - Math.exp(-dt / (want ? 60 : 110)))));
  });

  const placeDefault = useCallback(() => {
    const { w, h } = view.current;
    tx.set(w / 2); ty.set(h * 0.4); tw.set(w * 0.62); tr.set(0); ts.set(1);
    snap.set(true);
  }, [tx, ty, tw, tr, ts, snap]);
  useEffect(() => { if (!auto) placeDefault(); }, [auto, placeDefault]);

  const markTracking = useCallback((on: boolean) => {
    if (trackingRef.current === on || !mounted.current) return;
    trackingRef.current = on;
    setTracking(on);
  }, []);

  const onFace = useCallback((smp: FaceSample | null) => {
    if (!mounted.current || !smp) return; // a lost face keeps the last pose; the frame callback fades it out
    const fit = computeFit(smp, view.current);
    if (!fit) return;
    const now = Date.now();
    if (now - lastSeenJs.current > LOST_MS) snap.set(true);
    lastSeenJs.current = now;
    tx.set(fit.cx); ty.set(fit.cy); tw.set(fit.width); tr.set(fit.rotDeg); ts.set(fit.scaleX);
    seen.set(now);
    markTracking(true);
    if (lostTimer.current) clearTimeout(lostTimer.current);
    lostTimer.current = setTimeout(() => markTracking(false), LOST_MS + 50);
  }, [tx, ty, tw, tr, ts, seen, snap, markTracking]);

  // Test hook: a browser test page can define window.__BARAKAT_SIM__ () => FaceSample | null to simulate a tracked face.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g = globalThis as unknown as { __BARAKAT_SIM__?: () => FaceSample | null };
    if (!g.__BARAKAT_SIM__) return;
    const id = setInterval(() => onFace(g.__BARAKAT_SIM__!()), 50);
    return () => clearInterval(id);
  }, [onFace]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart(() => { sdx.set(dx.get()); sdy.set(dy.get()); })
      .onUpdate((e) => { dx.set(sdx.get() + e.translationX); dy.set(sdy.get() + e.translationY); });
    const pinch = Gesture.Pinch()
      .onStart(() => { ssc.set(sc.get()); })
      .onUpdate((e) => { sc.set(Math.min(2.5, Math.max(0.5, ssc.get() * e.scale))); });
    const rotate = Gesture.Rotation()
      .onStart(() => { sr.set(rAdj.get()); })
      .onUpdate((e) => { rAdj.set(sr.get() + (e.rotation * 180) / Math.PI); });
    return Gesture.Simultaneous(pan, pinch, rotate);
  }, [sdx, sdy, dx, dy, ssc, sc, sr, rAdj]);

  const style = useAnimatedStyle(() => {
    const w = fw.get() * sc.get();
    const h = w / asp.get();
    return {
      width: w, height: h, opacity: vis.get(),
      transform: [
        { translateX: cx.get() + dx.get() - w / 2 }, { translateY: cy.get() + dy.get() - h / 2 },
        { rotateZ: `${rot.get() + rAdj.get()}deg` }, { scaleX: sx.get() },
      ],
    };
  });

  const resetAdjust = () => { dx.set(0); dy.set(0); sc.set(1); rAdj.set(0); if (!auto) placeDefault(); };
  const onLayout = (e: LayoutChangeEvent) => { view.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; if (!auto) placeDefault(); };

  // ---- Capture ----
  // Non-native camera (Expo Go / web sim): take the still through expo-camera.
  useEffect(() => {
    if (auto && Auto) return;
    shootRef.current = async () => {
      try {
        const pic = await camRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: false });
        return pic?.uri ? { uri: pic.uri, mirror: facing === 'front' } : null;
      } catch { return null; }
    };
    return () => { shootRef.current = null; };
  }, [auto, facing]);

  const finalize = useCallback(async () => {
    try {
      const uri = await captureRef(frozenRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      if (!mounted.current) return;
      setOutUri(uri);
    } catch {
      if (!mounted.current) return;
      hold.set(false); snap.set(true); setFrozen(null);
      say(L('تعذر حفظ الصورة', 'Could not save the photo'));
    } finally { if (mounted.current) setBusy(false); }
  }, [hold, snap, say, L]);

  // Composite path: wait for the camera still to load under the frame, then flatten it. A timer covers a missed onLoad.
  const composedRef = useRef(false);
  useEffect(() => {
    if (!frozen?.composite) return;
    composedRef.current = false;
    const id = setTimeout(() => { if (!composedRef.current) { composedRef.current = true; finalize(); } }, 2500);
    return () => clearTimeout(id);
  }, [frozen, finalize]);
  const onFrozenError = useCallback(() => {
    if (!frozen?.composite || composedRef.current) return;
    composedRef.current = true;
    hold.set(false); snap.set(true); setFrozen(null); setBusy(false);
    say(L('تعذر تحميل الصورة', 'Could not load the photo'));
  }, [frozen, hold, snap, say, L]);
  const onFrozenLoad = useCallback(() => {
    if (!frozen?.composite || composedRef.current) return;
    composedRef.current = true;
    setTimeout(() => { if (mounted.current) finalize(); }, 60); // one frame so the overlay is laid out
  }, [frozen, finalize]);

  const takePicture = async () => {
    if (busy || frozen) return;
    setBusy(true);
    try {
      const shot = shootRef.current ? await shootRef.current() : null;
      if (!mounted.current) return;
      if (shot) {
        if (auto && vis.get() < 0.05) say(L('لم يتم رصد الوجه، قد تظهر الصورة بدون النظارة', 'No face tracked: the photo may have no glasses'));
        hold.set(true);
        setFrozen({ ...shot, composite: true });
        return; // finalize() clears busy
      }
      // Fallback: grab the screen view (camera preview + frame) exactly as shown.
      const uri = await captureRef(liveRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      if (!mounted.current) return;
      hold.set(true);
      setFrozen({ uri, mirror: false, composite: false });
      setOutUri(uri);
      setBusy(false);
    } catch {
      if (mounted.current) { setBusy(false); say(L('تعذر التقاط الصورة', 'Could not take the photo')); }
    }
  };

  const retake = () => {
    hold.set(false); snap.set(true);
    lastSeenJs.current = 0;
    setFrozen(null); setOutUri(null); setBusy(false);
  };

  const share = async () => {
    if (!outUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) { say(L('المشاركة غير متاحة على هذا الجهاز', 'Sharing is not available on this device')); return; }
      await Sharing.shareAsync(outUri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: L('مشاركة الصورة', 'Share photo') });
    } catch { say(L('تعذرت المشاركة', 'Could not share')); }
  };

  const uploadFrame = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!mounted.current || r.canceled || !r.assets?.[0]?.uri) return;
      let uri = r.assets[0].uri;
      try {
        const m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 640 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
        if (m?.uri) uri = m.uri;
      } catch { /* keep the original image */ }
      if (!mounted.current) return;
      setCustom(uri);
    } catch { say(L('تعذر فتح المعرض', 'Could not open the gallery')); }
  };

  if (perm.loading) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!perm.granted) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={56} color={colors.red} />
        <T style={{ textAlign: 'center', fontFamily: font.bold, fontSize: 17 }}>{t('camPerm')}</T>
        <Button title={t('grant')} onPress={perm.request} />
        <Pressable onPress={() => { Linking.openSettings().catch(() => {}); }} accessibilityRole="button" hitSlop={10}>
          <Text style={{ color: colors.red, fontFamily: font.medium, fontSize: 14 }}>{L('فتح الإعدادات', 'Open settings')}</Text>
        </Pressable>
      </View>
    );
  }

  const tn = TINTS.find((x) => x.id === tint)!;
  const hint = camErr ? L('تعذر تشغيل الكاميرا', 'Camera unavailable') : auto ? (tracking ? t('tryOnAuto') : t('tryOnNoFace')) : t('tryOnHint');
  const plainImg = custom ?? pickedImg;

  const overlayBody = (
    <>
      {cut ? (
        <Image source={cut.uri} style={StyleSheet.absoluteFill} contentFit="fill" />
      ) : plainImg && !cutBusy ? (
        // fallback if the cut-out fails: multiply hides the white background on native
        <View style={[StyleSheet.absoluteFill, { mixBlendMode: 'multiply' }]}>
          <Image source={custom ?? sized(pickedImg, 640)} style={StyleSheet.absoluteFill} contentFit="contain"
            onLoad={(e) => { const { width, height } = e.source; if (width && height) setAspect(width / height); }} />
        </View>
      ) : null}
      {cut && tn.opacity > 0 && <View pointerEvents="none" style={[s.lensTint, { backgroundColor: tn.color, opacity: tn.opacity }]} />}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={onLayout}>
      <View ref={liveRef} collapsable={false} style={StyleSheet.absoluteFill}>
        {auto && Auto
          ? <Auto.AutoCamera facing={facing} active={focused && appActive && !frozen} onFace={onFace} onError={() => { if (mounted.current) setCamErr(true); }} shootRef={shootRef} />
          : <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing={facing} onMountError={() => { if (mounted.current) setCamErr(true); }} />}
        {plainImg && !frozen && (
          <GestureDetector gesture={gesture}>
            <Animated.View style={[s.frame, style]}>{overlayBody}</Animated.View>
          </GestureDetector>
        )}
      </View>
      {(!auto || !tracking) && !frozen ? <View pointerEvents="none" style={s.guide}><View style={s.oval} /></View> : null}

      {frozen && (
        <View ref={frozenRef} collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
          <Image source={frozen.uri} style={[StyleSheet.absoluteFill, frozen.mirror && { transform: [{ scaleX: -1 }] }]}
            contentFit="cover" onLoad={onFrozenLoad} onError={onFrozenError} />
          {frozen.composite && plainImg && <Animated.View pointerEvents="none" style={[s.frame, style]}>{overlayBody}</Animated.View>}
        </View>
      )}

      {cutBusy && !frozen && (
        <View pointerEvents="none" style={s.spinner}><ActivityIndicator color="#fff" size="large" /></View>
      )}
      {(busy && !!frozen) && (
        <View pointerEvents="none" style={s.spinner}><ActivityIndicator color="#fff" size="large" /></View>
      )}

      {!frozen && (
        <View style={[s.top, { paddingTop: insets.top + 8, flexDirection: row }]}>
          <View style={s.hintPill}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
              {auto && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tracking ? colors.success : colors.amber }} />}
              <Text style={{ color: '#fff', fontFamily: font.medium, fontSize: 13 }}>{hint}</Text>
            </View>
          </View>
          <View style={{ flexDirection: row, gap: 8 }}>
            <Pressable style={s.round} onPress={resetAdjust} accessibilityRole="button" accessibilityLabel={t('reset')}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </Pressable>
            <Pressable style={s.round} onPress={() => { setFacing((f) => (f === 'front' ? 'back' : 'front')); setCamErr(false); lastSeenJs.current = 0; snap.set(true); }} accessibilityRole="button" accessibilityLabel={t('flip')}>
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {toast ? (
        <View pointerEvents="none" style={[s.toast, { top: insets.top + 64 }]}>
          <Text style={{ color: '#fff', fontFamily: font.medium, fontSize: 13, textAlign: 'center' }}>{toast}</Text>
        </View>
      ) : null}

      {frozen ? (
        <View style={[s.resultBar, { paddingBottom: insets.bottom + 24, flexDirection: row }]}>
          <Pressable style={[s.pill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={retake} accessibilityRole="button" accessibilityLabel={L('إعادة التقاط', 'Retake')}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={s.pillTxt}>{L('إعادة التقاط', 'Retake')}</Text>
          </Pressable>
          <Pressable style={[s.pill, { backgroundColor: colors.red, opacity: outUri ? 1 : 0.5 }]} disabled={!outUri} onPress={share} accessibilityRole="button" accessibilityLabel={L('مشاركة', 'Share')}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={s.pillTxt}>{L('مشاركة', 'Share')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 90 }]}>
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <Pressable onPress={takePicture} disabled={busy || camErr} accessibilityRole="button" accessibilityLabel={t('snap')}
              style={[s.shutter, (busy || camErr) && { opacity: 0.5 }]}>
              <View style={s.shutterIn} />
            </Pressable>
          </View>
          <View style={{ flexDirection: row, gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
            {TINTS.map((x) => <Chip key={x.id} label={t(x.key)} active={tint === x.id} onPress={() => setTint(x.id)} />)}
          </View>
          <FlatList horizontal data={items} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            inverted={lang === 'ar'}
            ListHeaderComponent={(
              <Pressable onPress={uploadFrame} accessibilityRole="button" accessibilityLabel={L('رفع صورة إطار', 'Upload a frame photo')}
                style={[s.thumb, { marginEnd: 10 }, custom ? { borderColor: colors.red } : null]}>
                <Ionicons name="image-outline" size={24} color={colors.red} />
              </Pressable>
            )}
            renderItem={({ item }) => (
              <Pressable onPress={() => { setCustom(null); setPicked(item); }} accessibilityRole="button" accessibilityLabel={item.title}
                style={[s.thumb, !custom && picked?.id === item.id && { borderColor: colors.red }]}>
                <Image source={sized(item.featuredImage?.url, 200)} style={{ width: 76, height: 50 }} contentFit="contain" />
              </Pressable>
            )} />
          {picked && (
            <Pressable onPress={() => nav.navigate('Product', { handle: picked.handle })} style={{ marginTop: 10, marginHorizontal: 20, flexDirection: row, alignSelf: 'center', alignItems: 'center', gap: 4, maxWidth: '100%' }} accessibilityRole="button">
              <Text numberOfLines={1} style={{ flexShrink: 1, color: '#fff', fontFamily: font.bold, fontSize: 14, lineHeight: 21 }}>{picked.title}</Text>
              <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function AutoScreen() {
  const p = Auto!.useAutoPermission();
  return <Shell perm={p} auto />;
}
function ManualScreen() {
  const [perm, ask] = useCameraPermissions();
  const sim = Platform.OS === 'web' && !!(globalThis as unknown as { __BARAKAT_SIM__?: unknown }).__BARAKAT_SIM__;
  return <Shell perm={{ granted: !!perm?.granted, loading: !perm, request: () => { ask(); } }} auto={sim} />;
}

export default function TryOnScreen() {
  return Auto ? <AutoScreen /> : <ManualScreen />;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },
  guide: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  oval: { width: 240, height: 320, borderRadius: 160, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', borderStyle: 'dashed' },
  frame: { position: 'absolute', left: 0, top: 0 },
  lensTint: { position: 'absolute', left: '14%', right: '14%', top: '26%', height: '46%', borderRadius: 40 },
  top: { position: 'absolute', top: 0, left: 16, right: 16, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hintPill: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 1 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, backgroundColor: 'rgba(30,8,10,0.72)' },
  spinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  resultBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingHorizontal: 20, gap: 12, justifyContent: 'center', backgroundColor: 'rgba(30,8,10,0.55)' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 48, borderRadius: radius.pill },
  pillTxt: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterIn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
  thumb: { width: 88, height: 62, borderRadius: radius.sm, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
});
