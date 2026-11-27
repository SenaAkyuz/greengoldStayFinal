/**
 * Yalnızca yerel geliştirmede açılan araçlar (tasarım galerisi, ileride örnek
 * veri modu). `next build` NODE_ENV'i 'production' olarak sabitler; bu yüzden
 * canlı ve önizleme dağıtımlarında bu fonksiyon HER ZAMAN false döner.
 * Ortam değişkeniyle açılamaz (bilinçli olarak).
 */
export function isDevToolsEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === 'development';
}

/** Geliştirmede oturumsuz açılabilen yollar. Production'da boş. */
export function devOnlyPublicPrefixes(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
  return isDevToolsEnabled(nodeEnv) ? ['/tasarim', '/onizleme'] : [];
}
