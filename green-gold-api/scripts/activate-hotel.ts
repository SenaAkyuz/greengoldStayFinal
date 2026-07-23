/**
 * Operatör script'i — 'pending' oteli 'active' yapar.
 *
 *   npm run activate-hotel -- --key <public_widget_key> [--dry-run]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır. En az bir GEÇERLİ
 * allowed_origin yoksa aktivasyonu REDDEDER — widget izinsiz domain'de
 * çalışmasın. Akış: create-hotel → allowed_origins → embed → activate-hotel.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  runActivateHotel,
  type ActivateHotelDeps,
} from './activate-hotel.core';

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

function parseArgs(argv: string[]): { key: string; dryRun: boolean } {
  let key = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--key') key = argv[++i] ?? '';
  }
  return { key, dryRun };
}

function makeDeps(db: SupabaseClient): ActivateHotelDeps {
  return {
    getHotelByKey: async (key) => {
      const { data } = await db
        .from('hotels')
        .select('id, name, status, allowed_origins')
        .eq('public_widget_key', key)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id as string,
        name: data.name as string,
        status: data.status as string,
        allowed_origins: (data.allowed_origins as string[] | null) ?? [],
      };
    },
    setStatus: async (id, status) => {
      const { error } = await db
        .from('hotels')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`Status güncellenemedi: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  loadEnv();

  const { key, dryRun } = parseArgs(process.argv.slice(2));

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

  const res = await runActivateHotel(key, makeDeps(db), { dryRun });

  if (dryRun) {
    console.log(
      `\n🧪 DRY-RUN — '${res.name}' aktive EDİLEBİLİR (geçerli origin var). Yazma yapılmadı.\n`,
    );
  } else if (res.alreadyActive) {
    console.log(`\nℹ️  '${res.name}' zaten aktif — değişiklik yok.\n`);
  } else {
    console.log(`\n✅ '${res.name}' aktive edildi (status: active).\n`);
  }
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
