-- Faz 1 + Faz 2: harici karbon OLCUM saglayicisi (3pmetrics) siniri.
--
-- NEDEN YENI TABLOLAR, NEDEN MEVCUT TABLOLARA DOKUNULMADI
-- --------------------------------------------------------
-- 1) `hotel_integrations` booking-engine/PMS seklindedir: `product_code NOT NULL`
--    ve `webhook_routing_id` bir rezervasyon optional-extra kontratina aittir.
--    Karbon olcum saglayicisinin urun kodu YOKTUR. O tabloyu yeniden kullanmak
--    `product_code`'u nullable yapmayi ve `provider` CHECK'ini genisletmeyi
--    gerektirirdi - yani MEVCUT tabloyu degistirmeyi. Bu migration mevcut hicbir
--    tabloyu/kolonu/policy'yi DEGISTIRMEZ veya SILMEZ; yalnizca yeni tablo ekler.
-- 2) `hotels.widget_settings.carbon_reports` (JSONB) bugunku elle hesap arsivini
--    tutuyor ve KORUNUR. Ama olcum kimligi + surum ile mukerrer kayit engellemek,
--    doneme gore sorgulamak ve 50'den fazla gecmis olcumu tutmak JSONB dizisinde
--    guvenli degildir (tekillik kisiti kurulamaz). Saglayici olcumleri bu yuzden
--    iliskisel tabloya yazilir.
--
-- RLS deseni mevcut tablolarla AYNIDIR: yalnizca tenant SELECT policy'si;
-- INSERT/UPDATE/DELETE policy'si YOK (deny-by-default, yalnizca service_role yazar).
--
-- DIKKAT: Bu tablolar saglayici sozlesmesi netlesene kadar BOS kalir. 3pmetrics'in
-- resmi API/webhook dokumani ve kimlik dogrulama yontemi elimize gecmeden hicbir
-- adapter `configured = true` olmaz (bkz. src/carbon/adapters/*).

-- ---------------------------------------------------------------------------
-- Faz 2: otelin harici karbon hesabi/tesisi ile eslestirmesi
-- ---------------------------------------------------------------------------
-- "Otelin 3pmetrics sifresini bizim toplamamiz gerekmemeli" -> bu tabloda ne
-- sifre ne de token ACIK METIN tutulur. `authorization_ref` yalnizca opak bir
-- referanstir; gercek deger harici bir secrets manager'dan cozulur (bugun
-- production icin YOK - fail closed, bkz. src/integrations/secret-resolver.ts).
CREATE TABLE carbon_provider_links (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id                  UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,

    -- src/carbon/carbon-provider-registry.ts ile BIREBIR ayni tutulur.
    provider                  TEXT NOT NULL CHECK (provider IN ('threepmetrics')),
    environment               TEXT NOT NULL DEFAULT 'sandbox'
                                CHECK (environment IN ('sandbox', 'production')),

    -- Saglayicinin tesis kimligi. Birden fazla oteli olan hesaplarda her tesis
    -- AYRI satirdir (yonergedeki Faz 2 / 4. adim).
    external_property_id      TEXT NOT NULL,
    -- Tesisin bagli oldugu saglayici hesabi (ayni hesapta birden fazla tesis).
    external_account_id       TEXT,
    external_property_name    TEXT,

    status                    TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'active', 'revoked')),

    -- Opak yetkilendirme referansi - secret_ref ile AYNI format kisiti
    -- (bkz. migration 0014 ve SECRET_REF_RE): env degiskeni adi olarak guvenli.
    authorization_ref         TEXT CHECK (authorization_ref IS NULL
                                          OR authorization_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'),
    authorization_expires_at  TIMESTAMPTZ,
    -- Verilen izin kapsami (saglayici ne donduruyorsa aynen; yorumlanmaz).
    scopes                    TEXT[] NOT NULL DEFAULT '{}',

    linked_at                 TIMESTAMPTZ,
    -- "Otel baglantiyi kaldirdiginda yeni veri aktarimi da durmali" -> ingestion
    -- status <> 'active' olan linkleri reddeder; satir AUDIT icin silinmez.
    revoked_at                TIMESTAMPTZ,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT carbon_provider_links_revoked_consistency
      CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- Otel + saglayici + ortam + tesis basina tek satir.
CREATE UNIQUE INDEX uniq_carbon_provider_links_scope
  ON carbon_provider_links (hotel_id, provider, environment, external_property_id);

-- Ayni tesis AYNI ANDA iki farkli otele aktif baglanamaz (tenant caprazi veri
-- karismasini DB seviyesinde engeller). Revoked satirlar bu kisita girmez.
CREATE UNIQUE INDEX uniq_carbon_provider_links_active_property
  ON carbon_provider_links (provider, environment, external_property_id)
  WHERE status = 'active';

CREATE INDEX idx_carbon_provider_links_hotel_id ON carbon_provider_links (hotel_id);

ALTER TABLE carbon_provider_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY carbon_provider_links_tenant_select ON carbon_provider_links
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- Faz 1: "Olcume basla" oturumu
-- ---------------------------------------------------------------------------
-- Bir satir = "bu otel icin, bu donem icin bir olcum formu actik" demektir.
-- `measurement_ref` BIZIM olcum kimligimizdir: saglayiciya iletilir ve webhook/
-- API yanitinda geri gelir. Boylece donen veri kesin olarak bu otele baglanir.
--
-- "Otelin tarayici donusu ile sunucular arasi aktarim BAGIMSIZ calismali" ->
-- sonuc bu satira degil, webhook/polling ile carbon_measurements'a yazilir;
-- otel sayfayi kapatsa bile ingestion devam eder. Tarayici donusu yalnizca
-- `status` guncellemesidir, verinin tasiyicisi DEGILDIR.
CREATE TABLE carbon_measurement_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id              UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    provider              TEXT NOT NULL CHECK (provider IN ('threepmetrics')),
    environment           TEXT NOT NULL DEFAULT 'sandbox'
                            CHECK (environment IN ('sandbox', 'production')),

    -- Bizim olcum kimligimiz (saglayiciya gonderilen measurement_id).
    measurement_ref       UUID NOT NULL DEFAULT gen_random_uuid(),

    period_start          DATE NOT NULL,
    period_end            DATE NOT NULL,

    -- Donus adresi - acik redirect'i engellemek icin uygulama katmani bunu
    -- panelin kendi origin'ine karsi dogrular (bkz. carbon-measurement.service).
    return_url            TEXT NOT NULL,

    -- Saglayicidan gelen oturum kimligi ve SURELI form baglantisi. Sozlesme
    -- gelene kadar NULL kalir (adapter configured=false -> oturum acilmaz).
    external_session_id   TEXT,
    form_url              TEXT,
    expires_at            TIMESTAMPTZ,

    status                TEXT NOT NULL DEFAULT 'created'
                            CHECK (status IN ('created', 'opened', 'submitted',
                                              'completed', 'expired', 'failed')),
    error_code            TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ,

    CONSTRAINT carbon_measurement_sessions_period
      CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX uniq_carbon_measurement_sessions_ref
  ON carbon_measurement_sessions (measurement_ref);

CREATE INDEX idx_carbon_measurement_sessions_hotel
  ON carbon_measurement_sessions (hotel_id, created_at DESC);

ALTER TABLE carbon_measurement_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY carbon_measurement_sessions_tenant_select ON carbon_measurement_sessions
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- Iceri aktarilan olcumler (Faz 1 sonucu + Faz 2 gecmis olcumler)
-- ---------------------------------------------------------------------------
-- Yonerge: "Yalnizca hesaplama sonucu yeterli degil; oda sayisi, doluluk, dolu
-- oda-gece/misafir-gece ve tuketim verilerine de ihtiyacimiz var." -> hem sonuc
-- alanlari hem `form_data` (alan tanimi + birim + donem ile birlikte ham alanlar)
-- saklanir.
--
-- Birim cevrilmez: saglayicinin verdigi birim `total_emissions_unit` icinde
-- AYNEN tutulur. kg/ton donusumu uygulama katmaninda, acik bir donusumle yapilir.
CREATE TABLE carbon_measurements (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id                 UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    provider                 TEXT NOT NULL CHECK (provider IN ('threepmetrics')),
    environment              TEXT NOT NULL DEFAULT 'sandbox'
                               CHECK (environment IN ('sandbox', 'production')),

    -- Faz 1'de oturumdan gelir; Faz 2 gecmis import'unda NULL.
    session_id               UUID REFERENCES carbon_measurement_sessions(id) ON DELETE SET NULL,
    link_id                  UUID REFERENCES carbon_provider_links(id) ON DELETE SET NULL,

    external_property_id     TEXT NOT NULL,
    external_measurement_id  TEXT NOT NULL,
    -- Revizyon takibi: "Her olcumu kimligi ve SURUMUYLE takip ederek mukerrer
    -- kayit olusmasini onleriz." Surum saglayicidan gelir; yoksa '1'.
    external_version         TEXT NOT NULL DEFAULT '1',

    period_start             DATE NOT NULL,
    period_end               DATE NOT NULL,

    result_status            TEXT NOT NULL DEFAULT 'submitted'
                               CHECK (result_status IN ('draft', 'submitted', 'calculating',
                                                        'completed', 'failed')),

    -- Sonuc (saglayicinin kendi birimi/kapsami ile)
    total_emissions          NUMERIC,
    total_emissions_unit     TEXT,
    scope                    TEXT,
    methodology              TEXT,
    methodology_version      TEXT,
    verification_status      TEXT,
    report_url               TEXT,

    -- Yonergenin acikca istedigi form alanlari (dagitim hesabi bunlara dayanir)
    rooms                    INTEGER CHECK (rooms IS NULL OR rooms > 0),
    occupied_room_nights     INTEGER CHECK (occupied_room_nights IS NULL OR occupied_room_nights > 0),
    guest_nights             INTEGER CHECK (guest_nights IS NULL OR guest_nights > 0),
    occupancy_percent        NUMERIC,

    -- Alan tanimi + birim + donem ile birlikte tum form alanlari (ham haliyle).
    form_data                JSONB,

    -- GreenGold tarafinda TURETILEN deger. Saglayicinin iddiasi degildir:
    -- konaklamaya ayrilmis kgCO2e / dolu oda-gece.
    room_night_kg            NUMERIC CHECK (room_night_kg IS NULL OR room_night_kg > 0),
    allocation_method        TEXT,
    -- Widget fiyatini su an hangi olcum belirliyor (otel basina en fazla bir tane).
    is_active                BOOLEAN NOT NULL DEFAULT FALSE,

    provider_updated_at      TIMESTAMPTZ,
    imported_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT carbon_measurements_period CHECK (period_end >= period_start)
);

-- Mukerrer kayit engeli: ayni olcumun ayni surumu bir otel icin TEK satir.
CREATE UNIQUE INDEX uniq_carbon_measurements_identity
  ON carbon_measurements (hotel_id, provider, external_measurement_id, external_version);

-- Otel basina en fazla BIR aktif olcum (widget fiyati belirsiz kalamaz).
CREATE UNIQUE INDEX uniq_carbon_measurements_active
  ON carbon_measurements (hotel_id)
  WHERE is_active;

CREATE INDEX idx_carbon_measurements_hotel_period
  ON carbon_measurements (hotel_id, period_end DESC);

-- "Guncellenen kayitlari sorgulama" (periyodik kontrol) icin.
CREATE INDEX idx_carbon_measurements_provider_updated
  ON carbon_measurements (provider, provider_updated_at DESC);

ALTER TABLE carbon_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY carbon_measurements_tenant_select ON carbon_measurements
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- Karbon saglayici webhook denetim gunlugu
-- ---------------------------------------------------------------------------
-- `integration_deliveries` KULLANILAMAZ: orada `integration_id` NOT NULL ve
-- `hotel_integrations`'a FK'lidir - karbon saglayicisinin boyle bir satiri yok.
-- Ayni PII-minimizasyon karari gecerlidir: HAM payload SAKLANMAZ.
CREATE TABLE carbon_provider_deliveries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id             UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    provider             TEXT NOT NULL,

    -- Bildirimin cozuldugu olcum oturumu / olcum (cozulemediyse NULL).
    session_id           UUID REFERENCES carbon_measurement_sessions(id) ON DELETE SET NULL,
    measurement_id       UUID REFERENCES carbon_measurements(id) ON DELETE SET NULL,

    provider_event_id    TEXT,
    event_type           TEXT,
    payload_hash         TEXT NOT NULL,
    signature_verified   BOOLEAN NOT NULL,

    processing_status    TEXT NOT NULL
                           CHECK (processing_status IN (
                             'received', 'processed',
                             'rejected_bad_signature', 'rejected_invalid_payload',
                             'rejected_replay', 'rejected_unknown_measurement',
                             'rejected_link_revoked', 'error'
                           )),
    error_code           TEXT,
    normalized_snapshot  JSONB,

    received_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX uniq_carbon_provider_deliveries_replay
  ON carbon_provider_deliveries (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX idx_carbon_provider_deliveries_hotel
  ON carbon_provider_deliveries (hotel_id, received_at DESC);

ALTER TABLE carbon_provider_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY carbon_provider_deliveries_tenant_select ON carbon_provider_deliveries
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- ---------------------------------------------------------------------------
-- Rezervasyon bazli emisyon tahmini - DONEMSEL SNAPSHOT
-- ---------------------------------------------------------------------------
-- Yonerge: "oda-gece ve rezervasyon bazli emisyon tahmini hesaplayacagiz."
--
-- Neden ayri tablo: `hotels.estimated_co2_per_night_kg` TEK bir guncel skalerdir.
-- Gecmis bir rezervasyonun tahminini bugunun katsayisiyla yeniden hesaplamak
-- kaydi geriye donuk DEGISTIRIR. Bu tablo, o rezervasyon icin O AN kullanilan
-- katsayiyi ve hangi olcumden geldigini dondurur (CARBON_METHODOLOGY_REVIEW.md:
-- "Gecmis rezervasyonlara kullanilan sonuclarin kopyasi saklanmalidir").
-- `reservations` tablosu DEGISTIRILMEDI.
CREATE TABLE reservation_carbon_estimates (
    reservation_id     UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
    hotel_id           UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,

    -- Tahminin dayandigi olcum. Olcum silinse bile katsayi snapshot'i kalir.
    measurement_id     UUID REFERENCES carbon_measurements(id) ON DELETE SET NULL,
    -- Katsayinin kaynagi: saglayici olcumu mu, otel girdisi mi, bolgesel tahmin mi.
    source             TEXT NOT NULL
                         CHECK (source IN ('provider_measurement', 'hotel_input', 'regional_estimate')),

    -- `reservations` oda sayisi TASIMIYOR (normalized event kontratinda yok).
    -- Sozlesme netlesene kadar 1 kabul edilir; bu varsayim burada ACIK durur.
    rooms              INTEGER NOT NULL DEFAULT 1 CHECK (rooms > 0),
    nights             INTEGER NOT NULL CHECK (nights BETWEEN 1 AND 365),
    room_nights        INTEGER NOT NULL CHECK (room_nights > 0),

    coefficient_kg     NUMERIC NOT NULL CHECK (coefficient_kg > 0),
    estimated_co2_kg   NUMERIC NOT NULL CHECK (estimated_co2_kg > 0),

    computed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservation_carbon_estimates_hotel
  ON reservation_carbon_estimates (hotel_id, computed_at DESC);

ALTER TABLE reservation_carbon_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_carbon_estimates_tenant_select ON reservation_carbon_estimates
    FOR SELECT USING (hotel_id = public.current_hotel_id());
