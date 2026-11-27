import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 3pmetrics kanıt belgesi yükleme (en fazla 4 MB + multipart payı).
      // API Vercel'de çalıştığı için 4.5 MB istek sınırının altında kalır.
      bodySizeLimit: '4.2mb',
    },
  },
  async headers() {
    return [
      {
        // Widget bundle panel public/'ten servis edilir.
        // PİLOT AŞAMASI: KISA cache — widget içeriği değişince hızlı yayılsın,
        // bayat kopya misafirde takılı kalmasın.
        // TODO(canlı): Gerçek otel canlıya çıkıp widget "dondurulunca"
        // `public, max-age=31536000, immutable` (1 yıl) yap. İçerik o aşamadan
        // sonra değişirse dosyayı v2 olarak yayınla (ad + NEXT_PUBLIC_WIDGET_SRC);
        // sürüm dosya adında olduğu için eski URL bozulmaz.
        source: "/green-gold-widget.v1.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, must-revalidate",
          },
        ],
      },
      {
        // Widget yazı tipi (DM Sans) — otel sitelerinden çapraz-origin yüklenir.
        // Dosya adı sürümlüdür (.v1.) → uzun önbellek güvenli.
        source: "/green-gold-widget-fonts/:file*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
