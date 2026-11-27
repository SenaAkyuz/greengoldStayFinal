# Green Gold Stay paneli — ekran yapısı planı

> Aşama durumu (A–G) ve yapılacaklar: kök `STATUS.md` §2 ve §14. Bu dosya yalnız ekran yapısını tanımlar.

Amaç: bütün panelin yeni tasarım diline (app/design, app/components/ui)
**işlev değiştirmeden** geçmesi. Her ekran bugün var olan işlevini korur;
yeni metrik/işlev ancak backend'de karşılığı olduğunda eklenir.

## Bilgi mimarisi (yan menü)

| Grup | Ekran | Bugünkü adres | Veri kaynağı (mevcut) | Durum |
|---|---|---|---|---|
| — | **Genel bakış** | `/` | `/dashboard/report`, `/contributions-summary`, `/hotel`, `/integration-health`, ConnectHub `status` | ✅ D — gerçek sayfa yeni tasarımda |
| Karbon | **Karbon ölçümü** (yeni) | `/karbon-olcumu`, `/karbon-olcumu/[donem]` | ConnectHub `periods`, `periods/:p`, `items`, `records` | ✅ E — liste + dönem girişi · ✅ F — hesap sonucu + güvenli yayın · ✅ G2 — kayıtlı hesap + sürüm geçmişi |
| Karbon | Karbon etkisi | `/karbon` | `/dashboard/carbon-summary` | ✅ G/G2 — yeni çerçeve + tasarım dili |
| Misafir ve raporlar | Misafir önizleme | `/misafir-onizleme` | `/hotel`, widget | ✅ G/G2 — yeni çerçeve + tasarım dili |
| Misafir ve raporlar | Dönüşüm | `/funnel` | `/dashboard/funnel` | ✅ G/G2 — yeni çerçeve + tasarım dili |
| Misafir ve raporlar | Raporlar | `/raporlar` | `/dashboard/report`, dışa aktarma | ✅ G/G2 — yeni çerçeve + tasarım dili |
| Rezervasyon (Faz 2) | Rezervasyonlar · Tahsilatlar · Sertifikalar | mevcut | Faz 2 uçları | "Yakında" etiketi korunur |
| Yönetim | Tesis profili (yeni) | `/tesis-profili` | ConnectHub `status` + `PUT profile` | ✅ D — gerçek sayfa |
| Yönetim | Entegrasyon | `/entegrasyon` | `/integrations-health`, widget | ✅ G/G2 — yeni çerçeve + tasarım dili |
| Yönetim | Ayarlar | `/ayarlar` | `/hotel` + eski 3pmetrics/CCA paneli | ✅ G/G2 — çerçeve, ConnectHub kartı, tasarım dili (CCA akışı aynen) |

## Genel bakış ≠ Karbon ölçümü

- **Genel bakış**: misafir tarafı performansı — widget görüntülenme, katkı
  seçimi, huni oranları, tahmini CO₂ etkisi (widget katsayısı), rezervasyon
  katkıları, entegrasyon sağlığı, sıradaki işlemler. Karbon ölçümünden yalnız
  "sıradaki işlem" bağlantısı gelir.
- **Karbon ölçümü**: tesis tarafı ölçüm — tüketim verisi, onay, dönem hesabı,
  yayın uygunluğu. Kendi menü öğesi ve alt sayfaları vardır.

## Ekran şablonları

1. **Pano** (Genel bakış): `HeroBand` (tek h1 + 3 temel metrik) → rapor kartı
   (`CardStrip` + `MetricGrid` + `BarList` + vurgu paneli) → 3'lü bilgi kartları.
2. **Bölüm özeti** (Karbon ölçümü, Raporlar): `PageHeader size="compact"` →
   kompakt `Notice` → rapor kartı → grafik + liste.
3. **İş akışı / detay** (Dönem): `Stepper` → solda adım kartları, sağda yapışkan
   özet + eylem paneli (≥1180 px); altında tek sütun.
4. **Form** (Tesis profili, Ayarlar): dar sütun (≤880 px), `Field` ile
   etiket/yardım/hata, canlı doğrulama, alt eylem çubuğu.

## Geçiş sırası (her biri ayrı onayla)

1. Uygulama çerçevesi: `AppShell` → `HotelPanelFrame` (AppFrame üstünde; menü
   öğeleri ve rozet/rol davranışları aynen; demo salt okunur göstergesi korunur).
   ✅ G'de tüm sayfalar geçti (iç içe `<main>` yok); G2'de eski `AppShell` silindi.
2. Genel bakış (yalnız görünüm; veri çağrıları değişmez).
3. Karbon ölçümü ekranları (B–F aşamaları, gerçek API ile).
4. Karbon etkisi, Dönüşüm, Raporlar, Misafir önizleme.
5. Entegrasyon ve Ayarlar (CCA paneli bileşen değiştirmeden çerçeveye alınır). ✅ G/G2
   G2 yöntemi: `globals.css` token köprüsü (Tailwind paletleri + `gg-*` sınıfları → `--ds-*`),
   sayfa başlıkları `PageHeader`, uyarılar `Notice`, `RangePills`/`MetricCard`/`ComingSoon` → `ui/*`.
   İsteğe bağlı G3: eski form bileşenlerinin `ui/*` ile yeniden yazımı + önizleme sayfaları.
6. Faz 2 ekranları (işlevleri açıldıkça).

## Kurallar

- Desteklenmeyen metrik gerçek veri gibi gösterilmez; eksik veri "—".
- "Tahmini katkı" dili; doğrulanmış dengeleme/sertifika iddiası yok.
- Uyarılar kompakt `Notice` (tek satır + sağda eylem); uzun açıklama gerekiyorsa
  `layout="block"`.
- Her geçişte: Vitest, tsc, lint, build ve tarayıcıda 1440 / 1024 / 768 / 375 px
  kontrolü.
