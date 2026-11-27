import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SupabaseModule } from '../src/supabase/supabase.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { CarbonModule } from '../src/carbon/carbon.module';
import { CarbonMeasurementService } from '../src/carbon/carbon-measurement.service';
import { ConnectHubService } from '../src/carbon/connecthub/connecthub.service';
import { carbonEnvVarNameForRef } from '../src/carbon/carbon-credentials';
import { makeFakeSupabase, type Row } from './fake-supabase';

/**
 * Regresyon (2026-11-27): "TypeError: Cannot read properties of undefined
 * (reading 'rpc')" — VaultCarbonCredentialResolver.has ← ConnectHubService.getStatus.
 *
 * Kök neden: SupabaseService istemciyi `onModuleInit`'te oluşturur; Nest ise
 * TÜM constructor'ları önce çalıştırır. CarbonMeasurementService constructor'da
 * `supabase.db` değerini okuyup resolver'a verdiği için resolver `undefined`
 * aldı. Diğer testler SupabaseService'i `useValue(fake)` ile değiştirdiğinden
 * (db baştan dolu) bu sıra hiç görünmedi.
 *
 * Bu test SupabaseService'i OVERRIDE ETMEZ: gerçek SupabaseModule + CarbonModule
 * provider yapılandırması, gerçek `onModuleInit` ve gerçek supabase-js istemcisi
 * kullanılır. Ağa çıkılmaması için yalnız init SONRASI oluşan gerçek istemcinin
 * `from`/`rpc` metotları bellek içi fake'e yönlendirilir.
 */

const WRITE_REF = 'GG_CH_WRITE';
const READ_REF = 'GG_CH_READ';
const CCA_REF = 'PILOT_HOTEL';

const connectHubLink = (environment: string): Row => ({
  id: 'link-ch',
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  api: 'connecthub',
  environment,
  external_property_id: '054caeeb-a602-4ac8-f193-08df4a2b430d',
  external_property_name: 'Green Gold Test Hotel',
  authorization_ref: WRITE_REF,
  read_authorization_ref: READ_REF,
  factor_inventory_id: null,
  status: 'active',
  linked_at: '2026-11-27T10:00:00Z',
  revoked_at: null,
});

const ccaLink = (environment: string): Row => ({
  id: 'link-cca',
  hotel_id: 'hotel-B',
  provider: 'threepmetrics',
  api: 'cca',
  environment,
  external_property_id: 'otel-b',
  external_property_name: 'Otel B',
  authorization_ref: CCA_REF,
  read_authorization_ref: null,
  factor_inventory_id: null,
  status: 'active',
  linked_at: '2026-10-01T00:00:00Z',
  revoked_at: null,
});

async function boot(
  environment: 'sandbox' | 'production',
  vaultRefs: string[],
) {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-not-a-secret';
  process.env.CARBON_PROVIDER_ENVIRONMENT = environment;

  const moduleRef = await Test.createTestingModule({
    imports: [
      // AppModule ile aynı ConfigModule; .env dosyası okunmaz (test yalıtımı).
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SupabaseModule,
      CarbonModule,
    ],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init(); // onModuleInit burada çalışır (serverless ile aynı sıra)

  const fake = makeFakeSupabase(
    {
      hotels: [
        { id: 'hotel-A', name: 'Pilot Otel', widget_settings: null },
        { id: 'hotel-B', name: 'Otel B', widget_settings: null },
      ],
      carbon_provider_links: [
        connectHubLink(environment),
        ccaLink(environment),
      ],
      carbon_facility_profiles: [],
      carbon_measurements: [],
    },
    {
      rpc: {
        carbon_provider_secret_exists: (args) => ({
          data: vaultRefs.includes(String(args.p_ref)),
          error: null,
        }),
        carbon_provider_secret_get: (args) => ({
          data: vaultRefs.includes(String(args.p_ref))
            ? `vault-value-for-test`
            : null,
          error: null,
        }),
      },
    },
  );

  const realClient = app.get(SupabaseService).db;
  expect(realClient).toBeDefined();
  const fromSpy = jest
    .spyOn(realClient, 'from')
    .mockImplementation(((table: string) => fake.db.from(table)) as never);
  const rpcSpy = jest
    .spyOn(realClient, 'rpc')
    .mockImplementation(((fn: string, args: Row) =>
      fake.db.rpc(fn, args)) as never);

  return {
    app,
    fake,
    fromSpy,
    rpcSpy,
    connecthub: app.get(ConnectHubService),
    measurement: app.get(CarbonMeasurementService),
  };
}

describe('Carbon credential resolver — gerçek NestJS provider yapılandırması', () => {
  let app: INestApplication | undefined;
  const envKeys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CARBON_PROVIDER_ENVIRONMENT',
    carbonEnvVarNameForRef(WRITE_REF),
    carbonEnvVarNameForRef(READ_REF),
    carbonEnvVarNameForRef(CCA_REF),
  ];
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    for (const key of envKeys) saved[key] = process.env[key];
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('ConnectHub getStatus (production): Vault, init sonrası gerçek istemciyle sorgulanır — TypeError yok', async () => {
    const ctx = await boot('production', [WRITE_REF, READ_REF]);
    app = ctx.app;

    const status = await ctx.connecthub.getStatus('hotel-A');

    expect(status.environment).toBe('production');
    expect(status.link?.environment).toBe('production');
    expect(status.environment_matches).toBe(true);
    expect(status.write_key_ready).toBe(true);
    expect(status.read_key_ready).toBe(true);
    expect(ctx.fake.rpcCalls).toEqual(
      expect.arrayContaining([
        { name: 'carbon_provider_secret_exists', args: { p_ref: WRITE_REF } },
        { name: 'carbon_provider_secret_exists', args: { p_ref: READ_REF } },
      ]),
    );
    // Anahtar değeri ya da ref'i panele dönen yanıtta yok.
    expect(JSON.stringify(status)).not.toContain(WRITE_REF);
    expect(JSON.stringify(status)).not.toContain('vault-value');
  });

  it('production: Vault boşsa env değişkeni YEDEK OLARAK KULLANILMAZ (has + resolve)', async () => {
    process.env[carbonEnvVarNameForRef(WRITE_REF)] = 'env-key-must-be-ignored';
    process.env[carbonEnvVarNameForRef(READ_REF)] = 'env-key-must-be-ignored';
    const ctx = await boot('production', []);
    app = ctx.app;

    const status = await ctx.connecthub.getStatus('hotel-A');
    expect(status.write_key_ready).toBe(false);
    expect(status.read_key_ready).toBe(false);
    await expect(
      ctx.measurement.credentials.resolve(WRITE_REF, 'production'),
    ).resolves.toBeNull();
  });

  it('production resolve: anahtar Vault RPC ile çözülür', async () => {
    const ctx = await boot('production', [WRITE_REF]);
    app = ctx.app;

    await expect(
      ctx.measurement.credentials.resolve(WRITE_REF, 'production'),
    ).resolves.toEqual({ apiKey: 'vault-value-for-test' });
    expect(ctx.rpcSpy).toHaveBeenCalledWith('carbon_provider_secret_get', {
      p_ref: WRITE_REF,
    });
  });

  it('sandbox: Vault boşsa env yedeği eskisi gibi çalışır', async () => {
    process.env[carbonEnvVarNameForRef(WRITE_REF)] = 'sandbox-env-key';
    const ctx = await boot('sandbox', []);
    app = ctx.app;

    const status = await ctx.connecthub.getStatus('hotel-A');
    expect(status.write_key_ready).toBe(true);
    expect(status.read_key_ready).toBe(false);
  });

  it('eski CCA getStatus aynı gerçek yapılandırmada çalışır ve ConnectHub bağlantısını görmez', async () => {
    const ctx = await boot('production', [CCA_REF]);
    app = ctx.app;

    const cca = await ctx.measurement.getStatus('hotel-B');
    expect(cca.link?.external_property_name).toBe('Otel B');
    expect(cca.credentials_ready).toBe(true);
    expect(ctx.fake.rpcCalls).toContainEqual({
      name: 'carbon_provider_secret_exists',
      args: { p_ref: CCA_REF },
    });

    const onlyConnectHub = await ctx.measurement.getStatus('hotel-A');
    expect(onlyConnectHub.link).toBeNull();
    expect(onlyConnectHub.credentials_ready).toBe(false);
  });

  it('SupabaseService.db, onModuleInit öncesi okunursa undefined yerine açık hata verir', () => {
    const service = new SupabaseService({ get: () => undefined } as never);
    expect(() => service.db).toThrow('henüz başlatılmadı');
  });
});
