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

### 3) Embed kodunu siteye yapıştır

Script'in bastığı embed kodunu otelin **ödeme (checkout)** sayfasına koyun.

### 4) Oteli aktive et

```bash
npm run activate-hotel -- --key <public_widget_key>
```

- `status`'ü `pending` → `active` yapar; widget ancak bundan sonra çalışır.
- ⚠️ **En az bir geçerli `allowed_origin` yoksa aktivasyonu REDDEDER** (widget
  izinsiz domain'de çalışmasın). `--dry-run` ile önce kontrol edebilirsiniz.

## Güvenlik notları

- Yeni kullanıcı **yalnızca kendi** otelini görür (tenant izolasyonu: profil
  satırı otelin `hotel_id`'sine bağlanır, AuthGuard bunu çözer).
- `create-hotel` yazmadan önce **pre-flight** yapar: e-posta hem `auth.users`
  hem `public.users`'ta, otel adı `hotels`'ta kontrol edilir; çakışma varsa net
  mesajla çıkar, yarım kayıt bırakmaz.
- Adımlar arasında hata olursa **rollback** (otel + auth kullanıcı geri alınır).
- Davet linki ve şifreler **log dosyasına yazılmaz**.
