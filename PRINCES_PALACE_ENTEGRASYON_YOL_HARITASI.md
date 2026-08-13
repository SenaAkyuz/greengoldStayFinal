# Green Gold Stay - Princes' Palace Entegrasyon Yol Haritası

Tarih: 13 Ağustos 2026

## 1. Yönetici kararı

Green Gold Stay teknik olarak çalışan bir Faz 1 ölçüm ürünüdür; bugün gerçek bir katkıyı tahsil eden, rezervasyona yazan veya karbon azaltımını doğrulayan ürün değildir. Princes' Palace için en doğru başlangıç, otelin kendi sitesinde 4-6 haftalık kontrollü ve ödeme içermeyen bir pilot; ikinci aşama ise Sabre/SynXis ve otelin finans/operasyon ekipleriyle gerçek rezervasyon ve tahsilat entegrasyonudur.

Doğrudan SynXis ödeme akışına kod enjekte etmeye çalışmak önerilmez. Green Gold'un rezervasyon toplamına bir kalem eklemesi için Sabre tarafından desteklenen bir konfigürasyon/API, otelin SynXis yöneticisi ve ödeme/muhasebe kararı gerekir.

## 2. Doğrulanan mevcut durum

- Kod üç parçalıdır: Preact/Shadow DOM widget, NestJS API, Next.js yönetim paneli.
- API testleri: 16 suite, 159 test başarılı.
- Widget testleri: 8 test başarılı.
- Widget production build ve paneldeki public kopyanın SHA-256 senkronu başarılı.
- Panel lint ve production build başarılı.
- Canlı API health, public demo ve widget JavaScript adresleri 200 dönmektedir.
- Widget yalnızca `viewed`, `selected` ve `clicked` niyet eventlerini kaydeder.
- Veri modeli rezervasyon, ödeme, iade, mutabakat ve sertifika kayıtlarını henüz içermez.
- Otel sitesi Book bağlantısı `be.synxis.com` alanına, `chain=24447` ve `hotel=46025` ile çıkmaktadır.

## 3. Pilot öncesi kritik düzeltmeler

### P0 - Canlıya çıkışı bloke edenler

1. Widget'taki “Konaklamanı karbon-nötr yap / Make your stay carbon-neutral” ifadesi kaldırılmalıdır. Sistem offset üretmediği için bu ifade mevcut teknik gerçeklikle çelişir. Öneri: “Konaklamanın çevresel etkisine katkıda bulun” / “Support lower-impact hospitality”.
2. 8.30 kg CO2/gece placeholder canlı otelde gösterilmemelidir. Metodoloji onaylanana kadar CO2 rakamı ve ağaç-yılı eşdeğeri gizlenmeli; pilot yalnızca tercih ve etkileşim ölçmelidir.
3. “Katkıyı ekle” düğmesi, gerçek bir sepete ekleme yapılmıyorsa “Bu seçeneği tercih ederim” olarak değiştirilmelidir.
4. Başarı ekranı tahsilat izlenimi vermemelidir: “Tercihinizi kaydettik; rezervasyonunuza ücret eklenmedi.”
5. KVKK/GDPR için veri envanteri, saklama süresi, veri sorumlusu/işleyen rolleri ve gizlilik metni belirlenmelidir.
6. Pilot KPI'ları önceden dondurulmalıdır: görüntülenme, seçim oranı, Book tıklaması, rezervasyon tamamlama oranı ve vazgeçme oranı.

### P1 - Pilot kalitesini belirleyenler

- Session kimliği yalnızca widget elementi ömründe oluşuyor. Ana site -> SynXis geçişini ölçmek için bir `journey_id` oluşturulmalı ve first-party cookie/sessionStorage ile tutulmalıdır.
- Book tıklaması için ayrı event gereklidir: `booking_engine_clicked`.
- Event şeması sürümlenmelidir: `schema_version`, `journey_id`, `page_type`, `locale`, `campaign`, `consent_state`.
- `amount_total` istemciden geldiği için finansal gerçek kabul edilmemelidir. Gerçek tutarlar yalnızca sunucu tarafında hesaplanmalıdır.
- Public key kimlik doğrulama değildir. Gerçek rezervasyon/ödeme webhookları imzalı, replay korumalı ve ayrı secret ile doğrulanmalıdır.
- Sentry/benzeri hata izleme, uptime alarmı ve olay müdahale prosedürü eklenmelidir.

## 4. Üç entegrasyon seviyesi

### Seviye A - Otel sitesinde ölçüm pilotu (önerilen ilk adım)

Yerleşim: sürdürülebilirlik sayfası, oda/suit sayfaları ve Book CTA yakınında. WordPress'e script ve custom element eklenir. `https://princespalace.com` allowed origin listesine alınır.

Ne sağlar:

- Misafir ilgisi ve mesaj varyantlarının ölçümü.
- Türkçe/İngilizce görünüm.
- Princes' Palace markasına uygun renk/logo.
- Book tıklamasına kadar ölçülebilir huni.

Ne sağlamaz:

- Rezervasyona ek ücret.
- Ödeme onayı.
- Rezervasyon tamamlandı doğrulaması.
- Karbon offseti veya sertifika.

Süre: teknik hazırlık ve otel onayları hazırsa 1-2 hafta; pilot 4-6 hafta.

### Seviye B - Rezervasyon doğrulamalı pilot

Amaç, Green Gold tercihini gerçek rezervasyon sonucu ile eşleştirmektir; ödeme hâlâ ayrı olabilir.

Gerekli Sabre/otel girdileri:

- SynXis Control Center erişimi ve otelin yetkili yöneticisi.
- Kullanılan Booking Engine sürümü ve desteklenen customization/tag manager yetenekleri.
- Reservation Delivery / webhook veya rezervasyon API erişimi.
- Sandbox/certification ortamı, kimlik bilgileri ve imza yöntemi.
- Rezervasyon durumları: created, modified, cancelled, no-show, stayed.

Önerilen veri modeli:

- `booking_journeys`: journey_id, hotel_id, consent, created_at.
- `reservations`: provider, provider_booking_id_hash, status, arrival, departure, nights, currency.
- `reservation_links`: journey_id -> reservation_id; eşleştirme yöntemi ve güven skoru.
- PII tutulmamalı; gerekiyorsa e-posta/telefon yerine otelin ürettiği opaque ID veya HMAC kullanılmalıdır.

### Seviye C - Gerçek katkı ve tahsilat

Bu aşama ancak ürün, hukuk ve finans kararlarından sonra yapılmalıdır.

Karar seçenekleri:

1. SynXis rezervasyonuna ancillary/package/fee olarak ekleme. En iyi misafir deneyimi; Sabre desteği ve otel konfigürasyonu gerektirir.
2. Rezervasyon sonrası ayrı Green Gold ödeme bağlantısı. En hızlı bağımsız ödeme yolu; dönüşüm ve mutabakat daha zordur.
3. Otelin mevcut payment provider'ı üzerinden ayrı line item. Muhasebe açısından güçlü; booking engine/payment entegrasyon kapasitesine bağlıdır.
4. Otelin katkıyı kendi bütçesinden karşılaması. Misafirden tahsilat yok; ölçüm ve ESG anlatımı daha basittir.

Bu aşamada zorunlu tablolar: contributions, payments, refunds, allocations, reconciliation_runs ve audit_log. Webhooklar idempotent olmalı; tutar ve para birimi sunucu tarafında doğrulanmalıdır.

## 5. Önerilen Princes' Palace pilot deneyimi

1. Misafir oda veya sürdürülebilirlik sayfasında düşük etkili konaklama seçeneğini görür.
2. “İlgileniyorum” seçimi yalnızca tercih olarak kaydedilir.
3. Book tıklaması `journey_id` ile kaydedilir ve kullanıcı SynXis'e gider.
4. Pilotun ilk versiyonunda Green Gold, SynXis ekranına müdahale etmez.
5. Otel mümkünse günlük anonim rezervasyon özeti veya Reservation Delivery akışı sağlar.
6. A/B testinde kontrol ve varyant karşılaştırılır; rezervasyon dönüşümüne zarar varsa pilot durdurulur.

Önerilen mesaj, otelin mevcut sürdürülebilirlik yaklaşımına uymalıdır: Büyükada ekosistemi, yerel topluluk, su/enerji/atık ve doğa koruma. Onaylanmamış karbon nötrlüğü veya ağaç eşdeğeri yerine somut yerel program anlatılmalıdır.

## 6. 90 günlük uygulama planı

### Gün 0-10 - Keşif ve sözleşme

- Otel sponsorunu belirle: Genel Müdür veya Sürdürülebilirlik/Marketing sahibi.
- Teknik sahipleri belirle: web ajansı, SynXis yöneticisi, finans, hukuk/KVKK.
- SynXis capability questionnaire gönder.
- Pilot kapsamını ve “ödeme yok” sınırını imzalı olarak netleştir.
- Veri işleme eki, saklama süresi ve silme prosedürünü tamamla.
- Karbon ifadelerini kaldır/gizle; P0 metin değişikliklerini yayınla.

Çıkış kapısı: onaylı metin, KPI, domain erişimi, sorumlular ve test takvimi.

### Gün 11-25 - Teknik pilot hazırlığı

- Princes' Palace tenant'ını pending oluştur.
- `https://princespalace.com` allowed origin ekle.
- Marka teması ve TR/EN metinlerini yükle.
- `journey_id`, `booking_engine_clicked`, consent ve campaign eventlerini geliştir.
- Staging sayfasında CSP, cache, CORS, mobil, Safari/Chrome ve erişilebilirlik testleri yap.
- Consent reddinde analitik davranışını test et.

Çıkış kapısı: staging UAT onayı, izinsiz origin 403, event doğruluğu, sıfır PII.

### Gün 26-55 - Kontrollü canlı pilot

- Trafiğin önce %10-20'sinde başlat; sonra %50'ye çıkar.
- Haftalık KPI: widget render başarı oranı, seçim, Book tıklaması, JS hata oranı, sayfa performansı ve rezervasyon dönüşümü.
- Kill switch ile widget'ı tek ayardan kapatabil.
- İçerik A/B testi yap; rakamsal karbon iddiası kullanma.

Çıkış kapısı: rezervasyon dönüşümüne zarar yok, anlamlı ilgi, teknik hata eşiğin altında.

### Gün 56-90 - SynXis Faz 2 kararı

- Sabre/otel ile desteklenen entegrasyon yolunu seç.
- Sandbox'ta Reservation Delivery veya API PoC yap.
- İptal/iade/no-show/stay lifecycle'ını test et.
- Ödeme modeli seçilmişse mutabakat ve muhasebe testlerini tamamla.
- Karbon metodolojisi bağımsız olarak onaylanmadıysa CO2/offset özelliklerini kapalı tut.

Çıkış kapısı: imzalı teknik tasarım, sandbox kanıtı, güvenlik/hukuk onayı, rollback planı.

## 7. Otelden istenecek kesin bilgi paketi

- WordPress admin veya tercihen staging + web ajansı teması.
- SynXis Control Center yöneticisi ve Sabre account/contact kişisi.
- Booking Engine ürün/sürüm adı; GTM/custom scripts/ancillary/package yetenekleri.
- Reservation Delivery/API dokümanı, sandbox URL, authentication ve webhook IP/sertifika şartları.
- Mevcut PSP/acquirer, merchant modeli, para birimleri, 3DS ve iade akışı.
- PMS adı ve entegrasyon sahibi.
- Gizlilik çerez yönetim platformu ve consent kategorileri.
- Sürdürülebilirlik programının gerçek faydalanıcısı, fon akışı ve denetlenebilir kanıtları.
- İptal/no-show durumunda katkının kaderi.
- Başarı metriği ve pilot durdurma eşikleri.

## 8. Claude analizine ilişkin değerlendirme

Claude'un güçlü teşhisi doğrudur: rezervasyon akışı SynXis alanında olduğu için gerçek sepet/ödeme entegrasyonu WordPress'e script eklemek kadar basit değildir. Ancak iki düzeltme gerekir:

- “Yazılım tarafı bitti” denemez. Faz 1 kodu çalışıyor; fakat gerçek otel için journey/booking eventleri, consent, rezervasyon lifecycle, ödeme, iade, mutabakat ve audit modeli henüz yoktur.
- WordPress pilotu yalnızca farkındalık olmak zorunda değildir. Book tıklamasına kadar sağlam ölçüm ve sonradan anonim rezervasyon doğrulaması kurulabilir. Yine de SynXis içinde gerçek line item için Sabre/otel yetkisi zorunludur.

## 9. Nihai öneri

Önce 4-6 haftalık, ödeme ve karbon nötrlüğü iddiası içermeyen bir ölçüm pilotu yapın. Aynı anda Sabre capability discovery başlatın. Pilot ilgi ve rezervasyon dönüşümüne zarar vermediğini kanıtlarsa, SynXis Reservation Delivery ile rezervasyon doğrulamasına geçin. Gerçek ücret ve karbon sonucu ancak finansal mutabakat, iptal/iade lifecycle'ı ve yayınlanabilir karbon metodolojisi tamamlandıktan sonra açılmalıdır.
