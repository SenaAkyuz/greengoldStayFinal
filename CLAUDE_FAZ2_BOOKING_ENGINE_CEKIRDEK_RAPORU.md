# Faz 2 Booking Engine Optional-Extra Çekirdeği — Tamamlama Raporu

Kaynak görevler:
1. `claude_faz2_booking_engine_optional_extra_cekirdek_promptu.md` (ilk tur)
2. `claude_faz2_cekirdek_inceleme_duzeltmeleri.md` (**inceleme düzeltmeleri turu — Bölüm 2**)
3. `claude_faz2_rpc_tenant_baglama_duzeltmesi.md` (**RPC tenant bağlama düzeltmesi — Bölüm 2.5**)

> **Bu görev gerçek bir SynXis entegrasyonu DEĞİLDİR.** SynXis dokümanı,
> sandbox ve credential yok. Hiçbir SynXis endpoint/payload/auth şeması
> uydurulmadı. Aşağıda yapılan her şey **provider-neutral çekirdek**tir;
> SynXis adapter'ı bilinçli olarak `configured = false` bırakıldı ve
> **aktive edilemez** durumda tutuldu.

Production/staging Supabase'e bağlanılmadı, Supabase'e hiçbir migration
uygulanmadı, commit/push/deploy yapılmadı. Migration'lar **yalnızca** yerel,
disposable ve sonda silinen bir test container'ında (`127.0.0.1:55433`)
uygulandı — bkz. Bölüm 4.

---

## 1. Gap analizi (6 ekran/adım)

| # | Adım | Durum (görev öncesi) | Not |
|---|------|-----------------------|-----|
| 1 | Booking checkout başlangıcı | **external dependency** | Otelin booking engine'inde gerçekleşir — bu repo'nun kapsamı dışında |
| 2 | Optional extra gösterimi | **external dependency** | Booking engine UI'sı; Green Gold widget'ı bunu DEĞİŞTİRMEZ |
| 3 | Seçim sonrası booking total güncellemesi | **external dependency** | Booking engine'in kendi toplamı; widget `amount_total`'ı booking total'a yazmıyor |
| 4 | Tek payment gateway işlemi | **external dependency** | Otelin merchant hattı; Green Gold kart verisi görmüyor |
| 5 | Rezervasyon onayı + Green Gold bildirimi | **missing → implement edildi** | Domain modeli, adapter registry, normalized event + state machine, imza doğrulamalı **atomik** webhook ingestion |
| 6 | Otel paneli/raporlama | **partial → tamamlandı** | Gerçek veri varsa gösteriliyor, yoksa dürüst `ComingSoon` korunuyor |

1–4 numaralı adımlar **bu repo'nun tek başına implement edemeyeceği** adımlardır.

---

## 2. İnceleme düzeltmeleri turu — ne değişti

### 2.1 Finansal ingestion artık ATOMİK (bulgu #1)

**Sorun:** ingestion servisi delivery insert → reservation upsert → contribution
upsert → delivery final status'ü **dört ayrı Supabase HTTP çağrısıyla** yapıyordu.
Aralarında hata/çökme veya eşzamanlı ikinci bir delivery olursa
"delivery `received` + reservation güncel ama contribution eksik" gibi **kısmi
finansal durum** oluşabiliyordu.

**Çözüm:** yeni migration `0013_ingest_reservation_event_fn.sql` — doğrulanmış
event'in **tüm** domain yazımını tek Postgres transaction'ında yapan
`ingest_reservation_event` RPC'si.

İş bölümü:
- **Karar** (apply / manual_review / reject) uygulama katmanında kalıyor
  (`state-machine.ts` — saf, test edilebilir, değişmedi).
- **Uygulama** RPC'de, tek transaction sınırında.

Eşzamanlılık modeli **iki katmanlı**:

1. **Advisory transaction lock** — `pg_advisory_xact_lock` ile aynı
   `(integration_id, provider_reservation_id)` için işlemler serileşir. Row
   lock'ın koruyamadığı **insert-insert yarışını** da kapsar (rezervasyon satırı
   henüz yokken).
2. **Optimistic re-check** — uygulama kararını hangi `provider_updated_at`
   değerine bakarak verdiyse (`p_expected_provider_updated_at` +
   `p_expected_reservation_exists`), lock alındıktan **sonra** transaction
   içinde yeniden doğrulanır. Değiştiyse karar bayatlamıştır →
   `serialization_failure (40001)` → **tüm transaction geri alınır**, hiçbir
   kısmi değişiklik kalmaz. Bu, aynı rezervasyona gelen iki farklı event'te
   **lost update**'i önler.

Idempotency: delivery insert `ON CONFLICT DO NOTHING`. Satır dönmezse bu
`provider_event_id` daha önce işlenmiştir → hiçbir finansal state'e
dokunulmadan `already_processed` döner. Eşzamanlı iki özdeş event'te biri unique
index'te bloke olur, sonra aynı yoldan `already_processed` alır → **finansal
toplam bir kez etkilenir**.

Retry politikası: RPC `40001` fırlatırsa API **503 `concurrent_update_retry`**
döner (retryable). Sağlayıcının retry'ında taze durumla yeniden karar verilir.
Sözleşme dokümanına sağlayıcı için tam bir **retry/no-retry HTTP tablosu**
eklendi.

Güvenlik: `SECURITY DEFINER` + sabit `search_path = public, pg_temp`; execute
yetkisi `anon`/`authenticated`'tan **alındı**, yalnızca `service_role`'a
verildi. Parametreler dar ve tipli; dinamik SQL parçası parametre olarak
alınmıyor (injection yüzeyi yok).

> **⚠️ Bu değişikliğin en önemli sınırı için bkz. Bölüm 4 — "Gerçek Postgres
> bekleyen kısımlar".** Atomiklik birim testlerle **kanıtlanmamıştır**.

### 2.5 RPC TENANT BAĞLAMA DÜZELTMESİ (kritik — 3. tur)

**Bulgu:** RPC `p_integration_id`, `p_hotel_id` ve `p_provider` değerlerini
çağırandan **ayrı ayrı** alıyor; `hotel_integrations` satırını kilitleyip
`hotel_id`/`provider` eşleşmesini transaction içinde **doğrulamıyordu**.
Service-role yüzeyindeki bir programlama hatası veya kötüye kullanım,
"Integration A kimliği + Hotel B `hotel_id`" birleştirerek **çapraz tenant**
reservation/contribution/delivery üretmeye çalışabilirdi. "API bugün doğru
parametre veriyor" bir `SECURITY DEFINER` fonksiyon için yeterli savunma
değildir.

**Düzeltme — en güçlü seçenek uygulandı:** `p_hotel_id` ve `p_provider`
parametreleri **tamamen kaldırıldı** (migration hiçbir ortama uygulanmadığı
için geriye uyumluluk kaygısı yoktu). Artık:

1. RPC, transaction başında `p_integration_id` ile `hotel_integrations`
   satırını **`FOR SHARE` ile kilitleyerek** okur.
   `FOR SHARE` seçildi çünkü: satır bizim işimiz sürerken silinemez/status'ü
   değiştirilemez, ama aynı entegrasyonun **farklı rezervasyonları paralel**
   işlenebilir (rezervasyon bazlı serileştirme advisory lock'ın işi).
2. **Satır yoksa → fail closed** (`22023`). Audit satırı bile yazılmaz: geçerli
   bir tenant bilinmediği için yazılacak güvenli bir yer yoktur.
3. **`status <> 'active'` → fail closed.** Pending/suspended entegrasyon
   domain write yapamaz.
4. `hotel_id` ve `provider` **yalnızca bu satırdan türetilir**; reservation,
   contribution ve delivery insert'lerinin hepsi bu türetilmiş değerleri
   kullanır.
5. **İkinci savunma (property):** `normalized_snapshot->>'property_id'` ile
   entegrasyonun `external_property_id`'si karşılaştırılır; uyuşmazsa
   transaction tamamen geri alınır. Asıl kontrol hâlâ service sınırındadır
   (`webhook-ingestion.service.ts` → 403 `property_id_mismatch`) — bu, o katman
   atlansa bile çapraz property yazımını **DB sınırında** durdurur.
6. **Sıralama:** advisory lock ve delivery insert dahil hiçbir kalıcı yazım,
   tenant bağı doğrulanmadan yapılmaz.
7. Eski (güvensiz) imza `DROP FUNCTION IF EXISTS` ile kaldırılıyor — overload
   olarak hayatta kalıp çağrılabilir olamaz. `REVOKE`/`GRANT` imzaları yeni
   parametre listesine güncellendi.
8. TypeScript çağrısı güncellendi: `p_hotel_id`/`p_provider` artık
   gönderilmiyor. Birim test bunu açıkça doğruluyor
   (`expect(args).not.toHaveProperty('p_hotel_id')`).

Yetki modeli yeniden kontrol edildi: `PUBLIC`, `anon`, `authenticated` execute
**kapalı**; yalnızca `service_role` **açık** (acceptance T12 bunu sorguyla
doğrular).

> **Sonuç:** çapraz tenant çağrısı artık "reddediliyor" değil, **ifade
> edilemiyor** — fonksiyon imzasında yanlış `hotel_id` geçirilecek bir yer yok.

### 2.2 Entegrasyon oluşturma otel oluşturmadan AYRILDI (bulgu #2)

`webhook_routing_id` ve `secret_ref` `create-hotel`'e **eklenmedi** (kullanıcı
talimatı + inceleme bulgusu aynı yönde). Gerekçe: otel yaratılırken provider /
external property ID / product code çoğunlukla bilinmez ve bir otelin birden
fazla provider/environment entegrasyonu olabilir.

Yeni: `npm run create-integration`
- Oteli **exact** `public_widget_key` veya `hotel_code` ile bulur — isim/LIKE **yok**.
- Provider registry allowlist'i ile doğrular (migration `0009` CHECK'i ile birebir).
- `--dry-run` hiçbir yazma yapmadan planı + çakışmaları gösterir.
- Aynı kapsamda (`hotel + provider + environment + property`) ikinci kayıt
  reddedilir; çakışmada **yarım kayıt oluşmaz** (plan aşaması insert'ten önce).
- Kayıt **her zaman `pending`** doğar.
- `webhook_routing_id` DB'de `gen_random_uuid()` ile üretilir, bir kez basılır.
- **Routing ID'nin auth OLMADIĞI** hem CLI çıktısında hem üç dokümanda açıkça yazıldı.
- Panel/public API `secret_ref` ve routing ID **döndürmez** (test edildi).

`create-hotel` çıktısındaki eski *"embed'i checkout sayfasına yapıştır"*
yönlendirmesi düzeltildi: artık Faz 1 widget (otelin kendi sitesi, ödeme değil)
ile Faz 2 booking-engine native optional extra **ayrı adımlar** olarak anlatılıyor
ve `create-integration` komutuna yönlendiriyor.

### 2.3 Secret oluşturma / saklama / rotasyon (bulgu #3)

- **`SecretResolver` interface'i** oluşturuldu. `EnvSecretResolver`
  `supportedEnvironments = ['sandbox']` — production için **meşru değil**.
- **`UnavailableProductionSecretResolver`** — production için bilinçli olarak
  **fail-closed**: hiçbir aday secret döndürmez. Production entegrasyonlar
  secret çözemez → webhook imzası doğrulanamaz (401 `secret_not_resolvable`) →
  aktivasyon reddedilir. Bu bir eksiklik değil, açık bir **kapı**dır.
- **`secret_ref` formatı** env-uyumlu hale getirildi: `^[A-Z][A-Z0-9_]{2,63}$`.
  Tire/küçük harf reddediliyor (`INTEGRATION_SECRET_hotel-a-ref` birçok kabukta
  geçerli bir değişken adı değil). Kısıt hem uygulamada hem DB'de (migration
  `0014` CHECK) uygulanıyor.
- **Script gerçek secret'ı DB'ye yazmıyor.** `--generate-secret` (yalnızca
  sandbox) 32 byte (256 bit) rastgele üretir ve **yalnızca terminalde, bir kez**
  gösterir; dry-run'da hiç üretilmez, log/rapor/dosyaya yazılmaz, `.env`
  otomatik değiştirilmez. Kaydedilecek anahtar adı ayrıca gösterilir.
- **Production'da `--generate-secret` reddediliyor** — gerçek secrets manager
  yokken secret üretmek, onu güvenle bir yere koyabileceğimiz izlenimi verirdi.
- **İki aşamalı rotasyon** (`npm run rotate-integration-secret`): tek
  `secret_ref` kolonuyla zero-downtime rotasyon **mümkün olmadığı için**
  migration `0014` `previous_secret_ref` + `previous_secret_expires_at` ekliyor.
  - `--phase begin`: yeni ref primary olur, eski ref overlap penceresine taşınır
    (varsayılan 60 dk). Pencerede **iki secret de kabul edilir**.
  - `--phase complete`: eski ref temizlenir; **`secret_last_rotated_at` yalnızca
    burada** set edilir — yarım kalmış rotasyon "tamamlanmış" görünmez.
  - `begin`, yeni secret kaydedilmemişse **reddedilir** (pencere dolunca
    entegrasyon tamamen kırılırdı). `complete` de aynı kontrolü yapar.
  - Süresi dolmuş `previous_secret_ref` **kabul edilmez** (expiry zorlayıcı).
  - DB kısıtları: ref+expiry birlikte dolu/boş; eski ve yeni ref aynı olamaz.

### 2.4 Entegrasyon aktivasyon kapısı (bulgu #4)

Yeni: `npm run activate-integration`. **Otelin `active` olması entegrasyonu
otomatik aktive etmez.** Beş kapı:

| Kapı | Kontrol |
| --- | --- |
| `adapter_configured` | SynXis `not_configured` iken **ASLA** aktive edilemez |
| `resolver_allowed_for_environment` | **production → RED** (gerçek secrets manager yok) |
| `secret_resolvable` | `secret_ref` çözülebiliyor mu (fail closed) |
| `property_and_product_present` | `external_property_id` + `product_code` dolu mu |
| `verification_delivery` | `processed` bir doğrulama eventi var mı |

`--override-verification` **yalnızca** son kapıyı atlar; güvenlik kapıları
atlanamaz (test edildi). `--dry-run` destekli. Kapı detay metinleri secret
**değeri** değil yalnızca **referans adı** içerir (test edildi).

---

## 3. Değiştirilen/eklenen dosyalar

**Yeni migration'lar (hiçbiri uygulanmadı):**
`0009_hotel_integrations` · `0010_reservations` · `0011_contributions` ·
`0012_integration_deliveries` · **`0013_ingest_reservation_event_fn`** ·
**`0014_integration_secret_rotation`**

**Yeni (api/src):** `src/integrations/` (normalized-event, state-machine,
provider-registry, secret-resolver, adapters/*, webhook-ingestion.{controller,service},
dashboard-integrations.controller, integrations-read.service, integrations.module)
+ `src/common/integration-webhook-rate.guard.ts` — hepsi `.spec.ts` eşlikçileriyle.

**Yeni (api/scripts):** `create-integration.{core,core.spec,}.ts` ·
`activate-integration.{core,core.spec,}.ts` · `rotate-integration-secret.{core,core.spec,}.ts`

**Yeni (api/test):** `test/staging/ingest-reservation-event.acceptance.sql` ·
`test/staging/bootstrap-acceptance.sql` · `test/staging/concurrency-manual.md` ·
`test/staging/README.md`

**Değiştirilen (api):** `src/app.module.ts` (IntegrationsModule) ·
`src/bootstrap.ts` (`rawBody: true`) · `test/fake-supabase.ts`
(`.neq/.in/.limit/.rpc` desteği) · `package.json` (3 yeni script) ·
`scripts/create-hotel.ts` (Faz 1/Faz 2 ayrımı) · `scripts/README.md`

**Yeni (panel):** `lib/money.ts`
**Değiştirilen (panel):** `lib/api.ts` · `app/rezervasyonlar/page.tsx` ·
`app/tahsilatlar/page.tsx` · `app/entegrasyon/page.tsx`

**Kök:** `BOOKING_ENGINE_OPTIONAL_EXTRA_CONTRACT.md` (yeni) · `README.md` ·
bu rapor

**Dokunulmadı:** `green-gold-widget/` kaynak kodu. Kullanıcının önceki
oturumlardan kalan untracked dosyaları (`CLAUDE_PRINCES_PALACE_*`,
`claude_princes_palace_*`, `green_gold_adim*`, `output/`, `tmp/`) korundu.

---

## 4. ✅ Gerçek Postgres acceptance testi — ÇALIŞTIRILDI

> **Durum değişikliği (2026-08-15):** bu bölüm önceki turda "en önemli açık
> risk" olarak işaretlenmişti. Docker Desktop kurulduktan sonra acceptance
> paketi **gerçek PostgreSQL 15.19 üzerinde sıfırdan çalıştırıldı ve
> T1–T15'in tamamı geçti.** Aşağıdaki "birim testte kanıtlanmadı" tablosu
> **hâlâ geçerlidir** (birim testler bu güvenceleri kanıtlamaz) — fark şu ki
> artık bu güvenceler **acceptance paketiyle gerçek Postgres'te
> kanıtlanmıştır**.

`ingest_reservation_event` fonksiyonunun **asıl güvencesi transaction
semantiğidir** (atomiklik, advisory lock, satır kilidi, rollback, serialization
failure). Bunların **hiçbiri** bellek-içi sahte Supabase istemcisiyle taklit
edilemez.

| Davranış | Birim testte kanıtlandı mı? | Gerçek Postgres acceptance'ta kanıtlandı mı? |
|---|---|---|
| Uygulama doğru RPC'yi doğru argümanlarla çağırıyor mu | ✅ evet | — (uygulama katmanı) |
| `already_processed` / `40001` sonuçlarını doğru ele alıyor mu | ✅ evet | — (uygulama katmanı) |
| Karar (state machine) doğru mu | ✅ evet (saf fonksiyon) | — (uygulama katmanı) |
| İmza/property/tenant kapıları domain yazımını engelliyor mu | ✅ evet | ✅ **evet** (T8–T11) |
| **Atomiklik (kısmi yazım kalmaması)** | ❌ **HAYIR** | ✅ **evet** (T3, T6) |
| **Advisory lock / satır kilidi** | ❌ **HAYIR** | ✅ **evet** (T14, T15 — `pg_blocking_pids` ile) |
| **Rollback** | ❌ **HAYIR** | ✅ **evet** (T3, T6, T15) |
| **Eşzamanlı duplicate'te toplamın bir kez etkilenmesi** | ❌ **HAYIR** | ✅ **evet** (T14) |
| **Lost update önleme** | ❌ **HAYIR** | ✅ **evet** (T15) |
| **EXECUTE yetki modeli** | ❌ **HAYIR** | ✅ **evet** (T12 + canlı `SET ROLE` denemesi) |

Bu güvenceler **birim testlerle değil**, aşağıdaki acceptance paketiyle
kanıtlanmıştır:

| Dosya | İçerik |
|---|---|
| `test/staging/bootstrap-acceptance.sql` | Yalnızca test için `auth` şeması/`auth.uid()`/`auth.users` + `anon`/`authenticated`/`service_role` rol stub'ları. **Production migration'ları bu test uğruna değiştirilmedi.** |
| `test/staging/ingest-reservation-event.acceptance.sql` | T1–T13 otomatik (`ASSERT`'li) |
| `test/staging/concurrency-manual.md` | T14–T15, iki oturum gerektiren senaryolar |
| `test/staging/README.md` | Güvenlik sınırlı Docker runbook'u |

### Acceptance test sonuçları

> ✅ **ÇALIŞTIRILDI — 2026-08-15, gerçek PostgreSQL 15.19 üzerinde.**
> Docker Desktop kurulduktan sonra runbook (`test/staging/README.md`) birebir
> uygulandı. **T1–T15'in tamamı geçti; hiçbir assertion gevşetilmedi, hiçbir
> test silinmedi/atlanmadı ve hiçbir kod/migration düzeltmesi gerekmedi
> (ilk çalıştırmada temiz geçti).**

#### Çalıştırma ortamı (gerçek PostgreSQL)

| Kalem | Değer |
|---|---|
| Motor | **PostgreSQL 15.19** (Debian 15.19-1.pgdg13+2, x86_64-linux) — gerçek sunucu, emülasyon değil |
| Container | `gg-faz2-acceptance` (disposable, `postgres:15`) |
| Bind | **yalnız `127.0.0.1:55433`** → container `5432` (`docker inspect`: `HostIp=127.0.0.1`) |
| Kalıcı volume | **YOK** — imajın anonim data volume'ü dahil `docker rm -v` ile silindi (`docker volume ls` sonda **boş**) |
| Bağlantı | Literal `host=127.0.0.1 port=55433 db=gg_acceptance user=gg_acceptance`; **repo `.env`'lerinden veya Supabase değişkenlerinden hiçbir değer alınmadı** |
| Hedef doğrulaması | Bağlanmadan önce `docker inspect` (port/mount), `Test-NetConnection 127.0.0.1:55433`, ardından `SELECT current_database(), current_user, version()` ile açıkça doğrulandı |
| Uzak DB | **Supabase'e veya herhangi bir uzak veritabanına hiçbir komut gönderilmedi** |
| Şema | `bootstrap-acceptance.sql` + production migration'ları **0001→0014 sırayla**, her biri `ON_ERROR_STOP=1`, hepsi hatasız |
| Temizlik | Container `stop` + `rm -v` edildi; container/volume/port sonda **boş** (doğrulandı) |

#### PGlite (ön doğrulama) — YAPILMADI

Repo'da PGlite kurulumu, bağımlılığı, script'i veya çıktısı **yoktur**
(arama sonucu: hiçbir dosyada `pglite` geçmiyor). Daha önce başlamış veya
tamamlanmış bir PGlite koşusu **bulunmadığından** raporda gösterilecek bir
PGlite sonucu da yoktur. Aşağıdaki tablodaki **tüm sonuçlar gerçek
PostgreSQL 15.19 sonuçlarıdır**; hiçbiri bir emülasyon/ön doğrulama sonucunun
yerine geçmemektedir.

| Koşu | Durum |
|---|---|
| PGlite (emülasyon, ön doğrulama) | ➖ **yapılmadı** (repo'da PGlite yok) |
| **Gerçek PostgreSQL 15.19 (disposable Docker)** | ✅ **T1–T15 tamamı çalıştırıldı ve geçti** |

#### T1–T13 — tek oturum, otomatik (`ASSERT`'li)

`psql -v ON_ERROR_STOP=1 -f test/staging/ingest-reservation-event.acceptance.sql`
→ **exit code 0**, 13 `NOTICE: Tn PASS`, sonda `ROLLBACK` (fixture kalıcı değil).

| Test | Ne doğrular | Gerçek PostgreSQL sonucu |
|---|---|---|
| T1 | confirmed+selected+collected; `hotel_id` DB'den türetiliyor | ✅ **PASS** |
| T2 | Duplicate event → `already_processed`, tutar şişmiyor (500 sabit) | ✅ **PASS** |
| T3 | Bayat karar → `40001` + tam rollback (delivery satırı bile yok) | ✅ **PASS** |
| T4 | `reject` → audit var, domain değişmiyor | ✅ **PASS** |
| T5 | `manual_review` → contribution dokunulmuyor | ✅ **PASS** |
| T6 | Contribution CHECK hatası → reservation da geri alınıyor (**atomiklik**) | ✅ **PASS** |
| T7 | **İmza kanıtı:** `p_hotel_id`/`p_provider` yok, tek overload | ✅ **PASS** |
| T8 | **Çapraz tenant** reddi (`22023`) + 3 tablonun satır sayısı sabit | ✅ **PASS** |
| T9 | **Pending** integration yazamıyor | ✅ **PASS** |
| T10 | **Suspended** integration yazamıyor (provider DB'den okunuyor) | ✅ **PASS** |
| T11 | **Bilinmeyen** integration → domain VE audit yazamıyor | ✅ **PASS** |
| T12 | **EXECUTE:** PUBLIC/anon/authenticated kapalı, service_role açık | ✅ **PASS** |
| T13 | `SECURITY DEFINER` + sabit `search_path` | ✅ **PASS** |

T7'nin bastığı gerçek imza (çapraz tenant çağrısı **ifade edilemiyor**):

```
p_integration_id uuid, p_provider_event_id text, p_provider_reservation_id text,
p_payload_hash text, p_normalized_snapshot jsonb, p_delivery_status text,
p_error_code text, p_expected_provider_updated_at timestamp with time zone,
p_expected_reservation_exists boolean, p_reservation_patch jsonb,
p_contribution_patch jsonb
```

#### T14–T15 — iki ayrı bağlantı, gerçekten çalıştırıldı

İki ayrı `psql` süreci (iki ayrı backend PID) ile `concurrency-manual.md`
senaryoları uygulandı. Blokajın **gerçekten** oluştuğu, üçüncü bir gözlem
oturumundan `pg_stat_activity` + `pg_blocking_pids()` ile kanıtlandı.

| Test | Ne doğrular | Gerçek PostgreSQL sonucu |
|---|---|---|
| T14 | Eşzamanlı **aynı** event (idempotency yarışı) | ✅ **PASS** |
| T15 | Eşzamanlı **farklı** event (lost update önleme, `40001`) | ✅ **PASS** |

**T14 kanıtı** — A `evt-race`'i işleyip commit etmeden beklerken B aynı event'le
girdi:

```
 pid | state  | wait_event_type | wait_event | query
 102 | active | Timeout         | PgSleep    | SELECT pg_sleep(12);        <- A (kilidi tutan)
 104 | active | Lock            | advisory   | SELECT public.ingest_...    <- B (BLOKE)

 blocked_pid | blocking_pid | wait_event_type | wait_event
         104 |          102 | Lock            | advisory
```

B, **advisory lock üzerinde 6.9 sn bloke kaldı** (20:56:42.870 → 20:56:49.765)
ve tam A'nın COMMIT'i (20:56:49.765) ile çözüldü; dönen değer
**`already_processed`**. Son durum:
`reservations(res-race)=1`, `contributions=1`, `integration_deliveries(evt-race)=1`,
`amount_minor=500` → **finansal toplam bir kez etkilendi**.

**T15 kanıtı** — A baseline'ı `2026-01-01T10:00Z` → `2026-01-02T10:00Z`
ilerletirken, B **aynı** baseline'ı iddia etti:

```
 blocked_pid | blocking_pid | wait_event_type | wait_event
         113 |          111 | Lock            | advisory
```

B **7.0 sn bloke** kaldı (20:58:22.512 → 20:58:29.545), A commit edince
blokaj çözüldü ve B şu hatayı aldı:

```
ERROR:  40001: stale decision: provider_updated_at degisti
CONTEXT: PL/pgSQL function ingest_reservation_event(...) line 124 at RAISE
```

B'nin transaction'ı **tamamen geri alındı**: `evt-B` için delivery satırı
**yok**, `booking_status='modified'` (A'nınki), `provider_updated_at=2026-01-02T10:00Z`,
`amount_minor=600`, `contributions` satır sayısı 1 → **lost update önlendi**.

#### SECURITY DEFINER / search_path / EXECUTE — gerçek katalog çıktısı

T12/T13'e ek olarak katalog doğrudan sorgulandı ve **gerçek rol değiştirerek**
negatif/pozitif deneme yapıldı:

```
 proname                  | security_definer | proconfig                       | proacl
 ingest_reservation_event | t                | {"search_path=public, pg_temp"} | {gg_acceptance=X/gg_acceptance,
                                                                                service_role=X/gg_acceptance}
```

`proacl`'de **PUBLIC girdisi yok** (`=X/...` biçiminde bir satır bulunmuyor) —
yani `PUBLIC` execute kapalı. Rol değiştirerek yapılan canlı deneme:

| Rol | Sonuç |
|---|---|
| `SET ROLE anon` → RPC çağrısı | ❌ `ERROR: permission denied for function ingest_reservation_event` (beklenen) |
| `SET ROLE authenticated` → RPC çağrısı | ❌ `ERROR: permission denied for function ingest_reservation_event` (beklenen) |
| `SET ROLE service_role` → RPC çağrısı | ✅ `processed` döndü (beklenen) |

Runbook (`test/staging/README.md`) uygulandığı haliyle şu güvenlik sınırlarını
zorladı: disposable `gg-faz2-acceptance` container'ı, `127.0.0.1:55433` bind,
kalıcı volume yok, `.env`/Supabase'den **alınmayan** literal bağlantı bilgisi,
hedefin komut öncesi doğrulanması, `0001..0014` sıralı + `ON_ERROR_STOP=1`,
sonda container'ın durdurulup **volume'üyle birlikte** kaldırılması.

> Migration'lar **yalnızca disposable container'a** uygulandı. Supabase'e
> (production veya staging) **hiçbir migration uygulanmadı**, hiçbir bağlantı
> açılmadı. Deploy/commit/push yapılmadı.

---

## 5. Production blocker'ları (açık ve bilinçli)

1. **Gerçek secrets manager YOK.** Env tabanlı çözüm yalnızca local/sandbox.
   Production resolver fail-closed → production entegrasyon aktive edilemez,
   webhook'u doğrulanamaz. Vault / AWS Secrets Manager / per-integration KMS
   entegre edilmeden production akışı açılmamalı.
2. ~~**Atomiklik + tenant bağı SQL'i gerçek Postgres'te doğrulanmadı.**~~
   **ÇÖZÜLDÜ (2026-08-15):** acceptance paketi disposable PostgreSQL 15.19
   container'ında sıfırdan çalıştırıldı; T1–T15 tamamı geçti (Bölüm 4).
   Kalan not: bu doğrulama **vanilla Postgres 15** üzerinde yapıldı; Supabase'in
   kendi rol/RLS ortamında migration'lar henüz uygulanmadı (bkz. Bölüm 9,
   madde 4). Acceptance koşusunda `auth` şeması ve `anon`/`authenticated`/
   `service_role` rolleri `bootstrap-acceptance.sql` ile **stub'landı**;
   dolayısıyla **RLS politikalarının gerçek Supabase davranışı** bu koşuda
   test edilmedi (acceptance testleri RLS'i değil RPC/transaction davranışını
   sınar).
3. **SynXis adapter'ı `not_configured`** — doküman/sandbox/credential yok;
   aktivasyon kapısı SynXis'i reddediyor.
4. **`rawBody: true` Vercel serverless'ta canlı doğrulanmadı** — lokal
   `nest build` + jest ile doğrulandı; preview deploy'da gerçek bir webhook
   isteğiyle sınanmalı.
5. **`integration_deliveries` retention politikası otomatikleştirilmedi**
   (repo'da cron/scheduled-job altyapısı yok). Öneri: işlenmiş kayıtları 90 gün
   sonra arşivle/sil.

---

## 6. Operatör komut örnekleri (gerçek secret içermez)

```bash
# 1) Entegrasyon kaydı — önce dry-run
npm run create-integration -- \
  --hotel-key HTL-1024 \
  --provider generic_signed_webhook \
  --environment sandbox \
  --external-property-id PROP-12345 \
  --product-code GG-OPTIONAL-EXTRA \
  --secret-ref PRINCES_PALACE_SANDBOX \
  --dry-run

# 2) Gerçek oluşturma + sandbox secret üretimi (değer BİR KEZ gösterilir)
npm run create-integration -- \
  --hotel-key HTL-1024 --provider generic_signed_webhook \
  --environment sandbox --external-property-id PROP-12345 \
  --product-code GG-OPTIONAL-EXTRA --secret-ref PRINCES_PALACE_SANDBOX \
  --generate-secret

# 3) Secret'ı INTEGRATION_SECRET_PRINCES_PALACE_SANDBOX olarak kaydedin,
#    sağlayıcıya güvenli kanaldan iletin, sandbox test eventi gönderin.

# 4) Aktivasyon — önce kapıları görün
npm run activate-integration -- --integration-id <uuid> --dry-run
npm run activate-integration -- --integration-id <uuid>

# 5) Rotasyon (iki aşama)
npm run rotate-integration-secret -- --integration-id <uuid> \
  --phase begin --new-secret-ref PRINCES_PALACE_SANDBOX_V2 --generate-secret
#    değeri kaydedin, sonra:
npm run rotate-integration-secret -- --integration-id <uuid> \
  --phase begin --new-secret-ref PRINCES_PALACE_SANDBOX_V2 --overlap-minutes 60
#    sağlayıcı kendi tarafını güncelledikten sonra:
npm run rotate-integration-secret -- --integration-id <uuid> --phase complete
```

---

## 7. Migration sırası ve rollback

| Migration | İçerik | Rollback |
|---|---|---|
| `0009_hotel_integrations` | Entegrasyon kaydı + RLS + unique index'ler | `DROP TABLE hotel_integrations CASCADE;` |
| `0010_reservations` | Doğrulanmış rezervasyon + RLS | `DROP TABLE reservations CASCADE;` |
| `0011_contributions` | Katkı (integer minor units) + RLS + tek-aktif index | `DROP TABLE contributions CASCADE;` |
| `0012_integration_deliveries` | Webhook inbox/audit + RLS | `DROP TABLE integration_deliveries CASCADE;` |
| `0013_ingest_reservation_event_fn` | **Atomik ingestion RPC'si** + **tenant bağının DB'de zorlanması** (hotel_id/provider parametre DEĞİL, integration satırından türetilir) | `DROP FUNCTION public.ingest_reservation_event(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB, JSONB);` |
| `0014_integration_secret_rotation` | Rotasyon kolonları + secret_ref format CHECK'i | `ALTER TABLE hotel_integrations DROP COLUMN previous_secret_ref, DROP COLUMN previous_secret_expires_at;` + 4 CHECK constraint drop |

**Uygulama sırası:** 0009 → 0010 → 0011 → 0012 → 0013 → 0014.
**Rollback sırası (tersten):** 0014 → 0013 → 0012 → 0011 → 0010 → 0009.

`0013` idempotenttir (`CREATE OR REPLACE FUNCTION`) — güvenle yeniden
uygulanabilir. `0014`'ün `secret_ref` format CHECK'i, 0009 dosyasını geriye
dönük düzenlemek yerine **append-only** migration disiplinine uyularak ayrı
dosyada eklendi.

Hiçbiri mevcut `hotels`/`users`/`widget_events` tablolarını değiştirmez —
tamamı yeni, ek nesnelerdir (Faz 1 verisini etkilemez).

---

## 8. Test/build sonuçları

```
cd green-gold-api
npm test -- --runInBand   → 27 suite, 314 test — HEPSİ GEÇTİ
                             (ilk tur 239 → 2. tur 313 → 3. tur 314)
npm run build              → başarılı
npx tsc --noEmit           → temiz (scripts/ dahil)

cd ../green-gold-widget
npm test                   → 28 test — HEPSİ GEÇTİ (dokunulmadı, regresyon yok)
npm run check:widget       → OK (sha256 65e245229c1e…)

cd ../green-gold-panel
npm run lint               → temiz (0 hata)
npm run build              → başarılı (20 route, TypeScript temiz)
```

Acceptance (SQL) testleri **ayrı** çalıştırılır (Jest'te ve CI'da koşmaz):

```
# disposable PostgreSQL 15.19 container (127.0.0.1:55433, volume yok)
bootstrap-acceptance.sql                    → OK
migrations 0001..0014 (sirayla, ON_ERROR_STOP=1) → hepsi OK
ingest-reservation-event.acceptance.sql     → exit 0, T1..T13 PASS
concurrency (iki ayri baglanti)             → T14 PASS, T15 PASS
```

> Yukarıdaki 314 birim testi transaction/tenant-bağı davranışını
> **kanıtlamaz**; yalnızca uygulama tarafının çağrı sözleşmesini doğrular. O
> davranışların kanıtı Bölüm 4'teki acceptance sonuçlarıdır. Bu turda **hiçbir
> kaynak dosya, migration veya test değiştirilmedi** — acceptance paketi ilk
> çalıştırmada temiz geçti, dolayısıyla `npm test` / `build` sonuçları
> yukarıdaki turdan aynen geçerlidir.

Bu turda eklenen test başlıkları: atomik RPC çağrı sözleşmesi (argümanlar,
optimistic baseline, `already_processed`, `40001` → 503), rotasyon overlap
penceresi (eski secret kabul/ret/expiry), production fail-closed,
`create-integration` (dry-run yazmıyor, exact hotel resolution, duplicate reddi,
secret sızıntısı yok, SynXis pending ama active değil), `activate-integration`
(her kapı ayrı ayrı + override'ın güvenlik kapılarını atlayamaması),
rotasyon lifecycle (begin/complete, expiry, timestamp yalnızca complete'te).

### Lint disiplini notu

`green-gold-api`'nin `npm run lint` script'i `eslint --fix` içerir ve
**dokunmadığım dosyaları da** yeniden formatlar. Bu turda bu tuzağa
düşülmedi: lint yalnızca **bu turda yazdığım/değiştirdiğim dosyalara**
kapsamlandırılarak çalıştırıldı. `git status` bunu doğruluyor — pre-existing
kaynak dosyalarda beklenmeyen değişiklik yok.

Kalan lint uyarıları yalnızca `integrations-read.service.ts`'teki
`resolveRange` kullanım desenidir; bu, `dashboard.service.ts`'teki **önceden
var olan** deseni birebir taklit eder (üslup tutarlılığı) ve
`scripts/*.core.spec.ts`'teki `require-await`, mevcut `activate-hotel.core.spec.ts`
/ `create-hotel.core.spec.ts` ile **aynı** repo konvansiyonudur (baseline
karşılaştırmasıyla doğrulandı).

---

## 9. Production'a geçiş sırası

1. ~~**Disposable Postgres'te `test/staging/` acceptance testlerini çalıştır**~~
   ✅ **TAMAMLANDI (2026-08-15)** — PostgreSQL 15.19, T1–T13 otomatik +
   T14–T15 iki ayrı bağlantı, hepsi PASS (Bölüm 4).
2. Gerçek bir secrets manager entegre et; `SecretResolver`'ın production
   implementasyonunu yaz (fail-closed olanın yerine).
3. Bir sağlayıcıyla gerçek doküman/sandbox/credential elde et; adapter yaz,
   registry + migration `0009` CHECK'ine ekle.
4. Migration'ları staging Supabase'e uygula (0009→0014).
5. `npm run create-integration` ile pilot otelin sandbox kaydını oluştur.
6. Sandbox'tan imzalı test event'leri gönder; kabul testi matrisini
   (sözleşme dokümanı Bölüm 7) doğrula.
7. `npm run activate-integration` (tüm kapılar geçmeli).
8. Preview deploy'da `rawBody` + webhook ucunu gerçek istekle doğrula.
9. Production credential + gerçek secrets manager ile `environment=production`
   entegrasyonu aç.
10. Panel sayfaları ilk gerçek event'le birlikte `ComingSoon`'dan otomatik
    olarak gerçek veri görünümüne geçer — panel tarafında ek kod gerekmez.

---

## `git status --short`

```
 M README.md
 M green-gold-api/package.json
 M green-gold-api/scripts/README.md
 M green-gold-api/scripts/create-hotel.ts
 M green-gold-api/src/app.module.ts
 M green-gold-api/src/bootstrap.ts
 M green-gold-api/test/fake-supabase.ts
 M green-gold-panel/app/entegrasyon/page.tsx
 M green-gold-panel/app/rezervasyonlar/page.tsx
 M green-gold-panel/app/tahsilatlar/page.tsx
 M green-gold-panel/lib/api.ts
?? BOOKING_ENGINE_OPTIONAL_EXTRA_CONTRACT.md
?? CLAUDE_FAZ2_BOOKING_ENGINE_CEKIRDEK_RAPORU.md
?? green-gold-api/scripts/activate-integration.core.spec.ts
?? green-gold-api/scripts/activate-integration.core.ts
?? green-gold-api/scripts/activate-integration.ts
?? green-gold-api/scripts/create-integration.core.spec.ts
?? green-gold-api/scripts/create-integration.core.ts
?? green-gold-api/scripts/create-integration.ts
?? green-gold-api/scripts/rotate-integration-secret.core.spec.ts
?? green-gold-api/scripts/rotate-integration-secret.core.ts
?? green-gold-api/scripts/rotate-integration-secret.ts
?? green-gold-api/src/common/integration-webhook-rate.guard.ts
?? green-gold-api/src/integrations/
?? green-gold-api/supabase/migrations/0009_hotel_integrations.sql
?? green-gold-api/supabase/migrations/0010_reservations.sql
?? green-gold-api/supabase/migrations/0011_contributions.sql
?? green-gold-api/supabase/migrations/0012_integration_deliveries.sql
?? green-gold-api/supabase/migrations/0013_ingest_reservation_event_fn.sql
?? green-gold-api/supabase/migrations/0014_integration_secret_rotation.sql
?? green-gold-api/test/staging/
?? green-gold-panel/lib/money.ts
```

`green-gold-api/test/staging/` içeriği: `README.md`,
`bootstrap-acceptance.sql`, `concurrency-manual.md`,
`ingest-reservation-event.acceptance.sql`.

Ayrıca bu görevden **önce de** untracked olan ve dokunulmayan dosyalar:
`CLAUDE_PRINCES_PALACE_PILOT_HAZIRLIK_RAPORU.md`,
`claude_faz2_booking_engine_optional_extra_cekirdek_promptu.md`,
`claude_faz2_cekirdek_inceleme_duzeltmeleri.md`,
`claude_princes_palace_inceleme_duzeltmeleri.md`,
`claude_princes_palace_pilot_hazirlik_promptu.md`,
`green_gold_adim14_ux_gorsel_iyilestirme.md`, `green_gold_adim9_sifre_sifirlama.md`,
`green_gold_claude_durum_karar_ve_bekleme_promptu.md`, `output/`, `tmp/`.

## `git diff --stat`

```
 README.md                                    |  20 ++++
 green-gold-api/package.json                  |   3 +
 green-gold-api/scripts/README.md             | 133 ++++++++++++++++++++++++++-
 green-gold-api/scripts/create-hotel.ts       |  27 +++++-
 green-gold-api/src/app.module.ts             |   2 +
 green-gold-api/src/bootstrap.ts              |  15 ++-
 green-gold-api/test/fake-supabase.ts         |  76 ++++++++++++++-
 green-gold-panel/app/entegrasyon/page.tsx    |  58 +++++++++++-
 green-gold-panel/app/rezervasyonlar/page.tsx | 121 +++++++++++++++++++++---
 green-gold-panel/app/tahsilatlar/page.tsx    |  93 +++++++++++++++----
 green-gold-panel/lib/api.ts                  |  72 +++++++++++++++
 11 files changed, 577 insertions(+), 43 deletions(-)
```

(Yeni dosyalar untracked olduğu için `--stat`'ta görünmez; listeleri Bölüm 3'te.)

---

## Sonuç

İlk turun dört inceleme bulgusu + üçüncü turun kritik RPC tenant bağlama
bulgusu uygulandı:

- Finansal ingestion tek Postgres transaction'ına alındı (advisory lock +
  optimistic re-check + idempotency).
- **RPC artık `hotel_id`/`provider`'ı çağırandan almıyor** — `FOR SHARE` ile
  kilitlediği integration satırından türetiyor, `active` durumunu transaction
  içinde doğruluyor, property için ikinci savunma uyguluyor. Çapraz tenant
  çağrısı artık **ifade edilemez**.
- Entegrasyon oluşturma `create-hotel`'den ayrıldı.
- `SecretResolver` interface'i + iki aşamalı rotasyon eklendi; production yolu
  fail-closed, env resolver hiçbir yerde production çözümü gibi sunulmuyor.
- Aktivasyon beş kapılı bir güvenlik sınırı; SynXis `not_configured` olduğu
  sürece aktive edilemiyor.

**Önceki turun tek büyük eksiği kapatıldı:** acceptance testlerinin
**tamamı (T1–T15)** disposable bir PostgreSQL 15.19 container'ında sıfırdan
çalıştırıldı ve **hepsi geçti**. Atomiklik, tam rollback, tenant bağlama,
inactive/unknown integration reddi, duplicate idempotency, stale event `40001`,
advisory-lock eşzamanlılığı, lost update önleme, `SECURITY DEFINER` + sabit
`search_path` ve yalnız `service_role` EXECUTE — hepsi artık **gerçek
Postgres'te kanıtlanmış** durumdadır (Bölüm 4). Hiçbir assertion gevşetilmedi,
hiçbir test silinmedi/atlanmadı; düzeltme gerekmedi.

Kalan production blocker'ları: gerçek secrets manager yokluğu, SynXis
`not_configured`, Supabase ortamında (gerçek `auth`/RLS rolleriyle) migration
uygulaması, `rawBody` canlı doğrulaması ve delivery retention politikası
(Bölüm 5).

Supabase'e migration uygulanmadı, deploy/commit/push yapılmadı.
**İnceleme için duruyorum.**
