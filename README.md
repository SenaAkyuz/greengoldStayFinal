# Green Gold Stay

Otellerin rezervasyon/checkout akışına eklenen bir **sürdürülebilirlik widget'ı** ve
bunun etkileşimlerini otele gösteren **yönetim paneli**. Üç parçadan oluşur; tek repo
(monorepo) altında tutulur.

> **Dürüstlük notu:** Panelde ve widget'ta gösterilen karbon değerleri **tahminidir**;
> doğrulanmış bir karbon dengelemesi (offset) **değildir**. Otel başına tahmini bir
> katsayı kullanılır ve Green Gold metodoloji onayı olmadan gerçek otele sunulmamalıdır.
> Widget'taki "katkı butonu" tıklaması bir ödeme veya rezervasyon onayı değildir.

---

## Mimari

```
Misafir (otel sitesi / booking engine)
        │  <green-gold-widget> (Shadow DOM, izole)
        ▼
  green-gold-widget  ──POST /widget/events──►  green-gold-api  ──►  Supabase (Postgres)
   (web component)         GET /widget/impact      (NestJS)              + Auth
                                                        ▲
                                                        │ GET /dashboard/* (auth'lı)
                                                        │ GET /raporlar/export
                                                 green-gold-panel
                                                   (Next.js, otel yöneticisi)
```

| Parça | Teknoloji | Rol |
|---|---|---|
| **green-gold-widget** | TypeScript · Vite · Web Component (Shadow DOM) | Misafir tarafı; otel sitesine gömülür. `dist/green-gold-widget.v1.js` olarak build edilir. |
| **green-gold-api** | NestJS 11 · Supabase (service_role) | `/widget/*` public uçları + `/dashboard/*` auth'lı uçlar. RLS backend'de service_role ile bypass edilir; tenant filtrelemesi kodda zorunludur. |
| **green-gold-panel** | Next.js 16 · React 19 · Supabase Auth | Otel yöneticisinin paneli: etkileşim/dönüşüm/tahmini karbon özeti, ayarlar, misafir demo. |

**Veri akışı:** Widget yalnızca otelin `allowed_origins` listesindeki alan adlarından
`public_widget_key` ile event yollar → API doğrular ve yazar → Panel auth'lı okur.

---

## Yerel Kurulum

Ön koşul: Node.js (LTS önerilir) ve bir Supabase projesi.

```bash
# 1) API
cd green-gold-api
npm install
cp .env.example .env.local          # değerleri kendi Supabase projenden doldur
# Supabase migration'larını uygula (0001–0006, supabase/migrations/)
npm run start:dev                   # http://localhost:3000

# 2) Panel
cd ../green-gold-panel
npm install
cp .env.example .env.local          # değerleri doldur (API_BASE_URL=http://localhost:3000)
npm run dev                         # http://localhost:3001

# 3) Widget (yalnızca geliştirme/derleme gerektiğinde)
cd ../green-gold-widget
npm install
npm run build                       # dist/green-gold-widget.v1.js üretir
npm run copy:public                 # dist -> green-gold-panel/public/ kopyalar
npm run check:widget                # build + hash: panel/public kopyası güncel mi?
# Bundle panelde public/green-gold-widget.v1.js olarak servis edilir.
```

> **Bayat widget koruması:** Widget, panelin `public/`'inden statik servis edilir;
> oradaki kopya güncel build ile eşleşmelidir. **Widget kaynağını değiştirdiyseniz:**
> `npm run copy:public` çalıştırın **ve** güncellenen `green-gold-panel/public/green-gold-widget.v1.js`'i
> **commit'leyin**. `npm run check:widget` senkronu sha256 ile doğrular; panel `prebuild`
> yerelde çalışır ama Vercel'in izole build'inde atlanır — asıl **zorunlu** kontrol
> **CI'dadır** (`.github/workflows/ci.yml`). Yayın adımları: [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md).

Ortam değişkenleri her paketin `.env.example` dosyasında açıklanmıştır (yalnızca
placeholder). **Gerçek anahtarlar asla commit edilmez** — `.env.local` gitignore'dadır.

---

## Operatör Script'leri (yalnızca lokal, `service_role` ile)

`green-gold-api` içinden çalıştırılır. Ayrıntı: `green-gold-api/scripts/README.md`.

| Komut | İş |
|---|---|
| `npm run create-hotel` | Yeni otel tenant'ı + yönetici davet akışını başlatır. |
| `npm run activate-hotel` | Bir oteli aktifleştirir (canlıya alma öncesi). |
| `npm run rebind-demo-user` | Demo tenant'ını mevcut demo auth kullanıcısına bağlar. |
| `npm run seed-demo-data` | Demo tenant'ına temsili (gerçek olmayan) veri yükler. |

> Bu script'ler `service_role` anahtarı kullanır (RLS bypass) — **yalnızca lokal/operatör**
> ortamında çalıştırılır, hiçbir zaman client'a veya prod runtime'a konmaz.

---

## İki demo kavramı (karıştırma)

| | **Demo Panel Girişi** | **Public Widget Demo** |
|---|---|---|
| Nerede | `/login` → "Demo panelini görüntüle" | `/demo` sayfası |
| Auth | Arka planda **gerçek oturum** açar (`demo_viewer`) | **Oturum YOK** (public) |
| Veri | Demo tenant'ının panel verisi | Yalnızca public `GET /widget/config` |
| Amaç | Ziyaretçiye şifresiz panel gezintisi | Widget'ın misafirde görünümü |

- **Mimari sınır:** Panelin `/dashboard/*` verisi **asla** oturumsuz açılmaz (tenant
  izolasyonu). Ziyaretçinin şifresiz panel erişimi **demo giriş butonuyla** karşılanır.
- `/demo` yalnızca widget önizlemesidir (`data-preview="true"` → event üretmez) ve
  `NEXT_PUBLIC_DEMO_WIDGET_KEY` (public demo key) + public `/widget/config` kullanır.
- `/misafir-demo` (girişli, otelin **kendi** key'iyle) ayrıca durur — otel yöneticisi
  kendi widget'ını görür.

---

## Deploy (özet)

- **Panel** ve **API** ayrı Vercel projeleridir (monorepo root directory sırasıyla
  `green-gold-panel` ve `green-gold-api`).
- **Widget**, panelin domain'inden statik dosya olarak servis edilir (`v1` sürümlü).
  **Pilot cache:** `max-age=300, must-revalidate` (kısa — içerik değişince hızlı
  yayılır). Widget dondurulunca `immutable + 1y`'e geçilir; içerik o aşamadan sonra
  değişirse `v2` olarak yayınlanır. Ayrıntı: [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md).
- **Rate limit** çok-instance ortamda bellek-içi sayaçla çalışmaz — dağıtık koruma için
  paylaşımlı store (Upstash Redis) gerekir; env yoksa best-effort fallback + uyarı logu.
- Gerçek anahtarlar Vercel/Supabase ortam değişkenlerinde tutulur.

Ayrıntılı deploy adımları operatör dokümantasyonunda tutulur (bu repoya dahil değildir).
