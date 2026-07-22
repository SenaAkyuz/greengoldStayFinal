CREATE TABLE widget_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id     UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL CHECK (event_type IN (
                     'widget_goruntulendi',
                     'checkbox_secildi',
                     'katki_ekle_butonuna_basildi'
                 )),
    session_ref  TEXT,           -- misafiri tekilleştirmeden oturumu izlemek için (anonim)
    metadata     JSONB,          -- tutar vs. varsa
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_widget_events_hotel_created ON widget_events (hotel_id, created_at);
CREATE INDEX idx_widget_events_session ON widget_events (session_ref);
