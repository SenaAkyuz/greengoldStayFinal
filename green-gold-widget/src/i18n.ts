import type { Lang } from './types';

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
}

export const I18N: Record<Lang, Strings> = {
  tr: {
    heading: 'Konaklamanı karbon-nötr yap',
    subheading: (hotel) =>
      `${hotel} ile konaklamanın tahmini karbon etkisine katkı sun.`,
    checkboxLabel: 'Katkı sunmak istiyorum',
    totalLabel: 'Toplam katkı',
    co2Label: 'Tahmini karbon etkisi',
    estimatedBadge: 'Tahmini',
    perNight: (amount, nights) =>
      `${amount} × ${nights} gece`,
    addButton: 'Katkıyı ekle',
    confirmation: 'Katkı tercihinizi aldık, teşekkürler.',
    co2Note: 'Rakamlar tahminidir, kesin ölçüm değildir.',
    previewBadge: 'Önizleme',
  },
  en: {
    heading: 'Make your stay carbon-neutral',
    subheading: (hotel) =>
      `Contribute to the estimated carbon impact of your stay with ${hotel}.`,
    checkboxLabel: 'I want to contribute',
    totalLabel: 'Total contribution',
    co2Label: 'Estimated carbon impact',
    estimatedBadge: 'Estimated',
    perNight: (amount, nights) =>
      `${amount} × ${nights} night${nights === 1 ? '' : 's'}`,
    addButton: 'Add contribution',
    confirmation: "Thanks — we've noted your contribution preference.",
    co2Note: 'Figures are estimates, not exact measurements.',
    previewBadge: 'Preview',
  },
};
