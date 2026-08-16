/**
 * Operatör script'i — 'pending' entegrasyonu 'active' yapar (kapılardan geçerse).
 *
 *   npm run activate-integration -- --integration-id <uuid> [--dry-run]
 *                                   [--override-verification]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır.
 * Otelin 'active' olması entegrasyonu OTOMATİK aktive ETMEZ — bu ayrı kapıdır.
 * SynXis adapter'ı 'not_configured' olduğu sürece SynXis entegrasyonu
 * aktive EDİLEMEZ. Production, gerçek secrets manager gelene kadar reddedilir.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  runActivateIntegration,
  type ActivateIntegrationDeps,
  type IntegrationRecord,
} from './activate-integration.core';
import { ProviderRegistryService } from '../src/integrations/provider-registry';
import {
  isResolverAllowedFor,
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
  dryRun: boolean;
  overrideVerification: boolean;
} {
  let integrationId = '';
  let dryRun = false;
  let overrideVerification = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--override-verification') overrideVerification = true;
    else if (a === '--integration-id') integrationId = argv[++i] ?? '';
  }
  return { integrationId, dryRun, overrideVerification };
}

function makeDeps(db: SupabaseClient): ActivateIntegrationDeps {
  const registry = new ProviderRegistryService();

  return {
    getIntegration: async (id) => {
      const { data } = await db
        .from('hotel_integrations')
        .select(
          'id, hotel_id, provider, environment, status, external_property_id, product_code, secret_ref, previous_secret_ref, previous_secret_expires_at',
        )
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;

      const { data: hotel } = await db
        .from('hotels')
        .select('name')
        .eq('id', data.hotel_id as string)
        .maybeSingle();

      return {
        id: data.id as string,
        hotelId: data.hotel_id as string,
        hotelName: (hotel?.name as string | undefined) ?? '(bilinmiyor)',
        provider: data.provider as string,
        environment: data.environment as string,
        status: data.status as string,
        externalPropertyId: data.external_property_id as string | null,
        productCode: data.product_code as string | null,
        secretRef: data.secret_ref as string,
        previousSecretRef: data.previous_secret_ref as string | null,
        previousSecretExpiresAt: data.previous_secret_expires_at as
          string | null,
      };
    },

    isProviderConfigured: (provider) =>
      registry.resolve(provider)?.configured === true,

    // Secret DEĞERİ hiçbir zaman dışarı çıkmaz — yalnızca "çözülebildi mi".
    canResolveSecret: (record: IntegrationRecord) => {
      const resolver = resolverForEnvironment(record.environment);
      const { candidates } = resolver.resolve({
        secretRef: record.secretRef,
        previousSecretRef: record.previousSecretRef,
        previousSecretExpiresAt: record.previousSecretExpiresAt,
      });
      return candidates.length > 0;
    },

    isResolverAllowed: (environment) =>
      isResolverAllowedFor(resolverForEnvironment(environment), environment),

    hasProcessedDelivery: async (integrationId) => {
      const { data } = await db
        .from('integration_deliveries')
        .select('id')
        .eq('integration_id', integrationId)
        .eq('processing_status', 'processed')
        .limit(1);
      return (data?.length ?? 0) > 0;
    },

    setStatus: async (id, status) => {
      const { error } = await db
        .from('hotel_integrations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`Status güncellenemedi: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  loadEnv();

  const { integrationId, dryRun, overrideVerification } = parseArgs(
    process.argv.slice(2),
  );

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

  const res = await runActivateIntegration(integrationId, makeDeps(db), {
    dryRun,
    overrideVerification,
  });

  if (res.alreadyActive) {
    console.log(`\nℹ️  Entegrasyon zaten aktif — değişiklik yok.\n`);
    return;
  }

  console.log('\n  Aktivasyon kapıları:\n');
  for (const gate of res.gates) {
    console.log(`   ${gate.passed ? '✓' : '✗'} [${gate.name}] ${gate.detail}`);
  }

  const { integration: i } = res;
  if (dryRun) {
    console.log(
      `\n🧪 DRY-RUN — '${i.hotelName}' / ${i.provider} (${i.environment}) aktive EDİLEBİLİR. Yazma yapılmadı.\n`,
    );
  } else {
    console.log(
      `\n✅ Entegrasyon aktive edildi: '${i.hotelName}' / ${i.provider} (${i.environment}).\n`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
