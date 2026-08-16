import {
  runActivateIntegration,
  evaluateGates,
  type ActivateIntegrationDeps,
  type IntegrationRecord,
} from './activate-integration.core';

function record(over: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    id: 'integ-1',
    hotelId: 'h1',
    hotelName: 'Pilot Otel',
    provider: 'generic_signed_webhook',
    environment: 'sandbox',
    status: 'pending',
    externalPropertyId: 'prop-A',
    productCode: 'GG-EXTRA',
    secretRef: 'PILOT_SANDBOX',
    previousSecretRef: null,
    previousSecretExpiresAt: null,
    ...over,
  };
}

interface DepOverrides {
  rec?: IntegrationRecord | null;
  configured?: boolean;
  canResolve?: boolean;
  resolverAllowed?: boolean;
  hasDelivery?: boolean;
}

function makeDeps(o: DepOverrides = {}): {
  deps: ActivateIntegrationDeps;
  statusSet: { id: string; status: string }[];
} {
  const statusSet: { id: string; status: string }[] = [];
  const deps: ActivateIntegrationDeps = {
    getIntegration: async () => (o.rec === undefined ? record() : o.rec),
    isProviderConfigured: () => o.configured ?? true,
    canResolveSecret: () => o.canResolve ?? true,
    isResolverAllowed: () => o.resolverAllowed ?? true,
    hasProcessedDelivery: async () => o.hasDelivery ?? true,
    setStatus: async (id, status) => {
      statusSet.push({ id, status });
    },
  };
  return { deps, statusSet };
}

describe('runActivateIntegration — bütün kapılar', () => {
  it('tüm kapılar geçerse aktive eder', async () => {
    const { deps, statusSet } = makeDeps();
    const res = await runActivateIntegration('integ-1', deps);
    expect(res.activated).toBe(true);
    expect(statusSet).toEqual([{ id: 'integ-1', status: 'active' }]);
    expect(res.gates.every((g) => g.passed)).toBe(true);
  });

  it('SynXis (adapter not_configured) -> AKTİVE EDİLEMEZ', async () => {
    const { deps, statusSet } = makeDeps({
      rec: record({ provider: 'synxis' }),
      configured: false,
    });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /adapter_configured/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('production + env resolver -> FAIL CLOSED, aktive edilemez', async () => {
    const { deps, statusSet } = makeDeps({
      rec: record({ environment: 'production' }),
      resolverAllowed: false,
      canResolve: false,
    });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /resolver_allowed_for_environment/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('secret çözülemiyorsa aktive edilemez', async () => {
    const { deps, statusSet } = makeDeps({ canResolve: false });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /secret_resolvable/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('property/product code eksikse aktive edilemez', async () => {
    const { deps, statusSet } = makeDeps({
      rec: record({ productCode: null }),
    });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /property_and_product_present/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('doğrulama eventi yoksa aktive edilemez', async () => {
    const { deps, statusSet } = makeDeps({ hasDelivery: false });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /verification_delivery/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('--override-verification YALNIZCA doğrulama kapısını atlar', async () => {
    const { deps, statusSet } = makeDeps({ hasDelivery: false });
    const res = await runActivateIntegration('integ-1', deps, {
      overrideVerification: true,
    });
    expect(res.activated).toBe(true);
    expect(statusSet).toHaveLength(1);
  });

  it('--override-verification GÜVENLİK kapılarını ATLAYAMAZ', async () => {
    const { deps, statusSet } = makeDeps({
      configured: false,
      hasDelivery: false,
    });
    await expect(
      runActivateIntegration('integ-1', deps, { overrideVerification: true }),
    ).rejects.toThrow(/adapter_configured/);
    expect(statusSet).toHaveLength(0);
  });

  it('dry-run: tüm kapılar geçse bile yazma yapmaz', async () => {
    const { deps, statusSet } = makeDeps();
    const res = await runActivateIntegration('integ-1', deps, { dryRun: true });
    expect(res.activated).toBe(false);
    expect(statusSet).toHaveLength(0);
  });

  it('zaten active -> no-op', async () => {
    const { deps, statusSet } = makeDeps({ rec: record({ status: 'active' }) });
    const res = await runActivateIntegration('integ-1', deps);
    expect(res.alreadyActive).toBe(true);
    expect(statusSet).toHaveLength(0);
  });

  it('entegrasyon bulunamazsa hata', async () => {
    const { deps } = makeDeps({ rec: null });
    await expect(runActivateIntegration('yok', deps)).rejects.toThrow(
      /bulunamadı/,
    );
  });

  it('id verilmezse hata', async () => {
    const { deps } = makeDeps();
    await expect(runActivateIntegration('  ', deps)).rejects.toThrow(
      /id gerekli/,
    );
  });

  it('birden fazla kapı düşerse HEPSİ raporlanır', async () => {
    const { deps } = makeDeps({
      configured: false,
      canResolve: false,
      hasDelivery: false,
    });
    await expect(runActivateIntegration('integ-1', deps)).rejects.toThrow(
      /adapter_configured[\s\S]*secret_resolvable[\s\S]*verification_delivery/,
    );
  });
});

describe('evaluateGates — kapı detayları secret DEĞERİ sızdırmaz', () => {
  it('detay metinleri yalnızca REFERANS adı içerir', () => {
    process.env.INTEGRATION_SECRET_PILOT_SANDBOX = 'super-gizli-deger';
    const { deps } = makeDeps({ canResolve: false });
    const gates = evaluateGates(record(), deps, false);
    const all = JSON.stringify(gates);
    expect(all).toContain('PILOT_SANDBOX');
    expect(all).not.toContain('super-gizli-deger');
    delete process.env.INTEGRATION_SECRET_PILOT_SANDBOX;
  });
});
