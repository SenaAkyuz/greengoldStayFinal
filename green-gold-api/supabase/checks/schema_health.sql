-- GreenGold Stay — şema sağlık kontrolü (SALT OKUNUR; hiçbir şeyi değiştirmez).
-- Supabase SQL Editor'da çalıştırın. Her satır bir kontroldür: ok = false olanlar sorundur.

WITH
expected_tables(name) AS (VALUES
  ('hotels'), ('users'), ('widget_events'), ('hotel_integrations'),
  ('reservations'), ('contributions'), ('integration_deliveries'),
  ('carbon_provider_links'), ('carbon_measurement_sessions'),
  ('carbon_measurements'), ('carbon_provider_deliveries'),
  ('reservation_carbon_estimates'), ('carbon_provider_entries'),
  -- 0019
  ('carbon_facility_profiles'), ('carbon_periods'), ('carbon_activity_records')
),
expected_functions(name) AS (VALUES
  ('current_hotel_id'), ('ingest_reservation_event'),
  ('carbon_provider_secret_set'), ('carbon_provider_secret_get'),
  ('carbon_provider_secret_exists'), ('carbon_provider_secret_delete'),
  ('activate_carbon_measurement')  -- 0019
),
checks AS (
  -- 1) Tablolar var mı?
  SELECT 'tablo: ' || e.name AS kontrol,
         (to_regclass('public.' || e.name) IS NOT NULL) AS ok,
         NULL::text AS ayrinti
  FROM expected_tables e

  UNION ALL
  -- 2) RLS her tabloda açık mı? (service_role dışı erişim kapalı olmalı)
  SELECT 'RLS açık: ' || c.relname, c.relrowsecurity, NULL
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN (SELECT name FROM expected_tables)

  UNION ALL
  -- 3) Fonksiyonlar var mı?
  SELECT 'fonksiyon: ' || f.name,
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = f.name),
         NULL
  FROM expected_functions f

  UNION ALL
  -- 4) widget_events: event_type'a bakan TEK kısıt olmalı ve booking_engine_clicked'ı kabul etmeli
  SELECT 'widget_events event_type kısıtı tek ve güncel',
         count(*) = 1 AND bool_and(pg_get_constraintdef(oid) LIKE '%booking_engine_clicked%'),
         string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | ')
  FROM pg_constraint
  WHERE conrelid = 'public.widget_events'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%event_type%'

  UNION ALL
  -- 5) 0019 sütunları
  SELECT 'carbon_provider_links.' || col,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'carbon_provider_links'
                   AND column_name = col),
         NULL
  FROM (VALUES ('api'), ('read_authorization_ref'), ('factor_inventory_id'),
               ('provider_member_id')) v(col)

  UNION ALL
  -- 5b) 0020: tesis profilinde ISO ülke kodu
  SELECT 'carbon_facility_profiles.country_code',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'carbon_facility_profiles'
                   AND column_name = 'country_code'),
         NULL

  UNION ALL
  -- 6) Tekillik indeksleri (mükerrer kaydı engelleyenler)
  SELECT 'indeks: ' || i.name,
         to_regclass('public.' || i.name) IS NOT NULL, NULL
  FROM (VALUES ('uniq_carbon_measurements_identity'),
               ('uniq_carbon_measurements_active'),
               ('uniq_carbon_provider_links_active_property'),
               ('uniq_carbon_provider_entries_idempotency'),
               ('uniq_carbon_activity_records_external'),
               ('uniq_carbon_provider_links_active_api')) i(name)

  UNION ALL
  -- 7) Veri tutarlılığı: otel başına en fazla bir aktif ölçüm
  SELECT 'veri: otel başına ≤1 aktif ölçüm',
         NOT EXISTS (SELECT 1 FROM carbon_measurements WHERE is_active
                     GROUP BY hotel_id HAVING count(*) > 1),
         NULL

  UNION ALL
  -- 8) Veri: aynı otelde aynı api türünde birden fazla aktif bağlantı olmamalı
  SELECT 'veri: otel başına api türü başına ≤1 aktif bağlantı',
         NOT EXISTS (SELECT 1 FROM carbon_provider_links WHERE status = 'active'
                     GROUP BY hotel_id, provider,
                              COALESCE((to_jsonb(carbon_provider_links) ->> 'api'), 'cca')
                     HAVING count(*) > 1),
         NULL

  UNION ALL
  -- 9) Fonksiyon yetkileri: anon/authenticated çağıramamalı
  SELECT 'yetki: anon ' || p.proname || ' çağıramaz',
         NOT has_function_privilege('anon', p.oid, 'EXECUTE'), NULL
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('carbon_provider_secret_get', 'carbon_provider_secret_set',
                      'activate_carbon_measurement', 'ingest_reservation_event')
)
SELECT kontrol, ok, ayrinti FROM checks ORDER BY ok, kontrol;
