# Green Gold Widget

Otel konaklama sayfasına gömülen, Shadow DOM ile izole `<green-gold-widget>` custom element'i.
Misafire konaklamasının **tahmini** karbon etkisine katkı sunma seçeneği gösterir ve
etkileşimleri (görüntülenme / seçim / katkı butonu) analitik olarak backend'e yollar.

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

Her element örneği bir `session_ref` üretir. `widget_goruntulendi`, `checkbox_secildi` ve
`katki_ekle_butonuna_basildi` event'lerinin her biri o session'da **en fazla bir kez**
gönderilir (checkbox aç/kapa ham sayaçları şişirmez). Element DOM'dan çıkıp tekrar eklenirse
aynı session sürer ve tek shadow root korunur.

## Geliştirme

```bash
npm install
npm run dev      # demo/ ile canlı geliştirme
npm run build    # dist/green-gold-widget.v1.js (deploy'da build edilir; dist gitignore'lu)
npm test         # vitest + jsdom
```
