CREATE TABLE hotels (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                          TEXT NOT NULL,
    hotel_code                    TEXT UNIQUE NOT NULL,        -- "HTL-1024"
    city                          TEXT,
    country                       TEXT DEFAULT 'TR',
    timezone                      TEXT NOT NULL DEFAULT 'Europe/Istanbul', -- aylık/günlük gruplama için
    default_currency              TEXT DEFAULT 'EUR',
    commission_rate               NUMERIC(5,2) DEFAULT 20.00,
    contribution_model            TEXT DEFAULT 'gece_basi_sabit',
    contribution_amount_per_night NUMERIC(10,2) DEFAULT 3.00,
    -- TAHMİNİ karbon katsayısı. 8.30 placeholder; ileride oda tipine göre çeşitlenebilir.
    -- UI/sertifika metinlerinde bu değerden türeyen her sayı "tahmini" ibaresiyle gösterilmeli.
    estimated_co2_per_night_kg    NUMERIC(10,2) NOT NULL DEFAULT 8.30,
    -- Widget'ın kendini tanıttığı düşük yetkili public anahtar (hassas değil).
    public_widget_key             TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    pms_provider                  TEXT,
    status                        TEXT DEFAULT 'pending',      -- pending / active / suspended
    created_at                    TIMESTAMPTZ DEFAULT now(),
    updated_at                    TIMESTAMPTZ DEFAULT now()
);
