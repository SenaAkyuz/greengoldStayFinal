/**
 * Karbon ölçümü ekranlarının durum sözlüğü — görünümden bağımsız.
 *
 * İş mantığı bir durumu buradaki koda eşler; ekran yalnızca `label`, `tone`
 * ve `help` metnini gösterir. Ton → renk eşlemesi tasarım token'larındadır.
 * Metinler otel kullanıcısına yöneliktir: teknik terim, uç nokta adı veya
 * sağlayıcı iç kodu içermez.
 */

export type UiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'pending';

export interface StatusView {
  label: string;
  tone: UiTone;
  help: string;
}

/** Bir ayın (raporlama döneminin) durumu. */
export type PeriodStatus =
  | 'future' // ay henüz gelmedi
  | 'in_progress' // ay sürüyor, veri girilemez
  | 'empty' // ay bitti, veri girilmedi
  | 'draft' // bazı veriler girildi, gönderilmedi
  | 'awaiting_approval' // gönderildi, onay bekleniyor
  | 'blocked' // hesap yapılamıyor (ör. yakıt türü gerekli)
  | 'preview_only' // hesaplandı ama yayına uygun değil (ör. ülke faktörü)
  | 'calculated' // hesaplandı, yayına hazır
  | 'published'; // widget fiyatı bu ölçümden

const PERIOD: Record<PeriodStatus, StatusView> = {
  future: {
    label: 'Gelecek ay',
    tone: 'neutral',
    help: 'Bu ay henüz başlamadı.',
  },
  in_progress: {
    label: 'Ay sürüyor',
    tone: 'neutral',
    help: 'Ay bitince veri girilebilir.',
  },
  empty: {
    label: 'Veri bekleniyor',
    tone: 'warning',
    help: 'Bu ayın tüketim ve doluluk bilgilerini girin.',
  },
  draft: {
    label: 'Eksik bilgi',
    tone: 'warning',
    help: 'Bazı bilgiler girildi; tamamlayıp gönderin.',
  },
  awaiting_approval: {
    label: 'Onay bekliyor',
    tone: 'pending',
    help: 'Kayıtlar ölçüm ortağımızda onay bekliyor. Onaylanınca hesap yapılır.',
  },
  blocked: {
    label: 'İşlem gerekli',
    tone: 'danger',
    help: 'Bazı kalemler hesaplanamadı. Ayrıntıları dönem sayfasında görün.',
  },
  preview_only: {
    label: 'Yalnız önizleme',
    tone: 'info',
    help: 'Hesap yapıldı, ancak bir faktör doğrulanamadığı için misafire gösterilmez.',
  },
  calculated: {
    label: 'Hesaplandı',
    tone: 'success',
    help: 'Sonuç hazır. İncelendikten sonra misafir ekranına alınabilir.',
  },
  published: {
    label: 'Yayında',
    tone: 'success',
    help: 'Misafir ekranındaki tahmini katkı bu ölçüme dayanıyor.',
  },
};

export function periodStatusView(status: PeriodStatus): StatusView {
  return PERIOD[status];
}

/** Tek bir tüketim kaydının gönderim durumu. */
export type RecordStatus =
  | 'sending'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'outcome_unknown';

const RECORD: Record<RecordStatus, StatusView> = {
  sending: {
    label: 'Gönderiliyor',
    tone: 'neutral',
    help: 'Kayıt iletiliyor.',
  },
  pending_approval: {
    label: 'Onay bekliyor',
    tone: 'pending',
    help: 'Kayıt alındı, onaylanmayı bekliyor.',
  },
  approved: {
    label: 'Onaylandı',
    tone: 'success',
    help: 'Kayıt hesaba dahil edilir.',
  },
  rejected: {
    label: 'Kabul edilmedi',
    tone: 'danger',
    help: 'Kayıt kabul edilmedi; nedeni yanında yazıyor. Düzeltip yeniden gönderin.',
  },
  outcome_unknown: {
    label: 'Sonuç belirsiz',
    tone: 'warning',
    help: 'Bağlantı yanıt vermeden kesildi. Aynı kaydı yeniden göndermek güvenlidir; mükerrer kayıt oluşmaz.',
  },
};

export function recordStatusView(status: RecordStatus): StatusView {
  return RECORD[status];
}

/**
 * Sonucu belirsiz/reddedilen kayıt yeniden gönderilebilir mi?
 * Mükerrer koruması: yeniden gönderim AYNI kayıt kimliğiyle yapılır
 * (sağlayıcı aynı kimliği günceller); onaylı veya yolda olan kayıt tekrar
 * gönderilmez.
 */
export function canResend(status: RecordStatus): boolean {
  return status === 'outcome_unknown' || status === 'rejected';
}

// --- Biçimlendirme (tr-TR) ---------------------------------------------------

const nf = (digits: number) =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** null/NaN → null (ekran "—" gösterir; eksik veri 0 yazılmaz). */
export function formatNumber(
  value: number | null | undefined,
  digits = 0,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return nf(digits).format(value);
}

/** kg → uygun birim: < 1000 kg ise kg, değilse t. */
export function formatEmission(kg: number | null | undefined): {
  value: string | null;
  unit: string;
} {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) {
    return { value: null, unit: 'kg CO₂e' };
  }
  return Math.abs(kg) >= 1000
    ? { value: formatNumber(kg / 1000, 2), unit: 't CO₂e' }
    : { value: formatNumber(kg, 1), unit: 'kg CO₂e' };
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string | null {
  const v = formatNumber(ratio === null || ratio === undefined ? null : ratio * 100, digits);
  return v === null ? null : `%${v}`;
}

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** "2026-10" → "Ekim 2026"; geçersizse girdi aynen döner. */
export function formatPeriod(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period;
}

export function monthShort(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return m ? MONTHS[Number(m[2]) - 1].slice(0, 3) : period;
}
