-- =============================================================================
-- ACCEPTANCE BOOTSTRAP — YALNIZCA disposable test Postgres'i içindir.
-- =============================================================================
--
-- ⚠️ BU DOSYA BİR PRODUCTION MIGRATION'I DEĞİLDİR ve hiçbir gerçek ortama
-- uygulanmamalıdır. Supabase'in hazır sağladığı ama vanilla Postgres'te
-- BULUNMAYAN nesneleri stub'lar; böylece production migration'ları (0001..0014)
-- TEK KARAKTER DEĞİŞTİRİLMEDEN uygulanabilir.
--
-- Stub'lananlar:
--   - `auth` şeması, `auth.users` tablosu, `auth.uid()` fonksiyonu
--     (0002_users.sql'in FK'si ve 0004_rls.sql'in policy'leri için)
--   - `anon`, `authenticated`, `service_role` rolleri
--     (0013'ün REVOKE/GRANT ifadeleri için)
--
-- Bu stub'lar GERÇEK Supabase Auth davranışını taklit ETMEZ; yalnızca
-- migration'ların hatasız uygulanmasını ve RPC yetki modelinin sınanmasını
-- sağlar. RLS politikalarının gerçek davranışı burada test EDİLMEZ
-- (acceptance testleri service_role muadili bir superuser ile çalışır).
-- =============================================================================

-- Supabase'de bu rollerin hepsi hazır gelir; vanilla Postgres'te yaratılmalı.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- 0002_users.sql: users.auth_user_id -> auth.users(id) FK'si için minimal tablo.
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 0004_rls.sql: current_hotel_id() içinde çağrılır. Acceptance testlerinde
-- oturum bağlamı yok -> NULL döner (hiçbir satır eşleşmez). Bu KASITLI:
-- acceptance testleri RLS'i değil, RPC/transaction davranışını sınar.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

-- pgcrypto: gen_random_uuid() PG13+'te çekirdekte var; eski sürümler için güvence.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
