-- Faz 2 — güvenli secret ROTASYONU için iki-aşamalı (overlap) model.
--
-- SORUN (inceleme bulgusu #3): tek bir `secret_ref` kolonuyla zero-downtime
-- rotasyon MÜMKÜN DEĞİLDİR. Secret'ı tek adımda değiştirirsek, sağlayıcı
-- kendi tarafındaki secret'ı güncelleyene kadar geçen sürede gelen her
-- webhook imza doğrulamasından geçemez (event kaybı / gereksiz retry
-- fırtınası). Bu yüzden kısa süreli bir OVERLAP penceresi gerekir.
--
-- MODEL (iki aşama):
--   Faz 1 "begin":  yeni ref `secret_ref` olur, eski ref `previous_secret_ref`e
--                   taşınır ve `previous_secret_expires_at` = now + pencere.
--                   Bu pencerede İKİ secret de kabul edilir. Sağlayıcı kendi
--                   tarafını günceller.
--   Faz 2 "complete": `previous_secret_ref` temizlenir; artık YALNIZCA yeni
--                   secret kabul edilir. `secret_last_rotated_at` YALNIZCA
--                   BURADA (gerçek tamamlanmada) set edilir — "başlatıldı"
--                   anında değil, aksi halde yarım kalan bir rotasyon
--                   tamamlanmış gibi görünürdü.
--
-- Süresi dolmuş bir `previous_secret_ref` uygulama katmanında kabul EDİLMEZ
-- (bkz. secret-resolver.ts) — expiry sadece bilgi amaçlı değil, zorlayıcıdır.

ALTER TABLE hotel_integrations
  ADD COLUMN previous_secret_ref        TEXT,
  ADD COLUMN previous_secret_expires_at TIMESTAMPTZ;

-- previous_secret_ref ve expiry BİRLİKTE dolu ya da birlikte boş olmalı —
-- "süresiz kabul edilen eski secret" durumu oluşamaz.
ALTER TABLE hotel_integrations
  ADD CONSTRAINT hotel_integrations_previous_secret_pair_chk
  CHECK (
    (previous_secret_ref IS NULL AND previous_secret_expires_at IS NULL)
    OR
    (previous_secret_ref IS NOT NULL AND previous_secret_expires_at IS NOT NULL)
  );

-- Eski ve yeni ref AYNI olamaz (rotasyon anlamsız olurdu, üstelik "eski"
-- süresi dolunca yenisini de reddettiğimiz izlenimi verirdi).
ALTER TABLE hotel_integrations
  ADD CONSTRAINT hotel_integrations_secret_ref_distinct_chk
  CHECK (previous_secret_ref IS NULL OR previous_secret_ref <> secret_ref);

-- secret_ref FORMAT kısıtı (inceleme bulgusu #3): env değişkeni adı olarak
-- güvenle kullanılabilsin diye YALNIZCA büyük harf, rakam ve alt çizgi.
-- Tire/küçük harf platformlar arası env uyumsuzluğu yaratıyordu
-- (ör. `INTEGRATION_SECRET_hotel-a-ref` birçok kabukta geçerli bir değişken
-- adı DEĞİLDİR). Rakamla başlamak da yasak — env adları harfle başlamalı.
--
-- ÖNEMLİ: `secret_ref` secret'ın KENDİSİ DEĞİL, ona giden opak bir
-- REFERANSTIR. Gerçek secret hiçbir zaman bu tabloda saklanmaz.
ALTER TABLE hotel_integrations
  ADD CONSTRAINT hotel_integrations_secret_ref_format_chk
  CHECK (secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$');

ALTER TABLE hotel_integrations
  ADD CONSTRAINT hotel_integrations_previous_secret_ref_format_chk
  CHECK (previous_secret_ref IS NULL OR previous_secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$');
