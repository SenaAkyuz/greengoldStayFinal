-- Faz 2 çekirdeği: bir rezervasyona bağlı Green Gold optional-extra katkısı
-- (gerçek, booking engine tarafından tahsil edilmiş/edilecek tutar).
--
-- Yaşam döngüsü modeli: "tek aktif satır, yerinde güncelleme". Aynı
-- rezervasyon için normalized event'ler geldikçe (confirmed -> modified ->
-- cancelled/refunded/...) YENİ satır eklenmez, MEVCUT satır güncellenir
-- (bkz. webhook-ingestion.service.ts). Bu, "aynı rezervasyonda tek aktif
-- Green Gold line item" gereksinimini basit ve sorgulanabilir tutar; tam
-- versiyon geçmişi gerekirse integration_deliveries zaten her event'in
-- normalized halini audit amaçlı saklar.
--
-- amount_minor TAM SAYI (kuruş/cent) — floating point KULLANILMAZ (parasal
-- yuvarlama hatalarına karşı). 500 = 5.00 birim.
CREATE TABLE contributions (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id                      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    reservation_id                UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,

    selected                      BOOLEAN NOT NULL,

    -- Negatif olamaz; seçilmediyse 0 olmalı (uygulama katmanında da doğrulanır,
    -- bu CHECK ek savunma).
    amount_minor                  INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency                      TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    status                        TEXT NOT NULL DEFAULT 'pending'
                                   CHECK (status IN (
                                     'pending', 'collected', 'refunded', 'voided', 'partially_refunded'
                                   )),

    -- Sağlayıcının kendi line-item/ürün referansı (mutabakat için faydalı).
    provider_line_item_reference  TEXT,

    collected_at                  TIMESTAMPTZ,
    refunded_at                   TIMESTAMPTZ,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seçilmediyse tutar sıfır olmalı — state machine bunu her yazımda zorunlu
-- kılar, DB de aynı kuralı ikinci savunma katmanı olarak uygular.
ALTER TABLE contributions
  ADD CONSTRAINT contributions_selected_amount_chk
  CHECK (selected OR amount_minor = 0);

-- Tek aktif (voided olmayan) katkı garantisi: aynı rezervasyon için birden
-- fazla 'pending/collected/refunded/partially_refunded' satırı OLAMAZ.
-- 'voided' satırlar bu kısıtın dışında tutulur (örn. yanlış oluşturulmuş bir
-- kaydı voided'a çekip -teorik olarak- yenisini açabilmek için).
CREATE UNIQUE INDEX uniq_contributions_active_per_reservation
  ON contributions (reservation_id)
  WHERE status <> 'voided';

CREATE INDEX idx_contributions_hotel_id ON contributions (hotel_id);
CREATE INDEX idx_contributions_reservation_id ON contributions (reservation_id);
CREATE INDEX idx_contributions_hotel_status ON contributions (hotel_id, status);

ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY contributions_tenant_select ON contributions
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- NOT: yazma policy'si yok — yalnızca service_role (webhook ingestion) yazar.
