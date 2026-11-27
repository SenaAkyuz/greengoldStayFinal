/**
 * Operatör script'i — 3pmetrics ConnectHub (otel = 3pmetrics birimi).
 *
 * Anahtarlar .env içinde CARBON_PROVIDER_SECRET_<REF> adıyla durur
 * (ör. CARBON_PROVIDER_SECRET_GG_CH_WRITE=ch_live_..., CARBON_PROVIDER_SECRET_GG_CH_READ=ch_live_...).
 * Anahtar hiçbir zaman ekrana, loga veya tablolara açık yazılmaz.
 *
 *   # 1) Anahtarları dene (DB'ye/3pmetrics'e YAZMAZ): birimler, başlıklar, faktör paketleri
 *   npm run connecthub -- check --write-ref GG_CH_WRITE --read-ref GG_CH_READ --year 2026
 *
 *   # 2) Test kaydı gönder (yalnızca --write-ref; aynı birim/başlık/dönem tekrar
 *   #    gönderilirse 3pmetrics kaydı GÜNCELLER, yeni kayıt açmaz).
 *   #    Göndermeden önce başlığın çözünürlüğü, birimi ve ölçü birimi API'den
 *   #    doğrulanır: aylık → 2026-10, günlük → 2026-10-14, yıllık → 2026.
 *   npm run connecthub -- send --write-ref GG_CH_WRITE --unit <birim-uuid> \
 *     --period 2026-10 --item <başlık-uuid> --quantity 1000 --uom kWh
 *
 *   # 3) Hesap önizleme (DB'ye YAZMAZ): 3pmetrics'teki ONAYLI kayıtlar × faktör paketi
 *   npm run connecthub -- preview --read-ref GG_CH_READ --unit <birim-uuid> --period 2026-10 \
 *     [--inventory <envanter-uuid>] [--country-code TR] \
 *     [--rooms 100 --room-nights 2000 --total-m2 10000 --rooms-m2 6000 --meeting-m2 0]
 *   #    --country-code: tesisin ISO ülke kodu; ülkeye bağlı faktörlerin (ör.
 *   #    elektrik) tesise uygunluğu buna göre değerlendirilir.
 *
 *   # 4) Anahtarları Supabase Vault'a kaydet (önce 3pmetrics'e karşı doğrulanır)
 *   npm run connecthub -- store-secret --ref GG_CH_WRITE
 *
 *   # 5) Oteli birime bağla (production'da iki anahtar da Vault'ta olmalı)
 *   npm run connecthub -- link --hotel-key <public_widget_key|hotel_code> --unit <birim-uuid> \
 *     --write-ref GG_CH_WRITE --read-ref GG_CH_READ --environment sandbox [--inventory <uuid>] [--dry-run]
 *
 * --environment, API'nin CARBON_PROVIDER_ENVIRONMENT değeriyle AYNI olmalı.
 * ⚠️ YALNIZCA LOKAL/OPERATÖR (service_role kullanır).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  ConnectHubClient,
  ConnectHubError,
} from '../src/carbon/connecthub/connecthub.client';
import { calculateFromFactorPackage } from '../src/carbon/connecthub/factor-calculation';
import { assessFactorCountries } from '../src/carbon/connecthub/country-check';
import {
  PERIOD_FORMAT_LABEL,
  isPeriodValidForResolution,
  resolutionKind,
} from '../src/carbon/connecthub/resolution';
import { externalIdFor } from '../src/carbon/connecthub/connecthub.service';
import { calculateHotelCarbon } from '../src/common/hotel-carbon';
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
  const [command = '', ...rest] = argv;
  const out: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run') {
      flags.add(key);
      continue;
    }
    out[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : '';
  }
  return { command, out, dryRun: flags.has('dry-run') };
}

/**
 * Hata: mesaj main()'de basılır ve çıkış kodu 1 olur. `process.exit` ÇAĞRILMAZ;
 * Windows'ta açık fetch bağlantıları varken process.exit, libuv
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" hatası basıyordu.
 */
class CliFailure extends Error {}

function fail(message: string): never {
  throw new CliFailure(message);
}

function keyFor(ref: string | undefined, label: string): string {
  if (!isValidSecretRef(ref)) {
    fail(`--${label} büyük harf/rakam/alt çizgi olmalı (ör. GG_CH_WRITE).`);
  }
  const name = carbonEnvVarNameForRef(ref as string);
  const key = process.env[name]?.trim();
  if (!key) fail(`${name} tanımlı değil (.env içine ekleyin).`);
  return key;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: string | undefined, label: string): string {
  if (!value || !UUID_RE.test(value))
    fail(`--${label} geçerli bir UUID olmalı.`);
  return value;
}

function requirePeriod(value: string | undefined): string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    fail('--period YYYY-AA olmalı (ör. 2026-10).');
  }
  return value;
}

const fmt = (n: number, digits = 3) =>
  n.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

async function check(client: ConnectHubClient, out: Record<string, string>) {
  const year = out.year ? Number(out.year) : new Date().getUTCFullYear();
  for (const [label, refArg] of [
    ['YAZMA', 'write-ref'],
    ['OKUMA', 'read-ref'],
  ] as const) {
    if (!out[refArg]) continue;
    const key = keyFor(out[refArg], refArg);
    console.log(`\n=== ${label} anahtarı (${out[refArg]}) ===`);
    try {
      const units = await client.listUnits(key);
      console.log(`Birimler (${units.length}):`);
      for (const u of units) {
        console.log(`  ${u.id}  ${u.name}${u.code ? ` [${u.code}]` : ''}`);
      }
      const items = await client.listItems(key);
      console.log(`Başlıklar (${items.length}):`);
      for (const i of items) {
        console.log(
          `  ${i.id}  ${i.name}${i.code ? ` [${i.code}]` : ''} · çözünürlük=${i.resolution} · birimler=${i.uoms.join('/')} · ${i.units.length} birimde açık`,
        );
      }
    } catch (e) {
      console.log(`  Birim/başlık okunamadı: ${describe(e)}`);
    }
    if (label === 'OKUMA') {
      try {
        const packages = await client.listFactorPackages(key, year);
        console.log(`${year} faktör paketleri (${packages.length}):`);
        for (const p of packages) {
          console.log(
            `  ${p.id}  ${p.name} (${p.year}) hash=${p.content_hash.slice(0, 12)}…`,
          );
        }
        if (!packages.length) {
          console.log(
            '  → Bu yıl için faktör paketi verilebilecek envanter yok. 3pmetrics\'te envanter açılmalı ve okuma anahtarında "Faktörleri içer" işaretli olmalı.',
          );
        }
      } catch (e) {
        console.log(`  Faktör paketleri okunamadı: ${describe(e)}`);
      }
    }
  }
  console.log('\ncheck: hiçbir şey yazılmadı.');
}

async function send(client: ConnectHubClient, out: Record<string, string>) {
  const key = keyFor(out['write-ref'], 'write-ref');
  const unit = requireUuid(out.unit, 'unit');
  const item = requireUuid(out.item, 'item');
  const period = (out.period ?? '').trim();
  const quantity = Number(out.quantity);
  if (!Number.isFinite(quantity) || quantity < 0)
    fail('--quantity sayı olmalı.');
  const uom = out.uom?.trim();
  if (!uom) fail('--uom gerekli (ör. kWh).');

  // Başlığın gerçek kontratını API'den doğrula (tahminle yazma yok).
  let items: Awaited<ReturnType<ConnectHubClient['listItems']>>;
  try {
    items = await client.listItems(key);
  } catch (e) {
    fail(`Başlıklar okunamadı: ${describe(e)}`);
  }
  const meta = items.find((i) => i.id === item);
  if (!meta) fail('Başlık bu yazma anahtarının kapsamında değil.');
  if (!meta.units.includes(unit)) {
    fail(`"${meta.name}" başlığı bu birimde açık değil.`);
  }
  const kind = resolutionKind(meta.resolution);
  if (!kind) {
    fail(
      `"${meta.name}" başlığının çözünürlüğü (${meta.resolution}) tanınmıyor; kayıt gönderilmedi.`,
    );
  }
  if (!isPeriodValidForResolution(kind, period)) {
    fail(
      `"${meta.name}" ${meta.resolution} bir başlık; --period ${PERIOD_FORMAT_LABEL[kind]} olmalı.`,
    );
  }
  if (!meta.uoms.includes(uom)) {
    fail(`--uom bu başlıkta şunlardan biri olmalı: ${meta.uoms.join(', ')}.`);
  }
  const record = {
    item,
    unit,
    period,
    quantity,
    uom,
    external_id: externalIdFor(unit, item, period),
    note: out.note || 'GreenGold test kaydı',
  };
  console.log(`Gönderiliyor: ${JSON.stringify(record)}`);
  try {
    const res = await client.writeRecords(key, [record]);
    console.log(`Yazılan: ${res.written} · Reddedilen: ${res.rejected}`);
    for (const r of res.results) {
      console.log(
        `  ${r.external_id} → ${r.status}${r.record_id ? ` (record ${r.record_id})` : ''}${r.error ? ` HATA ${r.error.code}: ${r.error.message}` : ''}${r.warnings.length ? ` uyarılar: ${r.warnings.join(', ')}` : ''}`,
      );
    }
  } catch (e) {
    if (e instanceof ConnectHubError && e.writeResponse) {
      for (const r of e.writeResponse.results) {
        console.log(
          `  ${r.external_id} → ${r.status} ${r.error?.code ?? ''} ${r.error?.message ?? ''}`,
        );
      }
    }
    fail(describe(e));
  }
}

async function preview(client: ConnectHubClient, out: Record<string, string>) {
  const key = keyFor(out['read-ref'], 'read-ref');
  const unit = requireUuid(out.unit, 'unit');
  const period = requirePeriod(out.period);
  const year = Number(period.slice(0, 4));

  let inventoryId = out.inventory;
  if (!inventoryId) {
    const packages = (await client.listFactorPackages(key, year)).filter(
      (p) => p.year === year,
    );
    if (packages.length !== 1) {
      fail(
        `${year} için ${packages.length} envanter bulundu; --inventory ile seçin.${packages.map((p) => `\n  ${p.id} ${p.name}`).join('')}`,
      );
    }
    inventoryId = packages[0].id;
  }
  requireUuid(inventoryId, 'inventory');

  const all = await client.readApprovedRecords(key, { unit });
  const records = all.filter(
    (r) =>
      r.unit === unit &&
      (r.period === period || r.period.startsWith(`${period}-`)),
  );
  console.log(
    `Birim ${unit} · ${period}: ${records.length} onaylı kayıt (birimde toplam ${all.length}).`,
  );
  if (!records.length) {
    fail(
      "Bu dönem için ONAYLI kayıt yok. Gönderdiyseniz 3pmetrics'te onay bekliyor olabilir.",
    );
  }

  const fetched = await client.getFactorPackage(key, inventoryId);
  if (fetched.notModified) fail('Beklenmedik 304.');
  const pkg = fetched.pkg;
  console.log(
    `Envanter: ${pkg.inventory.name} (${pkg.inventory.year}) · GWP ${pkg.inventory.gwp_set} · ${pkg.inventory.dataset} · Kapsam 2 ${pkg.inventory.scope2_method} · release ${pkg.release.release_id}`,
  );

  const result = calculateFromFactorPackage(pkg, unit, period, records);
  console.log('\nKalem bazında:');
  for (const l of result.lines) {
    const head = `  [K${l.scope ?? '-'}] ${l.item_name}: ${fmt(l.quantity, 3)} ${l.uom}`;
    if (l.excluded) {
      console.log(`${head} → envanter dışı (sayılmadı)`);
    } else if (l.method) {
      console.log(
        `${head} → ${l.quantity_in_factor_uom !== l.quantity ? `${fmt(l.quantity_in_factor_uom ?? 0, 3)} ${l.factor_uom} → ` : ''}${fmt(l.kg_co2e, 3)} kg CO2e  (${l.method}, faktör "${l.factor_name ?? l.factor_id}", veri yılı ${l.data_year ?? '-'}, kaynak ${l.factor_source?.name ?? '-'}${l.company_declared ? ', ŞİRKET BEYANI' : ''})${l.warnings.length ? ` uyarı: ${l.warnings.join(', ')}` : ''}`,
      );
    } else {
      console.log(`${head} → HESAPLANAMADI`);
    }
  }
  for (const b of result.blocking) {
    console.log(`  ✗ ${b.code} · ${b.item_name}: ${b.message}`);
  }
  const s = result.scope_totals_kg;
  console.log(
    `\nKapsam 1: ${fmt(s.scope_1)} kg · Kapsam 2: ${fmt(s.scope_2)} kg · Kapsam 3: ${fmt(s.scope_3)} kg${s.unscoped ? ` · kapsamsız: ${fmt(s.unscoped)} kg` : ''}`,
  );
  console.log(
    `TOPLAM: ${fmt(result.total_kg)} kg CO2e = ${fmt(result.total_kg / 1000, 4)} t CO2e${result.biogenic_co2_kg ? ` (biyojenik CO2 ayrı: ${fmt(result.biogenic_co2_kg)} kg)` : ''}`,
  );
  console.log(`Hesap kapsamı: ${result.coverage.label}`);
  for (const n of result.notices)
    console.log(`  Not [${n.code}]: ${n.message}`);
  if (result.blocking.length) {
    fail('Bazı kalemlere faktör uygulanamadı; panel bu durumda fiyat ÜRETMEZ.');
  }

  const countryCheck = assessFactorCountries(result, out['country-code']);
  console.log(
    `\nFaktör ülkesi · tesis ülke kodu: ${countryCheck.hotel_country_code ?? `(${countryCheck.hotel_country_status === 'invalid' ? 'geçersiz' : 'verilmedi'})`}`,
  );
  for (const l of countryCheck.lines) {
    console.log(
      `  ${l.publishable ? '✓' : '!'} ${l.item_name} [${l.factor_country_code ?? 'ülkeden bağımsız'}] ${l.status}: ${l.message}`,
    );
  }
  for (const m of countryCheck.messages) console.log(`  ${m}`);
  console.log(
    countryCheck.publishable
      ? "→ Ülke kontrolü geçti: panel bu sonucu kaydedip widget'a yayınlanabilir hale getirir."
      : "→ YALNIZ ÖNİZLEME: panel bu sonucu kaydetmez, widget'a yayınlanmaz.",
  );

  if (out.rooms && out['room-nights'] && out['total-m2'] && out['rooms-m2']) {
    const [y, m] = period.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pricing = calculateHotelCarbon(
      {
        mode: 'report',
        country: out.country || 'Turkey',
        period_start: `${period}-01`,
        period_end: `${period}-${String(last).padStart(2, '0')}`,
        rooms: Number(out.rooms),
        occupied_room_nights: Number(out['room-nights']),
        total_area_m2: Number(out['total-m2']),
        guestrooms_area_m2: Number(out['rooms-m2']),
        meeting_area_m2: Number(out['meeting-m2'] || 0),
        report_tonnes: result.total_kg / 1000,
        report_basis: 'hotel_total',
        report_reference: `preview ${period}`,
        assessor: '3pmetrics',
      },
      out.currency || 'EUR',
    );
    console.log(
      `\nKonaklama payı %${fmt(pricing.room_share * 100, 1)} → ${fmt(pricing.coefficient_kg, 3)} kg CO2e / dolu oda-gece → widget katkısı ${pricing.amount_per_night} ${pricing.currency}/gece (25 EUR/t, temsili)`,
    );
    for (const w of pricing.warnings) console.log(`  Uyarı: ${w}`);
  }
  console.log('\npreview: hiçbir şey yazılmadı.');
}

function db() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli.');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function storeSecret(
  client: ConnectHubClient,
  out: Record<string, string>,
  dryRun: boolean,
) {
  const ref = out.ref;
  const key = keyFor(ref, 'ref');
  // Çalışmayan anahtar saklanmaz.
  await client
    .listUnits(key)
    .catch((e: unknown) => fail(`Anahtar doğrulanamadı: ${describe(e)}`));
  if (dryRun) {
    console.log("--dry-run: anahtar doğrulandı, Vault'a yazılmadı.");
    return;
  }
  const { error } = await db().rpc('carbon_provider_secret_set', {
    p_ref: ref,
    p_secret: key,
  });
  if (error) fail(`Vault'a yazılamadı (migration 0016?): ${error.message}`);
  console.log(`Anahtar Vault'a şifreli kaydedildi (carbon_provider:${ref}).`);
}

async function link(
  client: ConnectHubClient,
  out: Record<string, string>,
  dryRun: boolean,
) {
  const environment = out.environment || 'sandbox';
  if (environment !== 'sandbox' && environment !== 'production') {
    fail('--environment sandbox veya production olmalı.');
  }
  const unitId = requireUuid(out.unit, 'unit');
  const writeRef = out['write-ref'];
  const readRef = out['read-ref'];
  if (!isValidSecretRef(writeRef) || !isValidSecretRef(readRef)) {
    fail('--write-ref ve --read-ref gerekli.');
  }
  const inventory = out.inventory
    ? requireUuid(out.inventory, 'inventory')
    : null;

  // Birim gerçekten anahtarın şirketinde mi? (env'de anahtar varsa doğrula)
  const probeKey =
    process.env[carbonEnvVarNameForRef(readRef)]?.trim() ||
    process.env[carbonEnvVarNameForRef(writeRef)]?.trim();
  let unitName: string | null = out['unit-name'] || null;
  if (probeKey) {
    const units = await client.listUnits(probeKey);
    const unit = units.find((u) => u.id === unitId);
    if (!unit) fail('Birim bu anahtarın şirketinde bulunamadı.');
    unitName = unit.name;
  }

  const supabase = db();
  if (environment === 'production') {
    for (const ref of [writeRef, readRef] as string[]) {
      const exists = await supabase.rpc('carbon_provider_secret_exists', {
        p_ref: ref,
      });
      if (exists.error || exists.data !== true) {
        fail(
          `Production için ${ref} Vault'ta olmalı. Önce store-secret çalıştırın.`,
        );
      }
    }
  }

  const hotelKey = out['hotel-key'];
  if (!hotelKey) fail('--hotel-key gerekli.');
  const byWidgetKey = await supabase
    .from('hotels')
    .select('id, name')
    .eq('public_widget_key', hotelKey)
    .maybeSingle();
  const hotel =
    byWidgetKey.data ??
    (
      await supabase
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
    api: 'connecthub',
    environment,
    external_property_id: unitId,
    external_account_id: null,
    external_property_name: unitName,
    status: 'active',
    authorization_ref: writeRef,
    read_authorization_ref: readRef,
    factor_inventory_id: inventory,
    linked_at: now,
    revoked_at: null,
    updated_at: now,
  };
  console.log(
    `Bağlanacak: ${hotel.name as string} → 3pmetrics birimi ${unitName ?? unitId} (${environment}), yazma=${writeRef}, okuma=${readRef}${inventory ? `, envanter=${inventory}` : ''}`,
  );
  if (dryRun) {
    console.log('--dry-run: DB değiştirilmedi.');
    return;
  }
  const { error } = await supabase.from('carbon_provider_links').upsert(row, {
    onConflict: 'hotel_id,provider,environment,external_property_id',
  });
  if (error) {
    fail(
      `Bağlantı yazılamadı (migration 0019 uygulandı mı?): ${error.message}`,
    );
  }
  console.log('Bağlantı aktif.');
}

function describe(e: unknown): string {
  if (e instanceof ConnectHubError)
    return `${e.reason}${e.status ? ` (${e.status})` : ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

async function main(): Promise<void> {
  loadEnv();
  const { command, out, dryRun } = parseArgs(process.argv.slice(2));
  const client = new ConnectHubClient({
    baseUrl: process.env.THREEPMETRICS_CONNECTHUB_BASE_URL || undefined,
  });
  switch (command) {
    case 'check':
      return check(client, out);
    case 'send':
      return send(client, out);
    case 'preview':
      return preview(client, out);
    case 'store-secret':
      return storeSecret(client, out, dryRun);
    case 'link':
      return link(client, out, dryRun);
    default:
      fail(
        'Komut: check | send | preview | store-secret | link (ayrıntı dosya başında).',
      );
  }
}

main().catch((failure: unknown) => {
  console.error(
    `HATA: ${failure instanceof CliFailure ? failure.message : describe(failure)}`,
  );
  process.exitCode = 1;
});
