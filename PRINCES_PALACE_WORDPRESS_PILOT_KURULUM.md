# Princes' Palace — WordPress Pilot Kurulum Rehberi

Bu doküman, Green Gold Stay widget'ının Princes' Palace'ın WordPress ana sitesine
**Faz 1 pilot** olarak nasıl eklenebileceğini anlatır. Hiçbir dosya WordPress'e
yüklenmedi/otomatik değiştirilmedi — bu yalnızca operatör/hotel geliştirici için
bir kılavuz ve örnek koddur.

> ⚠️ **SynXis onayı bekleniyor.** Otelden Sabre SynXis/PMS/ödeme entegrasyon
> bilgileri gelene kadar bu pilot yalnızca **analitik/görüntü** amaçlıdır —
> rezervasyon akışına dokunmaz, SynXis sayfasına hiçbir script enjekte etmez.

---

## 1) Bu pilot ne yapar, ne yapmaz

**Yapar:**
- WordPress'in ilgili sayfasına küçük bir `<green-gold-widget>` bileşeni ekler;
  misafire otelin sürdürülebilirlik programını destekleme **tercihi** gösterir.
- Görüntülenme / checkbox seçimi / "tercihimi kaydet" tıklaması gibi etkileşimleri
  **analitik** olarak `green-gold-api`'ye kaydeder.
- (Opsiyonel, otel bazlı feature flag ile) ana sitedeki **Book** bağlantısına
  (SynXis'e yönlendiren) tıklamayı `booking_engine_clicked` olarak ölçer.

**YAPMAZ:**
- Gerçek ödeme almaz, kart bilgisi işlemez.
- Karbon kredisi satın almaz, offset üretmez, "karbon nötr" iddiası yapmaz.
- Rezervasyona hiçbir ücret eklemez.
- SynXis (`be.synxis.com`) sayfasına script enjekte etmez veya o sayfayı değiştirmez.
- `booking_engine_clicked` event'i "rezervasyon başladı/tamamlandı/ödeme yapıldı"
  anlamına **gelmez** — yalnızca "misafir Book bağlantısına tıkladı" demektir.

---

## 2) Embed kodu

```html
<script src="https://<WIDGET_SCRIPT_DOMAIN>/green-gold-widget.v1.js" defer></script>
<green-gold-widget
  data-key="<PRINCES_PALACE_PUBLIC_WIDGET_KEY>"
  data-api="https://<API_DOMAIN>"
  data-lang="en"
  data-nights="1"
></green-gold-widget>
```

- `<WIDGET_SCRIPT_DOMAIN>`: widget'ın servis edildiği panel domain'i (Vercel'de
  belirlenecek — bu pilot hazırlığı sırasında henüz atanmadı).
- `<API_DOMAIN>`: `green-gold-api`'nin canlı adresi.
- `<PRINCES_PALACE_PUBLIC_WIDGET_KEY>`: otel operatör tarafından `create-hotel`
  script'iyle oluşturulduğunda üretilir (bu görevde **gerçek otel tenant'ı
  oluşturulmadı** — bu bir placeholder'dır).

`defer` önerilir: widget script'i sayfa render'ını bloklamaz; host sayfa
her koşulda (widget yüklenemese/API yanıt vermese bile) normal çalışmaya devam eder.

---

## 3) Attribute referansı

| Attribute | Zorunlu | Açıklama |
| --- | --- | --- |
| `data-key` | Evet | Otelin `public_widget_key`'i. Yoksa/geçersizse widget **hiç render edilmez**, sayfa bozulmaz. |
| `data-api` | Evet (prod'da) | `green-gold-api` taban URL'i. Verilmezse `http://localhost:3000`'e düşer (yalnızca dev). |
| `data-lang` | Hayır | `tr` \| `en`. Verilmezse `tr`. |
| `data-nights` | Hayır | Konaklama gece sayısı; host güncellerse widget yeniden çizilir. Verilmezse `1`. |
| `data-preview` | Hayır | `"true"` ise etkileşim çalışır ama **hiçbir analitik event POST edilmez** (staging/demo doğrulaması için). |
| `data-journey-id` | Hayır | Host'un kendi ürettiği, kişisel veri içermeyen yolculuk kimliği (bkz. §8). Verilmezse widget kendi `sessionStorage` tabanlı kimliğine düşer. |
| `data-tracker-only` | Hayır | `"true"` ise kart **hiç render edilmez**, config/impact **çekilmez**, `widget_goruntulendi` **asla gönderilmez** — yalnızca public `trackBookingEngineClick()` çalışır. Book bağlantısı olan ama kartın görünmeyeceği sayfalar (ör. header/nav) için (bkz. §5, §9). |

**Sürdürülebilirlik sayılarının görünürlüğü** (`show_estimated_impact`) ve
**booking-click tracking** (`enable_booking_click_tracking`) widget attribute'u
DEĞİLDİR — bunlar otel bazlı, sunucu tarafı bayraklardır ve yalnızca
`green-gold-api` operatör script'iyle (`npm run set-widget-settings`) ayarlanır.
Panelde bu ayarlar için UI **bilinçli olarak yoktur** (bkz. `green-gold-api/scripts/README.md`).
Princes' Palace pilotunda **karbon/CO₂ sayıları varsayılan olarak KAPALI** kalmalı —
Green Gold metodoloji onayı gelmeden açılmamalı.

---

## 4) WordPress'e ekleme seçenekleri

### Seçenek A — Child theme / `functions.php` enqueue (önerilen, en kontrollü)

```php
function greengold_widget_enqueue() {
    if ( ! is_page( 'reservations' ) ) { // yalnızca ilgili sayfa(lar)da yükle
        return;
    }
    wp_enqueue_script(
        'green-gold-widget',
        'https://<WIDGET_SCRIPT_DOMAIN>/green-gold-widget.v1.js',
        array(),
        '1.0.0',
        true // footer'da, defer davranışına yakın
    );
}
add_action( 'wp_enqueue_scripts', 'greengold_widget_enqueue' );

function greengold_widget_markup() {
    if ( ! is_page( 'reservations' ) ) {
        return;
    }
    echo '<green-gold-widget data-key="<PRINCES_PALACE_PUBLIC_WIDGET_KEY>" '
       . 'data-api="https://<API_DOMAIN>" data-lang="en"></green-gold-widget>';
}
add_action( 'wp_footer', 'greengold_widget_markup' );
```

### Seçenek B — Güvenilir "header/footer script ekleme" eklentisi

Otelin zaten kullandığı bir "insert header/footer" eklentisiyle (ör. WPCode,
Insert Headers and Footers) embed kodunu **yalnızca belirli sayfa(lar)a**
koşullu olarak ekleyin. Eklentinin "yalnızca şu sayfalarda çalıştır" seçeneğini
kullanın — site genelinde çalıştırmayın (bkz. §5).

### Seçenek C — Gutenberg "Custom HTML" bloğu

Sayfa düzenleyicide bir "Custom HTML" bloğuna embed kodunu (script + element)
doğrudan yapıştırın. En hızlı ama en az kontrollü yöntem — sayfa şablonu
değişirse blok kaybolabilir; A veya B üretim için tercih edilmeli.

---

## 5) Yalnızca gereken sayfalarda yükleme

Widget script'i **site genelinde değil**, yalnızca sürdürülebilirlik tercihinin
anlamlı olduğu sayfa(lar)da (ör. rezervasyon/oda seçim sayfası) yüklenmelidir:
- Gereksiz API çağrısı ve analitik gürültüsü önlenir.
- Sayfa performansı korunur (script her sayfada indirilmez).

`booking_engine_clicked` ölçümü için **Book bağlantılarının bulunduğu tüm
sayfalarda** (header/nav dahil olabilir) widget elementinin DOM'da bulunması
gerekir. Bu sayfalarda görünür kart istenmiyorsa elementi **`style="display:none"`
ile gizlemeyin** — normal widget, config çektikten sonra otomatik
`widget_goruntulendi` gönderir ve aylık impact'i çeker; görünmeyen bir kart
böylece **sahte bir "görüntülenme" üretir ve funnel/panel verisini bozar.**

Bunun yerine `data-tracker-only="true"` ile eklenen bir element kullanın (bkz.
§9): bu modda kart hiç render edilmez, config/impact hiç çekilmez,
`widget_goruntulendi` asla gönderilmez — yalnızca `trackBookingEngineClick()`
çalışır. Aynı sayfada hem görünür kart hem de ayrı bir tracker-only element
bulunabilir (ör. rezervasyon sayfasında görünür kart + header'da tracker-only).

---

## 6) Origin allowlist (`https://princespalace.com`)

Widget'ın `/widget/config`, `/widget/impact`, `/widget/events` uçları **per-hotel
CORS allowlist** ile korunur (`green-gold-api/src/common/widget-cors.ts`).
Princes' Palace'ın gerçek WordPress domain'i (`https://princespalace.com` ve
varsa `www.` alt domain'i) otel operatör script'iyle `allowed_origins`'e
eklenmeden widget **hiçbir isteği kabul etmez**:

```bash
# create-hotel sonrası, otel yöneticisi panelde Ayarlar'dan ekleyebilir; veya
# operatör SQL/​script ile:
UPDATE hotels SET allowed_origins = ARRAY['https://princespalace.com', 'https://www.princespalace.com']
WHERE public_widget_key = '<PRINCES_PALACE_PUBLIC_WIDGET_KEY>';
```

⚠️ `activate-hotel` script'i **en az bir geçerli `allowed_origin` yoksa
aktivasyonu reddeder** — bu bilinçli bir güvenlik kapısıdır.

---

## 7) CSP (Content-Security-Policy) gereksinimleri

WordPress'te (veya önündeki bir güvenlik eklentisinde/CDN'de) CSP varsa şu
kaynaklara izin verilmeli:

```
script-src  'self' https://<WIDGET_SCRIPT_DOMAIN>;
connect-src 'self' https://<API_DOMAIN>;
```

- `script-src`: widget bundle'ının indirildiği domain (`<WIDGET_SCRIPT_DOMAIN>`) —
  değişmez, widget'ın kendisi başka hiçbir script domain'i eklemez.
- `connect-src`: widget'ın `fetch()` ile konuştuğu API domain'i
  (`<API_DOMAIN>`) — config/impact/events uçları.
- `img-src`: **yalnızca otel `logo_url` alanı ayarlıysa gerekir**, ve
  `<API_DOMAIN>` **DEĞİL**, `logo_url`'ün gerçekte hangi https origin'inde
  barındığıysa o origin eklenmelidir (ör. otelin kendi CDN'i,
  `https://cdn.princespalace-assets.example`). Widget yalnızca **https** logo
  URL'lerini kabul eder (http/data:/javascript: reddedilir — bkz.
  `UpdateHotelDto.logo_url`); `data:` yalnızca gerçekten kullanılan bir veri-URI
  kaynağı varsa eklenmelidir, varsayılan olarak eklenmemeli. Bu pilotta logo
  kullanılmıyorsa **`img-src` için ek bir izin gerekmez**.

### `style-src` — dürüst bir uyarı

**Önceki bir taslakta "Shadow DOM içindeki inline style sayfanın CSP'sinden
izoledir" denmişti; bu YANLIŞTIR ve düzeltildi.** Shadow DOM, CSP'den muaf
değildir — tarayıcı, shadow root içine enjekte edilen `<style>` etiketlerini de
sayfanın `style-src` politikasına göre değerlendirir.

Widget çalışma anında (`main.tsx`), derlenmiş CSS'i doğrudan bir `<style>`
etiketine yazarak shadow root'a ekler (`style.textContent = STYLES`). Bu,
sıkı bir `style-src` politikasında (`'unsafe-inline'` içermeyen) **CSP
ihlaline neden olur ve widget'ın stilleri hiç uygulanmaz** (fonksiyonellik
bozulmaz ama görsel bozuk görünebilir).

- Mevcut bundle **nonce veya hash tabanlı `style-src` desteği sağlamıyor** —
  bu bir gelecek hardening işidir, bu görev kapsamında büyük bir refactor
  (CSS'i harici, sürümlü bir `.css` dosyasına çıkarmak veya build-time
  nonce/hash üretmek) yapılmadı.
- Otelin CSP politikası sıkıysa (ör. `style-src 'self'` ve `'unsafe-inline'`
  yoksa), pilot için `style-src` listesine **`'unsafe-inline'` eklenmesi
  gerekebilir**. **Bu, otelin/ajansın güvenlik ekibi onayı olmadan
  eklenmemelidir** — `'unsafe-inline'` politikanın genel sıkılığını düşürür;
  karar otelin güvenlik ekibine ait.
- Daha sıkı bir üretim çözümü (CSS'i ayrı, sürümlü bir dosyaya çıkarıp
  `style-src`'e yalnızca o domain'i eklemek, ya da nonce/hash uyumlu bir
  render yaklaşımı) ayrı bir hardening görevi olarak ele alınmalı.

---

## 8) Çerez/onay (consent) yönetimiyle koşullandırma

Widget **hiçbir üçüncü taraf çerezi kullanmaz**. Kullandığı tek istemci-taraf
depolama, `journey_id` için first-party `sessionStorage`'dır (bkz.
`green-gold-widget/README.md` "Yolculuk kimliği" bölümü) — sekme kapanınca
otomatik temizlenir, siteler arası paylaşılmaz.

**Varsayılan davranış:** widget script'i sayfaya eklenip element DOM'a
bağlandığı an `sessionStorage`'a yazar ve `widget_goruntulendi` event'ini
gönderir — script'i yüklemek zaten "aktif" bir davranıştır.

**Consent platformuyla koşullandırma:** eğer otel bir çerez/consent banner'ı
kullanıyorsa, embed script'ini yalnızca kullanıcı analitik/tercihe onay
verdikten SONRA enjekte edin (ör. consent platformunun "onay sonrası çalıştır"
kancasıyla §4'teki `wp_enqueue_script` çağrısını koşullayın). Onay verilmemiş
durumda script hiç yüklenmezse, widget hiçbir storage/network işlemi yapmaz —
bu güvenli varsayılan davranıştır ve ek kod gerektirmez.

---

## 9) Book bağlantısı tıklama ölçümü örneği

Book bağlantıları görünür sürdürülebilirlik kartının bulunduğu sayfadaysa,
sayfadaki mevcut `<green-gold-widget>` elementi (kart) kullanılabilir. Ancak
Book bağlantıları **farklı** sayfa(lar)da (ör. site geneli header/nav) ve o
sayfalarda kart görünmesi istenmiyorsa, oraya **kartı `display:none` ile
gizlemek YERİNE** ayrı bir **tracker-only** element ekleyin (bkz. §5):

```html
<script src="https://<WIDGET_SCRIPT_DOMAIN>/green-gold-widget.v1.js" defer></script>
<green-gold-widget
  data-key="<PRINCES_PALACE_PUBLIC_WIDGET_KEY>"
  data-api="https://<API_DOMAIN>"
  data-tracker-only="true"
></green-gold-widget>

<script>
  document.addEventListener('DOMContentLoaded', function () {
    var widget = document.querySelector('green-gold-widget');
    if (!widget) return;

    // Yalnızca be.synxis.com'a giden linkleri dinle; DAVRANIŞLARINI DEĞİŞTİRME.
    document.querySelectorAll('a[href*="be.synxis.com"]').forEach(function (link) {
      link.addEventListener('click', function () {
        // Fire-and-forget: navigasyonu ASLA bekletme/engelleme. Widget yoksa
        // veya method tanımsızsa sessizce atla — link normal çalışmaya devam eder.
        if (typeof widget.trackBookingEngineClick === 'function') {
          widget.trackBookingEngineClick();
        }
      }); // preventDefault/stopPropagation YOK — link target ve navigasyon aynen kalır
    });
  });
</script>
```

- `target`, `href`, açılma davranışı (yeni sekme/aynı sekme) **hiç değişmez** —
  yalnızca bir `click` dinleyicisi eklenir, `preventDefault()` çağrılmaz.
- `trackBookingEngineClick()` fire-and-forget'tir; ağ isteğini beklemez, hata
  fırlatmaz, navigasyonu geciktirmez.
- `data-tracker-only="true"` sayesinde bu element kart render etmez,
  config/impact çekmez ve `widget_goruntulendi` göndermez — yalnızca tıklama
  ölçümü çalışır (bkz. §3, `green-gold-widget/README.md` "Tracker-only modu").
- Bu event otel bazlı feature flag KAPALIYSA (varsayılan): API isteği **400**
  ile reddedilir. İstek fire-and-forget gönderildiği için (yanıt
  beklenmez/kontrol edilmez) host script bu 400'ü hiç görmez ve buna göre bir
  şey yapmak zorunda değildir — Book bağlantısının navigasyonu etkilenmez.

---

## 10) Staging ve production doğrulama kontrol listesi

**Staging (canlıya almadan önce):**
- [ ] `data-preview="true"` ile test edin: widget render oluyor, checkbox/buton
      çalışıyor ama **hiçbir event** `green-gold-api`'ye POST edilmiyor (Network
      sekmesinde doğrulayın).
- [ ] `data-preview` kaldırıldığında: `widget_goruntulendi` event'i bir kez gidiyor.
- [ ] İzinsiz origin'den (`allowed_origins`'e eklenmemiş bir domain) test:
      `GET /widget/config` **403** dönüyor.
- [ ] Book linkine tıklayınca navigasyon **hiç gecikmiyor/engellenmiyor**
      (widget/API kapalı olsa bile).
- [ ] `show_estimated_impact` kapalıyken CO₂/ağaç-yılı/impact satırları **hiç
      görünmüyor** (yalnızca tercih + tutar satırı var).
- [ ] Header/nav gibi görünmez `data-tracker-only="true"` elementler için:
      Network sekmesinde bu sayfa yüklenirken `GET /widget/config` ve
      `GET /widget/impact` **hiç gitmiyor**, ve hiçbir `widget_goruntulendi`
      event'i POST edilmiyor (yalnızca Book linkine tıklanınca
      `booking_engine_clicked` gidiyor).

**Production (canlıya aldıktan sonra, girişsiz temiz oturumla):**
- [ ] `GET https://<WIDGET_SCRIPT_DOMAIN>/green-gold-widget.v1.js` → **200**,
      `Content-Type: application/javascript`.
- [ ] Widget yalnızca hedef sayfa(lar)da yükleniyor (Network sekmesi — diğer
      sayfalarda script isteği YOK).
- [ ] `https://princespalace.com`'dan gelen istek 200/başarılı; başka bir
      origin'den (ör. tarayıcı konsolundan farklı domain simülasyonu) 403.
- [ ] Book bağlantısına tıklayınca (feature flag açıksa) `booking_engine_clicked`
      panelde/veritabanında görünüyor; flag kapalıysa hiç satır oluşmuyor.
- [ ] Panelde (`green-gold-panel`) otel yöneticisi görüntülenme/seçim/katkı
      sayılarını görebiliyor; CO₂ sayıları (flag kapalıysa) panelde bile
      **misafire gösterilmiyor** — panel kendi iç raporlama ekranıdır, bu ayrı bir
      konudur ve bu pilotun kapsamı dışındadır.

---

## 11) Kill switch / geri alma

Pilotu **anında** durdurmak için (kod değişikliği/deploy gerekmez):

1. **En hızlı:** WordPress'ten embed kodunu kaldırın (Seçenek A/B/C'ye göre
   `functions.php`'den kaldırın, eklenti kuralını kapatın veya Gutenberg
   bloğunu silin). Script bir sonraki sayfa yüklemesinde artık çekilmez.
2. **Sunucu tarafı (WordPress'e dokunmadan) durdurmak isterseniz:**
   ```bash
   npm run activate-hotel -- --key <key> --dry-run   # önce durumu kontrol edin
   ```
   oteli `suspended` durumuna almak için doğrudan operatör SQL'i:
   ```sql
   UPDATE hotels SET status = 'suspended' WHERE public_widget_key = '<key>';
   ```
   Bu durumda `/widget/config`, `/widget/impact` ve `POST /widget/events`
   **403** döner; widget host sayfada sessizce render etmemeye geçer (script
   sitede kalsa bile hiçbir şey göstermez/göndermez).
3. **Yalnızca booking-click tracking'i kapatmak isterseniz** (widget kartı
   kalsın):
   ```bash
   npm run set-widget-settings -- --key <key> --enable-booking-click-tracking false
   ```

Hiçbir kill switch adımı geriye dönük veriyi silmez — yalnızca **yeni**
event/gösterimi durdurur.

---

## 12) Önemli hatırlatma — SynXis'te gerçek ücret eklenmedi

Bu widget'ın "tercihimi kaydet" butonu **SynXis'teki (be.synxis.com) rezervasyon
tutarına hiçbir ücret eklemez**. Faz 1'de yalnızca misafirin niyeti kaydedilir
ve host sayfaya bir `greengold:contribution-selected` custom event yayınlanır
(bkz. `green-gold-widget/README.md`). Otelin checkout/SynXis entegrasyonu bu
event'i dinleyip tutarı **gerçekten** eklemek isterse, bu **Faz 2** kapsamında,
otel/Sabre onayı alınarak ayrıca tasarlanacaktır. Bu pilot hazırlığı SynXis
sayfasına hiçbir kod enjekte etmez ve booking URL parametrelerini değiştirmez.
