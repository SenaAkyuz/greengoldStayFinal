-- Faz 2 çekirdeği: booking engine/PMS entegrasyon kaydı.
--
-- Bir satır = "bu otel, bu sağlayıcının bu ortamda (sandbox/production) bir
-- property'sinde Green Gold optional-extra ürününü şu koda bağladı" demektir.
-- Provider-neutral: controller/service içinde hotel/provider adına göre
-- if-else YAZILMAZ; sağlayıcıya özgü davranış yalnızca adapter sınırında
-- (src/integrations/adapters/*) yaşar — bu tablo yalnızca konfigürasyonu tutar.
--
-- SynXis henüz sandbox/credential/dokümanı olmayan bir sağlayıcı — 'synxis'
-- provider değeri kayıt edilebilir (gelecekte kullanılacak), ama adapter
-- registry'de 'not_configured' döner (bkz. src/integrations/adapters/synxis.adapter.ts).
--
-- Secret saklama kararı: gerçek paylaşılan secret DB'de AÇIK METİN TUTULMAZ.
-- `secret_ref` yalnızca bir REFERANS/anahtar-id'dir; gerçek değer harici bir
-- kaynaktan (bugün için: sandbox ortamında process.env, prod için gerçek bir
-- secrets manager gerekir — henüz yok, rapor/README'de açık madde) çözülür.
CREATE TABLE hotel_integrations (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id               UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,

    -- Doğrulanmış sağlayıcı kayıt defteri (src/integrations/provider-registry.ts
    -- ile birebir tutulur). Yeni sağlayıcı eklemek hem burada hem registry'de
    -- açık bir karar gerektirir — sessizce "her provider kabul" YOK.
    provider               TEXT NOT NULL CHECK (provider IN ('synxis', 'generic_signed_webhook')),

    environment             TEXT NOT NULL DEFAULT 'sandbox'
                             CHECK (environment IN ('sandbox', 'production')),
    status                  TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'active', 'suspended')),

    -- Sağlayıcının kendi property/hotel kimliği (SynXis "Property ID" vb.).
    -- Gelen normalized event'in property_id'si BUNUNLA eşleşmezse reddedilir
    -- (bkz. webhook-ingestion.service.ts — tenant çapraz saldırı koruması).
    external_property_id   TEXT NOT NULL,

    -- Booking engine'deki GERÇEK optional-extra/ürün kodu. Otel başına
    -- SABİT ve booking engine tarafında konfigüre edilir; koda hard-code
    -- fiyat/ürün YOK (bkz. BOOKING_ENGINE_OPTIONAL_EXTRA_CONTRACT.md).
    product_code            TEXT NOT NULL,

    -- Webhook URL'inde kullanılan routing kimliği — public_widget_key'DEN
    -- FARKLI ve AYRI bir değer (widget key webhook auth için kullanılmaz).
    webhook_routing_id       UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Gerçek secret'a giden opak referans (bkz. yukarıdaki not). Hash DEĞİL,
    -- bir lookup anahtarı — çünkü HMAC doğrulaması gerçek secret'ı gerektirir.
    secret_ref               TEXT NOT NULL,
    secret_last_rotated_at   TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Otel + sağlayıcı + ortam + dış property başına TEK entegrasyon kaydı.
CREATE UNIQUE INDEX uniq_hotel_integrations_scope
  ON hotel_integrations (hotel_id, provider, environment, external_property_id);

-- Webhook URL'i bu id'yi taşır -> tekil olmalı (routing'in tek bir entegrasyona
-- çözülmesi garanti edilir).
CREATE UNIQUE INDEX uniq_hotel_integrations_webhook_routing_id
  ON hotel_integrations (webhook_routing_id);

CREATE INDEX idx_hotel_integrations_hotel_id ON hotel_integrations (hotel_id);

ALTER TABLE hotel_integrations ENABLE ROW LEVEL SECURITY;

-- Panel yalnızca kendi otelinin entegrasyon kaydını okuyabilir. secret_ref bu
-- satırda da bulunur; API katmanı panel'e DÖNERKEN bu alanı asla seçmez/döndürmez
-- (bkz. dashboard/integration-health servis DTO'su) — RLS bu satır bazlı izolasyonu
-- sağlar, alan bazlı maskeleme uygulama kodunun sorumluluğudur.
CREATE POLICY hotel_integrations_tenant_select ON hotel_integrations
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- NOT: INSERT/UPDATE/DELETE için policy YOK (deny-by-default). Entegrasyon
-- kaydı yalnızca operatör/service_role tarafından oluşturulur/güncellenir.
