import {
  validateIntegrationInput,
  planCreateIntegration,
  runCreateIntegration,
  activationBlockedReasonFor,
  webhookUrlFor,
  type CreateIntegrationDeps,
  type ExistingIntegration,
  type HotelRef,
} from './create-integration.core';

const VALID_RAW = {
  hotelKey: 'wk-123',
  provider: 'generic_signed_webhook',
  environment: 'sandbox',
  externalPropertyId: 'prop-A',
  productCode: 'GG-EXTRA',
  secretRef: 'PRINCES_PALACE_SANDBOX',
};

describe('validateIntegrationInput', () => {
  it('geçerli girdi kabul edilir', () => {
    const input = validateIntegrationInput(VALID_RAW);
    expect(input.provider).toBe('generic_signed_webhook');
    expect(input.environment).toBe('sandbox');
  });

  it('environment verilmezse sandbox varsayılır', () => {
    const input = validateIntegrationInput({
      ...VALID_RAW,
      environment: undefined,
    });
    expect(input.environment).toBe('sandbox');
  });

  it('registry dışı provider reddedilir', () => {
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, provider: 'opera_pms' }),
    ).toThrow(/--provider/);
  });

  it('geçersiz environment reddedilir', () => {
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, environment: 'staging' }),
    ).toThrow(/--environment/);
  });

  it('zorunlu alanlar eksikse reddedilir', () => {
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, hotelKey: '' }),
    ).toThrow(/--hotel-key/);
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, externalPropertyId: '  ' }),
    ).toThrow(/--external-property-id/);
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, productCode: undefined }),
    ).toThrow(/--product-code/);
  });

  it('env-uyumsuz secret ref reddedilir (tire/küçük harf)', () => {
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, secretRef: 'princes-palace' }),
    ).toThrow(/--secret-ref/);
    expect(() =>
      validateIntegrationInput({ ...VALID_RAW, secretRef: 'lower_case' }),
    ).toThrow(/--secret-ref/);
  });
});

const HOTEL: HotelRef = { id: 'h1', name: 'Pilot Otel', hotelCode: 'HTL-1' };

function makeDeps(
  hotel: HotelRef | null,
  existing: ExistingIntegration[] = [],
): {
  deps: CreateIntegrationDeps;
  inserted: Record<string, unknown>[];
  lookedUpKeys: string[];
} {
  const inserted: Record<string, unknown>[] = [];
  const lookedUpKeys: string[] = [];
  const deps: CreateIntegrationDeps = {
    findHotelByExactKey: async (key) => {
      lookedUpKeys.push(key);
      return hotel;
    },
    listIntegrationsForHotel: async () => existing,
    insertIntegration: async (row) => {
      inserted.push(row);
      return { id: 'integ-1', webhook_routing_id: 'routing-uuid-1' };
    },
  };
  return { deps, inserted, lookedUpKeys };
}

describe('planCreateIntegration', () => {
  it('oteli EXACT key ile çözer (LIKE/isim araması yok)', async () => {
    const { deps, lookedUpKeys } = makeDeps(HOTEL);
    const plan = await planCreateIntegration(
      validateIntegrationInput(VALID_RAW),
      deps,
    );
    expect(plan.hotel.id).toBe('h1');
    expect(lookedUpKeys).toEqual(['wk-123']);
  });

  it('otel bulunamazsa hata', async () => {
    const { deps } = makeDeps(null);
    await expect(
      planCreateIntegration(validateIntegrationInput(VALID_RAW), deps),
    ).rejects.toThrow(/Otel bulunamadı/);
  });

  it('aynı kapsamda entegrasyon varsa REDDEDER (duplicate)', async () => {
    const { deps } = makeDeps(HOTEL, [
      {
        id: 'existing',
        provider: 'generic_signed_webhook',
        environment: 'sandbox',
        externalPropertyId: 'prop-A',
        status: 'active',
      },
    ]);
    await expect(
      planCreateIntegration(validateIntegrationInput(VALID_RAW), deps),
    ).rejects.toThrow(/ZATEN VAR/);
  });

  it('farklı environment aynı property -> çakışma DEĞİL', async () => {
    const { deps } = makeDeps(HOTEL, [
      {
        id: 'existing',
        provider: 'generic_signed_webhook',
        environment: 'production',
        externalPropertyId: 'prop-A',
        status: 'pending',
      },
    ]);
    const plan = await planCreateIntegration(
      validateIntegrationInput(VALID_RAW),
      deps,
    );
    expect(plan.status).toBe('pending');
  });

  it('plan her zaman pending — asla active', async () => {
    const { deps } = makeDeps(HOTEL);
    const plan = await planCreateIntegration(
      validateIntegrationInput(VALID_RAW),
      deps,
    );
    expect(plan.status).toBe('pending');
  });
});

describe('runCreateIntegration', () => {
  it('pending kayıt ekler ve routing id döndürür', async () => {
    const { deps, inserted } = makeDeps(HOTEL);
    const res = await runCreateIntegration(
      validateIntegrationInput(VALID_RAW),
      deps,
    );
    expect(res.integrationId).toBe('integ-1');
    expect(res.webhookRoutingId).toBe('routing-uuid-1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe('pending');
    expect(inserted[0].secret_ref).toBe('PRINCES_PALACE_SANDBOX');
  });

  it('GERÇEK SECRET asla insert edilmez / sonuçta yer almaz', async () => {
    const { deps, inserted } = makeDeps(HOTEL);
    const res = await runCreateIntegration(
      validateIntegrationInput(VALID_RAW),
      deps,
    );
    // Yalnızca REFERANS taşınır; secret değeri için alan bile yoktur.
    expect(Object.keys(inserted[0])).not.toContain('secret');
    expect(JSON.stringify(res)).not.toMatch(/secret"?\s*:\s*"[^"]{20,}/);
  });

  it('çakışma varsa YARIM KAYIT oluşmaz (insert hiç çağrılmaz)', async () => {
    const { deps, inserted } = makeDeps(HOTEL, [
      {
        id: 'existing',
        provider: 'generic_signed_webhook',
        environment: 'sandbox',
        externalPropertyId: 'prop-A',
        status: 'pending',
      },
    ]);
    await expect(
      runCreateIntegration(validateIntegrationInput(VALID_RAW), deps),
    ).rejects.toThrow(/ZATEN VAR/);
    expect(inserted).toHaveLength(0);
  });

  it('SynXis kaydı OLUŞTURULABİLİR ama aktivasyon engeli taşır', async () => {
    const { deps } = makeDeps(HOTEL);
    const res = await runCreateIntegration(
      validateIntegrationInput({ ...VALID_RAW, provider: 'synxis' }),
      deps,
    );
    expect(res.status).toBe('pending');
    expect(res.activationBlockedReason).toMatch(/not_configured/);
  });
});

describe('activationBlockedReasonFor', () => {
  it('synxis -> engelli', () => {
    expect(activationBlockedReasonFor('synxis', 'sandbox')).toMatch(
      /not_configured/,
    );
  });

  it('production -> secrets manager yok, engelli', () => {
    expect(
      activationBlockedReasonFor('generic_signed_webhook', 'production'),
    ).toMatch(/secrets manager/);
  });

  it('sandbox + yapılandırılmış adapter -> engel yok', () => {
    expect(
      activationBlockedReasonFor('generic_signed_webhook', 'sandbox'),
    ).toBeNull();
  });
});

describe('webhookUrlFor', () => {
  it('URL yalnızca base + provider + routing id ile üretilir', () => {
    expect(
      webhookUrlFor('https://api.example.com', 'generic_signed_webhook', 'r1'),
    ).toBe(
      'https://api.example.com/integrations/webhooks/generic_signed_webhook/r1',
    );
  });

  it('sondaki slash tekrarlanmaz', () => {
    expect(webhookUrlFor('https://api.example.com/', 'synxis', 'r2')).toBe(
      'https://api.example.com/integrations/webhooks/synxis/r2',
    );
  });
});
