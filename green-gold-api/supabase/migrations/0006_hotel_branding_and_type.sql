-- ADIM 11C: Marka (logo/renk) + otel tipi (tanımlayıcı).

ALTER TABLE hotels
  ADD COLUMN logo_url    TEXT,
  ADD COLUMN brand_color TEXT,                                  -- '#RRGGBB'
  ADD COLUMN hotel_type  TEXT NOT NULL DEFAULT 'city';          -- 'city' | 'premium' | 'resort'

-- hotel_type yalnızca izinli değerler. TANIMLAYICI alan (şehir/premium ayrımı);
-- karbon hesabını ETKİLEMEZ (tier bazlı katsayı yok).
ALTER TABLE hotels
  ADD CONSTRAINT hotels_hotel_type_chk CHECK (hotel_type IN ('city', 'premium', 'resort'));

-- estimated_co2_per_night_kg artık NULLABLE:
--   NULL -> değer atanmamış; kodda tek dokümante PLACEHOLDER (8.30) fallback.
--   dolu -> otelin tahmini katsayısı.
-- (Placeholder GEÇİCİDİR — Green Gold metodoloji onayı bekleniyor.)
-- Eski satırlar mevcut değerlerini korur (geriye dönük uyumlu).
ALTER TABLE hotels
  ALTER COLUMN estimated_co2_per_night_kg DROP NOT NULL,
  ALTER COLUMN estimated_co2_per_night_kg DROP DEFAULT;
