# Misafir widget'ı yazı tipi — DM Sans (kendi alan adımızdan)

- `dm-sans-latin.v1.woff2` ve `dm-sans-latin-ext.v1.woff2`: DM Sans değişken yazı tipi (ağırlık 100–1000), latin ve latin-ext (Türkçe ğ, ş, ı, İ) alt kümeleri. Panelin `next/font/google` derlemesinin ürettiği dosyalardır (Google Fonts kaynaklı).
- Widget (`green-gold-widget.v1.js`) bu dosyaları kendi betik adresinin kökünden, `/green-gold-widget-fonts/` altından yükler. Misafirin tarayıcısı Google'a istek atmaz.
- Yüklenemezse (ağ, otel sitesinin CSP `font-src` kuralı vb.) widget sistem yazı tipine geçer; işlev etkilenmez.
- Erişim: `green-gold-widget` önekli yollar auth proxy'sine girmez (`proxy.ts`); `next.config.ts` CORS (`Access-Control-Allow-Origin: *`) ve uzun önbellek başlıklarını verir. Dosya içeriği değişirse ad sürümü (`.v2.`) artırılmalı ve `green-gold-widget/src/fonts.ts` güncellenmelidir.
- Lisans: DM Sans, SIL Open Font License 1.1 ile dağıtılır (Copyright 2014 The DM Sans Project Authors). Lisans metni bu klasörde: `OFL.txt` (Google Fonts deposundaki `ofl/dmsans/OFL.txt` ile birebir, 2026-11-27).
