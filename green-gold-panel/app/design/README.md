# Green Gold Stay — tasarım altyapısı

Amaç: ekranların **iş mantığı** ile **görünümü** ayrı kalsın; tasarım
değiştiğinde yalnızca bu katman değişsin.

## Katmanlar

| Katman | Yer | İçerir | İçermez |
|---|---|---|---|
| Token'lar | `app/design/tokens.css` | Palet (`--ds-palette-*`) ve anlamsal değişkenler (`--ds-color-*`, `--ds-font-*`, `--ds-radius-*`, `--ds-space-*`, `--ds-tone-*`) | Bileşene özgü kural |
| Bileşenler | `app/components/ui/` | Görünüm + erişilebilirlik (AppFrame, PageHeader, Card/CardStrip, MetricGrid, BarList, SegmentedTabs, Button, Field, StatusPill, Notice, Stat, Stepper, DataTable, ConfirmDialog, EmptyState, Divider, Skeleton, Meter) | API çağrısı, iş kuralı, ürün metni |
| Ekranlar | `app/<sayfa>/`, `app/components/<alan>/` | Veri çekme, iş kuralının sonucu → bileşen | Ham hex renk, yeni stil sistemi |
| İş mantığı | `lib/<alan>/` | Saf fonksiyonlar (durum, doğrulama, hata → mesaj) | JSX, stil |

## Kurallar

1. Bileşenler yalnızca anlamsal token kullanır (`var(--ds-color-primary)`),
   ham renk yazmaz. Palet değişince her şey birlikte değişir.
2. Durumlar **ton**larla ifade edilir: `neutral | info | success | warning |
   danger | pending`. İş mantığı durumu tona eşler; tonun rengi token'dadır.
3. Anlam yalnızca renkle verilmez: durum etiketi ve bildirimlerde metin her
   zaman görünür.
4. Eksik değer `0` gibi gösterilmez: `Stat` değeri `null` ise "—" yazar.
5. Form denetimleri `Field` içinde kullanılır; etiket/açıklama/hata aria ile
   otomatik bağlanır. Dokunmatik hedefler en az 44 px.
6. Duyarlı tasarım: tablolar 768 px altında kart listesine, adım göstergesi
   dikey görünüme geçer. Mobilde form alanları 16 px (iOS yakınlaştırmasın).
7. `prefers-reduced-motion` açıksa animasyonlar kapanır.

## Renk erişilebilirliği (WCAG AA ≥ 4.5:1)

| Metin | Zemin | Oran |
|---|---|---|
| ink `#0b393a` | beyaz / `#f7f9fa` / `#eff4e7` | 12.7 / 12.0 / 11.3 |
| sub `#4d625a` | beyaz / `#eff4e7` | 6.5 / 5.9 |
| pine `#006e64` | beyaz | 6.2 |
| beyaz | pine `#006e64` | 6.2 |
| mint `#8be3d1` | koyu bant `#0a393b` | 8.4 |
| durum etiketleri (fg/bg) | | 5.4 – 7.2 |

Zeytin `#6c8d46` (3.8:1) yalnızca süs çizgisidir; metin rengi olarak
kullanılmaz. Altın vurgular referanstan: `#f3cc61` koyu bant üzerindeki
birimlerde (8.2:1), `#d3a632` yalnız süs halkası/çizgisi (geçerli adım,
karşılama etiketi çizgisi); anlam her zaman metinle de verilir.

## Kaynak

Asıl referans: greengold-stay-product.ordino-tr.chatgpt.site. Değerler
tarayıcıda hesaplanan stillerden ölçüldü (26.11.2026):

- Font: **DM Sans** (başlık 500, kart başlığı 600, gövde 400), başlıklarda
  sıkı harf aralığı (−0,064em). Türkçe için `latin-ext`.
- Renk: `--ink #0b393a`, `--pine #006e64`, `--mint #8be3d1`, `--rule #d6ded2`,
  `--sub #4d625a`; yumuşak bölüm `#f7f9fa`, kart şeridi `#f2f5ed`, vurgulu
  panel `#eff4e7`, veri çubukları `#3b7256` / `#dbe4cf`.
- Biçim: kart 16px köşe + `#bdccbf` ince kenar (gölgesiz), buton 7px köşe,
  sekme/etiket 21px, seçim kutusu 5px; bölüm etiketi 12px büyük harf + 22×3
  zeytin çizgi.

## Geliştirme galerisi

`npm run dev` → `http://localhost:3000/tasarim` (bileşenler) ve
`http://localhost:3000/onizleme/panel` (örnek verili otel paneli). Yalnızca
`next dev` ile açılır (`lib/dev-only.ts`); production'da sayfalar 404 döner,
oturum istisnası uygulanmaz ve örnek veri modülü hata fırlatır.

## Token'ların yüklenmesi

`tokens.css`, `app/layout.tsx` içinde `globals.css`'ten ÖNCE doğrudan import
edilir. Tailwind'in CSS içi `@import` zincirine bağlanmaz: Windows/OneDrive
yolunda bu zincir token'ları düşürdü (26.11.2026'da tarayıcıda doğrulandı).

## Eski ekranlar

Eski panel değişkenleri (`--gg-*`) ve sınıfları (`gg-card`, `gg-title` …)
`globals.css`'te aynen durur. Ekranlar bu dile tek tek, ayrı adımlarla geçirilir.
