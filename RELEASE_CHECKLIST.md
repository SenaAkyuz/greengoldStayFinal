# Release Checklist

Pilot dağıtım için sürüm/yayın adımları. Manuel altyapı adımları (Vercel/Supabase/
Upstash env, script'ler) için `green_gold_adim13_mobil_deploy.md` "MANUEL YAPILACAKLAR".

## Widget yayını (widget kaynağı değiştiğinde)

Widget, panelin `public/` klasöründen statik servis edilir. **Panel'deki kopya,
widget kaynağının güncel build'i ile eşleşmek ZORUNDA** (bayat kopya = misafirde
eski widget).

```bash
cd green-gold-widget
npm run build          # dist/green-gold-widget.v1.js üretir
npm run copy:public    # dist -> green-gold-panel/public/ kopyalar
npm run check:widget   # build + hash karşılaştırması: public kopya güncel mi?
git add ../green-gold-panel/public/green-gold-widget.v1.js && git commit  # kopyayı commit'le
```

- `check:widget` **hata verirse** panel/public kopyası bayattır → `copy:public` çalıştır **ve commit'le**.
- Panel'in `prebuild` adımı `check:widget`'ı yerelde çalıştırır; Vercel'in izole panel
  build'inde widget kaynağı bulunmadığından **atlanır (uyarı basar)**.
- **Asıl zorunlu kontrol CI'dadır:** `.github/workflows/ci.yml` monorepo kökünden
  widget'ı build edip hash'i `panel/public` ile karşılaştırır; farklıysa **build FAIL**.

## Widget cache / sürümleme

- **Pilot:** `next.config.ts` → `/green-gold-widget.v1.js` için `max-age=300,
  must-revalidate` (kısa cache; içerik değişince hızlı yayılır).
- **Canlı (widget dondurulunca):** `max-age=31536000, immutable` (1 yıl) yap.
- **İçerik değişirse** (immutable aşamasından sonra): `v2` olarak yayınla — dosya
  adını `green-gold-widget.v2.js` yap **ve** `NEXT_PUBLIC_WIDGET_SRC`'yi güncelle.
  Sürüm dosya adında olduğu için eski embed URL'leri bozulmaz.

## Deploy öncesi genel kontrol

- [ ] Secret taraması temiz (çalışma ağacı + geçmiş); `.env.local` commit'lenmedi.
- [ ] API: `SUPABASE_*`, `UPSTASH_REDIS_REST_*` (dağıtık rate limit), `API_PUBLIC_URL`,
      `PANEL_URL` Vercel'de ayarlı. Upstash yoksa rate limit best-effort (uyarı loglar).
- [ ] Panel: `.env.example`'daki 8 değişken Vercel'de ayarlı (`API_BASE_URL` server-side,
      `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WIDGET_SRC` = gerçek widget URL'i).
- [ ] Vercel root directory: API `green-gold-api`, panel `green-gold-panel`.
- [ ] `npm run check:widget` OK (panel/public widget güncel).
- [ ] **Prod'da (girişsiz, temiz oturum) — Vercel routing farklı olduğundan zorunlu:**
  - [ ] `GET /green-gold-widget.v1.js` → **200**, `Content-Type: application/javascript`,
        `Cache-Control: public, max-age=300, must-revalidate`, **`/login`'e yönlendirme YOK**.
  - [ ] `GET /demo` → **200** (girişsiz), login'e sekmiyor; widget yükleniyor,
        etkileşimler `widget_events`'e **yazmıyor** (preview modu).
- [ ] Smoke test (13G): health, demo giriş, 403 demo yazma, widget yükleniyor +
      izinsiz origin 403, rate limit 429, CSV export, mobil.

## 🔴 Gerçek otel canlıya çıkmadan (bloklayıcı)

- [ ] **Karbon katsayısı onayı** — placeholder; Green Gold değeri + kaynağı onaylamadan
      gerçek otele sunma.
- [ ] Rate limit'in dağıtık çalıştığı doğrulandı (Upstash bağlı).
- [ ] Widget cache immutable + `v1` dondurma kararı verildi.
