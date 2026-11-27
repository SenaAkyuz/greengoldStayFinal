/**
 * Raporlar ekranının saf mantığı (UX-5.x). Yalnız API'nin verdiği sayılardan
 * türetir; veri yoksa "—" döner, sıfıra bölme yapılmaz.
 */
import type { RangeKey } from '../range';

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Karşılaştırma için önceki dönem. "Bu ay" (1–N): önceki ayın aynı günleri
 * (1–N; ay kısaysa ayın sonu). Son 7/30 gün: hemen öncesindeki eşit uzunluk.
 */
export function previousPeriod(
  range: RangeKey,
  period: { from: string; to: string } | null | undefined,
): { from: string; to: string } | null {
  if (!period) return null;
  const f = parse(period.from);
  const t = parse(period.to);
  if (!Number.isFinite(f.getTime()) || !Number.isFinite(t.getTime()) || f > t) return null;
  if (range === 'month') {
    const y = f.getUTCFullYear();
    const m = f.getUTCMonth();
    const lastDayPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m - 1, Math.min(t.getUTCDate(), lastDayPrev)));
    return { from: ymd(from), to: ymd(to) };
  }
  const len = Math.round((t.getTime() - f.getTime()) / DAY) + 1;
  const to = new Date(f.getTime() - DAY);
  const from = new Date(to.getTime() - (len - 1) * DAY);
  return { from: ymd(from), to: ymd(to) };
}

/** Oran: payda 0 ise null (ekranda "—"), %0 DEĞİL (UX-5.1). */
export function safeRatio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || !Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

/** Önceki döneme göre değişim metni ("+12 %", "−3 %", "değişmedi", önceki 0 ise "yeni"). */
export function deltaText(current: number | null | undefined, previous: number | null | undefined): string | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 'değişmedi' : 'önceki dönemde yoktu';
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return 'değişmedi';
  const v = Math.round(Math.abs(pct)).toLocaleString('tr-TR');
  return `${pct > 0 ? '+' : '−'}%${v}`;
}

/** Kısa gün etiketi (tr-TR): "27 Kas". */
export function dayLabel(date: string): string {
  const d = parse(date);
  if (!Number.isFinite(d.getTime())) return date;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/** Metrik sözlüğü — kartların altında ve "Bu metrikler ne anlama gelir?" bölümünde. */
export const METRIC_GLOSSARY = [
  { term: 'Görüntülenme', text: 'Misafir ekranının (widget) yüklendiği tekil oturum. Aynı misafirin sayfayı yenilemesi tek oturumdur.' },
  { term: 'Katkı seçimi', text: 'Misafirin gönüllü katkı seçeneğini işaretlediği oturum. Ödeme ya da tahsilat değildir.' },
  { term: 'Katkı niyeti', text: 'Misafirin “Tercihimi kaydet” düğmesine bastığı oturum. Rezervasyona ücret eklenmez; gerçek ödeme ayrıca, rezervasyon sistemi üzerinden yapılır.' },
  { term: 'Seçim oranı', text: 'Katkı seçimi / görüntülenme. Görüntülenme yoksa hesaplanmaz (“—”).' },
  { term: 'Uçtan uca oran', text: 'Katkı niyeti / görüntülenme: misafir ekranını gören oturumların ne kadarının tercihini kaydettiği.' },
  { term: 'Tahmini emisyon', text: 'Katkı niyeti bildiren konaklamaların oda-gece sayısı × gecelik tahmini emisyon (kg CO₂e). Tahmindir; doğrulanmış bir emisyon beyanı ya da dengeleme değildir.' },
] as const;

/** En fazla `max` ondalık (tam sayıda ondalık yok): 4,3 · 0,687 · 1.240. */
export function fmtMax(n: number | null | undefined, max = 3): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: max });
}
