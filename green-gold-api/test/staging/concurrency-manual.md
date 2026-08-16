# Eşzamanlılık Testleri (T14–T15) — iki oturum gerektirir

Bu iki test tek psql oturumunda **kurgulanamaz** (bir oturum kendi kendini
bloke edemez). İki ayrı `psql` penceresi gerekir.

> Bu testler çalıştırılmadıysa raporda **"geçti" denmez** — "bekliyor" olarak
> işaretlenir.

Aşağıdaki `$ACCEPTANCE_URL`, disposable container'ın URL'idir
(bkz. `README.md`). **Production/staging Supabase'e asla bağlanmayın.**

## Ortak fixture

Her iki oturumda da kullanılacak kayıtları önce oluşturun (tek oturumda,
commit ederek):

```sql
INSERT INTO hotels (id, name, hotel_code, public_widget_key, status)
VALUES ('11111111-1111-1111-1111-111111111111','CONC HOTEL','HTL-CONC','wk-conc','active');

INSERT INTO hotel_integrations (
  id, hotel_id, provider, environment, status,
  external_property_id, product_code, secret_ref
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'generic_signed_webhook','sandbox','active',
  'prop-conc','GG-EXTRA','CONC_REF'
);
```

## T14 — Eşzamanlı AYNI event (idempotency yarışı)

**Oturum A:**
```sql
BEGIN;
SELECT public.ingest_reservation_event(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'evt-race','res-race','hash-race',
  '{"property_id":"prop-conc","reservation_status":"confirmed"}'::jsonb,
  'processed', NULL, NULL, FALSE,
  '{"booking_status":"confirmed","provider_created_at":"2026-01-01T10:00:00Z","provider_updated_at":"2026-01-01T10:00:00Z"}'::jsonb,
  '{"selected":true,"amount_minor":500,"currency":"EUR","status":"collected"}'::jsonb
);
-- COMMIT ETMEYİN, bekleyin
```

**Oturum B:** (aynı `evt-race`)
```sql
BEGIN;
SELECT public.ingest_reservation_event( ... aynı parametreler ... );
-- B burada unique index üzerinde BLOKE olmalı
```

**Oturum A:** `COMMIT;`
→ B'nin blokajı çözülür ve **`already_processed`** dönmeli. Sonra B: `COMMIT;`

**Beklenen sonuç:**
```sql
SELECT count(*) FROM reservations WHERE provider_reservation_id='res-race';          -- 1
SELECT count(*) FROM contributions;                                                   -- 1
SELECT count(*) FROM integration_deliveries WHERE provider_event_id='evt-race';       -- 1
SELECT amount_minor FROM contributions;                                               -- 500 (şişmedi)
```

## T15 — Eşzamanlı FARKLI event (lost update önleme)

Önce bir baseline rezervasyon oluşturun (T14'ün sonucu kullanılabilir;
`provider_updated_at` = `2026-01-01T10:00:00Z`).

**Oturum A:**
```sql
BEGIN;
SELECT public.ingest_reservation_event(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'evt-A','res-race','hash-A',
  '{"property_id":"prop-conc","reservation_status":"modified"}'::jsonb,
  'processed', NULL,
  '2026-01-01T10:00:00Z'::timestamptz, TRUE,
  '{"booking_status":"modified","provider_updated_at":"2026-01-02T10:00:00Z"}'::jsonb,
  '{"selected":true,"amount_minor":600,"currency":"EUR","status":"collected"}'::jsonb
);
-- COMMIT ETMEYİN
```

**Oturum B:** (farklı event, **AYNI** baseline'ı iddia ediyor)
```sql
BEGIN;
SELECT public.ingest_reservation_event(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'evt-B','res-race','hash-B',
  '{"property_id":"prop-conc","reservation_status":"cancelled"}'::jsonb,
  'processed', NULL,
  '2026-01-01T10:00:00Z'::timestamptz, TRUE,   -- A'nın ilerlettiği değer
  '{"booking_status":"cancelled","provider_updated_at":"2026-01-03T10:00:00Z"}'::jsonb,
  '{"selected":true,"amount_minor":700,"currency":"EUR","status":"collected"}'::jsonb
);
-- B advisory lock üzerinde BLOKE olmalı
```

**Oturum A:** `COMMIT;`
→ B'nin blokajı çözülür; A baseline'ı ilerlettiği için B **`40001`
(serialization_failure)** almalı.

**Beklenen sonuç:** B tamamen geri alınır — `evt-B` için delivery satırı
**yoktur**, `amount_minor` = 600 (A'nınki), `booking_status` = `modified`.
Uygulama katmanı bunu **503 `concurrent_update_retry`**'a çevirir ve sağlayıcı
retry ettiğinde taze durumla yeniden karar verilir.
