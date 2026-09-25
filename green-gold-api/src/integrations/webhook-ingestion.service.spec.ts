import { createHmac } from 'crypto';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhookIngestionService } from './webhook-ingestion.service';
import { ProviderRegistryService } from './provider-registry';
import {
  makeFakeSupabase,
  type FakeDataset,
  type FakeOptions,
} from '../../test/fake-supabase';

const SECRET = 'sandbox-secret-value';
const SECRET_REF = 'HOTEL_A_REF';

function integrationRow(over: Record<string, unknown> = {}) {
  return {
    id: 'integ-A',
    hotel_id: 'hotel-A',
    provider: 'generic_signed_webhook',
    environment: 'sandbox',
    status: 'active',
    external_property_id: 'prop-A',
    secret_ref: SECRET_REF,
    previous_secret_ref: null,
    previous_secret_expires_at: null,
    webhook_routing_id: 'routing-A',
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    provider: 'generic_signed_webhook',
    provider_event_id: 'evt-1',
    provider_reservation_id: 'res-1',
    property_id: 'prop-A',
    reservation_status: 'confirmed',
    occurred_at: new Date().toISOString(),
    greengold: {
      selected: true,
      amount_minor: 500,
      currency: 'EUR',
      payment_status: 'collected',
    },
    ...over,
  };
}

function signedRequest(body: object, secret = SECRET) {
  const raw = Buffer.from(JSON.stringify(body));
  const ts = String(Date.now());
  const sig = createHmac('sha256', secret)
    .update(`${ts}.`)
    .update(raw)
    .digest('hex');
  return {
    rawBody: raw,
    headers: {
      'x-greengold-signature': `sha256=${sig}`,
      'x-greengold-timestamp': ts,
    } as Record<string, string>,
  };
}

/** Varsayılan: RPC başarıyla 'processed' döner. */
function okRpc(): FakeOptions['rpc'] {
  return {
    ingest_reservation_event: (args) => ({
      data: { status: args.p_delivery_status as string, delivery_id: 'd1' },
      error: null,
    }),
  };
}

function makeService(dataset: FakeDataset, rpc = okRpc()) {
  const fake = makeFakeSupabase(dataset, { rpc });
  const service = new WebhookIngestionService(
    fake as never,
    new ProviderRegistryService(),
  );
  return { service, fake };
}

describe('WebhookIngestionService.ingest', () => {
  const originalEnv = process.env[`INTEGRATION_SECRET_${SECRET_REF}`];
  beforeAll(() => {
    process.env[`INTEGRATION_SECRET_${SECRET_REF}`] = SECRET;
  });
  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env[`INTEGRATION_SECRET_${SECRET_REF}`];
    } else {
      process.env[`INTEGRATION_SECRET_${SECRET_REF}`] = originalEnv;
    }
  });

  it('bilinmeyen provider -> 404, hiçbir kayıt yazılmaz', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(payload());
    await expect(
      service.ingest('unknown_provider', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.dataset.integration_deliveries ?? []).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('SynXis (henüz yapılandırılmadı) -> 503 provider_not_configured', async () => {
    const { service } = makeService({
      hotel_integrations: [
        integrationRow({
          provider: 'synxis',
          id: 'integ-synxis',
          webhook_routing_id: 'routing-synxis',
        }),
      ],
    });
    const { rawBody, headers } = signedRequest(payload({ provider: 'synxis' }));
    await expect(
      service.ingest('synxis', 'routing-synxis', rawBody, headers),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('bilinmeyen routing id -> 404, hiçbir kayıt yazılmaz', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(payload());
    await expect(
      service.ingest(
        'generic_signed_webhook',
        'yok-boyle-routing',
        rawBody,
        headers,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.dataset.integration_deliveries ?? []).toHaveLength(0);
  });

  it('entegrasyon aktif değilse (pending) -> 403, domain RPC hiç çağrılmaz', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow({ status: 'pending' })],
    });
    const { rawBody, headers } = signedRequest(payload());
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('#11 yanlış imza -> 401, delivery reddedildi olarak loglanır, domain RPC YOK', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(payload(), 'wrong-secret');
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(fake.rpcCalls).toHaveLength(0);
    const deliveries = fake.dataset.integration_deliveries ?? [];
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].processing_status).toBe('rejected_bad_signature');
    expect(deliveries[0].signature_verified).toBe(false);
  });

  it('production environment -> secret çözülemez (fail closed), 401 + secret_not_resolvable', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow({ environment: 'production' })],
    });
    // İmza DOĞRU secret ile atılmış olsa bile: production resolver hiçbir
    // aday secret döndürmez -> doğrulama yapılamaz.
    const { rawBody, headers } = signedRequest(payload());
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(fake.rpcCalls).toHaveLength(0);
    const deliveries = fake.dataset.integration_deliveries ?? [];
    expect(deliveries[0].error_code).toBe('secret_not_resolvable');
  });

  it('#12 property_id eşleşmiyorsa -> 403, domain RPC YOK (tenant saldırı koruması)', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(
      payload({ property_id: 'prop-BASKA-OTEL' }),
    );
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fake.rpcCalls).toHaveLength(0);
    const deliveries = fake.dataset.integration_deliveries ?? [];
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].error_code).toBe('property_id_mismatch');
  });

  it('geçerli event -> TEK atomik RPC çağrısı, doğru argümanlarla', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(payload());
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );
    expect(res.status).toBe('processed');

    // Domain yazımı TEK çağrıda — ayrı ayrı insert/update YOK.
    expect(fake.rpcCalls).toHaveLength(1);
    const call = fake.rpcCalls[0];
    expect(call.name).toBe('ingest_reservation_event');
    expect(call.args.p_integration_id).toBe('integ-A');
    expect(call.args.p_provider_event_id).toBe('evt-1');
    expect(call.args.p_provider_reservation_id).toBe('res-1');
    expect(call.args.p_delivery_status).toBe('processed');
    // Optimistic concurrency temeli: rezervasyon yoktu.
    expect(call.args.p_expected_reservation_exists).toBe(false);
    expect(call.args.p_expected_provider_updated_at).toBeNull();
    expect(call.args.p_reservation_patch).toEqual(
      expect.objectContaining({ booking_status: 'confirmed' }),
    );
    expect(call.args.p_contribution_patch).toEqual(
      expect.objectContaining({ amount_minor: 500, status: 'collected' }),
    );
  });

  it("TENANT BAĞI: hotel_id ve provider RPC'ye GÖNDERİLMEZ (RPC kendisi türetir)", async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
    });
    const { rawBody, headers } = signedRequest(payload());
    await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );

    const args = fake.rpcCalls[0].args;
    // Çağıran taraf tenant bağını BELİRLEYEMEZ — bu, service katmanındaki
    // olası bir programlama hatasının çapraz tenant kayıt üretmesini önler.
    expect(args).not.toHaveProperty('p_hotel_id');
    expect(args).not.toHaveProperty('p_provider');
    // RPC'nin bağı çözebilmesi için gereken tek girdi: integration id.
    expect(args.p_integration_id).toBe('integ-A');
    // property_id ikinci savunması için snapshot'ta taşınır.
    expect(args.p_normalized_snapshot).toEqual(
      expect.objectContaining({ property_id: 'prop-A' }),
    );
  });

  it("mevcut rezervasyon varsa optimistic baseline RPC'ye taşınır", async () => {
    const prevUpdated = '2026-01-01T09:00:00.000Z';
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
      reservations: [
        {
          id: 'r1',
          integration_id: 'integ-A',
          provider_reservation_id: 'res-1',
          booking_status: 'confirmed',
          provider_updated_at: prevUpdated,
        },
      ],
      contributions: [
        {
          id: 'c1',
          reservation_id: 'r1',
          status: 'collected',
          currency: 'EUR',
          amount_minor: 500,
        },
      ],
    });
    const { rawBody, headers } = signedRequest(
      payload({ reservation_status: 'stayed' }),
    );
    await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );

    const call = fake.rpcCalls[0];
    expect(call.args.p_expected_reservation_exists).toBe(true);
    expect(call.args.p_expected_provider_updated_at).toBe(prevUpdated);
  });

  it('#3 replay: RPC already_processed dönerse aynen yüzeye çıkar (finansal state değişmez)', async () => {
    const { service, fake } = makeService(
      { hotel_integrations: [integrationRow()] },
      {
        ingest_reservation_event: () => ({
          data: { status: 'already_processed' },
          error: null,
        }),
      },
    );
    const { rawBody, headers } = signedRequest(payload());
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );
    expect(res.status).toBe('already_processed');
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it('RPC 40001 (bayat karar / eşzamanlı güncelleme) -> 503 retryable, kısmi state yok', async () => {
    const { service } = makeService(
      { hotel_integrations: [integrationRow()] },
      {
        ingest_reservation_event: () => ({
          data: null,
          error: { code: '40001', message: 'stale decision' } as never,
        }),
      },
    );
    const { rawBody, headers } = signedRequest(payload());
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("stale/out-of-order event -> reject kararı RPC'ye taşınır, contribution patch YOK", async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
      reservations: [
        {
          id: 'r1',
          integration_id: 'integ-A',
          provider_reservation_id: 'res-1',
          booking_status: 'stayed',
          // Gelecekteki bir zaman: gelen event bunun ÖNCESİNDE kalıyor.
          provider_updated_at: '2099-01-01T00:00:00.000Z',
        },
      ],
    });
    const { rawBody, headers } = signedRequest(payload());
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );

    expect(res.status).toBe('rejected_out_of_order');
    const call = fake.rpcCalls[0];
    expect(call.args.p_delivery_status).toBe('rejected_out_of_order');
    // Hiçbir domain patch'i taşınmıyor -> RPC hiçbir state değiştirmeyecek.
    expect(call.args.p_reservation_patch).toBeNull();
    expect(call.args.p_contribution_patch).toBeNull();
  });

  it('manual_review (no_show kararı bekliyor) -> contribution patch YOK, reservation patch VAR', async () => {
    const { service, fake } = makeService({
      hotel_integrations: [integrationRow()],
      reservations: [
        {
          id: 'r1',
          integration_id: 'integ-A',
          provider_reservation_id: 'res-1',
          booking_status: 'confirmed',
          provider_updated_at: '2026-01-01T09:00:00.000Z',
        },
      ],
      contributions: [
        {
          id: 'c1',
          reservation_id: 'r1',
          status: 'collected',
          currency: 'EUR',
          amount_minor: 500,
        },
      ],
    });
    const { rawBody, headers } = signedRequest(
      payload({ reservation_status: 'no_show' }),
    );
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );

    expect(res.status).toBe('manual_review');
    const call = fake.rpcCalls[0];
    expect(call.args.p_error_code).toBe('no_show_payment_decision_pending');
    expect(call.args.p_reservation_patch).toEqual(
      expect.objectContaining({ booking_status: 'no_show' }),
    );
    // Finansal veriye DOKUNULMUYOR.
    expect(call.args.p_contribution_patch).toBeNull();
  });

  it('tenant izolasyonu: Otel B routing + Otel A property_id -> 403, domain RPC YOK', async () => {
    process.env.INTEGRATION_SECRET_HOTEL_B_REF = SECRET;
    const { service, fake } = makeService({
      hotel_integrations: [
        integrationRow(),
        integrationRow({
          id: 'integ-B',
          hotel_id: 'hotel-B',
          external_property_id: 'prop-B',
          webhook_routing_id: 'routing-B',
          secret_ref: 'HOTEL_B_REF',
        }),
      ],
    });

    const { rawBody, headers } = signedRequest(
      payload({ property_id: 'prop-A' }),
    );
    await expect(
      service.ingest('generic_signed_webhook', 'routing-B', rawBody, headers),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fake.rpcCalls).toHaveLength(0);
    delete process.env.INTEGRATION_SECRET_HOTEL_B_REF;
  });
});

describe('WebhookIngestionService — rotasyon overlap penceresi', () => {
  const OLD_REF = 'HOTEL_A_OLD_REF';
  const OLD_SECRET = 'previous-sandbox-secret';

  beforeAll(() => {
    process.env[`INTEGRATION_SECRET_${SECRET_REF}`] = SECRET;
    process.env[`INTEGRATION_SECRET_${OLD_REF}`] = OLD_SECRET;
  });
  afterAll(() => {
    delete process.env[`INTEGRATION_SECRET_${SECRET_REF}`];
    delete process.env[`INTEGRATION_SECRET_${OLD_REF}`];
  });

  it('overlap açıkken ESKİ secret ile imzalanmış event kabul edilir', async () => {
    const { service } = makeService({
      hotel_integrations: [
        integrationRow({
          previous_secret_ref: OLD_REF,
          previous_secret_expires_at: new Date(
            Date.now() + 60_000,
          ).toISOString(),
        }),
      ],
    });
    const { rawBody, headers } = signedRequest(payload(), OLD_SECRET);
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );
    expect(res.status).toBe('processed');
  });

  it('overlap SÜRESİ DOLDUYSA eski secret reddedilir (401)', async () => {
    const { service } = makeService({
      hotel_integrations: [
        integrationRow({
          previous_secret_ref: OLD_REF,
          previous_secret_expires_at: new Date(
            Date.now() - 60_000,
          ).toISOString(),
        }),
      ],
    });
    const { rawBody, headers } = signedRequest(payload(), OLD_SECRET);
    await expect(
      service.ingest('generic_signed_webhook', 'routing-A', rawBody, headers),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('overlap açıkken YENİ secret de kabul edilir', async () => {
    const { service } = makeService({
      hotel_integrations: [
        integrationRow({
          previous_secret_ref: OLD_REF,
          previous_secret_expires_at: new Date(
            Date.now() + 60_000,
          ).toISOString(),
        }),
      ],
    });
    const { rawBody, headers } = signedRequest(payload(), SECRET);
    const res = await service.ingest(
      'generic_signed_webhook',
      'routing-A',
      rawBody,
      headers,
    );
    expect(res.status).toBe('processed');
  });
});
