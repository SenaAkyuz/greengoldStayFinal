/**
 * Operatör script'i — mevcut demo kullanıcısını Demo Otel'e yeniden bağlar.
 *
 *   npm run rebind-demo-user -- --email demo@greengold.example [--dry-run] \
 *     [--name "Green Gold Demo Otel"] [--city Antalya] [--tz Europe/Istanbul]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır. YENİ AUTH KULLANICI
 * OLUŞTURMAZ — mevcut demo_viewer kullanıcısının profilini demo tenant'a bağlar.
 * İdempotent; yetim public.users satırlarını temizler.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  runRebindDemoUser,
  type RebindDeps,
  type RebindInput,
  type UserProfile,
} from './rebind-demo-user.core';

function loadEnv(): void {
  const p = resolve(__dirname, '..', '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1] in process.env) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function parseArgs(argv: string[]): { input: RebindInput; dryRun: boolean } {
  const out: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
      out[key] = val;
    }
  }
  const email = (out.email || process.env.DEMO_LOGIN_EMAIL || '')
    .trim()
    .toLowerCase();
  return {
    dryRun,
    input: {
      demoEmail: email,
      hotelName: out.name || 'Green Gold Demo Otel',
      city: (out.city ?? 'Antalya').trim() || null,
      timezone: out.tz || out.timezone || 'Europe/Istanbul',
    },
  };
}

async function authUserByEmail(
  db: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`Auth kontrolü başarısız: ${error.message}`);
    const u = data.users.find(
      (x) => (x.email ?? '').toLowerCase() === email,
    );
    if (u) return { id: u.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

async function listProfiles(
  db: SupabaseClient,
  email: string,
): Promise<UserProfile[]> {
  const { data, error } = await db
    .from('users')
    .select('id, hotel_id, auth_user_id, role')
    .eq('email', email);
  if (error) throw new Error(`Profil listelenemedi: ${error.message}`);
  return (data ?? []) as UserProfile[];
}

function makeDeps(db: SupabaseClient): RebindDeps {
  return {
    findAuthUserByEmail: (email) => authUserByEmail(db, email),
    findDemoHotelByName: async (name) => {
      const { data } = await db
        .from('hotels')
        .select('id')
        .eq('name', name)
        .limit(1);
      return data && data.length > 0 ? { id: data[0].id as string } : null;
    },
    createDemoHotel: async (input) => {
      const { data, error } = await db
        .from('hotels')
        .insert({
          name: input.hotelName,
          city: input.city,
          timezone: input.timezone,
          hotel_type: 'city',
          hotel_code: `HTL-${randomBytes(4).toString('hex').toUpperCase()}`,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`Demo otel oluşturulamadı: ${error?.message}`);
      }
      return { id: data.id as string };
    },
    listUserProfilesByEmail: (email) => listProfiles(db, email),
    insertUserProfile: async (row) => {
      const { data, error } = await db
        .from('users')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`Profil eklenemedi: ${error?.message}`);
      }
      return { id: data.id as string };
    },
    updateUserProfile: async (id, patch) => {
      const { error } = await db.from('users').update(patch).eq('id', id);
      if (error) throw new Error(`Profil güncellenemedi: ${error.message}`);
    },
    deleteUserProfile: async (id) => {
      const { error } = await db.from('users').delete().eq('id', id);
      if (error) throw new Error(`Profil silinemedi: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  loadEnv();
  const { input, dryRun } = parseArgs(process.argv.slice(2));

  if (!input.demoEmail) {
    throw new Error('Demo e-postası gerekli (--email veya DEMO_LOGIN_EMAIL).');
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).',
    );
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const res = await runRebindDemoUser(input, makeDeps(db), { dryRun });

  if (dryRun) {
    console.log('\n🧪 DRY-RUN — hiçbir kayıt yazılmadı');
    console.log(`  Aksiyon         : ${res.action}`);
    console.log(`  Silinecek yetim : ${res.deletedOrphans}`);
    console.log(`  Demo otel       : ${res.hotelCreated ? 'OLUŞTURULACAK' : res.hotelId}\n`);
    return;
  }

  // Yetim/dağınık kayıt kalmadığını DOĞRULA: tam olarak 1 profil, doğru bağlar.
  const after = await listProfiles(db, input.demoEmail);
  if (after.length !== 1) {
    throw new Error(
      `Doğrulama başarısız: ${after.length} public.users satırı var, 1 bekleniyordu.`,
    );
  }
  const p = after[0];
  if (
    p.hotel_id !== res.hotelId ||
    p.auth_user_id !== res.authUserId ||
    p.role !== 'demo_viewer'
  ) {
    throw new Error('Doğrulama başarısız: profil bağları beklenenle uyuşmuyor.');
  }

  console.log('\n✅ Demo kullanıcı yeniden bağlandı');
  console.log(`  Aksiyon         : ${res.action}`);
  console.log(`  Demo otel id    : ${res.hotelId}${res.hotelCreated ? ' (yeni)' : ''}`);
  console.log(`  Profil id       : ${res.profileId}`);
  console.log(`  Auth user id    : ${res.authUserId}`);
  console.log(`  Silinen yetim   : ${res.deletedOrphans}`);
  console.log('  Doğrulama       : tek profil, hotel_id + auth_user_id + role OK\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
