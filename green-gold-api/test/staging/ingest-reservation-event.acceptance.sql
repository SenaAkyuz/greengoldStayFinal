-- =============================================================================
-- ACCEPTANCE TEST — public.ingest_reservation_event
-- =============================================================================
--
-- ⚠️ BU DOSYA JEST İLE ÇALIŞMAZ. `ingest_reservation_event` fonksiyonunun asıl
-- değeri TRANSACTION SEMANTİĞİDİR (atomiklik, advisory lock, satır kilidi,
-- rollback, serialization failure) ve TENANT BAĞIDIR. Bunların hiçbiri
-- bellek-içi sahte Supabase istemcisiyle taklit edilemez.
--
-- ⚠️ YALNIZCA disposable bir test veritabanında çalıştırın. Production veya
-- paylaşılan staging veritabanında ÇALIŞTIRMAYIN.
--
-- Kurulum ve çalıştırma: bkz. test/staging/README.md
--   psql "$ACCEPTANCE_URL" -v ON_ERROR_STOP=1 \
--     -f test/staging/ingest-reservation-event.acceptance.sql
--
-- Her test bir DO bloğudur ve ASSERT ile doğrular; herhangi biri geçmezse
-- ON_ERROR_STOP=1 sayesinde script HATA ile durur.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Sentetik fixture (GERÇEK otel/misafir/rezervasyon verisi DEĞİLDİR)
--   Hotel A -> Integration A (active,  prop-accept-1, generic_signed_webhook)
--   Hotel B -> Integration B (active,  prop-accept-2, generic_signed_webhook)
--   Hotel A -> Integration P (pending, prop-accept-3, generic_signed_webhook)
--   Hotel A -> Integration S (suspended, prop-accept-4, synxis)
-- ---------------------------------------------------------------------------
INSERT INTO hotels (id, name, hotel_code, public_widget_key, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ACCEPTANCE HOTEL A', 'HTL-ACCEPT-A', 'wk-accept-a', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ACCEPTANCE HOTEL B', 'HTL-ACCEPT-B', 'wk-accept-b', 'active');

INSERT INTO hotel_integrations (
  id, hotel_id, provider, environment, status,
  external_property_id, product_code, secret_ref
) VALUES
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'generic_signed_webhook', 'sandbox', 'active',
   'prop-accept-1', 'GG-EXTRA', 'ACCEPT_TEST_REF_A'),
  ('bbbb2222-bbbb-2222-bbbb-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'generic_signed_webhook', 'sandbox', 'active',
   'prop-accept-2', 'GG-EXTRA', 'ACCEPT_TEST_REF_B'),
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'generic_signed_webhook', 'sandbox', 'pending',
   'prop-accept-3', 'GG-EXTRA', 'ACCEPT_TEST_REF_P'),
  ('44444444-4444-4444-4444-444444444444',
   '11111111-1111-1111-1111-111111111111',
   'synxis', 'sandbox', 'suspended',
   'prop-accept-4', 'GG-EXTRA', 'ACCEPT_TEST_REF_S');

-- ---------------------------------------------------------------------------
-- T1: confirmed + selected + collected -> reservation + contribution oluşur
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  r := public.ingest_reservation_event(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'evt-1', 'res-1', 'hash-1',
    '{"property_id":"prop-accept-1","reservation_status":"confirmed"}'::jsonb,
    'processed', NULL,
    NULL, FALSE,
    '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
    '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected","line_item_reference":"LI-1","collected_at":"2026-01-01T10:00:00Z"}'::jsonb
  );
  ASSERT r->>'status' = 'processed', 'T1: status processed olmali';
  -- hotel_id RPC tarafindan DB'den turetildi (cagirandan gelmedi).
  ASSERT r->>'hotel_id' = '11111111-1111-1111-1111-111111111111',
    'T1: hotel_id integration satirindan turetilmeli';
  ASSERT (SELECT count(*) FROM reservations WHERE provider_reservation_id='res-1') = 1,
    'T1: tek reservation olmali';
  ASSERT (SELECT hotel_id FROM reservations WHERE provider_reservation_id='res-1')
         = '11111111-1111-1111-1111-111111111111', 'T1: reservation dogru tenant''ta olmali';
  ASSERT (SELECT count(*) FROM contributions WHERE amount_minor=500 AND status='collected') = 1,
    'T1: contribution collected olmali';
  ASSERT (SELECT processing_status FROM integration_deliveries WHERE provider_event_id='evt-1') = 'processed',
    'T1: delivery processed olmali';
  RAISE NOTICE 'T1 PASS';
END $$;

-- ---------------------------------------------------------------------------
-- T2: AYNI provider_event_id tekrar -> already_processed, finansal state AYNI
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb; v_amount int;
BEGIN
  r := public.ingest_reservation_event(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'evt-1', 'res-1', 'hash-1',
    '{"property_id":"prop-accept-1","reservation_status":"confirmed"}'::jsonb,
    'processed', NULL,
    '2026-01-01T10:00:00Z'::timestamptz, TRUE,
    '{"booking_status":"confirmed","provider_updated_at":"2026-01-01T11:00:00Z"}'::jsonb,
    '{"selected":true,"amount_minor":99999,"currency":"EUR","status":"collected"}'::jsonb
  );
  ASSERT r->>'status' = 'already_processed', 'T2: already_processed olmali';

  SELECT amount_minor INTO v_amount FROM contributions
   WHERE reservation_id = (SELECT id FROM reservations WHERE provider_reservation_id='res-1');
  -- KRİTİK: tekrar gelen event finansal toplami SISIRMEDI.
  ASSERT v_amount = 500, 'T2: tutar degismemeli (finansal sisme yok)';
  ASSERT (SELECT count(*) FROM integration_deliveries WHERE provider_event_id='evt-1') = 1,
    'T2: ikinci delivery satiri olusmamali';
  RAISE NOTICE 'T2 PASS';
END $$;

-- ---------------------------------------------------------------------------
-- T3: BAYAT KARAR (yanlis expected_provider_updated_at) -> 40001 + TAM ROLLBACK
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_caught boolean := false;
BEGIN
  BEGIN
    PERFORM public.ingest_reservation_event(
      '22222222-2222-2222-2222-222222222222'::uuid,
      'evt-stale', 'res-1', 'hash-stale',
      '{"property_id":"prop-accept-1","reservation_status":"modified"}'::jsonb,
      'processed', NULL,
      -- Gercek deger '2026-01-01T10:00:00Z'; bilerek YANLIS baseline.
      '2020-01-01T00:00:00Z'::timestamptz, TRUE,
      '{"booking_status":"modified","provider_updated_at":"2026-01-02T10:00:00Z"}'::jsonb,
      '{"selected":true,"amount_minor":700,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T3: 40001 bekleniyordu, hata alinmadi';
  EXCEPTION WHEN sqlstate '40001' THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'T3: serialization_failure yakalanmali';

  ASSERT (SELECT count(*) FROM integration_deliveries WHERE provider_event_id='evt-stale') = 0,
    'T3: bayat kararda delivery satiri KALMAMALI';
  ASSERT (SELECT booking_status FROM reservations WHERE provider_reservation_id='res-1') = 'confirmed',
    'T3: reservation DEGISMEMELI';
  ASSERT (SELECT amount_minor FROM contributions
            WHERE reservation_id=(SELECT id FROM reservations WHERE provider_reservation_id='res-1')) = 500,
    'T3: contribution DEGISMEMELI';
  RAISE NOTICE 'T3 PASS';
END $$;

-- ---------------------------------------------------------------------------
-- T4: reject karari (out-of-order) -> delivery yazilir, domain DEGISMEZ
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  r := public.ingest_reservation_event(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'evt-ooo', 'res-1', 'hash-ooo',
    '{"property_id":"prop-accept-1","reservation_status":"confirmed"}'::jsonb,
    'rejected_out_of_order', 'stale_event',
    '2026-01-01T10:00:00Z'::timestamptz, TRUE,
    NULL, NULL
  );
  ASSERT r->>'status' = 'rejected_out_of_order', 'T4: reject status donmeli';
  ASSERT (SELECT booking_status FROM reservations WHERE provider_reservation_id='res-1') = 'confirmed',
    'T4: reservation DEGISMEMELI';
  ASSERT (SELECT error_code FROM integration_deliveries WHERE provider_event_id='evt-ooo') = 'stale_event',
    'T4: delivery audit kaydi olmali';
  RAISE NOTICE 'T4 PASS';
END $$;

-- ---------------------------------------------------------------------------
-- T5: manual_review -> reservation guncellenir, contribution DOKUNULMAZ
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  r := public.ingest_reservation_event(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'evt-noshow', 'res-1', 'hash-noshow',
    '{"property_id":"prop-accept-1","reservation_status":"no_show"}'::jsonb,
    'manual_review', 'no_show_payment_decision_pending',
    '2026-01-01T10:00:00Z'::timestamptz, TRUE,
    '{"booking_status":"no_show","provider_updated_at":"2026-01-03T10:00:00Z"}'::jsonb,
    NULL
  );
  ASSERT r->>'status' = 'manual_review', 'T5: manual_review donmeli';
  ASSERT (SELECT booking_status FROM reservations WHERE provider_reservation_id='res-1') = 'no_show',
    'T5: reservation guncellenmeli';
  ASSERT (SELECT amount_minor FROM contributions
            WHERE reservation_id=(SELECT id FROM reservations WHERE provider_reservation_id='res-1')) = 500,
    'T5: contribution DEGISMEMELI';
  RAISE NOTICE 'T5 PASS';
END $$;

-- ---------------------------------------------------------------------------
-- T6: contribution yazimi PATLARSA reservation da geri alinir (ATOMIKLIK)
--     CHECK ihlali: selected=false iken amount_minor<>0
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_status text; v_caught boolean := false;
BEGIN
  SELECT booking_status INTO v_status FROM reservations WHERE provider_reservation_id='res-1';

  BEGIN
    PERFORM public.ingest_reservation_event(
      '22222222-2222-2222-2222-222222222222'::uuid,
      'evt-badcontrib', 'res-1', 'hash-badcontrib',
      '{"property_id":"prop-accept-1","reservation_status":"stayed"}'::jsonb,
      'processed', NULL,
      '2026-01-03T10:00:00Z'::timestamptz, TRUE,
      '{"booking_status":"stayed","provider_updated_at":"2026-01-04T10:00:00Z"}'::jsonb,
      '{"selected":false,"amount_minor":123,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T6: CHECK ihlali bekleniyordu';
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;

  ASSERT v_caught, 'T6: check_violation yakalanmali';
  -- KRİTİK: reservation patch ONCE uygulanmisti; contribution patlayinca
  -- fonksiyonun TUM yazimlari geri alinmali.
  ASSERT (SELECT booking_status FROM reservations WHERE provider_reservation_id='res-1') = v_status,
    'T6: contribution hatasinda reservation GERI ALINMALI';
  ASSERT (SELECT count(*) FROM integration_deliveries WHERE provider_event_id='evt-badcontrib') = 0,
    'T6: delivery satiri da kalmamali';
  RAISE NOTICE 'T6 PASS — atomiklik dogrulandi';
END $$;

-- =============================================================================
-- TENANT / INTEGRATION BAĞLAMA TESTLERİ (T7..T11)
--
-- Bu testler, RPC'nin hotel_id/provider'i ÇAĞIRANDAN ALMADIĞINI ve integration
-- satırından türettiğini doğrular. Fonksiyon imzasında artık p_hotel_id ve
-- p_provider YOKTUR — dolayısıyla "yanlış hotel_id geçirme" saldırısı
-- İFADE EDİLEMEZ hale gelmiştir. Testler bunu hem imza düzeyinde hem de
-- davranış düzeyinde kanıtlar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- T7: İMZA KANITI — p_hotel_id / p_provider parametreleri ARTIK YOK.
--     (Çapraz tenant çağrısı "yapılamıyor" olmalı, "reddediliyor" değil.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_names text[]; v_count int; v_args text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='ingest_reservation_event';
  -- Eski (guvensiz) imzanin overload olarak HAYATTA KALMADIGINI da kanitlar.
  ASSERT v_count = 1, format('T7: tek bir overload olmali (bulunan=%s)', v_count);

  SELECT p.proargnames, pg_get_function_arguments(p.oid)
    INTO v_names, v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='ingest_reservation_event';

  -- Tam eslesme (substring degil): p_provider_event_id gibi adlar yaniltmasin.
  ASSERT NOT ('p_hotel_id' = ANY(v_names)),
    format('T7: p_hotel_id parametresi KALDIRILMIS olmali. Imza: %s', v_args);
  ASSERT NOT ('p_provider' = ANY(v_names)),
    format('T7: p_provider parametresi KALDIRILMIS olmali. Imza: %s', v_args);
  ASSERT 'p_integration_id' = ANY(v_names),
    'T7: p_integration_id bulunmali';
  RAISE NOTICE 'T7 PASS — capraz tenant cagrisi IFADE EDILEMEZ. Imza: %', v_args;
END $$;

-- ---------------------------------------------------------------------------
-- T8: ÇAPRAZ TENANT — Integration A + Hotel B property'si.
--     Integration A'nin external_property_id'si 'prop-accept-1'; Hotel B'nin
--     property'si ('prop-accept-2') ile cagrilirsa RPC reddetmeli ve HİÇBİR
--     satır yazmamali.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_caught boolean := false;
  v_res_before int; v_con_before int; v_del_before int;
  v_res_after  int; v_con_after  int; v_del_after  int;
BEGIN
  SELECT count(*) INTO v_res_before FROM reservations;
  SELECT count(*) INTO v_con_before FROM contributions;
  SELECT count(*) INTO v_del_before FROM integration_deliveries;

  BEGIN
    PERFORM public.ingest_reservation_event(
      '22222222-2222-2222-2222-222222222222'::uuid,   -- Integration A (Hotel A)
      'evt-crosstenant', 'res-cross', 'hash-cross',
      -- Hotel B'nin property'si -> Integration A ile ESLESMEZ
      '{"property_id":"prop-accept-2","reservation_status":"confirmed"}'::jsonb,
      'processed', NULL,
      NULL, FALSE,
      '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
      '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T8: capraz tenant cagrisi REDDEDILMELIYDI';
  EXCEPTION WHEN sqlstate '22023' THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'T8: property mismatch reddedilmeli';

  SELECT count(*) INTO v_res_after FROM reservations;
  SELECT count(*) INTO v_con_after FROM contributions;
  SELECT count(*) INTO v_del_after FROM integration_deliveries;

  ASSERT v_res_after = v_res_before, 'T8: reservations satir sayisi DEGISMEMELI';
  ASSERT v_con_after = v_con_before, 'T8: contributions satir sayisi DEGISMEMELI';
  ASSERT v_del_after = v_del_before, 'T8: integration_deliveries satir sayisi DEGISMEMELI';
  -- Hotel B'ye hicbir sey sizmadi.
  ASSERT (SELECT count(*) FROM reservations
            WHERE hotel_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 0,
    'T8: Hotel B''ye capraz kayit yazilmamali';
  RAISE NOTICE 'T8 PASS — capraz tenant reddedildi, satir sayilari degismedi';
END $$;

-- ---------------------------------------------------------------------------
-- T9: PENDING integration domain write YAPAMAZ (audit dahil).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_caught boolean := false;
  v_res_before int; v_del_before int;
  v_res_after  int; v_del_after  int;
BEGIN
  SELECT count(*) INTO v_res_before FROM reservations;
  SELECT count(*) INTO v_del_before FROM integration_deliveries;

  BEGIN
    PERFORM public.ingest_reservation_event(
      '33333333-3333-3333-3333-333333333333'::uuid,   -- PENDING
      'evt-pending', 'res-pending', 'hash-pending',
      '{"property_id":"prop-accept-3","reservation_status":"confirmed"}'::jsonb,
      'processed', NULL,
      NULL, FALSE,
      '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
      '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T9: pending integration REDDEDILMELIYDI';
  EXCEPTION WHEN sqlstate '22023' THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'T9: pending integration reddedilmeli';

  SELECT count(*) INTO v_res_after FROM reservations;
  SELECT count(*) INTO v_del_after FROM integration_deliveries;
  ASSERT v_res_after = v_res_before, 'T9: reservations DEGISMEMELI';
  ASSERT v_del_after = v_del_before, 'T9: integration_deliveries DEGISMEMELI';
  RAISE NOTICE 'T9 PASS — pending integration yazamadi';
END $$;

-- ---------------------------------------------------------------------------
-- T10: SUSPENDED integration domain write YAPAMAZ.
--      (Bu kayit ayrica provider='synxis' — RPC provider'i DB'den okur,
--       cagiran provider iddia edemez.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_caught boolean := false;
  v_res_before int; v_del_before int;
  v_res_after  int; v_del_after  int;
BEGIN
  SELECT count(*) INTO v_res_before FROM reservations;
  SELECT count(*) INTO v_del_before FROM integration_deliveries;

  BEGIN
    PERFORM public.ingest_reservation_event(
      '44444444-4444-4444-4444-444444444444'::uuid,   -- SUSPENDED + synxis
      'evt-susp', 'res-susp', 'hash-susp',
      '{"property_id":"prop-accept-4","reservation_status":"confirmed"}'::jsonb,
      'processed', NULL,
      NULL, FALSE,
      '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
      '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T10: suspended integration REDDEDILMELIYDI';
  EXCEPTION WHEN sqlstate '22023' THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'T10: suspended integration reddedilmeli';

  SELECT count(*) INTO v_res_after FROM reservations;
  SELECT count(*) INTO v_del_after FROM integration_deliveries;
  ASSERT v_res_after = v_res_before, 'T10: reservations DEGISMEMELI';
  ASSERT v_del_after = v_del_before, 'T10: integration_deliveries DEGISMEMELI';
  RAISE NOTICE 'T10 PASS — suspended integration yazamadi';
END $$;

-- ---------------------------------------------------------------------------
-- T11: BILINMEYEN integration ID -> domain VE audit write YAPAMAZ.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_caught boolean := false;
  v_res_before int; v_con_before int; v_del_before int;
  v_res_after  int; v_con_after  int; v_del_after  int;
BEGIN
  SELECT count(*) INTO v_res_before FROM reservations;
  SELECT count(*) INTO v_con_before FROM contributions;
  SELECT count(*) INTO v_del_before FROM integration_deliveries;

  BEGIN
    PERFORM public.ingest_reservation_event(
      '00000000-0000-0000-0000-000000000000'::uuid,   -- YOK
      'evt-unknown', 'res-unknown', 'hash-unknown',
      '{"property_id":"prop-accept-1","reservation_status":"confirmed"}'::jsonb,
      'processed', NULL,
      NULL, FALSE,
      '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
      '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected"}'::jsonb
    );
    RAISE EXCEPTION 'T11: bilinmeyen integration REDDEDILMELIYDI';
  EXCEPTION WHEN sqlstate '22023' THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'T11: bilinmeyen integration reddedilmeli';

  SELECT count(*) INTO v_res_after FROM reservations;
  SELECT count(*) INTO v_con_after FROM contributions;
  SELECT count(*) INTO v_del_after FROM integration_deliveries;
  ASSERT v_res_after = v_res_before, 'T11: reservations DEGISMEMELI';
  ASSERT v_con_after = v_con_before, 'T11: contributions DEGISMEMELI';
  ASSERT v_del_after = v_del_before, 'T11: integration_deliveries DEGISMEMELI (audit bile yok)';
  RAISE NOTICE 'T11 PASS — bilinmeyen integration hicbir sey yazamadi';
END $$;

-- ---------------------------------------------------------------------------
-- T12: EXECUTE yetkisi — PUBLIC/anon/authenticated KAPALI, service_role ACIK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_public boolean; v_anon boolean; v_auth boolean; v_svc boolean;
  v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='ingest_reservation_event';

  v_public := has_function_privilege('public', v_oid, 'EXECUTE');
  v_anon   := has_function_privilege('anon', v_oid, 'EXECUTE');
  v_auth   := has_function_privilege('authenticated', v_oid, 'EXECUTE');
  v_svc    := has_function_privilege('service_role', v_oid, 'EXECUTE');

  ASSERT NOT v_public, 'T12: PUBLIC execute KAPALI olmali';
  ASSERT NOT v_anon,   'T12: anon execute KAPALI olmali';
  ASSERT NOT v_auth,   'T12: authenticated execute KAPALI olmali';
  ASSERT v_svc,        'T12: service_role execute ACIK olmali';
  RAISE NOTICE 'T12 PASS — public=% anon=% authenticated=% service_role=%',
    v_public, v_anon, v_auth, v_svc;
END $$;

-- ---------------------------------------------------------------------------
-- T13: SECURITY DEFINER + sabit search_path.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_secdef boolean; v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig INTO v_secdef, v_config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='ingest_reservation_event';

  ASSERT v_secdef, 'T13: SECURITY DEFINER olmali';
  ASSERT v_config IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%'),
    'T13: sabit search_path ayarlanmis olmali';
  RAISE NOTICE 'T13 PASS — secdef=% config=%', v_secdef, v_config;
END $$;

ROLLBACK;  -- Fixture dahil hicbir sey kalici olmasin.

-- =============================================================================
-- MANUEL EŞZAMANLILIK TESTLERİ (iki ayrı psql oturumu gerekir)
--
-- Bunlar tek oturumlu bu script'te KURGULANAMAZ (bir oturum kendi kendini
-- bloke edemez). Ayrı olarak `concurrency-manual.md` içinde adım adım
-- anlatılmıştır.
--
-- T14 — Eşzamanlı AYNI event (idempotency yarışı)
-- T15 — Eşzamanlı FARKLI event (lost update önleme, 40001)
--
-- Bunlar çalıştırılmadıysa "geçti" DENMEZ; raporda "bekliyor" olarak
-- işaretlenir.
-- =============================================================================
