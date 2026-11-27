/**
 * Ürün ana sayfası görselleri (plan §4.3, G1–G6). Dosyalar
 * `public/marketing/` altına konup `available: true` yapılınca sayfa onları
 * kullanır; o zamana kadar tasarım, görselsiz (degrade + çizim) yedekle
 * çalışır — eksik dosya için istek atılmaz, kırık görsel görünmez.
 *
 * Gerçek marka/ortak logoları burada YOK (KD-5): yalnız yazılı izinle eklenir.
 */
export interface MarketingImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  available: boolean;
}

export const MARKETING_IMAGES = {
  hero: { src: '/marketing/hero-otel-odasi.jpg', alt: 'Zeytin bahçesine açılan, doğal ışıklı sakin bir otel odası', width: 1536, height: 1024, available: true },
  guest: { src: '/marketing/misafir-rezervasyon.jpg', alt: 'Bitkilerle çevrili, sıcak ışıklı bir otel lobisi ve resepsiyon', width: 1448, height: 1086, available: true },
  forest: { src: '/marketing/doga-orman-tepeden.jpg', alt: 'Sabah sisi içinde tepelerden görülen orman örtüsü', width: 1774, height: 887, available: true },
  terrace: { src: '/marketing/otel-teras-kahvalti.jpg', alt: 'Zeytin ağaçları altında deniz manzaralı bir otel terasında kahvaltı', width: 1586, height: 992, available: true },
  login: { src: '/marketing/giris-gorsel.jpg', alt: 'Begonvil ve zeytin ağaçlarıyla taş bir otel avlusu', width: 1122, height: 1402, available: true },
  og: { src: '/marketing/og-greengold-stay.jpg', alt: 'Deniz manzaralı bir otel terası', width: 1200, height: 630, available: true },
} satisfies Record<string, MarketingImage>;

/**
 * İlkeler bölümü için etkinlik fotoğrafı (kullanıcı, 27.11). Tanınabilir
 * kişiler ve etkinlik markası içerir. Yayın izni ve etkinliğin vakıfla ilişkisi
 * kullanıcı tarafından doğrulandı (2026-11-27 18:23) → 'confirmed'. İzin geri
 * çekilirse 'pending' yapılır; bölüm teras fotoğrafına döner. Dosya özgün haliyle (1280×960,
 * 4:3) kullanılır; yerleşim aynı oranda olduğu için kişiler kırpılmaz.
 */
export const FORUM_PHOTO = {
  src: '/marketing/zero-waste-forum.jpg',
  alt: 'Zero Waste Forum’da dört katılımcı',
  width: 1280,
  height: 960,
  caption: 'Zero Waste Forum, Antalya',
  permission: 'confirmed' as 'pending' | 'confirmed',
};

/** Resmi marka logosu (amblem PNG; resmi SVG gelince değişir). */
export const BRAND_LOGO = { src: '/brand/greengold-logo.png', width: 148, height: 148 } as const;

/**
 * Ekosistem logoları (KD-5). Kullanım izni kullanıcı tarafından doğrulandı
 * (2026-11-27 18:23). İzin geri çekilirse ilgili satır 'pending' yapılır: `permission` yalnız izin
 * belgesi görüldükten sonra 'confirmed' yapılır. Hiçbiri onaylı değilse bölüm
 * sayfada hiç görünmez. `displayHeight`: farklı oranlı logoları görsel olarak
 * dengelemek için piksel yüksekliği. Rol yalnız bilinen için yazılır.
 */
export type PartnerPermission = 'pending' | 'confirmed';
export const PARTNERS: readonly {
  name: string;
  src: string;
  width: number;
  height: number;
  displayHeight: number;
  role: string | null;
  permission: PartnerPermission;
}[] = [
  { name: '3P Metrics', src: '/partners/partner-3pmetrics.svg', width: 300, height: 72, displayHeight: 34, role: 'Ölçüm altyapısı', permission: 'confirmed' },
  { name: 'Gaia Climate', src: '/partners/partner-gaia-climate.avif', width: 208, height: 100, displayHeight: 50, role: null, permission: 'confirmed' },
  { name: 'Denge Sende', src: '/partners/partner-denge-sende.png', width: 360, height: 90, displayHeight: 44, role: null, permission: 'confirmed' },
];

/** Yalnız izni doğrulanmış logolar (yayınlanabilir). */
export const PUBLISHED_PARTNERS = PARTNERS.filter((p) => p.permission === 'confirmed');
