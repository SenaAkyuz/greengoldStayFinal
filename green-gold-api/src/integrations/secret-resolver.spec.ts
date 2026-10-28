import {
  EnvSecretResolver,
  UnavailableProductionSecretResolver,
  VaultIntegrationSecretResolver,
  envVarNameForRef,
  isResolverAllowedFor,
  isValidSecretRef,
  resolverForEnvironment,
} from './secret-resolver';

describe('isValidSecretRef — env-uyumlu format', () => {
  it('büyük harf/rakam/alt çizgi kabul edilir', () => {
    expect(isValidSecretRef('HOTEL_A_REF')).toBe(true);
    expect(isValidSecretRef('PRINCES_PALACE_SANDBOX_1')).toBe(true);
  });

  it('tire ve küçük harf REDDEDİLİR (platform env uyumsuzluğu)', () => {
    expect(isValidSecretRef('hotel-a-ref')).toBe(false);
    expect(isValidSecretRef('HOTEL-A-REF')).toBe(false);
    expect(isValidSecretRef('hotel_a_ref')).toBe(false);
  });

  it('rakamla başlayan veya çok kısa/uzun reddedilir', () => {
    expect(isValidSecretRef('1ABC')).toBe(false);
    expect(isValidSecretRef('AB')).toBe(false);
    expect(isValidSecretRef(`A${'B'.repeat(70)}`)).toBe(false);
  });

  it('string olmayan reddedilir', () => {
    expect(isValidSecretRef(null)).toBe(false);
    expect(isValidSecretRef(123)).toBe(false);
  });
});

describe('EnvSecretResolver (yalnızca local/sandbox)', () => {
  const REF = 'TEST_REF_A';
  const OLD_REF = 'TEST_REF_OLD';

  afterEach(() => {
    delete process.env[envVarNameForRef(REF)];
    delete process.env[envVarNameForRef(OLD_REF)];
  });

  it('geçerli ref + env varsa secret döner', async () => {
    process.env[envVarNameForRef(REF)] = 's3cret';
    const res = await new EnvSecretResolver().resolve({ secretRef: REF });
    expect(res.candidates).toEqual(['s3cret']);
    expect(res.previousAccepted).toBe(false);
  });

  it('env yoksa boş döner (fail closed)', async () => {
    const res = await new EnvSecretResolver().resolve({ secretRef: REF });
    expect(res.candidates).toHaveLength(0);
  });

  it('geçersiz formatlı ref hiç denenmez', async () => {
    process.env['INTEGRATION_SECRET_bad-ref'] = 'x';
    const res = await new EnvSecretResolver().resolve({ secretRef: 'bad-ref' });
    expect(res.candidates).toHaveLength(0);
    delete process.env['INTEGRATION_SECRET_bad-ref'];
  });

  it('overlap penceresi açıkken eski secret da aday olur', async () => {
    process.env[envVarNameForRef(REF)] = 'new';
    process.env[envVarNameForRef(OLD_REF)] = 'old';
    const res = await new EnvSecretResolver().resolve({
      secretRef: REF,
      previousSecretRef: OLD_REF,
      previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(res.candidates).toEqual(['new', 'old']);
    expect(res.previousAccepted).toBe(true);
  });

  it('overlap süresi dolduysa eski secret aday DEĞİLDİR', async () => {
    process.env[envVarNameForRef(REF)] = 'new';
    process.env[envVarNameForRef(OLD_REF)] = 'old';
    const res = await new EnvSecretResolver().resolve({
      secretRef: REF,
      previousSecretRef: OLD_REF,
      previousSecretExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(res.candidates).toEqual(['new']);
    expect(res.previousAccepted).toBe(false);
  });

  it('expiry olmadan previous ref kabul edilmez (süresiz eski secret olamaz)', async () => {
    process.env[envVarNameForRef(REF)] = 'new';
    process.env[envVarNameForRef(OLD_REF)] = 'old';
    const res = await new EnvSecretResolver().resolve({
      secretRef: REF,
      previousSecretRef: OLD_REF,
      previousSecretExpiresAt: null,
    });
    expect(res.candidates).toEqual(['new']);
  });

  it('production için MEŞRU DEĞİL', () => {
    expect(isResolverAllowedFor(new EnvSecretResolver(), 'production')).toBe(
      false,
    );
    expect(isResolverAllowedFor(new EnvSecretResolver(), 'sandbox')).toBe(true);
  });
});

describe('UnavailableProductionSecretResolver — fail closed', () => {
  it('her zaman boş döner (gerçek secrets manager yok)', async () => {
    process.env.INTEGRATION_SECRET_PROD_REF = 'should-never-be-used';
    const res = await new UnavailableProductionSecretResolver().resolve({
      secretRef: 'PROD_REF',
    });
    expect(res.candidates).toHaveLength(0);
    delete process.env.INTEGRATION_SECRET_PROD_REF;
  });

  it('hiçbir environment için meşru değil', () => {
    const r = new UnavailableProductionSecretResolver();
    expect(isResolverAllowedFor(r, 'production')).toBe(false);
    expect(isResolverAllowedFor(r, 'sandbox')).toBe(false);
  });
});

describe('resolverForEnvironment', () => {
  it('sandbox -> env resolver', () => {
    expect(resolverForEnvironment('sandbox').name).toBe('env');
  });

  it('production -> fail-closed resolver (env ASLA kullanılmaz)', () => {
    expect(resolverForEnvironment('production').name).toBe(
      'unavailable_production',
    );
  });
});

describe('VaultIntegrationSecretResolver (production)', () => {
  function vault(secrets: Record<string, string>) {
    const calls: string[] = [];
    return {
      calls,
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push(`${fn}:${String(args.p_ref)}`);
        const value = secrets[String(args.p_ref)];
        return Promise.resolve({ data: value ?? null, error: null });
      },
    };
  }

  it("Vault'taki secret'ı döner; env'i okumaz", async () => {
    process.env.INTEGRATION_SECRET_PROD_REF = 'env-degeri';
    const db = vault({ PROD_REF: 'vault-degeri' });
    const res = await new VaultIntegrationSecretResolver(db).resolve({
      secretRef: 'PROD_REF',
    });
    expect(res.candidates).toEqual(['vault-degeri']);
    expect(db.calls).toEqual(['integration_secret_get:PROD_REF']);
    delete process.env.INTEGRATION_SECRET_PROD_REF;
  });

  it('süresi dolmamış eski secret overlap için eklenir, dolmuş olan eklenmez', async () => {
    const db = vault({ NEW_REF: 'new', OLD_REF: 'old' });
    const r = new VaultIntegrationSecretResolver(db);
    const live = await r.resolve({
      secretRef: 'NEW_REF',
      previousSecretRef: 'OLD_REF',
      previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(live).toEqual({
      candidates: ['new', 'old'],
      previousAccepted: true,
    });
    const expired = await r.resolve({
      secretRef: 'NEW_REF',
      previousSecretRef: 'OLD_REF',
      previousSecretExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(expired.candidates).toEqual(['new']);
  });

  it('geçersiz ref için Vault çağrılmaz; RPC hatası -> boş (fail closed)', async () => {
    const db = vault({});
    const r = new VaultIntegrationSecretResolver(db);
    expect((await r.resolve({ secretRef: 'bad-ref' })).candidates).toEqual([]);
    expect(db.calls).toEqual([]);
    const failing = new VaultIntegrationSecretResolver({
      rpc: () => Promise.resolve({ data: null, error: { message: 'yok' } }),
    });
    expect(
      (await failing.resolve({ secretRef: 'PROD_REF' })).candidates,
    ).toEqual([]);
  });

  it('resolverForEnvironment: production + Vault istemcisi -> Vault resolver', () => {
    const r = resolverForEnvironment('production', vault({}));
    expect(r.name).toBe('supabase-vault');
    expect(isResolverAllowedFor(r, 'production')).toBe(true);
  });
});
