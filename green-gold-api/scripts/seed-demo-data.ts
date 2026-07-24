/**
 * Operatör script'i — Demo tenant'ına gerçekçi widget_events seed eder.
 *
 *   npm run seed-demo-data -- --key <demo_public_widget_key> [--dry-run] [--sessions 240]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır. İDEMPOTENT: yalnızca
 * 'demo-sess-' önekli kayıtları siler, ardından yeniden ekler — çoğaltmaz ve
 * gerçek event'lere DOKUNMAZ. Yanlış otele seed etmemek için --key demo
 * otelinin anahtarı olmalı.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  generateDemoEvents,
  summarize,
  DEFAULT_SEED_OPTIONS,
  DEMO_SESSION_PREFIX,
} from './seed-demo-data.core';

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

function parseArgs(argv: string[]): {
  key: string;
  dryRun: boolean;
  sessions?: number;
} {
  let key = '';
  let dryRun = false;
  let sessions: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--key') key = argv[++i] ?? '';
    else if (a === '--sessions') sessions = Number(argv[++i]);
  }
  return { key, dryRun, sessions };
}

async function getHotelIdByKey(
  db: SupabaseClient,
  key: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await db
    .from('hotels')
    .select('id, name')
    .eq('public_widget_key', key)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, name: data.name as string };
}

async function main(): Promise<void> {
  loadEnv();
  const { key, dryRun, sessions } = parseArgs(process.argv.slice(2));

  if (!key) throw new Error('Demo otelinin anahtarı gerekli (--key).');

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

  const hotel = await getHotelIdByKey(db, key);
  if (!hotel) throw new Error('Otel bulunamadı (verilen --key ile eşleşme yok).');

  const events = generateDemoEvents({
    ...DEFAULT_SEED_OPTIONS,
    now: new Date(),
    sessions: sessions ?? DEFAULT_SEED_OPTIONS.sessions,
  });
  const s = summarize(events);

  console.log(`\nDemo seed — '${hotel.name}'`);
  console.log(
    `  ${s.total} event / ${s.viewedSessions} session · seçim %${s.selectRatePct} · buton %${s.clickRatePct} (seçenlerin)`,
  );

  if (dryRun) {
    console.log('\n🧪 DRY-RUN — hiçbir kayıt yazılmadı.\n');
    return;
  }

  // İdempotent: önce yalnızca demo-önekli kayıtları sil (gerçek event'lere dokunma).
  const { error: delError } = await db
    .from('widget_events')
    .delete()
    .eq('hotel_id', hotel.id)
    .like('session_ref', `${DEMO_SESSION_PREFIX}%`);
  if (delError) {
    throw new Error(`Eski demo kayıtları silinemedi: ${delError.message}`);
  }

  const rows = events.map((e) => ({ ...e, hotel_id: hotel.id }));
  // Büyük insert'i parçalara böl.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from('widget_events').insert(chunk);
    if (error) throw new Error(`Seed eklenemedi: ${error.message}`);
  }

  console.log(`\n✅ ${rows.length} demo event eklendi.\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
