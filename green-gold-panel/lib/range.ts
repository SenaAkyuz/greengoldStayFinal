export type RangeKey = 'month' | '7d' | '30d';

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'Bu ay',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
};

export function normalizeRange(raw?: string): RangeKey {
  return raw === '7d' || raw === '30d' ? raw : 'month';
}

// YYYY-MM-DD (sunucu yerel tarihi — pilot tz Istanbul ile örtüşür).
function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * Range -> from/to. `month` için from/to boş bırakılır; backend zaten otelin
 * timezone'una göre içinde bulunulan ayı hesaplar. `7d`/`30d` gün sayısına göre.
 *
 * TODO: multi-tz — 7g/30g şu an sunucu yerel gününe göre hesaplanıyor; tek
 * İstanbul pilotu için makul. Çok-tz desteği Adım 6'da otel timezone'una taşınacak.
 */
export function rangeToDates(range: RangeKey): {
  from?: string;
  to?: string;
} {
  if (range === 'month') return {};
  const days = range === '7d' ? 7 : 30;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1)); // bugün dahil N gün
  return { from: ymd(from), to: ymd(to) };
}
