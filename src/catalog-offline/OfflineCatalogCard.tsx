// Settings card: offline catalog toggle, size, last sync, storage cap, clear. Mount in MoreScreen: <OfflineCatalogCard />
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { colors, font, radius } from '../theme';
import { CAP_CHOICES_MB, clearOfflineData, setOfflineEnabled, setStorageCapMB, syncCatalog, useCatalogSync } from './sync';

const mb = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function OfflineCatalogCard() {
  const { lang, rtl } = useI18n();
  const ar = lang === 'ar';
  const s = useCatalogSync();
  const L = ar ? 'AR' : 'EN';
  const busy = s.status === 'downloading' || s.status === 'images' || s.status === 'waiting';
  const when = s.lastSync ? new Date(s.lastSync).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : (ar ? 'لم تتم المزامنة بعد' : 'Never');
  const note = s.status === 'waiting' ? (s.waitingFor === 'charging' ? (ar ? 'بانتظار الشاحن' : 'Waiting for charger') : (ar ? 'بانتظار شبكة Wi-Fi' : 'Waiting for Wi-Fi'))
    : s.status === 'downloading' ? (ar ? `تنزيل المنتجات ${Math.round(s.progress * 100)}٪` : `Downloading products ${Math.round(s.progress * 100)}%`)
    : s.status === 'images' ? (ar ? `تنزيل الصور ${Math.round(s.progress * 100)}٪` : `Downloading images ${Math.round(s.progress * 100)}%`)
    : s.status === 'error' ? (ar ? 'تعذّرت المزامنة، سيعاد المحاولة' : 'Sync failed, will retry')
    : s.status === 'done' ? (ar ? 'جاهز للاستخدام بدون إنترنت' : 'Ready for offline use') : '';
  const row = { flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' } as const;
  const txt = { color: colors.text, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' } as const;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line }}>
      <View style={row}>
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          <Text style={[txt, { fontSize: 15, fontFamily: font.bold }]}>{ar ? 'تنزيل الكتالوج كاملاً للاستخدام بدون إنترنت' : 'Download full catalog for offline'}</Text>
          <Text style={[txt, { fontSize: 12, color: colors.muted, marginTop: 2 }]}>{ar ? 'عبر Wi-Fi فقط، ويُحدَّث تلقائياً كل ٢٤ ساعة' : 'Wi-Fi only, refreshed automatically every 24 hours'}</Text>
        </View>
        <Switch value={s.enabled} onValueChange={(v) => { setOfflineEnabled(v, L).catch(() => {}); }} trackColor={{ true: colors.red, false: colors.line }} thumbColor={colors.card} />
      </View>
      {s.enabled && (
        <>
          {busy && <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}><View style={{ width: `${Math.round(s.progress * 100)}%`, height: 6, backgroundColor: colors.red }} /></View>}
          {!!note && <Text style={[txt, { fontSize: 12.5, color: s.status === 'error' ? colors.red : colors.muted }]}>{note}</Text>}
          <View style={row}><Text style={[txt, { fontSize: 13 }]}>{ar ? 'المساحة المستخدمة' : 'Storage used'}</Text><Text style={[txt, { fontSize: 13, fontFamily: font.bold }]}>{mb(s.sizeBytes)}</Text></View>
          <View style={row}><Text style={[txt, { fontSize: 13 }]}>{ar ? 'آخر مزامنة' : 'Last sync'}</Text><Text style={[txt, { fontSize: 13, fontFamily: font.bold }]}>{when}</Text></View>
          <View style={{ gap: 6 }}>
            <Text style={[txt, { fontSize: 13 }]}>{ar ? 'الحد الأقصى للصور' : 'Image storage limit'}</Text>
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8 }}>
              {CAP_CHOICES_MB.map((c) => (
                <Pressable key={c} onPress={() => { setStorageCapMB(c).catch(() => {}); }} accessibilityRole="button"
                  style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: s.capMB === c ? colors.red : colors.bg, borderWidth: 1, borderColor: s.capMB === c ? colors.red : colors.line }}>
                  <Text style={{ color: s.capMB === c ? '#fff' : colors.text, fontSize: 13, fontFamily: font.bold }}>{ar ? `${c} م.ب` : `${c} MB`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
            <Pressable disabled={busy} onPress={() => { syncCatalog(L, { force: true }).catch(() => {}); }} accessibilityRole="button" style={{ opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: colors.red, fontSize: 13, fontFamily: font.bold }}>{ar ? 'مزامنة الآن' : 'Sync now'}</Text>
            </Pressable>
          </View>
        </>
      )}
      <Pressable accessibilityRole="button" onPress={() => Alert.alert(ar ? 'مسح البيانات' : 'Clear offline data', ar ? 'سيتم حذف الكتالوج والصور المحفوظة.' : 'Saved catalog and images will be deleted.', [
        { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' }, { text: ar ? 'مسح' : 'Clear', style: 'destructive', onPress: () => { clearOfflineData().catch(() => {}); } }])}>
        <Text style={[txt, { fontSize: 13, color: colors.red, fontFamily: font.bold }]}>{ar ? 'مسح البيانات المحفوظة' : 'Clear offline data'}</Text>
      </Pressable>
    </View>
  );
}
