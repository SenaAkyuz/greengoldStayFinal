-- Faz 2 çekirdeği: webhook inbox / ingestion audit trail.
--
-- Her gelen webhook denemesi (imzası GEÇERSİZ olanlar DAHİL) burada bir satır
-- bırakır — bu bir GÜVENLİK/DENETİM günlüğüdür, "domain write" (reservations/
-- contributions) DEĞİLDİR. Görev talimatındaki "yanlış imza -> hiçbir domain
-- write yok" kuralı reservations/contributions'a yazılmamasını ifade eder;
-- bu tabloya (audit) yazmak o kuralı ihlal etmez, aksine güvenlik izlenebilirliği
-- için gereklidir.
--
-- PII minimizasyon kararı: HAM payload SAKLANMAZ. Yalnızca normalized event'in
-- güvenli/PII-içermeyen alanları (normalized_snapshot) tutulur — normalized
-- kontrat zaten misafir adı/e-posta/telefon TAŞIMAZ (bkz. NormalizedReservationEvent).
-- Bu, "ham payload saklanacaksa redaction" şartını ham payload'ı HİÇ saklamayarak
-- karşılar (en güvenli seçenek). payload_hash yalnızca replay/bütünlük kontrolü
-- için tutulur, payload'ın kendisi değildir.
--
-- Retention notu (henüz otomatikleştirilmedi — bu repo'da cron/scheduled-job
-- altyapısı yok): önerilen politika, işlenmiş (processed/rejected_*) kayıtları
-- 90 gün sonra silmek/arşivlemek. Rapor'da açık madde olarak işaretlenmiştir.
CREATE TABLE integration_deliveries (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- routing kimliği geçerli bir entegrasyona ÇÖZÜLEMEDİYSE (bilinmeyen
    -- webhook_routing_id) hiçbir satır YAZILMAZ — o zaman elimizde geçerli
    -- bir tenant/hotel_id yok, enumeration'a karşı sadece HTTP 404 dönülür.
    -- Bu yüzden hotel_id/integration_id burada NOT NULL: bu tablo yalnızca
    -- ÇÖZÜLMÜŞ bir entegrasyona ait denemeleri tutar (imza geçersiz olsa bile).
    hotel_id               UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    integration_id         UUID NOT NULL REFERENCES hotel_integrations(id) ON DELETE CASCADE,
    provider               TEXT NOT NULL,

    -- İmza doğrulanamadan/payload parse edilemeden event ID okunamayabilir.
    provider_event_id      TEXT,

    payload_hash            TEXT NOT NULL,
    signature_verified      BOOLEAN NOT NULL,

    processing_status       TEXT NOT NULL
                             CHECK (processing_status IN (
                               'received',
                               'processed',
                               'rejected_bad_signature',
                               'rejected_invalid_payload',
                               'rejected_replay',
                               'rejected_out_of_order',
                               'manual_review',
                               'error'
                             )),
    error_code               TEXT,

    -- Yalnızca normalized/güvenli alanlar — asla ham payload/guest PII.
    normalized_snapshot       JSONB,

    received_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at               TIMESTAMPTZ
);

-- İdempotency/replay: aynı entegrasyon için aynı provider_event_id İKİNCİ KEZ
-- işlenmez (event_id çözülebildiyse). event_id yoksa (parse/imza hatası) bu
-- kısıt devreye girmez — her başarısız deneme ayrı satırdır (audit için doğru).
CREATE UNIQUE INDEX uniq_integration_deliveries_replay
  ON integration_deliveries (integration_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX idx_integration_deliveries_hotel_id ON integration_deliveries (hotel_id);
CREATE INDEX idx_integration_deliveries_integration_received
  ON integration_deliveries (integration_id, received_at DESC);

ALTER TABLE integration_deliveries ENABLE ROW LEVEL SECURITY;

-- Panel "son delivery durumu" (entegrasyon sağlığı) için okuyabilir.
CREATE POLICY integration_deliveries_tenant_select ON integration_deliveries
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- NOT: yazma policy'si yok — yalnızca service_role (webhook ingestion) yazar.
