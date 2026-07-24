import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
