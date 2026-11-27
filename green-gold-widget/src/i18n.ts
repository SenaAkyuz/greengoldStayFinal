import type { ContentOverrides, Lang } from './types';

interface Strings {
  heading: string;
  subheading: (hotel: string) => string;
  checkboxLabel: string;
  totalLabel: string;
  co2Label: string;
  estimatedBadge: string;
  perNight: (amount: string, rooms: number, nights: number) => string;
  addButton: string;
  confirmation: string;
  co2Note: string;
  previewBadge: string;
  impactLine: (co2: string, trees: string) => string;
  /** Başlık şeridindeki ikinci satır (otel adının altında). */
  brandLine: string;
  /** Başlık üstü küçük etiket. */
  eyebrow: string;
  /** Kaydedildikten sonra toplam satırının etiketi. */
  savedTotalLabel: string;
  /** Alttaki marka imzası: "<lead> GreenGold Stay". */
  signatureLead: string;
  stayLabel: string;
  stayValue: (nights: number, rooms: number) => string;
  footprintLabel: string;
  /** Fiyat kaynağı satırı (yalnız `carbon_pricing_demo` iken gösterilir). */
  sourceNote: (
    source: 'hotel' | 'regional' | undefined,
    measured: boolean,
    rooms: number,
  ) => string;
  /** Ölçüm tabanlı (Kapsam 1–2) tahminde ek dürüstlük notu. */
  measuredNote: string;
}

// Dürüstlük notu: bu widget karbon kredisi SATMAZ, offset ÜRETMEZ, ödeme
// almaz. Yalnızca misafirin bir sürdürülebilirlik tercihini kaydeder ve
// bunu host sayfaya bildirir — "karbon nötr" / "dengeledik" gibi doğrulanmamış
// iddialar YOK. Bkz. kök README'deki dürüstlük notu.
export const I18N: Record<Lang, Strings> = {
  tr: {
    heading: 'Daha sürdürülebilir bir konaklamayı destekle',
    subheading: (hotel) =>
      `${hotel}'in sürdürülebilirlik programını desteklemek için bir tercih — karbon nötrlüğü garanti etmez.`,
    checkboxLabel: 'Bu seçeneği tercih ediyorum',
    totalLabel: 'Toplam katkı',
    co2Label: 'Tahmini karbon etkisi',
    estimatedBadge: 'Tahmini',
    perNight: (amount, rooms, nights) =>
      rooms > 1
        ? `${amount} × ${rooms} oda × ${nights} gece`
        : `${amount} × ${nights} gece`,
    addButton: 'Tercihimi kaydet',
    confirmation:
      'Tercihinizi kaydettik. Rezervasyonunuza henüz herhangi bir ücret eklenmedi.',
    co2Note: 'Ayak izi tahminidir; kesin ölçüm değildir.',
    previewBadge: 'Önizleme',
    brandLine: 'Sürdürülebilir konaklama',
    eyebrow: 'Gönüllü katkı',
    savedTotalLabel: 'Seçtiğiniz katkı',
    signatureLead: 'Destekleyen:',
    stayLabel: 'Konaklamanız',
    stayValue: (nights, rooms) =>
      rooms > 1 ? `${nights} gece · ${rooms} oda` : `${nights} gece`,
    footprintLabel: 'Tahmini ayak iziniz',
    impactLine: (co2, _trees) =>
      `Bu ay bu otelde seçilen konaklamaların tahmini emisyonu ≈ ${co2} kg CO₂e`,
    sourceNote: (source, measured, rooms) =>
      `${
        measured
          ? 'Ölçülen enerji tüketimine dayalı tahmin (Kapsam 1 ve 2)'
          : source === 'hotel'
            ? 'Otel verileriyle tahmin'
            : 'Bölgesel tahmin'
      } · Temsili fiyat · ${rooms} oda`,
    // Karbon nötrlüğü uyarısı alt başlıkta (subheading) zaten var; tekrar edilmez.
    measuredNote: 'Doğrulanmış bir emisyon beyanı değildir.',
  },
  en: {
    heading: 'Support a more sustainable stay',
    subheading: (hotel) =>
      `A preference to support ${hotel}'s sustainability program — this does not guarantee carbon neutrality.`,
    checkboxLabel: 'I am interested in this option',
    totalLabel: 'Total contribution',
    co2Label: 'Estimated carbon impact',
    estimatedBadge: 'Estimated',
    perNight: (amount, rooms, nights) =>
      rooms > 1
        ? `${amount} × ${rooms} rooms × ${nights} night${nights === 1 ? '' : 's'}`
        : `${amount} × ${nights} night${nights === 1 ? '' : 's'}`,
    addButton: 'Save my preference',
    confirmation:
      'Your preference has been recorded. No charge has been added to your booking.',
    co2Note: 'The footprint is an estimate, not an exact measurement.',
    previewBadge: 'Preview',
    brandLine: 'Sustainable stay',
    eyebrow: 'Voluntary contribution',
    savedTotalLabel: 'Your selected contribution',
    signatureLead: 'Powered by',
    stayLabel: 'Your stay',
    stayValue: (nights, rooms) =>
      `${nights} night${nights === 1 ? '' : 's'}` +
      (rooms > 1 ? ` · ${rooms} rooms` : ''),
    footprintLabel: 'Your estimated footprint',
    impactLine: (co2, _trees) =>
      `This month, the estimated footprint of stays choosing this option ≈ ${co2} kg CO₂e`,
    sourceNote: (source, measured, rooms) =>
      `${
        measured
          ? 'Estimate based on measured energy use (Scope 1 and 2)'
          : source === 'hotel'
            ? 'Hotel-based estimate'
            : 'Regional estimate'
      } · Indicative price · ${rooms} room${rooms === 1 ? '' : 's'}`,
    measuredNote: 'This is not a verified emissions statement.',
  },
};

// Yalnızca bu alanlar otel bazlı override edilebilir (bkz. green-gold-api
// src/common/widget-settings.ts). Karbon/tahmin iddiası taşıyan metinler
// (subheading, co2Note, impactLine, estimatedBadge...) KASITLI OLARAK
// override edilemez — bir otelin yanıltıcı bir dürüstlük iddiası eklemesini
// mimari olarak imkânsız kılar.
export type OverridableField =
  | 'heading'
  | 'checkboxLabel'
  | 'addButton'
  | 'confirmation';

/**
 * Metin çözümleme sırası: otelin doğrulanmış override'ı -> güvenli platform
 * varsayılanı. Yalnızca BU dile ait override kullanılır (tenant-safe: başka
 * bir otelin override'ı asla karışmaz — config zaten tek otelden gelir).
 */
export function resolveStrings(
  lang: Lang,
  overrides?: ContentOverrides | null,
): Strings {
  const base = I18N[lang];
  const o = overrides?.[lang];
  if (!o) return base;
  return {
    ...base,
    heading: o.heading || base.heading,
    checkboxLabel: o.checkboxLabel || base.checkboxLabel,
    addButton: o.addButton || base.addButton,
    confirmation: o.confirmation || base.confirmation,
  };
}
