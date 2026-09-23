const INVISIBLE_COPY_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Kopyala-yapıştır kaynaklı karakterleri güvenli biçimde temizler.
 * Adresin içindeki gerçek boşlukları veya nokta gibi anlamlı karakterleri
 * değiştirmez; böylece hatalı bir adres sessizce başka bir adrese dönüşmez.
 */
export function normalizeEmailInput(value: string): string {
  return value
    .replace(INVISIBLE_COPY_CHARACTERS, '')
    .trim()
    .replace(/\s*@\s*/g, '@');
}
