# Booking Engine Optional-Extra Entegrasyon Sözleşmesi (Faz 2)

Bu doküman, bir otelin booking engine/PMS sağlayıcısının (ör. SynXis veya
başka bir sağlayıcı) Green Gold ile **gerçek, tahsilatlı** bir optional-extra
entegrasyonu kurması için karşılaması gereken gereksinimleri tanımlar.

> **Önemli sınırlama:** Bu doküman **SynXis'e özgü** bir entegrasyon rehberi
> **DEĞİLDİR**. SynXis dokümantasyonu, sandbox ortamı ve credential'ları henüz
> Green Gold ekibinde yok. Aşağıdaki gereksinimler **provider-neutral**dir —
> herhangi bir booking engine/PMS sağlayıcısı için geçerlidir. SynXis'e özgü
> eksikler ayrı bir bölümde ([SynXis için açık checklist](#synxis-i̇çin-açık-checklist))
> ayrıca listelenmiştir; onlar doğrulanmadan "SynXis destekleniyor" denemez.

---

## 1. Ticari/akış gereksinimleri

1. **Green Gold, booking engine'de bir optional extra / ancillary / package /
   fee olarak tanımlanmalıdır.** Green Gold kendi başına bir rezervasyon veya
   ödeme sistemi değildir — booking engine'in mevcut "ek ürün" mekanizmasına
   eklenir.
2. **Ürün kodu property (otel) bazlı ve değişmez (immutable) olmalıdır.**
   Kod bir kez atandıktan sonra değişmemelidir; değişirse geçmiş event'lerin
   `provider_line_item_reference` alanı ile eşleşmesi bozulur.
3. **Fiyat ve vergilendirme booking engine tarafından uygulanır.** Green Gold
   API/widget hiçbir fiyat/vergi hesaplaması yapmaz, booking engine'in
   hesapladığı `amount_minor` + `currency` değerlerini olduğu gibi kabul eder.
4. **Seçildiğinde aynı booking total içinde görünmelidir.** Misafir tek bir
   ekranda, tek bir toplamda Green Gold'u görür — ayrı bir ödeme adımı YOKTUR.
5. **Mevcut payment gateway'de TEK bir tahsilat olmalıdır.** Green Gold
   tutarı, rezervasyonun geri kalanıyla birlikte otelin/booking engine'in
   kendi merchant hesabına tek işlemle geçer.
6. **Green Gold hiçbir zaman kart verisi/CVC/PAN görmemelidir.** Green Gold
   API bir PCI-DSS kapsamına giren bileşen DEĞİLDİR ve öyle tasarlanmamalıdır.
7. **Green Gold, para akışında merchant of record DEĞİLDİR** — aksi yönde
   açık bir ticari karar olmadıkça bu varsayım geçerlidir. Tahsilat otelin/
   booking engine'in hesabına gider; Green Gold yalnızca bunu DOĞRULANMIŞ
   bir bildirimle kayda geçirir.

---

## 2. Gerekli event'ler (server-to-server)

Booking engine/PMS, aşağıdaki her rezervasyon yaşam döngüsü olayında Green
Gold'a **sunucudan sunucuya** bir bildirim göndermelidir:

| Olay | Ne zaman |
|---|---|
| `confirmed` | Rezervasyon (ve varsa Green Gold satırı) onaylandığında |
| `modified` | Rezervasyon güncellendiğinde (tarih/tutar/oda değişse de değişmese de) |
| `cancelled` | Rezervasyon iptal edildiğinde |
| `refunded` / `partially_refunded` | Green Gold tutarı iade edildiğinde (tam/kısmi) |
| `no_show` | Misafir gelmediğinde |
| `stayed` | Konaklama tamamlandığında |

Her bildirim EN AZ şu bilgiyi taşımalıdır:

- provider'ın kendi rezervasyon kimliği (`provider_reservation_id`)
- provider'ın kendi event kimliği (`provider_event_id`) — idempotency için
- property/otel kimliği (`property_id`)
- Green Gold seçildi mi (`selected: boolean`)
- Green Gold tutarı (**integer minor units**, ör. `500` = `5.00`)
- para birimi (ISO 4217, 3 harf büyük, ör. `EUR`)
- rezervasyon durumu (yukarıdaki tablo)
- ödeme durumu (`pending` / `collected` / `refunded` / `voided` / `partially_refunded`)
- event'in gerçekten oluştuğu zaman damgası (ISO 8601)

Bu alanların normalize edilmiş iç kontratı (Green Gold API'nin adapter
sınırının ARKASINDA kullandığı, provider-bağımsız şekil) için bkz.
`green-gold-api/src/integrations/normalized-event.ts`. **Bu kontrat SynXis'in
gerçek payload şekli DEĞİLDİR** — her sağlayıcı için bir adapter bu şekle
ÇEVİRİR.

---

## 3. Server-to-server authentication seçenekleri

Green Gold API, sağlayıcı başına ayrı bir adapter sınırı kullanır (bkz.
`green-gold-api/src/integrations/adapters/`). Sandbox/test amaçlı, bu repoda
**kendi iç referans şemamız** olarak `generic_signed_webhook` uygulanmıştır:

- **Yöntem:** HMAC-SHA256, paylaşılan bir secret ile.
- **Header'lar:** `X-GreenGold-Signature: sha256=<hex hmac>`,
  `X-GreenGold-Timestamp: <unix ms>`.
- **İmza girdisi:** `HMAC_SHA256(secret, "<timestamp>." + ham_body_bytes)`.
- **Replay koruması:** timestamp, sunucu saatinden ±5 dakikadan fazla
  sapıyorsa reddedilir.
- **Routing:** webhook URL'i `hotel_integrations.webhook_routing_id` denen,
  **public widget key'DEN AYRI** bir routing kimliği taşır — public widget key
  webhook auth için KULLANILMAZ. Routing ID kriptografik olarak rastgeledir
  (`gen_random_uuid()`), ama **⚠️ bir kimlik doğrulama aracı DEĞİLDİR**:
  yalnızca isteğin hangi entegrasyona ait olduğunu söyler. Gerçek doğrulama
  **her zaman imza** ile yapılır; routing ID'yi bilen ama secret'ı bilmeyen bir
  taraf hiçbir şey yazamaz.
- **Secret rotasyonu:** iki aşamalı, overlap'li. Rotasyon başlatıldığında kısa
  bir pencere boyunca **eski ve yeni secret'ın ikisi de** kabul edilir; böylece
  sağlayıcı kendi tarafını güncellerken event kaybı/retry fırtınası olmaz.
  Pencere dolduğunda (veya rotasyon tamamlandığında) yalnızca yeni secret
  kabul edilir. Sağlayıcının rotasyon için bize bildirmesi gereken bir şey
  yoktur — yalnızca kendi tarafındaki değeri pencere içinde güncellemesi
  yeterlidir. Önerilen pencere: **60 dakika**.

Bu, **yalnızca bizim iç sandbox kontratımızdır** — SynXis'in veya başka bir
sağlayıcının gerçek imza şeması (HMAC mi, OAuth2 mi, mTLS mi, IP allowlist mi)
FARKLI olabilir ve dokümantasyonundan doğrulanmadan varsayılamaz. Yeni bir
sağlayıcı eklenirken bu bölüm, o sağlayıcının GERÇEK auth şemasıyla
güncellenmelidir.

---

## 4. Sandbox / test property / örnek payload / retry politikası

Bir sağlayıcı entegrasyonunun **production'a alınmadan önce** sağlaması
gerekenler:

- [ ] Sandbox/test ortamı erişimi (ayrı credential, prod'dan izole)
- [ ] En az bir test property/otel kimliği
- [ ] Gerçek (redacted olmayan, ama SENTETİK veri içeren) örnek payload'lar —
      confirm/modify/cancel/refund/partial-refund/no-show/stayed için ayrı ayrı
- [ ] Event retry/backoff politikası: başarısız (5xx/timeout) teslimatlarda
      sağlayıcı kaç kez, ne aralıkla tekrar dener? Green Gold webhook ucu
      **idempotent**tir (`provider_event_id` bazlı) — güvenle tekrar denenebilir.
- [ ] Sağlayıcının event SIRASI garantisi var mı, yok mu (out-of-order
      teslimat olası mı)? Green Gold state machine'i out-of-order event'leri
      `occurred_at` zaman damgasına göre tespit edip reddeder/insan
      gözden geçirmesine düşürür (bkz. `state-machine.ts`).

### Retry beklenen HTTP cevapları

Green Gold'un webhook ucu şu durumlarda **retry edilmesini bekler**:

| Cevap | Anlam | Sağlayıcı ne yapmalı |
| --- | --- | --- |
| `503` + `concurrent_update_retry` | Aynı rezervasyona eşzamanlı başka bir event işlendi; bu istek **hiçbir kısmi değişiklik bırakmadan** geri alındı | **Retry et** (kısa backoff) |
| `5xx` (genel) | Geçici sunucu hatası | **Retry et** |
| `401` | İmza doğrulanamadı | Retry **etme**; secret'ı kontrol edin |
| `403` | `property_id` bu entegrasyonla eşleşmiyor veya entegrasyon aktif değil | Retry **etme**; konfigürasyonu kontrol edin |
| `400` | Payload şemaya uymuyor | Retry **etme**; payload'ı düzeltin |
| `2xx` | İşlendi (veya daha önce işlenmişti) | Retry **etme** |

Aynı `provider_event_id` ile yapılan retry'lar **idempotenttir** — finansal
toplam asla iki kez etkilenmez, güvenle tekrar denenebilir.

---

## 5. Amount / currency / line item kuralları

- `amount_minor` **her zaman tam sayı, minor unit** (kuruş/cent) cinsinden
  gönderilmelidir. Floating point (`5.00` gibi) KABUL EDİLMEZ.
- `selected: false` iken `amount_minor` **kesinlikle 0** olmalıdır.
- `currency` tam 3 harfli büyük ISO 4217 kodu olmalıdır (ör. `EUR`, `USD`,
  `TRY`). Küçük harf, 2 harf, tam isim (`EURO`) KABUL EDİLMEZ.
- `line_item_reference` (opsiyonel) sağlayıcının kendi ürün/kalem
  referansıdır — mutabakat/denetim için faydalıdır, mümkünse gönderilmelidir.
- Bir rezervasyonun para birimi **yaşam döngüsü boyunca değişmemelidir**.
  Değişirse Green Gold bunu finansal bir tutarsızlık olarak işaretler ve
  ilgili katkı kaydına dokunmadan insan gözden geçirmesine düşürür.

---

## 6. Refund / kısmi iade kuralları

- Tam iade: `reservation_status` mutlaka `cancelled` olması GEREKMEZ (bir
  rezervasyon iptal edilmeden de Green Gold satırı tek başına iade
  edilebilir) — `greengold.payment_status = 'refunded'` yeterlidir.
- Kısmi iade: `greengold.payment_status = 'partially_refunded'`. **Önemli
  sınırlama:** mevcut normalized kontrat, iade edilen KISMİ tutarı ayrı bir
  alanda TAŞIMAZ — yalnızca durumu taşır. Green Gold paneli bu durumda
  KONSERVATİF davranır: `partially_refunded` bir satırın TAMAMI, "Toplam
  Katkı" hesabından düşülür (net katkı asla olduğundan yüksek gösterilmez,
  ama kısmi iade sonrası kalan gerçek tutarı da tam göstermez). Kısmi iade
  tutarının hassas takibi gerekiyorsa, kontrata `refunded_amount_minor` gibi
  bir alan eklenmesi ayrı bir karar/migration gerektirir.
- `no_show` durumunda Green Gold katkısının refund edilip edilmeyeceği
  **ürün kararı gerektirir** — booking engine bunu event'in
  `greengold.payment_status` alanında AÇIKÇA bildirmelidir (`refunded` veya
  `collected` olarak kalması). Karar bildirilmezse (durum `collected` olarak
  kalırsa) Green Gold otomatik varsayım YAPMAZ, kaydı insan gözden
  geçirmesine düşürür.

---

## 7. Kabul testi matrisi (acceptance test matrix)

Bir sağlayıcı entegrasyonu production'a alınmadan önce aşağıdaki senaryoların
HEPSİ sandbox'ta doğrulanmalıdır:

| # | Senaryo | Beklenen sonuç |
|---|---|---|
| 1 | confirmed + selected + collected | Rezervasyon + katkı oluşturulur, katkı `collected` |
| 2 | confirmed + not selected + amount 0 | Rezervasyon oluşturulur, katkı `voided` (aktif değil) |
| 3 | Aynı `confirmed` event'i tekrar gönderilir | Tekrar işlenmez, finansal toplam şişmez |
| 4 | modified: tutar değişmeden güncelleme | Rezervasyon güncellenir, katkı tutarı aynı kalır |
| 5 | cancelled (refund henüz bildirilmedi) | Rezervasyon `cancelled`, katkı mevcut durumunda kalır (icat edilmiş refund yok) |
| 6 | refunded event | Katkı `refunded`, `refunded_at` set edilir |
| 7 | partial refund | Katkı `partially_refunded` |
| 8 | no_show + karar bildirilmedi | Rezervasyon `no_show`, katkı DOKUNULMAZ, insan gözden geçirmesine düşer |
| 9 | stayed | Rezervasyon `stayed` |
| 10 | Rezervasyon hiç yokken refund/cancel event'i gelir | Reddedilir, hiçbir kayıt oluşturulmaz |
| 11 | Yanlış imza | 401, hiçbir domain kaydı yazılmaz |
| 12 | Başka bir property_id ile (yanlış otel) event | 403, hiçbir domain kaydı yazılmaz (tenant izolasyonu) |
| 13 | Aynı rezervasyonda para birimi değişir | İnsan gözden geçirmesine düşer, finansal veri korunur |

Bu matrisin Green Gold API tarafındaki karşılığı
`green-gold-api/src/integrations/state-machine.spec.ts` ve
`webhook-ingestion.service.spec.ts` dosyalarında otomatik test edilmiştir.

---

## SynXis için açık checklist

SynXis, bu doküman yazıldığı sırada Green Gold'un GERÇEK dokümantasyonuna,
sandbox erişimine veya credential'a sahip olmadığı bir sağlayıcıdır. SynXis
desteği "var" denebilmesi için aşağıdakilerin HEPSİ netleşmesi/doğrulanması
gerekir — hiçbiri bu doküman yazılırken varsayılmamıştır:

- [ ] SynXis'in optional-extra/ancillary API'sinin GERÇEK adı ve dokümanı
- [ ] SynXis webhook/event bildirim endpoint'i var mı, yoksa polling mi
      gerekiyor?
- [ ] SynXis'in GERÇEK authentication şeması (OAuth2, API key, mTLS, IP
      allowlist, vb.) — bu dokümandaki `generic_signed_webhook` HMAC şeması
      yalnızca bizim iç sandbox referansımızdır, SynXis'in şeması FARKLI
      olabilir
- [ ] SynXis'in property/hotel kimlik alanının GERÇEK adı ve formatı
- [ ] SynXis'in rezervasyon durumu (confirm/modify/cancel/no-show/stay)
      alan adları ve olası değerleri
- [ ] SynXis'in tutar/para birimi alan adları, minor/major unit kullanımı
- [ ] SynXis sandbox ortamı erişimi ve test property'si
- [ ] SynXis'in event retry/idempotency garantisi (kendi event ID'si var mı?)
- [ ] SynXis'in refund/kısmi refund event modeli
- [ ] SynXis'in rate limit/timeout beklentileri

Bu liste netleşene kadar `src/integrations/adapters/synxis.adapter.ts`
`configured = false` durumunda kalacak ve webhook ucu SynXis için 503
`provider_not_configured` dönecektir — hiçbir gerçek veya varsayımsal SynXis
davranışı koda yazılmamıştır.
