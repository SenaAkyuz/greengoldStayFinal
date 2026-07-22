-- Adım 8: Faz 2 güvenlik / launch kapısı (public widget yüzeyi)

-- 1) Otel başına izin verilen origin'ler (widget hangi domain'lerden POST edebilir).
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT[] NOT NULL DEFAULT '{}';

-- 2) Event idempotency: (hotel_id, session_ref, event_type) session_ref varken TEKİL.
--    Unique index'ten ÖNCE olası dup'ları temizle (aksi halde index oluşturma patlar).
--    En yeni kaydı (created_at, sonra id) tut; eskileri sil.
DELETE FROM widget_events a
USING widget_events b
WHERE a.session_ref IS NOT NULL
  AND a.hotel_id = b.hotel_id
  AND a.session_ref = b.session_ref
  AND a.event_type = b.event_type
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_widget_event_session_type
  ON widget_events (hotel_id, session_ref, event_type)
  WHERE session_ref IS NOT NULL;
