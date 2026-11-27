/**
 * DM Sans'ı KENDİ alan adımızdan yükler (Google Fonts'a misafir isteği yok).
 *
 * Shadow DOM içinde `@font-face` tanımları uygulanmaz; yazı tipi belgeye
 * (host sayfanın <head>'ine) bir kez, ad alanlı aile adıyla ("GG DM Sans")
 * eklenir — otel sitesinin kendi yazı tipleriyle çakışmaz, sitenin
 * stillerine dokunmaz. Dosyalar betiğin kökünden servis edilir:
 * `<betik kökü>/green-gold-widget-fonts/*.v1.woff2` (panel `public/`).
 *
 * Yüklenemezse (ağ, sitenin CSP `font-src` kuralı, betik adresi bilinemiyor)
 * CSS'teki yedek yığın kullanılır: sistem yazı tipleri. İşlev etkilenmez.
 */
export const FONT_FAMILY = 'GG DM Sans';
const STYLE_ID = 'green-gold-widget-fonts';

// next/font'un DM Sans alt kümeleriyle aynı aralıklar (latin + latin-ext → Türkçe).
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF';

/** Betik adresinden yazı tipi klasörünün kökünü çıkarır (yalnız http/https). */
export function fontBaseFrom(scriptSrc: string | null | undefined): string | null {
  if (!scriptSrc) return null;
  try {
    const url = new URL(scriptSrc, typeof location !== 'undefined' ? location.href : undefined);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}/green-gold-widget-fonts/`;
  } catch {
    return null;
  }
}

export function fontFaceCss(base: string): string {
  const face = (file: string, range: string) =>
    `@font-face{font-family:"${FONT_FAMILY}";font-style:normal;font-weight:100 1000;font-display:swap;` +
    `src:url("${base}${file}") format("woff2");unicode-range:${range};}`;
  return face('dm-sans-latin.v1.woff2', LATIN) + face('dm-sans-latin-ext.v1.woff2', LATIN_EXT);
}

/** Belgeye bir kez ekler; hata olursa sessizce sistem yazı tipinde kalır. */
export function ensureFonts(base: string | null, doc: Document = document): boolean {
  if (!base) return false;
  try {
    if (doc.getElementById(STYLE_ID)) return true;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = fontFaceCss(base);
    (doc.head ?? doc.documentElement).appendChild(style);
    return true;
  } catch {
    return false;
  }
}
