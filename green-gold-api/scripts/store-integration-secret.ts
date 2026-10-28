/**
 * Operatör script'i — bir entegrasyon secret'ını Supabase Vault'a yazar
 * (migration 0017, `integration:<REF>`). Production resolver yalnızca Vault'u okur.
 *
 *   npm run store-integration-secret -- --ref <SECRET_REF> [--hotelrunner-hr-id <HR_ID>] [--dry-run]
 *
 * Secret değeri komut satırından ALINMAZ (shell geçmişine düşmesin): ortamdan
 * veya .env'den `INTEGRATION_SECRET_<REF>` okunur. Yazımdan sonra .env satırı
 * silinebilir.
 *
 * `--hotelrunner-hr-id` verilirse değer bir HotelRunner TOKEN'ı kabul edilir ve
 * yazmadan ÖNCE `GET /api/v2/apps/rooms` ile doğrulanır (çalışmayan anahtar
 * saklanmaz). Bu çağrı otelin günlük 250 istek kotasından 1 tane harcar.
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır. Secret değeri asla
 * yazdırılmaz.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  envVarNameForRef,
  isValidSecretRef,
} from '../src/integrations/secret-resolver';
import { HotelRunnerClient } from '../src/integrations/hotelrunner/hotelrunner.client';

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

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  ref: string;
  hrId: string;
  dryRun: boolean;
} {
  let ref = '';
  let hrId = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--ref') ref = argv[++i] ?? '';
    else if (a === '--hotelrunner-hr-id') hrId = argv[++i] ?? '';
  }
  return { ref, hrId, dryRun };
}

async function main(): Promise<void> {
  loadEnv();
  const { ref, hrId, dryRun } = parseArgs(process.argv.slice(2));

  if (!isValidSecretRef(ref)) {
    fail('--ref gerekli ve ^[A-Z][A-Z0-9_]{2,63}$ formatında olmalı.');
  }
  const envName = envVarNameForRef(ref);
  const secret = process.env[envName]?.trim();
  if (!secret) fail(`${envName} ortamda/.env'de tanımlı değil.`);

  if (hrId) {
    const client = new HotelRunnerClient({ token: secret, hrId });
    const rooms = await client.listRooms().catch((e: Error) => {
      fail(`HotelRunner anahtarı doğrulanamadı: ${e.message}`);
    });
    console.log(
      `✅ HotelRunner anahtarı geçerli (${rooms.length} oda/fiyat planı).`,
    );
  }

  if (dryRun) {
    console.log("--dry-run: secret Vault'a yazılmadı.");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli.');
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await db.rpc('integration_secret_set', {
    p_ref: ref,
    p_secret: secret,
  });
  if (error) {
    fail(
      `Secret Vault'a yazılamadı (migration 0017 uygulandı mı?): ${error.message}`,
    );
  }
  console.log(
    `✅ Secret Vault'a şifreli kaydedildi (integration:${ref}). ${envName} satırı artık .env'den silinebilir.`,
  );
}

main().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
