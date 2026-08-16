# Operatör Script'leri

⚠️ Bu script'ler **yalnızca lokal/operatör** kullanımı içindir. `service_role`
anahtarıyla çalışır (RLS bypass). **Public self-service kayıt değildir** — otel
oluşturma bilinçli olarak yetkili bir operatörün elindedir.

## Ön koşul

`green-gold-api/.env` (bkz. `.env.example`):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# opsiyonel: embed kodundaki data-api adresi (varsayılan http://localhost:3000)
# API_PUBLIC_URL=https://api.otel.com
# opsiyonel: davet linkinin döneceği panel adresi (varsayılan http://localhost:3001)
# PANEL_URL=https://panel.otel.com
```

> Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**'e
> panel callback'i eklenmeli: `<PANEL_URL>/auth/callback` (davet linki buraya
> döner). Aksi halde davet/set-password linki çalışmaz.

## "5 dakikada kurulum" — 4 adım

### 1) Otel + yönetici oluştur

```bash
npm run create-hotel -- \
  --name "Deniz Otel" \
  --email yonetici@denizotel.com \
  --city "İzmir" \
  --tz Europe/Istanbul \
  --type city
```

| Bayrak          | Zorunlu | Açıklama                                                     |
| --------------- | ------- | ----------------------------------------------------------- |
| `--name`        | evet    | Otel adı                                                    |
| `--email`       | evet    | Yönetici e-postası (giriş yapacak kişi)                     |
| `--city`        | hayır   | Şehir                                                       |
| `--tz`          | hayır   | IANA timezone (varsayılan Europe/Istanbul)                 |
| `--type`        | hayır   | `city` \| `premium` \| `resort` (tanımlayıcı, varsayılan `city`) |
| `--admin-name`  | hayır   | Yöneticinin adı (varsayılan e-posta öneki)                 |
| `--dry-run`     | hayır   | Hiçbir kayıt yazmadan yapılacakları gösterir               |

Otel **`pending`** (yayında değil) oluşturulur. Çıktı: otel id/kodu, **widget
key**, **embed kodu** ve **davet linki**.

- **Yönetici şifresi YOK.** Bunun yerine `generateLink('invite')` ile
  **tek kullanımlık davet linki** üretilir; yönetici panelde ayrı
  **`/set-password`** akışında kendi şifresini belirler (recovery
  `/reset-password` akışından ayrıdır).
- ⚠️ Bu link **e-posta göndermez**, yalnızca üretir. Yöneticiye **güvenli
  kanaldan** iletin. (E-posta göndermek isterseniz ayrıca
  `auth.admin.inviteUserByEmail` kullanılmalıdır.) Link **loglanmaz**, konsola
  bir kez basılır.

### 2) İzinli domain ekle

Yönetici panele girip **Ayarlar → izin verilen alan adları**'na otelin sitesini
ekler (ör. `https://denizotel.com`). En az bir geçerli domain zorunludur.

### 3) Faz 1 widget'ını siteye yerleştir

Script'in bastığı embed kodunu otelin sitesine koyun.

> **⚠️ Faz 1 widget ≠ Faz 2 booking-engine entegrasyonu.** Bu ikisi AYRI
> adımlardır ve karıştırılmamalıdır:
>
> | | **Faz 1 — widget** | **Faz 2 — booking engine optional extra** |
> |---|---|---|
> | Nereye | Otelin kendi sitesi (ör. WordPress) | Booking engine'in KENDİ ürün kataloğu |
> | Ne yapar | Tercih/analitik sinyali toplar | Gerçek, tahsil edilen bir kalem ekler |
> | Kurulum | `<script>` + `<green-gold-widget>` | `npm run create-integration` + sağlayıcı tarafı |
> | Ödeme | **YOK** — buton tıklaması ödeme DEĞİLDİR | Otelin payment gateway'inde tek tahsilat |
>
> Widget'ı booking engine'in checkout sayfasına gömmek **Faz 2 entegrasyonu
> yerine geçmez** — widget booking total'ını değiştirmez ve değiştirmemelidir.
> Faz 2 için aşağıdaki "Booking engine entegrasyonu" bölümüne bakın.

### 4) Oteli aktive et

```bash
npm run activate-hotel -- --key <public_widget_key>
```

- `status`'ü `pending` → `active` yapar; widget ancak bundan sonra çalışır.
- ⚠️ **En az bir geçerli `allowed_origin` yoksa aktivasyonu REDDEDER** (widget
  izinsiz domain'de çalışmasın). `--dry-run` ile önce kontrol edebilirsiniz.

## Demo tenant kurulumu (herkese açık demo giriş için)

Demo giriş butonu (`DEMO_LOGIN_ENABLED=true`) **ayrı** bir demo tenant'ına
bağlanmalı — pilot otelin gerçek verisi/anahtarı asla demo'da görünmemeli.

### 1a) Demo kullanıcısı YOKSA (ilk kurulum)

```bash
npm run create-hotel -- \
  --name "Green Gold Demo Otel" --city "Antalya" \
  --email demo@greengold.example \
  --role demo_viewer --password '<DEMO_LOGIN_PASSWORD>'
```

### 1b) Demo Auth kullanıcısı ZATEN VARSA (yeniden bağlama)

`create-hotel`'i körü körüne çalıştırmayın (preflight e-posta çakışmasında
zaten reddeder). Bunun yerine mevcut kullanıcıyı demo tenant'a bağlayın:

```bash
npm run rebind-demo-user -- --email demo@greengold.example
#   önce kontrol:  ... --email demo@greengold.example --dry-run
```

- Demo Otel'i bulur/oluşturur; **mevcut** demo kullanıcısının `public.users`
  satırını bu otele bağlar (`hotel_id` + `role='demo_viewer'` + `auth_user_id`).
- **İdempotent**; **yetim** profilleri temizler → pilot otelde demo kalıntısı
  bırakmaz. Sonda "tek profil, doğru bağlar" doğrulaması yapar.

> Her iki durumda da: `--role demo_viewer` → API'de tüm yazma metotları 403
> (`DemoReadOnlyGuard`, global). Panel `.env`'inde `DEMO_LOGIN_EMAIL` /
> `DEMO_LOGIN_PASSWORD` demo kullanıcıyla aynı olmalı; `DEMO_LOGIN_ENABLED=true`.

```bash
# 2) Demo otelinin izinli origin'ini SQL ile ekleyin (demo kullanıcı salt
#    okunur olduğundan panelden ekleyemez):
#    UPDATE hotels SET allowed_origins = ARRAY['https://<demo-panel-domain>']
#      WHERE public_widget_key = '<demo_key>';

# 3) Aktive edin
npm run activate-hotel -- --key <demo_public_widget_key>

# 4) Gerçekçi demo verisi (idempotent — tekrar çalıştırınca çoğaltmaz)
npm run seed-demo-data -- --key <demo_public_widget_key>
#    Kontrol için önce:  ... --key <key> --dry-run
```

Seed verisi: son ~60 güne yayılmış, huni monoton (viewed ⊇ selected ⊇ clicked),
dönüşüm **gerçekçi** (%100 değil), `nights` 1–7. Yalnızca `demo-sess-` önekli
kayıtları yönetir; gerçek event'lere dokunmaz.

## Widget pilot ayarları (`widget_settings`) — panel UI YOK, bilinçli tercih

`hotels.widget_settings` (JSONB) şu bayrakları taşır: `pilot_mode`,
`show_estimated_impact`, `enable_booking_click_tracking`, `content_overrides`
(TR/EN, yalnızca `heading` / `checkboxLabel` / `addButton` / `confirmation`
düz metin override'ları — HTML kabul edilmez). **Varsayılan hepsi kapalı/boş**
(migration `0007_widget_settings.sql`) — yeni/gerçek bir otel yanlışlıkla
placeholder karbon sayıları göstermez veya booking-click event'i üretmez.

Bu ayarlar **bilinçli olarak panelde değil** — Green Gold operasyon ekibinin
kontrolünde: sürdürülebilirlik sayılarının ne zaman gösterileceği bir ürün/
hukuk kararı, otel yöneticisinin kendi başına açıp kapatabileceği bir şey
değil. Değiştirmek için:

```bash
# Örnek: Princes' Palace pilotu için booking-click tracking'i aç, karbon
# sayılarını KAPALI bırak (metodoloji onayı gelene kadar):
npm run set-widget-settings -- \
  --key <public_widget_key> \
  --enable-booking-click-tracking true \
  --dry-run          # önce kontrol et, sonra --dry-run'ı kaldırıp tekrar çalıştır
```

| Bayrak | Açıklama |
| --- | --- |
| `--key` | Zorunlu. Otelin `public_widget_key`'i. |
| `--pilot-mode true\|false` | Bilgilendirici pilot işareti (şu an davranış değiştirmez; ileride panel/rapor etiketlemesi için ayrılmıştır). |
| `--show-estimated-impact true\|false` | CO₂/ağaç-yılı/aylık impact satırlarının widget'ta gösterilip gösterilmeyeceği. |
| `--enable-booking-click-tracking true\|false` | `booking_engine_clicked` event'inin bu otel için kabul edilip edilmeyeceği. |
| `--content-tr-*` / `--content-en-*` | `heading` / `checkbox-label` / `add-button` / `confirmation` düz metin override'ı (boş string `""` verilirse o alan override'dan kaldırılır). |
| `--clear-content-overrides` | Tüm TR/EN override'ları temizler. |
| `--dry-run` | Hiçbir şey yazmadan önce/sonra durumu gösterir. |

Yalnızca verilen bayraklar değişir — diğer ayarlar dokunulmadan kalır
(kısmi güncelleme, `applyPatch` — `set-widget-settings.core.spec.ts`).

### Demo tenant'ta mevcut görünümü korumak

Bu migration'dan önce demo widget'ı her zaman CO₂/impact satırlarını
gösteriyordu (`is_estimated` her zaman `true`'ydu). Yeni varsayılan `false`
olduğundan, demo tenant'ın mevcut görünümünü korumak için migration
uygulandıktan sonra AÇIKÇA açın:

```bash
npm run set-widget-settings -- --key <demo_public_widget_key> --show-estimated-impact true
```

## Booking engine entegrasyonu (Faz 2) — ayrı yaşam döngüsü

**Entegrasyon oluşturma, otel oluşturmadan AYRIDIR.** Otel yaratılırken
provider / external property ID / product code çoğunlukla henüz bilinmez ve
bir otelin birden fazla provider/environment entegrasyonu olabilir. Bu yüzden
`create-hotel` bu alanları **istemez**; `webhook_routing_id` ve `secret_ref`
create-hotel'e ait değildir.

### 1) Entegrasyon kaydı oluştur

```bash
npm run create-integration -- \
  --hotel-key <public_widget_key veya hotel_code> \
  --provider generic_signed_webhook \
  --environment sandbox \
  --external-property-id <sağlayıcının property id'si> \
  --product-code <booking engine'deki ürün kodu> \
  --secret-ref PRINCES_PALACE_SANDBOX \
  --dry-run
```

| Bayrak | Zorunlu | Açıklama |
| --- | --- | --- |
| `--hotel-key` | evet | **TAM eşleşme** (`public_widget_key` veya `hotel_code`). İsim/LIKE araması YOK. |
| `--provider` | evet | `generic_signed_webhook` \| `synxis` (registry allowlist) |
| `--environment` | hayır | `sandbox` (varsayılan) \| `production` |
| `--external-property-id` | evet | Sağlayıcının property/hotel kimliği |
| `--product-code` | evet | Booking engine'deki gerçek optional-extra ürün kodu |
| `--secret-ref` | evet | **Opak referans** — secret'ın KENDİSİ değil. Format: `^[A-Z][A-Z0-9_]{2,63}$` |
| `--generate-secret` | hayır | Yalnızca sandbox. 32 byte rastgele secret üretir, **bir kez** gösterir |
| `--dry-run` | hayır | Hiçbir yazma yapmadan planı ve çakışmaları gösterir |

- Kayıt **her zaman `pending`** doğar. Aktivasyon ayrı bir kapıdır.
- Aynı kapsamda (`hotel + provider + environment + property`) ikinci kayıt
  **reddedilir**; çakışmada yarım kayıt oluşmaz.
- `webhook_routing_id` DB tarafında `gen_random_uuid()` ile üretilir ve
  **bir kez** ekrana basılır.
- **⚠️ Routing ID bir kimlik doğrulama DEĞİLDİR.** Yalnızca hangi entegrasyona
  ait olduğunu söyler; gerçek doğrulama **imza** ile yapılır. Panel ve public
  API `secret_ref`'i de routing ID'yi de **döndürmez**.

### 2) Secret'ı kaydet

Script secret'ı **DB'ye asla yazmaz**. `--generate-secret` kullandıysanız değer
terminalde **bir kez** gösterilir; hiçbir log/rapor/dry-run çıktısına düşmez ve
`.env` **otomatik değiştirilmez**. Değeri gösterilen anahtar adıyla
(`INTEGRATION_SECRET_<REF>`) kendiniz kaydedin ve aynı değeri sağlayıcıya
güvenli kanaldan iletin.

> **⚠️ Production blocker:** env tabanlı secret çözümü **yalnızca
> local/sandbox** içindir. Production için gerçek bir secrets manager
> (Vault / AWS Secrets Manager / per-integration KMS) **henüz yoktur** ve
> `UnavailableProductionSecretResolver` bilinçli olarak **fail-closed**tır:
> production entegrasyonlar secret çözemez, webhook imzası doğrulanamaz ve
> aktivasyon reddedilir. Bu bir hata değil, açık bir kapıdır.

### 3) Sandbox doğrulama eventi gönder

Sağlayıcı (veya sandbox test aracınız) imzalı bir test eventi göndermeli ve bu
event `processed` olarak işlenmelidir. Aktivasyon kapısı bunu arar.

### 4) Entegrasyonu aktive et

```bash
npm run activate-integration -- --integration-id <uuid> --dry-run
```

Aktivasyon **tüm** şu kapıları doğrular (hepsi geçmeden `active` olmaz):

| Kapı | Ne kontrol eder |
| --- | --- |
| `adapter_configured` | Provider adapter'ı gerçekten yapılandırılmış mı (SynXis `not_configured` iken **ASLA**) |
| `resolver_allowed_for_environment` | Bu environment için meşru bir secret resolver var mı (**production → RED**) |
| `secret_resolvable` | `secret_ref` gerçek bir secret'a çözülebiliyor mu |
| `property_and_product_present` | `external_property_id` ve `product_code` dolu mu |
| `verification_delivery` | Başarıyla işlenmiş (`processed`) bir doğrulama eventi var mı |

- `--override-verification` **yalnızca** son kapıyı atlar. Güvenlik kapıları
  (adapter, resolver, secret) **atlanamaz**.
- **Otelin `active` olması entegrasyonu otomatik aktive ETMEZ.**

### 5) Secret rotasyonu (iki aşamalı, overlap'li)

Tek `secret_ref` kolonuyla zero-downtime rotasyon **mümkün değildir** — bu
yüzden migration `0014` `previous_secret_ref` + `previous_secret_expires_at`
ekler ve rotasyon iki aşamada yapılır:

```bash
# 0) Yeni secret üret (HİÇBİR kayıt yazılmaz — değer bir kez gösterilir)
npm run rotate-integration-secret -- --integration-id <uuid> \
  --phase begin --new-secret-ref PILOT_SANDBOX_V2 --generate-secret

# 1) Değeri INTEGRATION_SECRET_PILOT_SANDBOX_V2 olarak kaydedin, sonra:
npm run rotate-integration-secret -- --integration-id <uuid> \
  --phase begin --new-secret-ref PILOT_SANDBOX_V2 --overlap-minutes 60

#    -> Bu pencerede ESKİ ve YENİ secret'ın İKİSİ de kabul edilir.
#    2) Sağlayıcı kendi tarafındaki secret'ı günceller.

# 3) Rotasyonu tamamla (eski secret geçersiz olur)
npm run rotate-integration-secret -- --integration-id <uuid> --phase complete
```

- `begin`, yeni secret **kaydedilmemişse** reddedilir (aksi halde pencere
  dolunca entegrasyon tamamen kırılırdı).
- `complete`, yeni secret çözülemiyorsa reddedilir (aynı sebep).
- `secret_last_rotated_at` **yalnızca `complete`'te** set edilir — yarım kalmış
  bir rotasyon "tamamlanmış" görünmez.
- Süresi dolmuş `previous_secret_ref` **kabul edilmez** (expiry zorlayıcıdır).

## Güvenlik notları

- Yeni kullanıcı **yalnızca kendi** otelini görür (tenant izolasyonu: profil
  satırı otelin `hotel_id`'sine bağlanır, AuthGuard bunu çözer).
- **Gerçek secret hiçbir zaman DB'ye yazılmaz** — yalnızca opak `secret_ref`.
  Secret değeri hiçbir API cevabında, logda, panelde veya rapor çıktısında
  görünmez; yalnızca üretildiği anda CLI'da bir kez gösterilir.
- `create-hotel` yazmadan önce **pre-flight** yapar: e-posta hem `auth.users`
  hem `public.users`'ta, otel adı `hotels`'ta kontrol edilir; çakışma varsa net
  mesajla çıkar, yarım kayıt bırakmaz.
- Adımlar arasında hata olursa **rollback** (otel + auth kullanıcı geri alınır).
- Davet linki ve şifreler **log dosyasına yazılmaz**.
