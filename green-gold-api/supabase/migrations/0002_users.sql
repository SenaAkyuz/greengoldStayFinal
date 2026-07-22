-- Supabase Auth kullanılıyor: password_hash YOK. Kimlik auth.users'ta, biz sadece profili tutuyoruz.
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id       UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    auth_user_id   UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL, -- Supabase Auth bağlantısı
    full_name      TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    role           TEXT NOT NULL DEFAULT 'otel_yoneticisi',  -- rol listesi ileride genişler
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_auth_user_id ON users (auth_user_id);
CREATE INDEX idx_users_hotel_id ON users (hotel_id);
