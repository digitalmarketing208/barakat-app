import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { colors, font } from '../theme';
import { useI18n } from '../i18n';
import { Button, Chip, T } from '../ui';
import { GENDERS, SHAPES } from '../catalog';
import { Sheet } from './Sheet';
import { Filters, NO_FILTERS, PRICES, countActive } from './filters';
import { useDir } from './dir';
import { useD } from './strings';
import { haptic } from './motion';
import { alpha } from './tint';

export function usePriceLabel() {
  const { t } = useI18n();
  const d = useD();
  return (id: string) => {
    const p = PRICES.find((x) => x.id === id);
    if (!p) return '';
    if (p.min == null) return `${d('under', { n: p.max! })} ${t('sar')}`;
    if (p.max == null) return `${d('over', { n: p.min })} ${t('sar')}`;
    return `${p.min} – ${p.max} ${t('sar')}`;
  };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const { row } = useDir();
  return (
    <View style={{ marginBottom: 20 }}>
      <T style={{ fontFamily: font.bold, fontSize: 14, marginBottom: 10 }}>{title}</T>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export function FilterSheet({ visible, value, brands, onApply, onClose }: {
  visible: boolean; value: Filters; brands: string[]; onApply: (f: Filters) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const { row } = useDir();
  const d = useD();
  const priceLabel = usePriceLabel();
  // Edits stay in a draft until "Show results", so the list behind does not refetch on every tap.
  const [f, setF] = useState<Filters>(value);
  const [was, setWas] = useState(visible);
  if (was !== visible) { setWas(visible); if (visible) setF(value); }
  const toggle = (k: 'shapes' | 'brands', id: string) => setF((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));
  const n = countActive(f);

  return (
    <Sheet visible={visible} onClose={onClose} title={d('filtersTitle')}
      action={n > 0 ? { label: d('resetAll'), onPress: () => { haptic.light(); setF(NO_FILTERS); } } : undefined}
      footer={<Button title={n > 0 ? `${d('showResults')} (${n})` : d('showResults')} onPress={() => { haptic.success(); onApply(f); }} />}>
      <Group title={d('gender')}>
        {GENDERS.map((g) => <Chip key={g.id} label={t(g.label)} active={f.gender === g.id} onPress={() => setF((p) => ({ ...p, gender: g.id }))} />)}
      </Group>
      <Group title={d('shape')}>
        {SHAPES.map((x) => <Chip key={x.id} label={t(x.label)} active={f.shapes.includes(x.id)} onPress={() => toggle('shapes', x.id)} />)}
      </Group>
      <Group title={d('priceRange')}>
        {PRICES.map((x) => <Chip key={x.id} label={priceLabel(x.id)} active={f.price === x.id} onPress={() => setF((p) => ({ ...p, price: p.price === x.id ? null : x.id }))} />)}
      </Group>
      {brands.length > 0 && (
        <Group title={d('brand')}>
          {brands.map((b) => <Chip key={b} label={b} active={f.brands.includes(b)} onPress={() => toggle('brands', b)} />)}
        </Group>
      )}
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.bold, fontSize: 14 }}>{d('availability')}</T>
          <T style={{ color: colors.muted, fontSize: 12.5 }}>{d('inStockOnly')}</T>
        </View>
        <Switch value={f.inStock} onValueChange={(v) => { haptic.tap(); setF((p) => ({ ...p, inStock: v })); }}
          trackColor={{ true: alpha(colors.red, 0.45), false: colors.line }} thumbColor={f.inStock ? colors.red : colors.card}
          accessibilityLabel={d('inStockOnly')} />
      </View>
    </Sheet>
  );
}
