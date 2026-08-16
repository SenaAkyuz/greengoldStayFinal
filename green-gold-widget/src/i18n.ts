import type { ContentOverrides, Lang } from './types';

interface Strings {
  heading: string;
  subheading: (hotel: string) => string;
  checkboxLabel: string;
  totalLabel: string;
  co2Label: string;
  estimatedBadge: string;
  perNight: (amount: string, nights: number) => string;
  addButton: string;
  confirmation: string;
  co2Note: string;
  previewBadge: string;
  impactLine: (co2: string, trees: string) => string;
}

// Dürüstlük notu: bu widget karbon kredisi SATMAZ, offset ÜRETMEZ, ödeme
// almaz. Yalnızca misafirin bir sürdürülebilirlik tercihini kaydeder ve
// bunu host sayfaya bildirir — "karbon nötr" / "dengeledik" gibi doğrulanmamış
// iddialar YOK. Bkz. RELEASE_CHECKLIST.md ve kök README'deki dürüstlük notu.
export const I18N: Record<Lang, Strings> = {
  tr: {
    heading: 'Daha sürdürülebilir bir konaklamayı destekle',
    subheading: (hotel) =>
      `${hotel}'in sürdürülebilirlik programını desteklemek için bir tercih — karbon nötrlüğü garanti etmez.`,
    checkboxLabel: 'Bu seçeneği tercih ediyorum',
    totalLabel: 'Toplam katkı',
    co2Label: 'Tahmini karbon etkisi',
    estimatedBadge: 'Tahmini',
    perNight: (amount, nights) =>
      `${amount} × ${nights} gece`,
    addButton: 'Tercihimi kaydet',
    confirmation:
      'Tercihinizi kaydettik. Rezervasyonunuza henüz herhangi bir ücret eklenmedi.',
    co2Note: 'Rakamlar tahminidir, kesin ölçüm değildir.',
    previewBadge: 'Önizleme',
    impactLine: (co2, trees) =>
      `Bu ay bu otelde tahmini ≈ ${co2} kg CO₂ (≈ ${trees} ağaç-yılı)`,
  },
  en: {
    heading: 'Support a more sustainable stay',
    subheading: (hotel) =>
      `A preference to support ${hotel}'s sustainability program — this does not guarantee carbon neutrality.`,
    checkboxLabel: 'I am interested in this option',
    totalLabel: 'Total contribution',
    co2Label: 'Estimated carbon impact',
    estimatedBadge: 'Estimated',
    perNight: (amount, nights) =>
      `${amount} × ${nights} night${nights === 1 ? '' : 's'}`,
    addButton: 'Save my preference',
    confirmation:
      'Your preference has been recorded. No charge has been added to your booking.',
    co2Note: 'Figures are estimates, not exact measurements.',
    previewBadge: 'Preview',
    impactLine: (co2, trees) =>
      `This month, estimated ≈ ${co2} kg CO₂ at this hotel (≈ ${trees} tree-years)`,
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
