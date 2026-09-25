# 3pmetrics karbon ölçüm entegrasyonu — durum raporu

25 Eylül 2026. Kapsam: yönergedeki Faz 1 (GreenGold Stay'den gelen otellerin
3pmetrics'te ölçülmesi) ve Faz 2 (3pmetrics'te ölçümü olan otellerin bağlanması).

## 1. Ana karar

3pmetrics'in API dokümanı, kimlik doğrulama yöntemi, webhook sözleşmesi, örnek
JSON'ları ve test erişimi **henüz elimizde yok** — yönergenin son paragrafı bu
bilgileri hâlâ talep ediyor. Bu yüzden yapılan iş, **sağlayıcı sınırını (adapter
boundary) kurmak** oldu; gerçek endpoint/alan adı/imza şeması **uydurulmadı.**

Neden: uydurulmuş bir şema derlenir, testten geçer ve panelde "bağlı" görünür,
ama ilk gerçek çağrıda çöker. Repoda aynı durum SynXis için zaten var
(`SynxisNotConfiguredAdapter`, `configured = false` → 503) ve aynı desen izlendi.

**Mevcut çalışan karbon hesaplayıcıları KALDIRILMADI.** 3pmetrics canlıya
girmeden onları kaldırmak, otelleri hesap yapamaz duruma düşürürdü. Üç kaynak
artık panelde açıkça ayrı:

| Sıra | Kaynak | Durum |
|---|---|---|
| 1 | **3pmetrics ölçümü** | Hedeflenen ana akış — sağlayıcı sözleşmesi bekliyor |
| 2 | Otele özgü hesap (tüketim / beyan edilen rapor) | Çalışıyor |
| 3 | Bölgesel tahmin (Greenview oda-gece katsayısı) | Çalışıyor |

## 2. Bugün sistem nasıl çalışıyor (değişmeden önce)

- `green-gold-api/src/common/carbon-pricing.ts` — ülke/bölge/otel sınıfı →
  Greenview HFT katsayısı → temsili ton fiyatı → gecelik katkı.
- `green-gold-api/src/common/hotel-carbon.ts` — otelin girdiği tüketim veya
  beyan ettiği rapor → alan oranıyla konaklamaya dağıtım → dolu oda-geceye
  bölme → oda-gece katsayısı.
- İki yol da sonucu `hotels.contribution_amount_per_night`,
  `hotels.estimated_co2_per_night_kg` ve `hotels.widget_settings.carbon_pricing`
  alanlarına yazar; belge arşivi `widget_settings.carbon_reports` içinde.
- Widget public config bu gecelik fiyatı ve katsayıyı okur, oda × gece ile çarpar.

Yani ölçüm bugün **panel içinde, elle girilen veriyle** yapılıyor. Yönerge bunun
3pmetrics'e taşınmasını istiyor.

## 3. Yapılanlar

### 3.1 Sağlayıcı kontratı (yönergenin yazılı hâli)

`green-gold-api/src/carbon/carbon-provider.interface.ts`

Yönergedeki her madde bir metoda karşılık gelir:

| Yönerge maddesi | Kontrat |
|---|---|
| Ölçüm oturumu oluşturma | `createSession(hotelRef, measurementRef, period, returnUrl)` → `formUrl` + `expiresAt` |
| Form verilerini alma | `getFormData()` → `rooms`, `occupiedRoomNights`, `guestNights`, `occupancyPercent` + alan/birim/dönem taşıyan `fields[]` |
| Hesaplama sonucunu alma | `getResult()` → toplam emisyon, birim, dönem, kapsam, yöntem/sürüm, sonuç durumu, rapor bağlantısı |
| Durum bildirimleri | `verifyWebhookSignature()`, `parseWebhookEvent()` → `form_submitted` / `measurement_completed` / `measurement_updated` |
| Faz 2 · yetkili tesisler | `listProperties(authorizationRef)` |
| Faz 2 · ölçümleri listeleme / güncellenenler | `listMeasurements({ externalPropertyId, updatedSince })` |

Çekirdek bu arayüzün arkasında kalır — hiçbir controller/service içinde
`if (provider === 'threepmetrics')` yok.

### 3.2 Adapter ve kayıt defteri

- `src/carbon/adapters/threepmetrics.adapter.ts` — `configured = false`.
  Her metot `CarbonProviderNotConfiguredError` fırlatır; sessizce yanlış veri
  üretmez. Dosyanın başında "sözleşme geldiğinde nasıl tamamlanır" adımları var.
- `src/carbon/carbon-provider-registry.ts` — `REGISTERED_CARBON_PROVIDERS`,
  migration'daki `provider` CHECK kısıtıyla birebir.

### 3.3 Dağıtım (allocation) katmanı — bugün gerçekten çalışan kısım

`src/carbon/room-night-allocation.ts`

`CARBON_METHODOLOGY_REVIEW.md`'deki kararları uygular, değiştirmez:

- Konaklamaya ayrılmış dönem emisyonu ÷ **aynı dönemin** dolu oda-gecesi.
  Fiziksel oda sayısı veya misafir sayısı payda değildir.
- Konaklama kapsamlı sonuç **ikinci kez** dağıtılmaz.
- **Otel toplamı kapsamlı sonuç, dağıtım oranı açıkça verilmeden fiyata
  çevrilmez** → `missing_guestroom_share` ile reddedilir. (Yönerge "dağıtım
  yöntemini sizinle birlikte netleştireceğiz" diyor; netleşmeden varsayım
  yapılmıyor.)
- **Bilinmeyen birim tahmin edilmez.** `kgCO2e`/`tCO2e` dışında bir birim
  `unknown_unit` ile reddedilir — kg/ton karışması 1000 kat hatalı fiyat üretir.
- **Tanınmayan kapsam metni** `unknown_scope` ile reddedilir; sessizce "otel
  toplamı" varsayılmaz.
- `estimateReservationCo2(coefficient, rooms, nights)` — rezervasyon bazlı tahmin.

Bu modül 16 testle kaplı ve sağlayıcıdan bağımsız çalışır.

### 3.4 Servis + API uçları

`src/carbon/carbon-measurement.service.ts` / `carbon-measurement.controller.ts`

| Uç | İş |
|---|---|
| `GET /dashboard/carbon-provider/status` | Sağlayıcı hazır mı, şema hazır mı, bağlı tesis, aktif ölçüm, aktif kaynak |
| `GET /dashboard/carbon-provider/measurements` | İçeri aktarılmış ölçümler |
| `GET /dashboard/carbon-provider/properties` | Faz 2 · yetkili tesisler |
| `POST /dashboard/carbon-provider/sessions` | Faz 1 · "Ölçüme başla" |
| `DELETE /dashboard/carbon-provider/links/:id` | Bağlantıyı kaldır |

Uygulanan güvenlik kararları:

- `hotel_id` **yalnızca token'dan**; gövdeden/query'den asla okunmaz.
- Her sorguda açık `hotel_id` filtresi (service_role RLS'i bypass eder).
- **Açık redirect yok:** dönüş adresi dışarıdan tam URL olarak alınmaz; panel
  içi bir *yol* alınır, origin sunucuda `PANEL_BASE_URL`'den eklenir.
- Sağlayıcı yanıtı güvenilmez girdi sayılır: `http` form adresi, süresi geçmiş
  veya eksik `expiresAt` reddedilir (502).
- Sağlayıcı hata mesajı kullanıcıya **sızdırılmaz**, yalnızca loglanır.
- `authorization_ref` (yetkilendirme referansı) panele dönen DTO'ya hiç girmez.
- Girdi doğrulaması sağlayıcı kapısından **önce** çalışır; hatalı dönem
  sağlayıcı hazır olsa da reddedilir.
- Sağlayıcı yapılandırılmadan **hiçbir satır yazılmaz.**
- Migration uygulanmamışsa 500 değil `schema_ready: false` döner.

### 3.5 Panel

- `app/components/CarbonProviderPanel.tsx` — yeni. 3pmetrics akışı; sağlayıcı
  hazır olmadığında "bağlantı hazırlanıyor" durumu gösterilir ve otel alternatif
  sekmelere yönlendirilir, butonlar pasif. "Bağlı" izlenimi verilmez.
  Ekran **otel yöneticisine** bakar: sağlayıcıdan beklediğimiz maddeler, migration
  numarası, "Faz 1/Faz 2" gibi proje içi terimler bu ekranda YER ALMAZ — onların
  yeri bu rapor ve `output/3pmetrics-bilgi-talebi.pdf`.
- `app/components/CarbonSettings.tsx` — iki sekme yerine üç sekme
  (3pmetrics / otele özgü / bölgesel). Varsayılan sekme otelin **o an kullandığı**
  kaynak → mevcut oteller için davranış değişmedi.
- `app/ayarlar/actions.ts` — `startProviderMeasurement` server action; API
  hatası kullanıcıya aynen yansıtılır.
- `lib/api.ts` — sağlayıcı uçları için tipler ve istemci fonksiyonları.

### 3.6 Migration

`green-gold-api/supabase/migrations/0015_carbon_measurement_provider.sql`
— **uygulandı** (Supabase SQL editor, 25 Eylül 2026). Beş tablonun da varlığı
PostgREST üzerinden doğrulandı.

| Tablo | Amaç |
|---|---|
| `carbon_provider_links` | Faz 2 · `hotel_id` ↔ 3pmetrics tesis kimliği eşlemesi, yetkilendirme referansı, revoke |
| `carbon_measurement_sessions` | Faz 1 · ölçüm oturumu, bizim `measurement_ref`'imiz, süreli form bağlantısı |
| `carbon_measurements` | Ölçüm + sürüm + form verisi + sonuç + türetilen oda-gece katsayısı |
| `carbon_provider_deliveries` | Karbon webhook denetim günlüğü (ham payload saklanmaz) |
| `reservation_carbon_estimates` | Rezervasyon bazlı tahmin — dönemsel snapshot |

## 4. Veritabanınızın yönergeye uyumu

**Mevcut hiçbir tablo, kolon, index veya RLS policy'si değiştirilmedi veya
silinmedi.** 0015 yalnızca yeni tablo ekler. Ama şemanız yönergeyi **bugünkü
hâliyle karşılayamıyor**; uymayan noktalar:

### 4.1 `hotel_integrations` 3pmetrics'i barındıramaz

Tablo booking-engine/PMS şeklinde: `product_code NOT NULL` ve
`webhook_routing_id` bir rezervasyon *optional-extra* kontratına ait. Karbon
ölçüm sağlayıcısının ürün kodu yok. Ayrıca `provider` CHECK'i yalnızca
`synxis` / `generic_signed_webhook` kabul ediyor. Yeniden kullanmak
`product_code`'u nullable yapmayı **ve** CHECK'i genişletmeyi gerektirirdi —
yani mevcut tabloyu değiştirmeyi. Bu yüzden ayrı tablo (`carbon_provider_links`).

### 4.2 `integration_deliveries` karbon webhook'unu loglayamaz

`integration_id` NOT NULL ve `hotel_integrations`'a FK'li; karbon sağlayıcısının
böyle bir satırı olmayacak. Ayrı bir denetim günlüğü gerekti
(`carbon_provider_deliveries`), aynı PII-minimizasyon kararıyla.

### 4.3 `widget_settings.carbon_reports` ölçüm geçmişi için uygun değil

Yönerge "her ölçümü kimliği ve sürümüyle takip ederek mükerrer kayıt oluşmasını
önleriz" diyor. JSONB dizisinde `(measurement_id, version)` üzerinde tekillik
kısıtı **kurulamaz**; döneme göre sorgulanamaz; kodda 50 kayıt üst sınırı var.
Faz 2 geçmiş ölçüm aktarımı bu sınırı aşabilir. Sağlayıcı ölçümleri ilişkisel
tabloya yazılır; `carbon_reports` elle hesap arşivi olarak **korunur**.

### 4.4 `hotels.estimated_co2_per_night_kg` tek skaler — geçmişi bozuyor

Bu **yönergeyle çelişen en önemli nokta.** Yönerge rezervasyon bazlı tahmin
istiyor; skaler tek bir güncel katsayı tutuyor. Yeni bir ölçüm kaydedildiğinde
geçmiş rezervasyonların tahmini de **geriye dönük değişir**.
`CARBON_METHODOLOGY_REVIEW.md` bunu zaten yazmış: "Geçmiş rezervasyonlara
kullanılan sonuçların kopyası saklanmalıdır." Çözüm: `reservation_carbon_estimates`
(rezervasyon başına dondurulmuş katsayı + hangi ölçümden geldiği).
`reservations` tablosuna dokunulmadı.

### 4.5 `reservations` oda sayısı taşımıyor

`nights` var, **`rooms` yok** — normalized event kontratında da yok. "Oda-gece
bazlı" tahmin oda × gece gerektirir. Şu an 1 oda varsayılıyor ve bu varsayım
`reservation_carbon_estimates.rooms DEFAULT 1` içinde **açıkça** duruyor.
Çok odalı rezervasyonlar bugün eksik tahmin edilir. Bunu düzeltmek booking
engine tarafındaki normalized event kontratını genişletmeyi gerektirir — ayrı
bir karar, bu rapor kapsamında değiştirilmedi.

### 4.6 Yetkilendirme saklama — production blokerı

Yönerge "otelin 3pmetrics şifresini bizim toplamamız gerekmemeli" diyor; buna
uyuluyor: `authorization_ref` yalnızca **opak bir referans**, şifre/token açık
metin tutulmuyor. Ama gerçek değeri çözecek bir **production secrets manager
yok** — `src/integrations/secret-resolver.ts` production için bilinçli olarak
fail-closed. Faz 2 production akışı bu çözülmeden açılmamalı. (Aynı bloker
SynXis için de kayıtlı.)

### 4.7 RLS

Yeni tabloların hepsi mevcut desene uyuyor: yalnızca tenant `SELECT` policy'si,
INSERT/UPDATE/DELETE policy'si yok (deny-by-default, yalnızca service_role
yazar). `public.current_hotel_id()` fonksiyonuna bağımlıdırlar — 0004/0005
zaten sağlıyor.

### 4.8 Uyumlu olan noktalar

- `hotels.hotel_code`, `public_widget_key`, `allowed_origins` — değişiklik gerekmiyor.
- `contributions.amount_minor` (minor unit, int4) doğru kurulmuş. Not: katkı
  tahsilatı **itfa kanıtı değildir**; ölçüm/tahsilat/kredi itfası ayrı süreçler.
- `widget_events` ölçümden bağımsız; etkilenmiyor.

## 5. 3pmetrics'ten gereken sözleşme

Adapter'ı tamamlamak için gereken minimum — her biri
`carbon-provider.interface.ts`'te bir tipe karşılık gelir:

1. **API dokümanı ve kimlik doğrulama yöntemi.** Server-to-server kimlik nasıl
   kurulur (API key / OAuth client credentials / mTLS), rate limit, hata kodları.
2. **Ölçüm oturumu ucu.** Girdi: bizim tesis kimliğimiz, ölçüm kimliğimiz,
   dönem, dönüş adresi. Çıktı: form URL + **son kullanma zamanı**. Bağlantı
   süreli ve tekrar giriş gerektirmeyen olmalı; süresiz bağlantı kabul edilmiyor.
3. **Form verileri ucu.** Alan tanımı + birim + dönem ile birlikte tüm alanlar;
   ayrıca ayrı ayrı: oda sayısı, doluluk, dolu oda-gece, misafir-gece.
4. **Sonuç ucu.** Toplam emisyon, **birimi** (kgCO2e/tCO2e), dönem, **kapsam**
   (otel toplamı mı konaklamaya ayrılmış mı), yöntem + sürüm, sonuç durumu,
   doğrulama durumu, rapor bağlantısı.
5. **Webhook dokümanı.** Olay tipleri, **imza şeması** (hangi header, hangi
   algoritma, imzanın hangi bytes üzerinde hesaplandığı), yeniden deneme
   politikası, olay kimliği. Bildirimde bizim `measurement_ref`'imizin geri
   dönmesi kritik — oteli/oturumu çözmenin tek güvenilir yolu.
6. **Faz 2 uçları.** Yetkili tesisleri listeleme (otelin şifresini almadan),
   tesisin ölçümlerini listeleme, ölçüm detayı, `updatedSince` ile güncellenen
   kayıtları sorgulama.
7. **Sandbox/test erişimi + örnek form ve sonuç JSON'ları.**
8. **Dağıtım yöntemi mutabakatı.** Sonuç "otel toplamı" kapsamındaysa
   konaklamaya dağıtım oranını nasıl belirleyeceğimiz (alan oranı mı, 3pmetrics
   kendi dağıtımını veriyor mu). Bu netleşmeden otel toplamı fiyata çevrilmiyor.

## 6. Bekleyen işler

Tamamlananlar: migration 0015 uygulandı; kod `main`'e merge edilip production'a
deploy edildi (PR #3 `e06f4f2`, PR #4 `4127d06`).

| # | İş | Bloker |
|---|---|---|
| 1 | `PANEL_BASE_URL` env değişkenini API projesine ekle (Vercel) | — |
| 2 | Adapter'ı gerçek uçlara bağla, `configured = true` | 3pmetrics dokümanı |
| 3 | Webhook ingestion ucu + imza doğrulama + idempotency | 3pmetrics webhook/imza şeması |
| 4 | Ölçüm → oda-gece katsayısı → widget fiyatı yazma akışı | 2. madde + dağıtım mutabakatı (bkz. §5.8) |
| 5 | Periyodik kontrol (webhook yoksa `updatedSince` polling) | 3pmetrics listeleme ucu |
| 6 | Faz 2 yetkilendirme akışı (OAuth) + tesis seçimi ekranı | 3pmetrics auth yöntemi |
| 7 | Production secrets manager | Altyapı kararı — Faz 2 production blokerı |
| 8 | Rezervasyon `rooms` alanı (çok odalı rezervasyon tahmini) | Booking engine event kontratı |
| 9 | `carbon_provider_deliveries` / `integration_deliveries` saklama süresi politikası | Cron altyapısı yok |

## 7. Doğrulama

Bu oturumda çalıştırıldı:

- API TypeScript derlemesi: temiz.
- API test paketi: **386 test / 31 paket geçti** (öncesi 343 — 43 yeni test).
- API ESLint: **0 hata** (tüm repo; öncesi 60 hata — bkz. §8).
- API production derlemesi (`nest build` + `verify-dist`): geçti.
- Panel TypeScript: temiz. Panel testleri: 12 test geçti. Panel ESLint: temiz.
- Panel production derlemesi (`next build`): 21 route derlendi, geçti.
- Widget: 34 test geçti; `check:widget` hash eşleşmesi doğrulandı.
- Migration 0015: beş tablonun varlığı PostgREST üzerinden doğrulandı.
- Canlı: yeni uçlar auth'suz 401 döndürüyor; prod smoke testi 11/11 geçti;
  API `/internal/health` 200.

Yapılmayanlar:

- Gerçek 3pmetrics çağrısı yapılmadı (sözleşme yok). Adapter testleri, sözleşme
  geldiğinde yerine geçecek bir sahte adapter ile seam'in çalıştığını kanıtlar;
  3pmetrics'in gerçek yanıt şeması hakkında hiçbir iddia içermez.
- `reservation_carbon_estimates` tablosu oluşturuldu ama **henüz doldurulmuyor** —
  rezervasyon bazlı snapshot yazımı 6. bölümdeki 4. maddeye bağlı.
- Smoke script'inin manuel bıraktığı 9 madde (gerçek kullanıcı girişi, şifre
  sıfırlama e2e, demo salt-okunurluk, CSV tenant kapsamı, gerçek mobil cihaz,
  Upstash bağlantısı) elle doğrulanmadı.

## 8. Değişen dosyalar

Yeni:

- `green-gold-api/supabase/migrations/0015_carbon_measurement_provider.sql`
- `green-gold-api/src/carbon/carbon-provider.interface.ts`
- `green-gold-api/src/carbon/carbon-provider-registry.ts`
- `green-gold-api/src/carbon/adapters/threepmetrics.adapter.ts`
- `green-gold-api/src/carbon/room-night-allocation.ts` (+ `.spec.ts`)
- `green-gold-api/src/carbon/carbon-measurement.service.ts` (+ `.spec.ts`)
- `green-gold-api/src/carbon/carbon-measurement.controller.ts`
- `green-gold-api/src/carbon/carbon.module.ts`
- `green-gold-api/src/carbon/dto/start-measurement.dto.ts`
- `green-gold-panel/app/components/CarbonProviderPanel.tsx`

Düzenlenen (küçük, geri alınabilir):

- `green-gold-api/src/app.module.ts` — `CarbonModule` kaydı (2 satır)
- `green-gold-api/test/fake-supabase.ts` — `maybeSingle()` eklendi (ek, değişiklik değil)
- `green-gold-panel/lib/api.ts` — sağlayıcı tipleri + istemci fonksiyonları (ek)
- `green-gold-panel/app/ayarlar/page.tsx` — sağlayıcı durumunu yükler
- `green-gold-panel/app/ayarlar/actions.ts` — `startProviderMeasurement` (ek)
- `green-gold-panel/app/components/SettingsForm.tsx` — prop geçişi
- `green-gold-panel/app/components/CarbonSettings.tsx` — üçüncü sekme

Sonradan eklenen (PR #3 ikinci commit + PR #4):

- API lint borcu temizliği — `dashboard.service.ts`, `integrations-read.service.ts`,
  `http-exception.filter.ts`, `response.interceptor.ts`, `supabase.service.ts`,
  `widget.service.ts`, `test/fake-supabase.ts`, `eslint.config.mjs`.
  60 hatanın 35'i tek kök sebepten geliyordu: `let range;` tip annotation'sız
  yazıldığı için örtük `any` oluyordu. Ayrıca gerçek bir bug düzeltildi —
  `http-exception.filter.ts` hata gövdesi nesne olduğunda istemciye
  `'[object Object]'` döndürüyordu.
- Panel dili — `CarbonProviderPanel.tsx`, `karbon/page.tsx`,
  `CarbonPricingCalculator.tsx`, `SettingsForm.tsx`: proje içi terimler
  (sağlayıcıdan beklenenler listesi, migration numarası, "Faz 1/Faz 2",
  "pilot varsayılanı") otel ekranından çıkarıldı. Doğruluk ibareleri korundu.
- `login/LoginForm.tsx` — auth hata mesajları ayrıştırıldı; kimlik bilgisi
  hataları hesap sayımına izin vermemek için tek genel mesajda bırakıldı.

Dokunulmayanlar (karbon mantığı): `common/carbon-pricing.ts`,
`common/hotel-carbon.ts`, `common/hft-rows.ts`, `dashboard.service.ts` karbon
hesap akışı, `widget.service.ts` fiyat aktarımı, `lib/carbon-document.ts`,
sertifika ekranı, widget paketi, 0001–0014 migration'ları.
