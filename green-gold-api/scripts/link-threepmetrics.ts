/**
 * Operatör script'i — bir oteli 3pmetrics müşteri hesabına bağlar veya bir API
 * anahtarını DB'ye dokunmadan dener.
 *
 *   # 1) Anahtarı dene (DB'ye YAZMAZ): müşteri, birimler ve dönem özeti
 *   npm run link-threepmetrics -- --authorization-ref GREENGOLD \
 *     --environment production --check --from 2025-01-01 --to 2025-12-31
 *
 *   # 2) Anahtarı Supabase Vault'a kaydet (secrets manager, migration 0016)
 *   npm run link-threepmetrics -- --authorization-ref GREENGOLD \
 *     --environment production --store-secret
 *
 *   # 3) Oteli bağla (production'da anahtar Vault'ta OLMALI)
 *   npm run link-threepmetrics -- --hotel-key <public_widget_key veya hotel_code> \
 *     --authorization-ref GREENGOLD --environment production [--dry-run] \
 *     [--member-id <3pmetrics üye kimliği>]
 *
 *   --member-id: 3pmetrics "anahtarın üye kapsamı yoksa yanıt oluşturmada
 *   memberId belirtilmeli" diyor. Yalnızca 3pmetrics böyle bir kimlik
 *   verdiyse kullanılır (migration 0018 gerekir); verilmezse alan yazılmaz.
 *
 * Anahtar ilk olarak `.env` içinde `CARBON_PROVIDER_SECRET_<REF>` adıyla
 * verilir (ör. CARBON_PROVIDER_SECRET_GREENGOLD=...). `--store-secret` onu
 * ŞİFRELİ olarak Vault'a yazar; sonrasında .env satırı silinebilir. Anahtar
 * DB tablolarına, loga veya bu script'in çıktısına ASLA açık metin yazılmaz;
 * `carbon_provider_links` yalnızca opak referansı tutar.
 *
 * 3pmetrics API anahtarı tek bir MÜŞTERİYE bağlıdır (teknik ek §1.5) — bu
 * yüzden bağlanacak hesap anahtardan okunur, elle girilmez. Anahtar birden
 * fazla müşteri döndürürse bağlama REDDEDİLİR (hangi müşterinin hangi otel
 * olduğu tahmin edilmez).
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır (RLS bypass).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  THREEPMETRICS_BASE_URLS,
  ThreePMetricsAdapter,
} from '../src/carbon/adapters/threepmetrics.adapter';
import { carbonEnvVarNameForRef } from '../src/carbon/carbon-credentials';
import { isValidSecretRef } from '../src/integrations/secret-resolver';

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

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run' || key === 'check' || key === 'store-secret') {
      flags.add(key);
      continue;
    }
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
  }
  return {
    out,
    check: flags.has('check'),
    dryRun: flags.has('dry-run'),
    storeSecret: flags.has('store-secret'),
  };
}

function fail(message: string): never {
  console.error(`HATA: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();
  const { out, check, dryRun, storeSecret } = parseArgs(process.argv.slice(2));

  const ref = out['authorization-ref'];
  if (!isValidSecretRef(ref)) {
    fail(
      '--authorization-ref büyük harf/rakam/alt çizgi olmalı (ör. GREENGOLD).',
    );
  }
  const environment = out.environment || 'sandbox';
  if (environment !== 'sandbox' && environment !== 'production') {
    fail('--environment sandbox veya production olmalı.');
  }
  const envName = carbonEnvVarNameForRef(ref);
  const apiKey = process.env[envName]?.trim();
  if (!apiKey) fail(`${envName} tanımlı değil (.env içine ekleyin).`);

  const adapter = new ThreePMetricsAdapter({
    baseUrl:
      process.env.THREEPMETRICS_BASE_URL ||
      THREEPMETRICS_BASE_URLS[environment],
  });
  const credentials = { apiKey };

  const accounts = await adapter.listAccounts(credentials);
  console.log(`Ortam: ${environment}`);
  console.log(
    `Anahtarın bağlı olduğu müşteri(ler): ${accounts.map((a) => `${a.name} (${a.externalAccountId})`).join(', ') || 'YOK'}`,
  );
  if (accounts.length !== 1) {
    fail(
      'Anahtar tam olarak bir müşteri döndürmeli; bağlanacak hesap belirsiz.',
    );
  }
  const account = accounts[0];

  const units = await adapter.listUnits(credentials, account.externalAccountId);
  console.log(
    `Birimler (${units.length}): ${units.map((u) => `${u.name} [${u.type}]`).join(', ') || '-'}`,
  );
  if (units.length > 1) {
    console.warn(
      'UYARI: Hesapta birden fazla birim var. Carbon Summary API birim parametresi almıyor; özet TÜM birimlerin toplamı olabilir (3pmetrics ile netleştirin).',
    );
  }

  if (check) {
    const from = out.from;
    const to = out.to;
    if (from && to) {
      const summary = await adapter.getCarbonSummary(credentials, {
        start: from,
        end: to,
      });
      console.log(`Dönem ${from} — ${to}:`);
      for (const scope of summary.scopes) {
        console.log(
          `  ${scope.scopeTitle} (${scope.scopeLabel}): ${scope.total} ${summary.totalEmissionsUnit}`,
        );
      }
      console.log(
        `  TOPLAM: ${summary.totalEmissions} ${summary.totalEmissionsUnit} (${summary.lines.length} kaynak)`,
      );
    }
    console.log('--check: DB değiştirilmedi.');
    return;
  }

  const hotelKey = out['hotel-key'];
  if (!hotelKey && !storeSecret)
    fail('--hotel-key veya --store-secret gerekli.');

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli.');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (storeSecret) {
    // Anahtar yukarıda 3pmetrics'e karşı DOĞRULANDI; çalışmayan anahtar saklanmaz.
    if (dryRun) {
      console.log("--dry-run: anahtar Vault'a yazılmadı.");
    } else {
      const { error } = await db.rpc('carbon_provider_secret_set', {
        p_ref: ref,
        p_secret: apiKey,
      });
      if (error) {
        fail(
          `Anahtar Vault'a yazılamadı (migration 0016 uygulandı mı?): ${error.message}`,
        );
      }
      console.log(
        `Anahtar Vault'a şifreli kaydedildi (carbon_provider:${ref}). .env satırı artık silinebilir.`,
      );
    }
    if (!hotelKey) return;
  }

  // EXACT eşleşme: önce public_widget_key, sonra hotel_code. LIKE/isim YOK.
  const byWidgetKey = await db
    .from('hotels')
    .select('id, name')
    .eq('public_widget_key', hotelKey)
    .maybeSingle();
  const hotel =
    byWidgetKey.data ??
    (
      await db
        .from('hotels')
        .select('id, name')
        .eq('hotel_code', hotelKey)
        .maybeSingle()
    ).data;
  if (!hotel) fail('Otel bulunamadı — --hotel-key TAM eşleşmeli.');

  const now = new Date().toISOString();
  const row = {
    hotel_id: hotel.id as string,
    provider: 'threepmetrics',
    environment,
    external_property_id: account.externalAccountId,
    external_account_id: account.externalAccountId,
    external_property_name: account.name,
    status: 'active',
    authorization_ref: ref,
    linked_at: now,
    revoked_at: null,
    updated_at: now,
    // Yalnızca verildiyse yazılır: 0018 uygulanmamış ortamda bağlama bozulmasın.
    ...(out['member-id']
      ? { provider_member_id: out['member-id'].trim() }
      : {}),
  };

  console.log(
    `Bağlanacak: ${hotel.name as string} -> ${account.name} (${account.externalAccountId}), ref=${ref}`,
  );
  if (environment === 'production' && !dryRun) {
    // Production'da API env'i OKUMAZ — anahtar Vault'ta yoksa bağlantı işe yaramaz.
    const exists: { data: unknown; error: unknown } = await db.rpc(
      'carbon_provider_secret_exists',
      { p_ref: ref },
    );
    if (exists.error || exists.data !== true) {
      fail(
        "Production bağlantısı için anahtar Vault'ta olmalı. Önce --store-secret çalıştırın.",
      );
    }
  }
  if (dryRun) {
    console.log('--dry-run: DB değiştirilmedi.');
    return;
  }

  const { error } = await db.from('carbon_provider_links').upsert(row, {
    onConflict: 'hotel_id,provider,environment,external_property_id',
  });
  if (error) fail(`Bağlantı yazılamadı: ${error.message}`);
  console.log('Bağlantı aktif.');
}

main().catch((failure: unknown) => {
  console.error(
    `HATA: ${failure instanceof Error ? failure.message : String(failure)}`,
  );
  process.exit(1);
});
