# Green Gold Widget

Otel konaklama sayfasına gömülen, Shadow DOM ile izole `<green-gold-widget>` custom element'i.
Misafire otelin sürdürülebilirlik programını destekleme **tercihi** sunar ve
etkileşimleri (görüntülenme / seçim / katkı butonu / booking-click) analitik olarak
backend'e yollar. CO₂/ağaç-yılı/aylık toplu etki gösterimi **otel bazlı** olarak
kapalı/açık olabilir (bkz. "show_estimated_impact" altında) — hiçbir hotel için
"karbon nötr" iddiası yapılmaz.

> **Faz 1 dürüstlük notu:** Bu widget ödeme/rezervasyon **yapmaz**. "Katkıyı ekle" butonu
> yalnızca misafirin **niyetini** kaydeder ve host sayfaya bir event yayınlar. Gerçek tahsilat
> ve doğrulanmış işlem kaydı Faz 2'de otelin checkout entegrasyonuyla gelir.

## Gömme (embed)

```html
<script src="https://cdn.greengold.example/green-gold-widget.v1.js"></script>
<green-gold-widget
  data-key="<public_widget_key>"
  data-nights="3"
  data-lang="tr"
  data-api="https://api.greengold.example"
></green-gold-widget>
```

- `data-key` (zorunlu): otelin public widget anahtarı. Yoksa/geçersizse widget **hiç render
  etmez** ve host sayfayı bozmaz.
- `data-nights`: konaklama gece sayısı (host tarafından güncellenirse widget yeniden çizilir).
- `data-lang`: `tr` | `en`.
- `data-api`: backend taban URL'i.
- `data-journey-id` (opsiyonel): host sayfanın kendi ürettiği, kişisel veri içermeyen
  bir yolculuk kimliği. Verilmezse widget kendi first-party `sessionStorage` tabanlı
  kimliğine düşer (bkz. "Yolculuk kimliği (journey_id)" altında).
- `data-preview` (opsiyonel, `"true"`): önizleme modu — etkileşim tam çalışır ama
  **hiçbir analitik event POST edilmez** (panel/demo önizlemesi için).
- `data-tracker-only` (opsiyonel, `"true"`): bkz. "Tracker-only modu" altında —
  yalnızca `trackBookingEngineClick()` çalışsın, kart/event/impact hiç oluşmasın
  isteniyorsa (ör. Book bağlantısı olan ama kartın görünmeyeceği sayfalar).

## show_estimated_impact ve içerik override'ları

Widget'ın CO₂/ağaç-yılı/aylık toplu etki gösterip göstermeyeceği ve TR/EN metin
override'ları `GET /widget/config` yanıtındaki `show_estimated_impact` ve
`content_overrides` alanlarından gelir — **otel bazlı**, operatör tarafından
`green-gold-api` scripts/set-widget-settings ile ayarlanır (panelde UI yoktur,
bilinçli tercih). `show_estimated_impact` kapalıyken CO₂ satırı, "tahmini" rozeti,
CO₂ notu ve aylık toplu etki satırı **hiç render edilmez**.

## Host callback contract'ı

Misafir "Katkıyı ekle" butonuna bastığında widget, host sayfaya şu event'i yayınlar
(`bubbles: true, composed: true` — shadow root sınırını geçer):

```js
document.addEventListener('greengold:contribution-selected', (e) => {
  const { session_ref, nights, amount_total, currency } = e.detail;
  // Otelin checkout sistemi tutarı burada gerçekten ekleyebilir.
});
```

Widget "başardım / ödeme aldım" **demez** — kontrolü otele devreder. Otelin checkout
sistemi bu event'i dinleyip tutarı gerçekten eklediğinde, **Faz 2**'de backend'e
doğrulanmış bir işlem kaydı gönderecek. Faz 1'de `widget_events` yalnızca analitiktir.

## Session davranışı

Her element örneği bir `session_ref` üretir. `widget_goruntulendi`, `checkbox_secildi`,
`katki_ekle_butonuna_basildi` ve `booking_engine_clicked` event'lerinin her biri o
session'da **en fazla bir kez** gönderilir (checkbox aç/kapa ham sayaçları şişirmez).
Element DOM'dan çıkıp tekrar eklenirse aynı session sürer ve tek shadow root korunur.

## Yolculuk kimliği (journey_id)

Ana site (ör. WordPress) sayfaları arasında aynı misafirin etkileşimini kişisel veri
olmadan ilişkilendirebilmek için widget bir `session_ref` (yolculuk kimliği) çözer:

1. `data-journey-id` verilmişse (host kendi kimliğini yönetiyorsa) -> doğrudan kullanılır.
2. Yoksa first-party `sessionStorage` (`greengold_journey_id` anahtarı) -> ilk sayfada
   üretilir, aynı sekme/oturumdaki sonraki sayfalarda **aynı kimlik** okunur. Üçüncü taraf
   çerez/izleme **yok**; sekme kapanınca otomatik temizlenir.
3. Storage engellenmişse (gizli mod vb.) -> bu örnek ömrü boyunca geçerli rastgele bir
   kimliğe güvenle düşer; host sayfa asla bozulmaz.

`journey_id` **hiçbir zaman** e-posta/telefon/isim/IP/rezervasyon numarası içermez ve
otomatik olarak SynXis URL'sine eklenmez (bkz. kök `PRINCES_PALACE_WORDPRESS_PILOT_KURULUM.md`).

## Booking engine tıklama ölçümü (booking_engine_clicked)

Ana sitedeki "Book" bağlantısına (SynXis booking engine'e yönlendiren) tıklamayı
ölçmek için widget küçük bir **public method** sağlar:

```js
document.querySelectorAll('green-gold-widget').forEach((el) => {
  el.trackBookingEngineClick?.();
});
```

- **Rezervasyon/ödeme onayı DEĞİLDİR** — yalnızca "misafir Book bağlantısına tıkladı"
  bilgisini kaydeder (event: `booking_engine_clicked`).
- Otel bazlı feature flag KAPALIYSA (varsayılan kapalı) API isteği **400** ile
  reddedilir. Bu istek fire-and-forget gönderildiği için (`sendEvent()` yanıtı
  bekletmez/kontrol etmez) host sayfa bu 400'ü hiç görmez — Book bağlantısının
  navigasyonu bundan **asla** etkilenmez/geciktirilmez.
- Element bağlanmamışsa (`data-key` yok) veya `data-preview="true"` ise sessiz no-op.
- SynXis URL'si widget'a **hiçbir zaman** hard-code edilmez — bu yalnızca tıklama
  ölçümüdür, host sayfa link davranışını kendisi yönetir.

## Tracker-only modu (`data-tracker-only`)

Book bağlantıları widget kartının göründüğü sayfadan **farklı** sayfa(lar)da
(ör. site geneli header/nav) olabilir. Oraya normal widget'ı eklemek —
gizlemek için `style="display:none"` kullansanız bile — **yanlıştır**: widget
`connectedCallback()` içinde config çektikten sonra otomatik `widget_goruntulendi`
gönderir ve aylık impact'i çeker; görünmeyen bir kart böylece **sahte
görüntülenme** üretir ve funnel/panel verisini bozar.

Bunun yerine aynı sayfaya **tracker-only** bir element ekleyin:

```html
<script src="https://cdn.greengold.example/green-gold-widget.v1.js"></script>
<green-gold-widget
  data-key="<public_widget_key>"
  data-api="https://api.greengold.example"
  data-tracker-only="true"
></green-gold-widget>
```

Tracker-only modda:
- Kart **render edilmez** (shadow root bile kurulmaz).
- `GET /widget/config` ve `GET /widget/impact` **çekilmez**.
- `widget_goruntulendi` **asla gönderilmez**; checkbox/katkı event'leri zaten
  yok (kart yok).
- Yalnızca public `trackBookingEngineClick()` çalışır (yukarıdaki bölümdeki
  aynı garantilerle: feature flag kapalıysa 400, fire-and-forget, idempotent,
  preview'da hiç event yok, geçersiz key/origin'de host sayfa bozulmaz).

`data-tracker-only`, host tarafından sonradan değiştirilmesi beklenmediği için
`observedAttributes`'e eklenmedi — yalnızca ilk bağlanmada okunur.

## Geliştirme

```bash
npm install
npm run dev      # demo/ ile canlı geliştirme
npm run build    # dist/green-gold-widget.v1.js (deploy'da build edilir; dist gitignore'lu)
npm test         # vitest + jsdom
```
