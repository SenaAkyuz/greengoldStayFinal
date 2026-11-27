-- 0020 — Tesis profiline ISO ülke kodu
--
-- Neden: 3pmetrics faktör paketinde ülkeye bağlı faktörler (ör. şebeke
-- elektriği) `country_code` taşır; birimin ülkesi 3pmetrics'te boşsa
-- `FACTOR_COUNTRY_FALLBACK` ile başka ülkenin faktörü gelir. Green Gold,
-- faktörün tesise uygunluğunu kendi tesis profilindeki ülke koduyla doğrular
-- (bkz. src/carbon/connecthub/country-check.ts). Kod yoksa hesap yine yapılır;
-- doğrulanamayan ülke faktörü içeren sonuç yalnız önizleme olur, yayınlanmaz.
--
-- Geriye uyumlu: sütun boş olabilir; uygulama sütun yokken (42703) eski
-- sorguya düşer. 0019'dan SONRA uygulanır. Tekrar çalıştırılabilir.

ALTER TABLE public.carbon_facility_profiles
  ADD COLUMN IF NOT EXISTS country_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'carbon_facility_profiles_country_code_iso2'
      AND conrelid = 'public.carbon_facility_profiles'::regclass
  ) THEN
    ALTER TABLE public.carbon_facility_profiles
      ADD CONSTRAINT carbon_facility_profiles_country_code_iso2
      CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

COMMENT ON COLUMN public.carbon_facility_profiles.country_code IS
  'ISO 3166-1 alpha-2 (ör. TR). 3pmetrics faktör ülkesinin tesise uygunluğunu doğrulamak için.';
