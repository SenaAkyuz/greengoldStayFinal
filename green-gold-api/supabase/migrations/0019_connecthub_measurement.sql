-- 0019: 3pmetrics ConnectHub ölçüm akışı + şema düzeltmeleri.
--
-- Bu migration yalnızca EKLER veya DÜZELTİR; mevcut veriyi silmez, uygulanmış
-- migration dosyalarına dokunmaz. Birden fazla kez çalıştırılabilir
-- (IF NOT EXISTS / OR REPLACE / koşullu DO blokları).
--
-- 1) DÜZELTME — widget_events.event_type kısıtı
--    0008, eski kısıtı `pg_get_constraintdef LIKE '%event_type%IN%'` ile arıyordu.
--    Postgres kısıtı `event_type = ANY (ARRAY[...])` biçiminde yazdığı için eski
--    kısıt bulunamadı ve SİLİNMEDİ. Sonuç: 'booking_engine_clicked' olayı eski
--    3 değerli kısıta takılıp reddediliyor (otel bayrağı açılınca ortaya çıkar).
--    Burada event_type'a bakan TÜM check kısıtları kaldırılıp tek, isimli kısıt
--    yeniden kurulur.
--
-- 2) ConnectHub bağlantısı — carbon_provider_links'e:
--      api                     'cca' (eski, varsayılan) | 'connecthub'
--      read_authorization_ref  okuma anahtarı ("Faktörleri içer" açık)
--      factor_inventory_id     faktör paketi okunacak envanter (boşsa yıla göre tek envanter)
--    ConnectHub'da external_property_id = 3pmetrics BİRİM (unit) kimliğidir; her
--    otel ayrı birimdir, böylece aynı şirket hesabındaki oteller karışmaz.
--
-- 3) carbon_facility_profiles  — tesis profili, bir kez girilir (oda, alanlar).
-- 4) carbon_periods            — dönem başına dolu oda-gece (PMS raporundan).
-- 5) carbon_activity_records   — panelden 3pmetrics'e gönderilen aylık kayıtlar.
--    external_id deterministiktir (birim + başlık + dönem): aynı ayı tekrar
--    göndermek 3pmetrics'te YENİ kayıt açmaz, mevcut kaydı günceller.
-- 6) activate_carbon_measurement() — ölçümü widget fiyatına TEK işlemde uygular
--    (önceki kod üç ayrı yazma yapıyor ve ilk ikisinin hatasını kontrol etmiyordu).

-- ---------------------------------------------------------------------------
-- 1) widget_events.event_type
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.widget_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.widget_events DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.widget_events
  ADD CONSTRAINT widget_events_event_type_chk
  CHECK (event_type IN (
    'widget_goruntulendi',
    'checkbox_secildi',
    'katki_ekle_butonuna_basildi',
    'booking_engine_clicked'
  ));

-- ---------------------------------------------------------------------------
-- 2) carbon_provider_links — ConnectHub alanları
-- ---------------------------------------------------------------------------
ALTER TABLE public.carbon_provider_links
  ADD COLUMN IF NOT EXISTS api TEXT NOT NULL DEFAULT 'cca';
ALTER TABLE public.carbon_provider_links
  ADD COLUMN IF NOT EXISTS read_authorization_ref TEXT;
ALTER TABLE public.carbon_provider_links
  ADD COLUMN IF NOT EXISTS factor_inventory_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'carbon_provider_links_api_chk') THEN
    ALTER TABLE public.carbon_provider_links
      ADD CONSTRAINT carbon_provider_links_api_chk
      CHECK (api IN ('cca', 'connecthub'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'carbon_provider_links_read_ref_chk') THEN
    ALTER TABLE public.carbon_provider_links
      ADD CONSTRAINT carbon_provider_links_read_ref_chk
      CHECK (read_authorization_ref IS NULL
             OR read_authorization_ref ~ '^[A-Z][A-Z0-9_]{2,63}$');
  END IF;
END $$;

-- Bir otelin aynı API türünde en fazla BİR aktif bağlantısı olur
-- (ör. eski CCA bağlantısı ile yeni ConnectHub bağlantısı yan yana durabilir).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_carbon_provider_links_active_api
  ON public.carbon_provider_links (hotel_id, provider, api)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3) Tesis profili
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carbon_facility_profiles (
    hotel_id            UUID PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
    country             TEXT NOT NULL,
    rooms               INTEGER NOT NULL CHECK (rooms > 0),
    total_area_m2       NUMERIC NOT NULL CHECK (total_area_m2 > 0),
    guestrooms_area_m2  NUMERIC NOT NULL CHECK (guestrooms_area_m2 > 0),
    meeting_area_m2     NUMERIC NOT NULL DEFAULT 0 CHECK (meeting_area_m2 >= 0),
    updated_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT carbon_facility_profiles_area
      CHECK (guestrooms_area_m2 + meeting_area_m2 <= total_area_m2)
);

ALTER TABLE public.carbon_facility_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carbon_facility_profiles_tenant_select ON public.carbon_facility_profiles;
CREATE POLICY carbon_facility_profiles_tenant_select ON public.carbon_facility_profiles
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- 4) Dönemler (aylık)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carbon_periods (
    hotel_id              UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    environment           TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    period                TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    occupied_room_nights  INTEGER CHECK (occupied_room_nights IS NULL OR occupied_room_nights > 0),
    measurement_id        UUID REFERENCES public.carbon_measurements(id) ON DELETE SET NULL,
    updated_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (hotel_id, environment, period)
);

ALTER TABLE public.carbon_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carbon_periods_tenant_select ON public.carbon_periods;
CREATE POLICY carbon_periods_tenant_select ON public.carbon_periods
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- 5) Gönderilen aylık kayıtlar
-- ---------------------------------------------------------------------------
--   sending          istek yolda
--   accepted         3pmetrics yazdı (provider_status: ör. pending_approval / created / updated)
--   rejected         3pmetrics bu satırı reddetti (error_code dolu)
--   outcome_unknown  yanıt alınamadı; external_id sabit olduğu için TEKRAR GÖNDERMEK GÜVENLİ
CREATE TABLE IF NOT EXISTS public.carbon_activity_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id          UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    link_id           UUID REFERENCES public.carbon_provider_links(id) ON DELETE SET NULL,
    environment       TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    unit_id           UUID NOT NULL,
    item_id           UUID NOT NULL,
    item_code         TEXT,
    item_name         TEXT,
    period            TEXT NOT NULL,
    quantity          NUMERIC NOT NULL CHECK (quantity >= 0),
    uom               TEXT NOT NULL,
    note              TEXT CHECK (note IS NULL OR length(note) <= 500),
    external_id       TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'sending'
                        CHECK (status IN ('sending', 'accepted', 'rejected', 'outcome_unknown')),
    provider_status   TEXT,
    provider_record_id UUID,
    error_code        TEXT,
    error_message     TEXT,
    warnings          JSONB NOT NULL DEFAULT '[]'::jsonb,
    sent_by           UUID,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_carbon_activity_records_external
  ON public.carbon_activity_records (hotel_id, environment, external_id);
CREATE INDEX IF NOT EXISTS idx_carbon_activity_records_period
  ON public.carbon_activity_records (hotel_id, environment, period);

ALTER TABLE public.carbon_activity_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carbon_activity_records_tenant_select ON public.carbon_activity_records;
CREATE POLICY carbon_activity_records_tenant_select ON public.carbon_activity_records
    FOR SELECT USING (hotel_id = public.current_hotel_id());
-- Yazma yalnızca API (service_role): INSERT/UPDATE/DELETE policy YOK.

-- ---------------------------------------------------------------------------
-- 6) Ölçümü widget fiyatına tek işlemde uygula
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_carbon_measurement(
  p_hotel_id        UUID,
  p_measurement_id  UUID,
  p_amount_per_night NUMERIC,
  p_coefficient_kg  NUMERIC,
  p_pricing         JSONB
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_amount_per_night IS NULL OR p_amount_per_night <= 0
     OR p_coefficient_kg IS NULL OR p_coefficient_kg <= 0
     OR p_pricing IS NULL OR jsonb_typeof(p_pricing) <> 'object' THEN
    RAISE EXCEPTION 'invalid_pricing' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM carbon_measurements
   WHERE id = p_measurement_id AND hotel_id = p_hotel_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'measurement_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE carbon_measurements
     SET is_active = FALSE, updated_at = now()
   WHERE hotel_id = p_hotel_id AND is_active AND id <> p_measurement_id;

  UPDATE carbon_measurements
     SET is_active = TRUE, updated_at = now()
   WHERE id = p_measurement_id AND hotel_id = p_hotel_id;

  UPDATE hotels
     SET contribution_amount_per_night = p_amount_per_night,
         estimated_co2_per_night_kg   = p_coefficient_kg,
         widget_settings = jsonb_set(COALESCE(widget_settings, '{}'::jsonb),
                                     '{carbon_pricing}', p_pricing, TRUE),
         updated_at = now()
   WHERE id = p_hotel_id;
END $$;

REVOKE ALL ON FUNCTION public.activate_carbon_measurement(UUID, UUID, NUMERIC, NUMERIC, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_carbon_measurement(UUID, UUID, NUMERIC, NUMERIC, JSONB)
  TO service_role;
