import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhookIngestionService } from '../webhook-ingestion.service';
import { ProviderRegistryService } from '../provider-registry';
import {
  makeFakeSupabase,
  type FakeOptions,
} from '../../../test/fake-supabase';
import { hrPushBody, hrReservation } from '../../../test/hotelrunner-fixtures';
import { HotelRunnerPollService } from './hotelrunner-poll.service';
import {
  HotelRunnerClient,
  type FetchLike,
  type HotelRunnerCredentials,
} from './hotelrunner.client';

const TOKEN = 'hr-sandbox-token';
const SECRET_REF = 'HR_PILOT_REF';

function hrIntegration(over: Record<string, unknown> = {}) {
  return {
    id: 'integ-HR',
    hotel_id: 'hotel-HR',
    provider: 'hotelrunner',
    environment: 'sandbox',
    status: 'active',
    external_property_id: '12345',
    product_code: 'GREENGOLD',
    secret_ref: SECRET_REF,
    previous_secret_ref: null,
    previous_secret_expires_at: null,
    webhook_routing_id: 'routing-HR',
    ...over,
  };
}

function okRpc(): FakeOptions['rpc'] {
  return {
    ingest_reservation_event: (args) => ({
      data: { status: args.p_delivery_status as string },
      error: null,
    }),
  };
}

function makeIngestion(rows = [hrIntegration()], rpc = okRpc()) {
  const fake = makeFakeSupabase({ hotel_integrations: rows }, { rpc });
  const service = new WebhookIngestionService(
    fake as never,
    new ProviderRegistryService(),
  );
  return { fake, service };
}

beforeAll(() => {
  process.env[`INTEGRATION_SECRET_${SECRET_REF}`] = TOKEN;
});
afterAll(() => {
  delete process.env[`INTEGRATION_SECRET_${SECRET_REF}`];
});

describe('HotelRunner push -> WebhookIngestionService', () => {
  const query = { token: TOKEN, hr_id: '12345' };

  it('partideki her rezervasyon ayrı atomik RPC ile uygulanır', async () => {
    const { fake, service } = makeIngestion();
    const res = await service.ingest(
      'hotelrunner',
      'routing-HR',
      hrPushBody([
        hrReservation(),
        hrReservation({ hr_number: 'R2', rooms: [] }),
      ]),
      {},
      query,
    );
    expect(res).toEqual({
      status: 'batch_processed',
      events: ['processed', 'processed'],
    });
    const calls = fake.rpcCalls.filter(
      (c) => c.name === 'ingest_reservation_event',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_contribution_patch).toEqual(
      expect.objectContaining({
        selected: true,
        amount_minor: 3750,
        currency: 'TRY',
        status: 'pending',
      }),
    );
    expect(calls[1].args.p_contribution_patch).toEqual(
      expect.objectContaining({ selected: false, status: 'voided' }),
    );
  });

  it("bozuk rezervasyon audit'e yazılır, diğeri yine işlenir", async () => {
    const { fake, service } = makeIngestion();
    const res = await service.ingest(
      'hotelrunner',
      'routing-HR',
      hrPushBody([hrReservation({ state: 'mystery' }), hrReservation()]),
      {},
      query,
    );
    expect(res.events).toEqual(['rejected', 'processed']);
    const deliveries = fake.dataset.integration_deliveries ?? [];
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].error_code).toBe('unsupported_reservation_state');
  });

  it('yanlış token -> 401, domain yazımı yok', async () => {
    const { fake, service } = makeIngestion();
    await expect(
      service.ingest(
        'hotelrunner',
        'routing-HR',
        hrPushBody([hrReservation()]),
        {},
        {
          token: 'wrong-token-value',
          hr_id: '12345',
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('token doğru ama hr_id başka bir otelin -> property_id_mismatch', async () => {
    const { fake, service } = makeIngestion();
    await expect(
      service.ingest(
        'hotelrunner',
        'routing-HR',
        hrPushBody([hrReservation()]),
        {},
        {
          token: TOKEN,
          hr_id: '99999',
        },
      ),
    ).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.dataset.integration_deliveries?.[0].error_code).toBe(
      'property_id_mismatch',
    );
  });

  it('eşzamanlı çakışma -> parti bitince 503 (sağlayıcı tekrar gönderir)', async () => {
    let n = 0;
    const { fake, service } = makeIngestion([hrIntegration()], {
      ingest_reservation_event: (args) =>
        ++n === 1
          ? { data: null, error: { code: '40001', message: 'retry' } }
          : { data: { status: args.p_delivery_status as string }, error: null },
    });
    await expect(
      service.ingest(
        'hotelrunner',
        'routing-HR',
        hrPushBody([hrReservation(), hrReservation({ hr_number: 'R2' })]),
        {},
        query,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    // İkinci rezervasyon yine de denendi.
    expect(fake.rpcCalls).toHaveLength(2);
  });
});

describe('HotelRunnerClient', () => {
  it('rezervasyonları undelivered=false ile okur; hata mesajında token yok', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      urls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ reservations: [hrReservation()] }),
      });
    };
    const client = new HotelRunnerClient(
      { token: TOKEN, hrId: '12345' },
      fetchImpl,
    );
    const list = await client.listReservationsUpdatedSince('2026-10-26', 1, 50);
    expect(list).toHaveLength(1);
    const params = new URL(urls[0]).searchParams;
    expect(params.get('undelivered')).toBe('false');
    expect(params.get('from_last_update_date')).toBe('2026-10-26');
    expect(params.get('hr_id')).toBe('12345');

    const failing = new HotelRunnerClient({ token: TOKEN, hrId: '12345' }, () =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }),
    );
    const err = await failing.listRooms().catch((e: Error) => e);
    expect((err as Error).message).toContain('HTTP 401');
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe('HotelRunnerPollService', () => {
  class TestPoll extends HotelRunnerPollService {
    pages: unknown[][] = [];
    seen: HotelRunnerCredentials[] = [];
    protected createClient(creds: HotelRunnerCredentials): HotelRunnerClient {
      this.seen.push(creds);
      let page = 0;
      return new HotelRunnerClient(creds, () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ reservations: this.pages[page++] ?? [] }),
        }),
      );
    }
  }

  it('aktif entegrasyonun rezervasyonlarını push ile aynı çekirdekten uygular', async () => {
    const { fake, service } = makeIngestion();
    const poll = new TestPoll(fake as never, service);
    poll.pages = [[hrReservation()]];
    const res = await poll.pollAll(new Date('2026-10-28T12:00:00Z'));
    expect(res).toEqual([
      { integration_id: 'integ-HR', reservations: 1, status: 'ok' },
    ]);
    expect(poll.seen).toEqual([{ token: TOKEN, hrId: '12345' }]);
    expect(
      fake.rpcCalls.filter((c) => c.name === 'ingest_reservation_event'),
    ).toHaveLength(1);
  });

  it('secret çözülemezse HotelRunner çağrılmaz', async () => {
    const { fake, service } = makeIngestion([
      hrIntegration({ secret_ref: 'MISSING_REF' }),
    ]);
    const poll = new TestPoll(fake as never, service);
    const res = await poll.pollAll();
    expect(res[0].status).toBe('secret_not_resolvable');
    expect(poll.seen).toHaveLength(0);
  });
});
