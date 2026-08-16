-- Faz 2 çekirdeği: booking engine/PMS tarafından DOĞRULANMIŞ rezervasyon kaydı.
--
-- Bu tablo yalnızca imzası doğrulanmış server-to-server event'lerden yazılır
-- (bkz. webhook-ingestion.service.ts). Widget'ın "katki_ekle_butonuna_basildi"
-- tıklaması BU TABLOYA ASLA YAZMAZ — o yalnızca widget_events'te bir niyet
-- sinyalidir, rezervasyon değildir (bkz. README dürüstlük notu).
--
-- Misafir PII'ı (ad/e-posta/telefon) VARSAYILAN OLARAK saklanmaz — panel
-- yalnızca provider reservation ID + durum + tarihleri göstermek zorunda,
-- misafir kimliği göstermek bu Faz 2 çekirdeğinin kapsamı dışında.
CREATE TABLE reservations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id                 UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    integration_id           UUID NOT NULL REFERENCES hotel_integrations(id) ON DELETE CASCADE,

    provider_reservation_id  TEXT NOT NULL,

    booking_status           TEXT NOT NULL
                              CHECK (booking_status IN (
                                'confirmed', 'modified', 'cancelled', 'no_show', 'stayed'
                              )),

    -- Yalnızca panelde tarih bağlamı göstermek için minimize tutulur; guest
    -- kimliği YOK. Sağlayıcı vermezse NULL kalabilir.
    arrival_date              DATE,
    departure_date            DATE,
    nights                    INTEGER CHECK (nights IS NULL OR nights BETWEEN 1 AND 365),

    -- Sağlayıcının kendi zaman damgaları (event sırası/out-of-order kararları
    -- için) + yerel insert/update zamanları.
    provider_created_at       TIMESTAMPTZ,
    provider_updated_at       TIMESTAMPTZ,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aynı entegrasyon kapsamında (= aynı otel + sağlayıcı + ortam) bir provider
-- reservation ID yalnızca BİR satıra karşılık gelir. integration_id zaten
-- hotel_id'yi taşıdığı için bu, "tenant/provider kapsamında unique" gereksinimini
-- karşılar.
CREATE UNIQUE INDEX uniq_reservations_integration_provider_id
  ON reservations (integration_id, provider_reservation_id);

CREATE INDEX idx_reservations_hotel_id ON reservations (hotel_id);
CREATE INDEX idx_reservations_hotel_status ON reservations (hotel_id, booking_status);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_tenant_select ON reservations
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- NOT: yazma policy'si yok — yalnızca service_role (webhook ingestion) yazar.
