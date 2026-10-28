-- Otelin GreenGold panelinden 3pmetrics'e gönderdiği emisyon verisi kayıtları.
--
-- AKIŞ: otel verisini (ör. aylık elektrik tüketimi) panelde girer -> API
-- `POST /cca/replies` ile 3pmetrics'e yazar -> 3pmetrics emisyonu hesaplar ->
-- Carbon Summary ile dönem sonucu alınır (carbon_measurements, migration 0015).
--
-- NEDEN YEREL KAYIT: 3pmetrics API'sinde SİLME YOKTUR (3pmetrics teyidi: silme
-- yalnızca 3pmetrics arayüzünden yapılır) ve kayıt listeleme ucu da yoktur.
-- Otelin "ne gönderdim" sorusunun tek cevabı bu tablodur; yanlış bir kayıt
-- 3pmetrics arayüzünden silindiğinde burada da öyle işaretlenir.
--
-- PII: emisyon verisi PII değildir. Uçuş kaynaklarında `passengerOrFlightName`
-- bir yolcu adı olabilir — panel uçuş kodu girilmesini önerir.

CREATE TABLE carbon_provider_entries (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id               UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    link_id                UUID REFERENCES carbon_provider_links(id) ON DELETE SET NULL,
    provider               TEXT NOT NULL CHECK (provider IN ('threepmetrics')),
    environment            TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),

    -- Panelin form başına ürettiği anahtar: çift tıklama / yeniden gönderim
    -- 3pmetrics'te İKİNCİ (silinemez) kayıt oluşturmasın.
    idempotency_key        UUID NOT NULL,

    external_account_id    TEXT NOT NULL,  -- 3pmetrics customerSlug
    external_unit_id       TEXT NOT NULL,  -- customerUnitSlug
    external_unit_name     TEXT,
    resource_slug          TEXT NOT NULL,  -- emissionResourceSlug
    resource_title         TEXT,
    ghg_scope              TEXT,

    entry_date             DATE NOT NULL,
    -- Uçuş kaynaklarında NULL (dokümana göre value gönderilmez).
    value                  NUMERIC CHECK (value IS NULL OR value >= 0),
    system_option_value    TEXT,
    system_option_label    TEXT,
    user_option_value      TEXT,
    user_option_label      TEXT,
    flight                 JSONB,

    --   sending          3pmetrics'e gönderiliyor
    --   sent             3pmetrics kaydı oluşturdu (external_reply_id dolu)
    --   failed           3pmetrics reddetti; 3pmetrics'te kayıt YOK
    --   outcome_unknown  istek gitti, yanıt alınamadı; kayıt OLUŞMUŞ olabilir —
    --                    otel 3pmetrics arayüzünden kontrol etmeden tekrar girmemeli
    --   deleted_in_provider  otel kaydı 3pmetrics arayüzünden sildiğini işaretledi
    status                 TEXT NOT NULL DEFAULT 'sending'
                             CHECK (status IN ('sending', 'sent', 'failed',
                                               'outcome_unknown', 'deleted_in_provider')),
    external_reply_id      BIGINT,
    error_code             TEXT,
    -- [{ file_name, uploaded_at }]
    documents              JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_by             UUID,  -- auth.users.id (panel kullanıcısı)
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT carbon_provider_entries_sent_has_reply
      CHECK (status <> 'sent' OR external_reply_id IS NOT NULL)
);

CREATE UNIQUE INDEX uniq_carbon_provider_entries_idempotency
  ON carbon_provider_entries (hotel_id, idempotency_key);

CREATE INDEX idx_carbon_provider_entries_hotel_created
  ON carbon_provider_entries (hotel_id, created_at DESC);

ALTER TABLE carbon_provider_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY carbon_provider_entries_tenant_select ON carbon_provider_entries
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- Yazma yalnızca API (service_role) üzerinden: INSERT/UPDATE/DELETE policy YOK.

-- 3pmetrics: "API anahtarınızın üye kapsamı yoksa, belirli bir üyeyi gerektiren
-- işlemlerde (ör. yanıt oluşturma) memberId parametresi belirtilmelidir."
-- Anahtar üye kapsamlıysa NULL kalır ve hiç gönderilmez.
ALTER TABLE carbon_provider_links ADD COLUMN IF NOT EXISTS provider_member_id TEXT;
