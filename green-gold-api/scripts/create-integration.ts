/**
 * Operatör script'i — bir otele booking engine/PMS entegrasyonu ekler.
 *
 *   npm run create-integration -- \
 *     --hotel-key <public_widget_key veya hotel_code> \
 *     --provider generic_signed_webhook|synxis \
 *     --environment sandbox|production \
 *     --external-property-id <id> \
 *     --product-code <code> \
 *     --secret-ref <SAFE_REFERENCE> \
 *     [--generate-secret] [--dry-run]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır (RLS bypass).
 * Entegrasyon her zaman 'pending' doğar — aktivasyon için activate-integration.
 *
 * ⚠️ GERÇEK SECRET DB'YE ASLA YAZILMAZ. --generate-secret verilirse secret
 * YALNIZCA burada, terminalde, BİR KEZ gösterilir; hiçbir log/rapor/dry-run
 * çıktısına ve hiçbir dosyaya yazılmaz. .env dosyası OTOMATİK DEĞİŞTİRİLMEZ.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validateIntegrationInput,
  planCreateIntegration,
  runCreateIntegration,
  webhookUrlFor,
  type CreateIntegrationDeps,
  type RawIntegrationInput,
} from './create-integration.core';
import { envVarNameForRef } from '../src/integrations/secret-resolver';

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
  raw: RawIntegrationInput;
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
    dryRun,
    generateSecret,
    raw: {
      hotelKey: out['hotel-key'],
      provider: out.provider,
      environment: out.environment,
      externalPropertyId: out['external-property-id'],
      productCode: out['product-code'],
      secretRef: out['secret-ref'],
    },
  };
}

function makeDeps(db: SupabaseClient): CreateIntegrationDeps {
  return {
    // EXACT eşleşme: önce public_widget_key, sonra hotel_code. LIKE/isim YOK.
    findHotelByExactKey: async (key) => {
      const byWidgetKey = await db
        .from('hotels')
        .select('id, name, hotel_code')
        .eq('public_widget_key', key)
        .maybeSingle();
      const row =
        byWidgetKey.data ??
        (
          await db
            .from('hotels')
            .select('id, name, hotel_code')
            .eq('hotel_code', key)
            .maybeSingle()
        ).data;
      if (!row) return null;
      return {
        id: row.id as string,
        name: row.name as string,
        hotelCode: row.hotel_code as string,
      };
    },
    listIntegrationsForHotel: async (hotelId) => {
      const { data } = await db
        .from('hotel_integrations')
        .select('id, provider, environment, external_property_id, status')
        .eq('hotel_id', hotelId);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        provider: r.provider as string,
        environment: r.environment as string,
        externalPropertyId: r.external_property_id as string,
        status: r.status as string,
      }));
    },
    insertIntegration: async (row) => {
      const { data, error } = await db
        .from('hotel_integrations')
        .insert(row)
        .select('id, webhook_routing_id')
        .single();
      if (error || !data) {
        throw new Error(
          `Entegrasyon eklenemedi: ${error?.message ?? 'bilinmeyen'}`,
        );
      }
      return {
        id: data.id as string,
        webhook_routing_id: data.webhook_routing_id as string,
      };
    },
  };
}

async function main(): Promise<void> {
  loadEnv();

  const { raw, dryRun, generateSecret } = parseArgs(process.argv.slice(2));
  const input = validateIntegrationInput(raw);

  // --generate-secret YALNIZCA sandbox + yapılandırılmış adapter için anlamlı.
  // Production'da gerçek secrets manager yok -> secret üretmek onu bir yere
  // güvenle koyabileceğimiz izlenimi verir; bu yüzden REDDEDİLİR.
  if (generateSecret && input.environment !== 'sandbox') {
    throw new Error(
      '--generate-secret yalnızca --environment sandbox ile kullanılabilir. ' +
        'Production secret üretimi/saklanması gerçek bir secrets manager gerektirir (henüz yok).',
    );
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).',
    );
  }

  const apiBase = process.env.API_PUBLIC_URL ?? 'http://localhost:3000';
  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deps = makeDeps(db);

  if (dryRun) {
    const plan = await planCreateIntegration(input, deps);
    console.log('\n🧪 DRY-RUN — hiçbir kayıt yazılmadı\n');
    console.log(
      `  Otel            : ${plan.hotel.name} (${plan.hotel.hotelCode})`,
    );
    console.log(`  Provider        : ${plan.provider}`);
    console.log(`  Environment     : ${plan.environment}`);
    console.log(`  Property ID     : ${plan.externalPropertyId}`);
    console.log(`  Product code    : ${plan.productCode}`);
    console.log(`  Secret ref      : ${plan.secretRef}`);
    console.log(`  Status          : ${plan.status} (aktive DEĞİL)`);
    console.log(
      `  Webhook URL     : ${webhookUrlFor(apiBase, plan.provider, '<ROUTING_ID_OLUSTURULACAK>')}`,
    );
    if (plan.activationBlockedReason) {
      console.log(`\n  ⛔ Aktivasyon engeli: ${plan.activationBlockedReason}`);
    }
    if (generateSecret) {
      // Dry-run'da secret ÜRETİLMEZ ve GÖSTERİLMEZ.
      console.log(
        "\n  (--generate-secret dry-run'da çalışmaz — secret yalnızca gerçek oluşturmada üretilir.)",
      );
    }
    console.log(
      "\n  DRY-RUN bitti. Gerçek oluşturma için --dry-run'ı kaldırın.\n",
    );
    return;
  }

  const res = await runCreateIntegration(input, deps);

  console.log(
    '\n✅ Entegrasyon oluşturuldu (status: pending — aktive DEĞİL)\n',
  );
  console.log(`  Otel            : ${res.hotel.name} (${res.hotel.hotelCode})`);
  console.log(`  Entegrasyon id  : ${res.integrationId}`);
  console.log(`  Provider        : ${res.provider}`);
  console.log(`  Environment     : ${res.environment}`);
  console.log(`  Property ID     : ${res.externalPropertyId}`);
  console.log(`  Product code    : ${res.productCode}`);
  console.log(`  Secret ref      : ${res.secretRef}`);
  console.log('\n  Webhook URL (sağlayıcıya verilecek):\n');
  console.log(
    `     ${webhookUrlFor(apiBase, res.provider, res.webhookRoutingId)}`,
  );
  console.log(
    '\n  ℹ️  Routing ID bir KİMLİK DOĞRULAMA DEĞİLDİR — yalnızca hangi',
  );
  console.log(
    '     entegrasyona ait olduğunu söyler. Gerçek doğrulama imza ile yapılır.',
  );

  if (generateSecret) {
    // 32 byte = 256 bit entropi. YALNIZCA burada, BİR KEZ gösterilir.
    const secret = randomBytes(32).toString('base64url');
    console.log(
      '\n  🔐 Üretilen SECRET (BİR KEZ gösterilir — şimdi güvenli yere kaydedin):\n',
    );
    console.log(`     ${secret}`);
    console.log(
      `\n     Kaydedilecek env/secret-manager anahtar adı: ${envVarNameForRef(res.secretRef)}`,
    );
    console.log(
      '     (.env OTOMATİK DEĞİŞTİRİLMEDİ — bu değeri kendiniz koyun.',
    );
    console.log('      Aynı değeri sağlayıcıya da güvenli kanaldan iletin.)');
  } else {
    console.log(
      `\n  🔑 Secret'ı şu anahtar adıyla kaydedin: ${envVarNameForRef(res.secretRef)}`,
    );
    console.log('     (Bu script secret üretmedi/yazmadı.)');
  }

  if (res.activationBlockedReason) {
    console.log(`\n  ⛔ Aktivasyon engeli: ${res.activationBlockedReason}`);
    console.log(
      "     Kayıt 'pending' olarak duruyor; engel kalkınca aktive edilebilir.",
    );
  } else {
    console.log(
      '\n  Sonraki adım — sandbox doğrulama eventi sonrası aktivasyon:',
    );
    console.log(
      `     npm run activate-integration -- --integration-id ${res.integrationId} --dry-run`,
    );
  }
  console.log('');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
