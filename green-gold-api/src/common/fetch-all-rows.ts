/**
 * PostgREST her okuma yanıtını projenin "max rows" ayarıyla (Supabase
 * varsayılanı 1000) KESER ve hata dönmez. Sayım/toplam üreten sorgular tek
 * istekle okunursa, o sınırı aşan bir otelde panel sessizce eksik sayı
 * gösterir. Bu yardımcı sorguyu sayfa sayfa okur.
 *
 * Sayfa, dönen satır sayısı kadar ilerler ve boş sayfada durur: böylece
 * proje sınırı PAGE_SIZE'dan küçük ayarlanmış olsa da hiçbir satır atlanmaz.
 * Sorgu KARARLI bir sıralama içermelidir (ör. created_at + id), yoksa sayfalar
 * arasında satır kayabilir.
 */
export const PAGE_SIZE = 1000;
/** Sonsuz döngü emniyeti: 500 sayfa = 500.000 satır. */
const MAX_PAGES = 500;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T> & { data: T[] }> {
  const rows: T[] = [];
  let from = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const batch = data ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
    from += batch.length;
  }
  return { data: rows, error: null };
}
