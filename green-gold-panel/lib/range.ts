export type RangeKey = 'month' | '7d' | '30d';

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'Bu ay',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
};

export function normalizeRange(raw?: string): RangeKey {
  return raw === '7d' || raw === '30d' ? raw : 'month';
}

// NOT: Preset tarih hesabı (7g/30g) artık panelde YAPILMAZ. Aralık, otelin
// timezone'unu bilen backend'de çözülür (#8 çözüldü). Panel yalnızca `range`
// anahtarını API'ye geçer.
