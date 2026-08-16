/**
 * Operatör script'i — entegrasyon secret'ını İKİ AŞAMALI (overlap) rotasyonla
 * değiştirir.
 *
 *   # Faz 1 — başlat (iki secret de kabul edilir):
 *   npm run rotate-integration-secret -- --integration-id <uuid> \
 *     --phase begin --new-secret-ref <YENI_REF> [--overlap-minutes 60] \
 *     [--generate-secret] [--dry-run]
 *
 *   # Faz 2 — tamamla (yalnızca yeni secret kabul edilir):
 *   npm run rotate-integration-secret -- --integration-id <uuid> \
 *     --phase complete [--dry-run]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır.
 * ⚠️ GERÇEK SECRET DB'YE ASLA YAZILMAZ. --generate-secret verilirse secret
 * YALNIZCA terminalde BİR KEZ gösterilir; log/rapor/dosyaya yazılmaz.
 *
 * Doğru sıra:
 *   1) --generate-secret ile yeni secret üret (veya kendiniz üretin)
 *   2) Yeni secret'ı env/secret-manager'a YENİ ref adıyla kaydedin
 *   3) --phase begin (overlap başlar)
 *   4) Sağlayıcı kendi tarafındaki secret'ı günceller
 *   5) --phase complete (eski secret geçersiz olur)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  beginRotation,
  completeRotation,
  validateOverlapMinutes,
  type RotateSecretDeps,
} from './rotate-integration-secret.core';
import {
  envVarNameForRef,
  resolverForEnvironment,
} from '../src/integrations/secret-resolver';

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
  integrationId: string;
  phase: string;
  newSecretRef: string;
  overlapMinutes?: string;
  dryRun: boolean;
  generateSecret: boolean;
} {
  const out: Record<string, string> = {};
  let dryRun = false;
  let generateSecret = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run') {
      dryRun = true;
      continue;
    }
    if (key === 'generate-secret') {
      generateSecret = true;
      continue;
    }
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    out[key] = val;
  }
  return {
    integrationId: out['integration-id'] ?? '',
    phase: out.phase ?? '',
    newSecretRef: out['new-secret-ref'] ?? '',
    overlapMinutes: out['overlap-minutes'],
    dryRun,
    generateSecret,
  };
}

function makeDeps(db: SupabaseClient): RotateSecretDeps {
  return {
    getIntegration: async (id) => {
      const { data } = await db
        .from('hotel_integrations')
        .select(
          'id, provider, environment, status, secret_ref, previous_secret_ref, previous_secret_expires_at',
        )
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id as string,
        provider: data.provider as string,
        environment: data.environment as string,
        status: data.status as string,
        secretRef: data.secret_ref as string,
        previousSecretRef: data.previous_secret_ref as string | null,
        previousSecretExpiresAt: data.previous_secret_expires_at as
          string | null,
      };
    },

    // Secret DEĞERİ hiçbir zaman dışarı çıkmaz — yalnızca "çözülebildi mi".
    canResolveRef: (record, ref) => {
      const resolver = resolverForEnvironment(record.environment);
      // Verilen ref'i TEK BAŞINA (overlap'siz) dener.
      const { candidates } = resolver.resolve({ secretRef: ref });
      return candidates.length > 0;
    },

    applyBegin: async (id, patch) => {
      const { error } = await db
        .from('hotel_integrations')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`Rotasyon başlatılamadı: ${error.message}`);
    },

    applyComplete: async (id, patch) => {
      const { error } = await db
        .from('hotel_integrations')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`Rotasyon tamamlanamadı: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  loadEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.phase !== 'begin' && args.phase !== 'complete') {
    throw new Error("--phase 'begin' veya 'complete' olmalı.");
  }

  // --generate-secret yalnızca yeni bir ref tanıtılan 'begin' fazında anlamlı.
  if (args.generateSecret && args.phase !== 'begin') {
    throw new Error('--generate-secret yalnızca --phase begin ile kullanılır.');
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).',
    );
  }

  // --generate-secret rotasyonun KENDİSİNDEN ÖNCE gelir: değer üretilir,
  // operatör kaydeder, SONRA 'begin' çalıştırılır. Bu yüzden burada yalnızca
  // değeri gösterip çıkıyoruz — DB'ye hiçbir şey yazmadan.
  if (args.generateSecret) {
    const secret = randomBytes(32).toString('base64url');
    console.log(
      '\n🔐 Üretilen SECRET (BİR KEZ gösterilir — şimdi güvenli yere kaydedin):\n',
    );
    console.log(`     ${secret}`);
    if (args.newSecretRef) {
      console.log(
        `\n     Kaydedilecek anahtar adı: ${envVarNameForRef(args.newSecretRef)}`,
      );
    }
    console.log(
      '\n  ⚠️ HİÇBİR KAYIT YAZILMADI. Değeri kaydettikten SONRA rotasyonu başlatın:',
    );
    console.log(
      `     npm run rotate-integration-secret -- --integration-id ${args.integrationId} \\`,
    );
    console.log(
      `       --phase begin --new-secret-ref ${args.newSecretRef || '<YENI_REF>'}\n`,
    );
    return;
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deps = makeDeps(db);

  if (args.phase === 'begin') {
    const overlapMinutes = validateOverlapMinutes(args.overlapMinutes);
    const plan = await beginRotation(
      args.integrationId,
      args.newSecretRef,
      deps,
      { dryRun: args.dryRun, overlapMinutes },
    );
    console.log(
      args.dryRun
        ? '\n🧪 DRY-RUN — rotasyon BAŞLATILABİLİR. Yazma yapılmadı.\n'
        : '\n✅ Rotasyon başlatıldı (overlap penceresi açık).\n',
    );
    console.log(`  Eski ref (overlap): ${plan.currentRef}`);
    console.log(`  Yeni ref (primary): ${plan.newRef}`);
    console.log(`  Overlap bitişi    : ${plan.overlapUntil}`);
    for (const w of plan.warnings) console.log(`  ⚠️  ${w}`);
    console.log(
      '\n  Sağlayıcı kendi tarafını güncelledikten SONRA tamamlayın:',
    );
    console.log(
      `     npm run rotate-integration-secret -- --integration-id ${plan.integrationId} --phase complete\n`,
    );
    return;
  }

  const plan = await completeRotation(args.integrationId, deps, {
    dryRun: args.dryRun,
  });
  console.log(
    args.dryRun
      ? '\n🧪 DRY-RUN — rotasyon TAMAMLANABİLİR. Yazma yapılmadı.\n'
      : '\n✅ Rotasyon tamamlandı — artık yalnızca yeni secret kabul ediliyor.\n',
  );
  console.log(`  Aktif ref: ${plan.currentRef}`);
  for (const w of plan.warnings) console.log(`  ⚠️  ${w}`);
  console.log('');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
