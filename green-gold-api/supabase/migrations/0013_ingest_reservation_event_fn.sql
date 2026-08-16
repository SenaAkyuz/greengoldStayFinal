-- Faz 2 — DOĞRULANMIŞ webhook event'inin domain yazımını ATOMİK yapan RPC.
--
-- SORUN (inceleme bulgusu #1): ingestion servisi delivery insert, reservation
-- upsert, contribution upsert ve delivery final status'ü AYRI Supabase HTTP
-- çağrılarıyla yapıyordu. Aralarında hata/çökme veya eşzamanlı ikinci bir
-- delivery olursa "delivery received + reservation güncel ama contribution
-- eksik" gibi KISMİ FİNANSAL DURUM oluşabiliyordu. Production için kabul
-- edilemez.
--
-- ÇÖZÜM: doğrulanmış event'in TÜM domain yazımı bu tek fonksiyonda, dolayısıyla
-- TEK Postgres transaction'ında çalışır. Fonksiyon herhangi bir noktada
-- fırlatırsa transaction tamamen geri alınır — kısmi reservation/contribution
-- değişikliği KALMAZ.
--
-- ============================================================================
-- TENANT BAĞLAMA (inceleme bulgusu: KRİTİK)
-- ============================================================================
-- Fonksiyon `hotel_id` ve `provider` değerlerini ÇAĞIRANDAN ALMAZ. Önceki
-- sürüm bunları ayrı parametre olarak kabul ediyordu; bu, service-role
-- yüzeyindeki bir programlama hatasının veya kötüye kullanımın "Integration A
-- kimliği + Hotel B hotel_id" birleştirerek ÇAPRAZ TENANT kayıt üretmesine
-- açık kapı bırakıyordu. SECURITY DEFINER bir fonksiyon için "API bugün doğru
-- parametreyi veriyor" YETERLİ SAVUNMA DEĞİLDİR.
--
-- Şimdi: `p_integration_id` ile `hotel_integrations` satırı transaction içinde
-- KİLİTLENEREK okunur ve `hotel_id` ile `provider` YALNIZCA o satırdan türetilir.
-- Satır yoksa veya entegrasyon `active` değilse fonksiyon fırlatır — advisory
-- lock dahil hiçbir kalıcı yazım (delivery/audit satırı bile) kalmaz.
--
-- İKİNCİ SAVUNMA (property): `external_property_id` kontrolü asıl olarak
-- service/adapter sınırında yapılır (webhook-ingestion.service.ts —
-- 'property_id_mismatch' -> 403). Burada normalized snapshot'taki
-- `property_id` ile entegrasyonun `external_property_id`'si AYRICA karşılaştırılır;
-- uyuşmazsa transaction tamamen geri alınır. Böylece service katmanı atlansa
-- bile çapraz property yazımı DB sınırında durur.
-- ============================================================================
--
-- İŞ BÖLÜMÜ: state transition KARARI (apply / manual_review / reject) uygulama
-- katmanında kalır (src/integrations/state-machine.ts — saf, test edilebilir).
-- Bu fonksiyon o kararı UYGULAR ve kararın dayandığı ön koşulu transaction
-- İÇİNDE YENİDEN DOĞRULAR (optimistic concurrency — aşağıya bkz.).
--
-- EŞZAMANLILIK MODELİ (iki katman):
--   1) Advisory transaction lock: aynı (integration_id, provider_reservation_id)
--      için işlemler seri hale gelir. Rezervasyon satırı HENÜZ YOKKEN de
--      koruma sağlar (row lock'ın koruyamadığı insert-insert yarışı).
--   2) Optimistic re-check: uygulama kararını `provider_updated_at`in HANGİ
--      değerine bakarak verdiyse (p_expected_provider_updated_at), lock
--      alındıktan sonra o değer hâlâ aynı mı diye bakılır. Değiştiyse karar
--      bayatlamıştır -> serialization_failure (40001) fırlatılır, transaction
--      geri alınır, sağlayıcının retry'ında taze durumla yeniden karar verilir.
--      Bu, aynı rezervasyona gelen iki farklı event'te LOST UPDATE'i önler.
--
-- IDEMPOTENCY: delivery insert'i ON CONFLICT DO NOTHING ile yapılır. Satır
-- dönmezse bu provider_event_id DAHA ÖNCE işlenmiştir -> hiçbir finansal
-- state'e dokunulmadan 'already_processed' döner. Eşzamanlı iki özdeş event'te
-- biri unique index'te bloke olur, sonra aynı yoldan 'already_processed'
-- alır — finansal toplam BİR KEZ etkilenir.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path. Execute yetkisi anon ve
-- authenticated'tan ALINIR; yalnızca service_role çağırabilir (API bu
-- fonksiyonu service_role client'ıyla çağırır — bkz. SupabaseService).
-- Parametreler dar ve tiplidir; tablo/kolon adı gibi dinamik SQL parçası
-- parametre olarak ALINMAZ (injection yüzeyi yok).

-- Eski (güvensiz) imza varsa kaldır — hotel_id/provider parametreli sürüm
-- ÇAĞRILABİLİR KALMAMALI. (Bu migration hiçbir ortama uygulanmadığı için
-- pratikte no-op'tur; yine de yeniden uygulanabilirlik için burada.)
DROP FUNCTION IF EXISTS public.ingest_reservation_event(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT,
    TIMESTAMPTZ, BOOLEAN, JSONB, JSONB
);

CREATE OR REPLACE FUNCTION public.ingest_reservation_event(
    p_integration_id               UUID,
    p_provider_event_id            TEXT,
    p_provider_reservation_id      TEXT,
    p_payload_hash                 TEXT,
    p_normalized_snapshot          JSONB,
    p_delivery_status              TEXT,
    p_error_code                   TEXT,
    p_expected_provider_updated_at TIMESTAMPTZ,
    p_expected_reservation_exists  BOOLEAN,
    p_reservation_patch            JSONB,
    p_contribution_patch           JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- DB'den TÜRETİLEN tenant bağı — çağırandan ALINMAZ.
    v_hotel_id            UUID;
    v_provider            TEXT;
    v_integration_status  TEXT;
    v_external_property   TEXT;
    v_snapshot_property   TEXT;

    v_delivery_id       UUID;
    v_reservation_id    UUID;
    v_current_updated   TIMESTAMPTZ;
    v_reservation_found BOOLEAN;
    v_contribution_id   UUID;
    v_now               TIMESTAMPTZ := now();
BEGIN
    -- 0) Parametre savunması. Tablolardaki CHECK kısıtları zaten son sözü
    --    söyler; bu, SECURITY DEFINER yüzeyinde erken ve net hata için.
    IF p_integration_id IS NULL THEN
        RAISE EXCEPTION 'integration_id zorunlu' USING ERRCODE = '22023';
    END IF;
    IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) = 0 THEN
        RAISE EXCEPTION 'provider_event_id zorunlu' USING ERRCODE = '22023';
    END IF;
    IF p_provider_reservation_id IS NULL
       OR length(btrim(p_provider_reservation_id)) = 0 THEN
        RAISE EXCEPTION 'provider_reservation_id zorunlu' USING ERRCODE = '22023';
    END IF;
    IF p_delivery_status NOT IN (
        'processed', 'rejected_out_of_order', 'rejected_invalid_payload',
        'manual_review', 'error'
    ) THEN
        RAISE EXCEPTION 'gecersiz delivery_status: %', p_delivery_status
            USING ERRCODE = '22023';
    END IF;

    -- ========================================================================
    -- 1) TENANT BAĞI: integration satırını KİLİTLEYEREK oku ve hotel_id/provider'ı
    --    BURADAN türet. FOR SHARE: satır bizim işimiz sürerken silinemez/
    --    status'ü değiştirilemez, ama aynı entegrasyonun farklı rezervasyonları
    --    paralel işlenebilir (rezervasyon bazlı serileştirme advisory lock'ta).
    --    Bu blok BAŞARISIZ olursa fonksiyon fırlatır; advisory lock ve delivery
    --    insert dahil HİÇBİR kalıcı yazım yapılmamış olur.
    -- ========================================================================
    SELECT hotel_id, provider, status, external_property_id
      INTO v_hotel_id, v_provider, v_integration_status, v_external_property
      FROM hotel_integrations
     WHERE id = p_integration_id
     FOR SHARE;

    IF NOT FOUND THEN
        -- Bilinmeyen integration -> fail closed. Audit satırı bile yazılmaz:
        -- geçerli bir tenant (hotel_id) bilinmediği için yazılacak güvenli bir
        -- yer yoktur; enumeration'a da bilgi sızdırmayız.
        RAISE EXCEPTION 'integration bulunamadi: %', p_integration_id
            USING ERRCODE = '22023';
    END IF;

    IF v_integration_status <> 'active' THEN
        RAISE EXCEPTION 'integration aktif degil (status=%)', v_integration_status
            USING ERRCODE = '22023';
    END IF;

    -- 2) İKİNCİ SAVUNMA — property bağı. Asıl kontrol service sınırındadır
    --    (webhook-ingestion.service.ts, 403 property_id_mismatch); bu, o katman
    --    atlansa bile çapraz property yazımını DB'de durdurur.
    v_snapshot_property := p_normalized_snapshot->>'property_id';
    IF v_snapshot_property IS NULL THEN
        RAISE EXCEPTION 'normalized_snapshot.property_id zorunlu'
            USING ERRCODE = '22023';
    END IF;
    IF v_snapshot_property <> v_external_property THEN
        RAISE EXCEPTION
            'property_id bu integration ile eslesmiyor'
            USING ERRCODE = '22023';
    END IF;

    -- 3) Aynı rezervasyon için tüm işlemleri serileştir (satır henüz yokken de).
    --    Tenant bağı DOĞRULANDIKTAN SONRA alınır.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_integration_id::text || ':' || p_provider_reservation_id, 0)
    );

    -- 4) Idempotency kapısı. Çakışırsa hiçbir domain yazımı YAPILMADAN çıkılır.
    --    hotel_id ve provider DB'den türetilmiş değerlerdir.
    INSERT INTO integration_deliveries (
        hotel_id, integration_id, provider, provider_event_id,
        payload_hash, signature_verified, processing_status, normalized_snapshot
    )
    VALUES (
        v_hotel_id, p_integration_id, v_provider, p_provider_event_id,
        p_payload_hash, TRUE, 'received', p_normalized_snapshot
    )
    ON CONFLICT (integration_id, provider_event_id)
        WHERE provider_event_id IS NOT NULL
        DO NOTHING
    RETURNING id INTO v_delivery_id;

    IF v_delivery_id IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed');
    END IF;

    -- 5) Mevcut rezervasyonu KİLİTLEYEREK oku (aynı tx'te güncelleyeceğiz).
    SELECT id, provider_updated_at
      INTO v_reservation_id, v_current_updated
      FROM reservations
     WHERE integration_id = p_integration_id
       AND provider_reservation_id = p_provider_reservation_id
     FOR UPDATE;

    v_reservation_found := FOUND;

    -- 6) Optimistic concurrency: uygulamanın kararını verdiği ön koşul hâlâ
    --    geçerli mi? Değilse karar bayat -> 40001, tüm tx geri alınır.
    IF v_reservation_found <> COALESCE(p_expected_reservation_exists, FALSE) THEN
        RAISE EXCEPTION
            'stale decision: reservation varlik durumu degisti (beklenen=%, guncel=%)',
            COALESCE(p_expected_reservation_exists, FALSE), v_reservation_found
            USING ERRCODE = '40001';
    END IF;

    IF v_reservation_found
       AND v_current_updated IS DISTINCT FROM p_expected_provider_updated_at THEN
        RAISE EXCEPTION
            'stale decision: provider_updated_at degisti'
            USING ERRCODE = '40001';
    END IF;

    -- 7) Reservation patch (NULL ise uygulanmaz — ör. reject veya geçişin
    --    kendisinin şüpheli olduğu manual_review).
    IF p_reservation_patch IS NOT NULL THEN
        IF v_reservation_found THEN
            UPDATE reservations
               SET booking_status      = p_reservation_patch->>'booking_status',
                   provider_updated_at = (p_reservation_patch->>'provider_updated_at')::TIMESTAMPTZ,
                   updated_at          = v_now
             WHERE id = v_reservation_id;
        ELSE
            BEGIN
                INSERT INTO reservations (
                    hotel_id, integration_id, provider_reservation_id,
                    booking_status, provider_created_at, provider_updated_at
                )
                VALUES (
                    v_hotel_id, p_integration_id, p_provider_reservation_id,
                    p_reservation_patch->>'booking_status',
                    (p_reservation_patch->>'provider_created_at')::TIMESTAMPTZ,
                    (p_reservation_patch->>'provider_updated_at')::TIMESTAMPTZ
                )
                RETURNING id INTO v_reservation_id;
            EXCEPTION WHEN unique_violation THEN
                -- Advisory lock'a rağmen (ör. lock alınmadan yazan bir yol)
                -- yarış olduysa: retry edilebilir hata olarak yüzeye çıkar.
                RAISE EXCEPTION 'concurrent reservation insert'
                    USING ERRCODE = '40001';
            END;
        END IF;
    END IF;

    -- 8) Contribution patch (yalnızca 'apply' kararında dolu gelir).
    IF p_contribution_patch IS NOT NULL THEN
        IF v_reservation_id IS NULL THEN
            RAISE EXCEPTION 'contribution icin reservation yok'
                USING ERRCODE = '22023';
        END IF;

        -- Aktif (voided olmayan) katkıyı kilitleyerek bul.
        SELECT id INTO v_contribution_id
          FROM contributions
         WHERE reservation_id = v_reservation_id
           AND status <> 'voided'
         FOR UPDATE;

        IF FOUND THEN
            UPDATE contributions
               SET selected                     = (p_contribution_patch->>'selected')::BOOLEAN,
                   amount_minor                 = (p_contribution_patch->>'amount_minor')::INTEGER,
                   currency                     = p_contribution_patch->>'currency',
                   status                       = p_contribution_patch->>'status',
                   provider_line_item_reference = p_contribution_patch->>'line_item_reference',
                   collected_at                 = COALESCE(
                       (p_contribution_patch->>'collected_at')::TIMESTAMPTZ, collected_at),
                   refunded_at                  = COALESCE(
                       (p_contribution_patch->>'refunded_at')::TIMESTAMPTZ, refunded_at),
                   updated_at                   = v_now
             WHERE id = v_contribution_id;
        ELSE
            INSERT INTO contributions (
                hotel_id, reservation_id, selected, amount_minor, currency,
                status, provider_line_item_reference, collected_at, refunded_at
            )
            VALUES (
                v_hotel_id,
                v_reservation_id,
                (p_contribution_patch->>'selected')::BOOLEAN,
                (p_contribution_patch->>'amount_minor')::INTEGER,
                p_contribution_patch->>'currency',
                p_contribution_patch->>'status',
                p_contribution_patch->>'line_item_reference',
                (p_contribution_patch->>'collected_at')::TIMESTAMPTZ,
                (p_contribution_patch->>'refunded_at')::TIMESTAMPTZ
            );
        END IF;
    END IF;

    -- 9) Delivery final status — aynı transaction sınırında.
    UPDATE integration_deliveries
       SET processing_status = p_delivery_status,
           error_code        = p_error_code,
           processed_at      = v_now
     WHERE id = v_delivery_id;

    RETURN jsonb_build_object(
        'status', p_delivery_status,
        'delivery_id', v_delivery_id,
        'reservation_id', v_reservation_id,
        -- Çağıranın DB'den türetilen bağı doğrulayabilmesi için (audit/log).
        'hotel_id', v_hotel_id
    );
END;
$$;

-- Yetki: yalnızca service_role. anon/authenticated ASLA çağıramaz — bu
-- fonksiyon RLS'i bypass eden finansal yazım yapar.
REVOKE ALL ON FUNCTION public.ingest_reservation_event(
    UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_reservation_event(
    UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB, JSONB
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_reservation_event(
    UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB, JSONB
) TO service_role;
