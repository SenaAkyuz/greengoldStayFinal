import { RANGE_LABELS, type RangeKey } from '@/lib/range';
import { SegmentedTabs } from './ui';

const ORDER: RangeKey[] = ['month', '7d', '30d'];

/**
 * Tarih aralığı seçimi (bu ay / 7 gün / 30 gün). G2: görünüm tasarım
 * dilinin `SegmentedTabs` bileşeni; adresler ve davranış aynı
 * (`?range=`, "bu ay" parametresiz).
 */
export function RangePills({
  active,
  basePath = '/',
}: {
  active: RangeKey;
  basePath?: string;
}) {
  return (
    <SegmentedTabs
      label="Tarih aralığı"
      activeKey={active}
      items={ORDER.map((key) => ({
        key,
        label: RANGE_LABELS[key],
        href: key === 'month' ? basePath : `${basePath}?range=${key}`,
      }))}
    />
  );
}
