import {
  beginRotation,
  completeRotation,
  validateOverlapMinutes,
  DEFAULT_OVERLAP_MINUTES,
  type RotateSecretDeps,
  type RotationRecord,
} from './rotate-integration-secret.core';

function record(over: Partial<RotationRecord> = {}): RotationRecord {
  return {
    id: 'integ-1',
    provider: 'generic_signed_webhook',
    environment: 'sandbox',
    status: 'active',
    secretRef: 'PILOT_SANDBOX_V1',
    previousSecretRef: null,
    previousSecretExpiresAt: null,
    ...over,
  };
}

interface Calls {
  begin: { id: string; patch: Record<string, unknown> }[];
  complete: { id: string; patch: Record<string, unknown> }[];
}

function makeDeps(
  rec: RotationRecord | null,
  resolvableRefs: string[] = ['PILOT_SANDBOX_V1', 'PILOT_SANDBOX_V2'],
): { deps: RotateSecretDeps; calls: Calls } {
  const calls: Calls = { begin: [], complete: [] };
  const deps: RotateSecretDeps = {
    getIntegration: async () => rec,
    canResolveRef: (_record, ref) => resolvableRefs.includes(ref),
    applyBegin: async (id, patch) => {
      calls.begin.push({ id, patch });
    },
    applyComplete: async (id, patch) => {
      calls.complete.push({ id, patch });
    },
  };
  return { deps, calls };
}

describe('validateOverlapMinutes', () => {
  it('verilmezse varsayılan', () => {
    expect(validateOverlapMinutes(undefined)).toBe(DEFAULT_OVERLAP_MINUTES);
    expect(validateOverlapMinutes('')).toBe(DEFAULT_OVERLAP_MINUTES);
  });
  it('geçerli değer kabul edilir', () => {
    expect(validateOverlapMinutes('30')).toBe(30);
  });
  it('sıfır/negatif/aşırı/ondalık reddedilir', () => {
    expect(() => validateOverlapMinutes('0')).toThrow();
    expect(() => validateOverlapMinutes('-5')).toThrow();
    expect(() => validateOverlapMinutes('99999')).toThrow();
    expect(() => validateOverlapMinutes('1.5')).toThrow();
  });
});

describe('beginRotation — faz 1', () => {
  it('yeni ref primary olur, eski ref overlap penceresine taşınır', async () => {
    const { deps, calls } = makeDeps(record());
    const plan = await beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps, {
      overlapMinutes: 30,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(calls.begin).toHaveLength(1);
    expect(calls.begin[0].patch).toEqual({
      secret_ref: 'PILOT_SANDBOX_V2',
      previous_secret_ref: 'PILOT_SANDBOX_V1',
      previous_secret_expires_at: '2026-01-01T00:30:00.000Z',
    });
    expect(plan.phase).toBe('begin');
  });

  it("secret_last_rotated_at BEGIN'de set EDİLMEZ (yarım rotasyon tamamlanmış görünmemeli)", async () => {
    const { deps, calls } = makeDeps(record());
    await beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps);
    expect(Object.keys(calls.begin[0].patch)).not.toContain(
      'secret_last_rotated_at',
    );
  });

  it('yeni secret KAYDEDİLMEMİŞSE rotasyon başlatılmaz', async () => {
    const { deps, calls } = makeDeps(record(), ['PILOT_SANDBOX_V1']);
    await expect(
      beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps),
    ).rejects.toThrow(/çözülemiyor/);
    expect(calls.begin).toHaveLength(0);
  });

  it('devam eden rotasyon varken yeniden başlatılamaz', async () => {
    const { deps, calls } = makeDeps(
      record({
        previousSecretRef: 'PILOT_SANDBOX_V0',
        previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await expect(
      beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps),
    ).rejects.toThrow(/devam eden bir rotasyon/i);
    expect(calls.begin).toHaveLength(0);
  });

  it('yeni ref mevcut ile aynıysa reddedilir', async () => {
    const { deps } = makeDeps(record());
    await expect(
      beginRotation('integ-1', 'PILOT_SANDBOX_V1', deps),
    ).rejects.toThrow(/AYNI/);
  });

  it('env-uyumsuz yeni ref reddedilir', async () => {
    const { deps } = makeDeps(record());
    await expect(
      beginRotation('integ-1', 'pilot-sandbox-v2', deps),
    ).rejects.toThrow(/--new-secret-ref/);
  });

  it('dry-run yazma yapmaz', async () => {
    const { deps, calls } = makeDeps(record());
    const plan = await beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps, {
      dryRun: true,
    });
    expect(calls.begin).toHaveLength(0);
    expect(plan.newRef).toBe('PILOT_SANDBOX_V2');
  });

  it('entegrasyon bulunamazsa hata', async () => {
    const { deps } = makeDeps(null);
    await expect(
      beginRotation('yok', 'PILOT_SANDBOX_V2', deps),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe('completeRotation — faz 2', () => {
  const inRotation = record({
    secretRef: 'PILOT_SANDBOX_V2',
    previousSecretRef: 'PILOT_SANDBOX_V1',
    previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  it('eski ref temizlenir ve secret_last_rotated_at BURADA set edilir', async () => {
    const { deps, calls } = makeDeps(inRotation);
    const now = new Date('2026-02-01T12:00:00.000Z');
    await completeRotation('integ-1', deps, { now });
    expect(calls.complete).toHaveLength(1);
    expect(calls.complete[0].patch).toEqual({
      previous_secret_ref: null,
      previous_secret_expires_at: null,
      secret_last_rotated_at: '2026-02-01T12:00:00.000Z',
    });
  });

  it('devam eden rotasyon yoksa hata', async () => {
    const { deps, calls } = makeDeps(record());
    await expect(completeRotation('integ-1', deps)).rejects.toThrow(
      /Devam eden bir rotasyon yok/,
    );
    expect(calls.complete).toHaveLength(0);
  });

  it('yeni secret çözülemiyorsa tamamlama REDDEDİLİR (entegrasyonu kırmamak için)', async () => {
    const { deps, calls } = makeDeps(inRotation, ['PILOT_SANDBOX_V1']);
    await expect(completeRotation('integ-1', deps)).rejects.toThrow(
      /REDDEDİLDİ/,
    );
    expect(calls.complete).toHaveLength(0);
  });

  it('overlap süresi dolmuşsa uyarı verir ama tamamlar', async () => {
    const expired = record({
      secretRef: 'PILOT_SANDBOX_V2',
      previousSecretRef: 'PILOT_SANDBOX_V1',
      previousSecretExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const { deps, calls } = makeDeps(expired);
    const plan = await completeRotation('integ-1', deps);
    expect(plan.warnings.join(' ')).toMatch(/dolmuştu/);
    expect(calls.complete).toHaveLength(1);
  });

  it('dry-run yazma yapmaz', async () => {
    const { deps, calls } = makeDeps(inRotation);
    await completeRotation('integ-1', deps, { dryRun: true });
    expect(calls.complete).toHaveLength(0);
  });
});

describe('rotasyon lifecycle — uçtan uca (referans düzeyinde)', () => {
  it('begin -> complete sonrası yalnızca yeni ref kalır', async () => {
    let current = record();
    const calls: Calls = { begin: [], complete: [] };
    const deps: RotateSecretDeps = {
      getIntegration: async () => current,
      canResolveRef: (_r, ref) =>
        ['PILOT_SANDBOX_V1', 'PILOT_SANDBOX_V2'].includes(ref),
      applyBegin: async (id, patch) => {
        calls.begin.push({ id, patch });
        current = {
          ...current,
          secretRef: patch.secret_ref,
          previousSecretRef: patch.previous_secret_ref,
          previousSecretExpiresAt: patch.previous_secret_expires_at,
        };
      },
      applyComplete: async (id, patch) => {
        calls.complete.push({ id, patch });
        current = {
          ...current,
          previousSecretRef: null,
          previousSecretExpiresAt: null,
        };
      },
    };

    await beginRotation('integ-1', 'PILOT_SANDBOX_V2', deps);
    expect(current.secretRef).toBe('PILOT_SANDBOX_V2');
    expect(current.previousSecretRef).toBe('PILOT_SANDBOX_V1');

    await completeRotation('integ-1', deps);
    expect(current.secretRef).toBe('PILOT_SANDBOX_V2');
    expect(current.previousSecretRef).toBeNull();
    expect(current.previousSecretExpiresAt).toBeNull();
  });
});
