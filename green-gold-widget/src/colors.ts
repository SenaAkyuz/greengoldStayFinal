/**
 * Otel rengi (brand_color) → widget vurgusu, okunabilirlik denetimiyle.
 *
 * Vurgu rengi butonun ZEMİNİDİR (üzerinde beyaz yazı) ve bağlantı/metin
 * rengidir (beyaz kart üzerinde). İkisi için de WCAG AA normal metin eşiği
 * 4,5:1 aranır. Renk geçersizse ya da eşiği sağlamıyorsa güvenli varsayılan
 * (onaylı tasarım dilinin çam yeşili) kullanılır.
 */
export const DEFAULT_ACCENT = '#006e64';
export const MIN_CONTRAST = 4.5;
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Kullanılacak vurgu rengi ve otel renginin kullanılıp kullanılmadığı. */
export function resolveAccent(color: string | null | undefined): { accent: string; fromHotel: boolean } {
  if (color && HEX6.test(color) && contrastRatio(color, '#ffffff') >= MIN_CONTRAST) {
    return { accent: color.toLowerCase(), fromHotel: true };
  }
  return { accent: DEFAULT_ACCENT, fromHotel: false };
}
