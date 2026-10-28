import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { CarbonMeasurementService } from './carbon-measurement.service';
import type { CarbonProviderRegistryService } from './carbon-provider-registry';
import {
  CarbonProviderRequestError,
  type CarbonProviderAdapter,
  type EmissionReplyInput,
  type EmissionResource,
  type ReplyDocument,
} from './carbon-provider.interface';
import {
  CarbonDataEntryService,
  buildReply,
} from './carbon-data-entry.service';
import {
  ThreePMetricsAdapter,
  parseEmissionResource,
} from './adapters/threepmetrics.adapter';
import type { CreateEntryDto } from './dto/create-entry.dto';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

const LINK_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';

const ELECTRICITY: EmissionResource = {
  slug: 'electricity-consumption',
  title: 'Elektrik Tüketimi',
  header: 'Elektrik tüketim bilgilerini giriniz',
  description: null,
  ghgScope: { id: 2, name: 'Scope 2' },
  systemOptions: {
    description: 'Birim Seçimi',
    options: [
      { name: 'Kilowatt-saat', value: '1' },
      { name: 'Megawatt-saat', value: '2' },
    ],
  },
  userOptions: null,
  inputMode: null,
  requiredFields: [],
};

const FLIGHT: EmissionResource = {
  slug: 'business-flights',
  title: 'İş Seyahati Uçuşları',
  header: null,
  description: null,
  ghgScope: { id: 3, name: 'Scope 3' },
  systemOptions: null,
  userOptions: null,
  inputMode: 'flight-route-v1',
  requiredFields: ['flightDate', 'departureIata', 'arrivalIata'],
};

class FakeAdapter implements CarbonProviderAdapter {
  readonly provider = 'threepmetrics';
  readonly configured = true;
  replies: EmissionReplyInput[] = [];
  documents: { replyId: number; document: ReplyDocument }[] = [];
  replyFailure?: Error;

  listAccounts() {
    return Promise.resolve([{ externalAccountId: 'otel-a', name: 'Otel A' }]);
  }
  listUnits() {
    return Promise.resolve([
      { externalUnitId: 'merkez', name: 'Merkez Bina', type: 'Other' },
    ]);
  }
  getCarbonSummary(): Promise<never> {
    return Promise.reject(new Error('kullanılmaz'));
  }
  listEmissionResources() {
    return Promise.resolve([ELECTRICITY, FLIGHT]);
  }
  lookupAirports() {
    return Promise.resolve([
      { iata: 'IST', name: 'IST', city: null, country: null },
    ]);
  }
  createReply(_c: unknown, input: EmissionReplyInput) {
    this.replies.push(input);
    if (this.replyFailure) return Promise.reject(this.replyFailure);
    return Promise.resolve({ replyId: 12345, message: 'ok' });
  }
  uploadReplyDocument(_c: unknown, replyId: number, document: ReplyDocument) {
    this.documents.push({ replyId, document });
    return Promise.resolve({ fileName: document.fileName });
  }
}

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: LINK_ID,
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  environment: 'sandbox',
  status: 'active',
  external_property_id: 'otel-a',
  external_property_name: 'Otel A',
  authorization_ref: 'PILOT_HOTEL',
  provider_member_id: null,
  linked_at: '2026-10-01T00:00:00.000Z',
  revoked_at: null,
  ...over,
});

function makeService(dataset: FakeDataset = {}, adapter = new FakeAdapter()) {
  const fake = makeFakeSupabase(
    {
      carbon_provider_links: [linkRow()],
      carbon_provider_entries: [],
      ...dataset,
    },
    {
      uniqueBy: { carbon_provider_entries: ['hotel_id', 'idempotency_key'] },
    },
  );
  const registry = {
    resolve: (p: string) => (p === adapter.provider ? adapter : undefined),
    statuses: () => [],
  } as unknown as CarbonProviderRegistryService;
  const measurement = new CarbonMeasurementService(fake as never, registry, {
    get: () => undefined,
  } as never);
  measurement.credentials = {
    name: 'test',
    supportedEnvironments: ['sandbox'],
    resolve: () => Promise.resolve({ apiKey: 'k' }),
    has: () => Promise.resolve(true),
  };
  const service = new CarbonDataEntryService(fake as never, measurement);
  return { service, fake, adapter };
}

const dto = (over: Partial<CreateEntryDto> = {}): CreateEntryDto => ({
  idempotency_key: KEY,
  unit_id: 'merkez',
  resource_slug: 'electricity-consumption',
  date: '2026-09-30',
  value: '15000',
  system_option_value: '1',
  confirm_irreversible: true,
  ...over,
});

describe('buildReply — kaynak tanımına göre doğrulama', () => {
  it('miktar + sistem seçeneği -> dokümandaki istek', () => {
    expect(buildReply(dto(), ELECTRICITY, 'otel-a')).toEqual({
      customerSlug: 'otel-a',
      customerUnitSlug: 'merkez',
      emissionResourceSlug: 'electricity-consumption',
      date: '2026-09-30',
      value: '15000',
      systemOptionValue: '1',
      userOptionValue: undefined,
    });
  });

  it('sistem seçeneği olan kaynakta seçenek zorunlu', () => {
    expect(() =>
      buildReply(dto({ system_option_value: undefined }), ELECTRICITY, 'a'),
    ).toThrow('Birim Seçimi seçilmeli.');
  });

  it('listede olmayan seçenek reddedilir', () => {
    expect(() =>
      buildReply(dto({ system_option_value: '9' }), ELECTRICITY, 'a'),
    ).toThrow(BadRequestException);
  });

  it('seçenek grubu olmayan kaynağa seçenek gönderilemez', () => {
    expect(() =>
      buildReply(dto({ user_option_value: '1' }), ELECTRICITY, 'a'),
    ).toThrow('Bu kaynak seçenek almaz.');
  });

  it('miktar sıfır olamaz', () => {
    expect(() => buildReply(dto({ value: '0' }), ELECTRICITY, 'a')).toThrow(
      'Miktar sıfırdan büyük olmalı.',
    );
  });

  it('uçuş kaynağı: miktar yerine rota, value gönderilmez', () => {
    const reply = buildReply(
      dto({
        resource_slug: 'business-flights',
        value: undefined,
        system_option_value: undefined,
        flight_name: 'TK 1983',
        departure_iata: 'IST',
        arrival_iata: 'LHR',
      }),
      FLIGHT,
      'a',
    );
    expect(reply.value).toBeUndefined();
    expect(reply.flight).toEqual({
      passengerOrFlightName: 'TK 1983',
      departureIata: 'IST',
      arrivalIata: 'LHR',
    });
  });

  it('uçuş kaynağında eksik rota veya aynı havalimanı reddedilir', () => {
    const base = dto({
      resource_slug: 'business-flights',
      value: undefined,
      system_option_value: undefined,
    });
    expect(() => buildReply(base, FLIGHT, 'a')).toThrow(BadRequestException);
    expect(() =>
      buildReply(
        {
          ...base,
          flight_name: 'TK1',
          departure_iata: 'IST',
          arrival_iata: 'IST',
        },
        FLIGHT,
        'a',
      ),
    ).toThrow('Kalkış ve varış havalimanı aynı olamaz.');
  });

  it('bilinmeyen inputMode için kayıt yazılmaz', () => {
    expect(() =>
      buildReply(dto(), { ...ELECTRICITY, inputMode: 'meter-v2' }, 'a'),
    ).toThrow(/henüz desteklenmiyor/);
  });
});

describe('CarbonDataEntryService.createEntry', () => {
  it("3pmetrics'e yazar, yerel kaydı 'sent' + replyId ile tutar", async () => {
    const { service, fake, adapter } = makeService();
    const res = await service.createEntry('hotel-A', 'user-1', dto());
    expect(res.replayed).toBe(false);
    expect(res.entry).toEqual(
      expect.objectContaining({
        status: 'sent',
        reply_id: 12345,
        unit_name: 'Merkez Bina',
        resource_title: 'Elektrik Tüketimi',
        ghg_scope: 'Scope 2',
        value: 15000,
        system_option: { value: '1', label: 'Kilowatt-saat' },
      }),
    );
    expect(adapter.replies).toHaveLength(1);
    expect(adapter.replies[0].memberId).toBeUndefined();
    expect(fake.dataset.carbon_provider_entries?.[0].created_by).toBe('user-1');
  });

  it('aynı idempotency anahtarı ikinci kez 3pmetrics çağrısı yapmaz', async () => {
    const { service, adapter } = makeService();
    await service.createEntry('hotel-A', 'user-1', dto());
    const again = await service.createEntry('hotel-A', 'user-1', dto());
    expect(again.replayed).toBe(true);
    expect(adapter.replies).toHaveLength(1);
  });

  it('aynı birim/kaynak/tarih/seçenek -> onaysız 409, onayla gönderilir', async () => {
    const { service, adapter } = makeService();
    await service.createEntry('hotel-A', 'user-1', dto());
    const second = dto({
      idempotency_key: '44444444-4444-4444-8444-444444444444',
    });
    await expect(
      service.createEntry('hotel-A', 'user-1', second),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(adapter.replies).toHaveLength(1);
    await service.createEntry('hotel-A', 'user-1', {
      ...second,
      allow_duplicate: true,
    });
    expect(adapter.replies).toHaveLength(2);
  });

  it("link'te üye kimliği varsa memberId gönderilir", async () => {
    const { service, adapter } = makeService({
      carbon_provider_links: [linkRow({ provider_member_id: 'member-7' })],
    });
    await service.createEntry('hotel-A', 'user-1', dto());
    expect(adapter.replies[0].memberId).toBe('member-7');
  });

  it('hesapta olmayan birim reddedilir, 3pmetrics yazılmaz', async () => {
    const { service, adapter } = makeService();
    await expect(
      service.createEntry('hotel-A', 'u', dto({ unit_id: 'baska-otel' })),
    ).rejects.toThrow('Seçilen birim 3pmetrics hesabınızda bulunamadı.');
    expect(adapter.replies).toHaveLength(0);
  });

  it('ileri tarih reddedilir', async () => {
    const { service } = makeService();
    await expect(
      service.createEntry('hotel-A', 'u', dto({ date: '2999-01-01' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("yanıt alınamazsa 'outcome_unknown' — otomatik tekrar yok", async () => {
    const adapter = new FakeAdapter();
    adapter.replyFailure = new CarbonProviderRequestError(
      'outcome_unknown',
      'timeout',
    );
    const { service, fake } = makeService({}, adapter);
    const failure = (await service
      .createEntry('hotel-A', 'u', dto())
      .catch((e: unknown) => e)) as HttpException;
    expect(failure.getStatus()).toBe(504);
    expect(adapter.replies).toHaveLength(1);
    expect(fake.dataset.carbon_provider_entries?.[0].status).toBe(
      'outcome_unknown',
    );
  });

  it("3pmetrics reddederse 'failed' kaydı kalır", async () => {
    const adapter = new FakeAdapter();
    adapter.replyFailure = new CarbonProviderRequestError(
      'invalid_request',
      '422',
      422,
    );
    const { service, fake } = makeService({}, adapter);
    await expect(service.createEntry('hotel-A', 'u', dto())).rejects.toThrow(
      '3pmetrics kaydı kabul etmedi',
    );
    expect(fake.dataset.carbon_provider_entries?.[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error_code: 'invalid_request',
      }),
    );
  });
});

describe('CarbonDataEntryService — belge ve silme işareti', () => {
  const sentEntry = (over: Record<string, unknown> = {}) => ({
    id: ENTRY_ID,
    hotel_id: 'hotel-A',
    idempotency_key: KEY,
    external_unit_id: 'merkez',
    resource_slug: 'electricity-consumption',
    entry_date: '2026-09-30',
    status: 'sent',
    external_reply_id: 12345,
    documents: [],
    environment: 'sandbox',
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  });
  const pdf = (size = 1000, name = 'fatura.pdf') => ({
    originalname: name,
    mimetype: 'application/pdf',
    size,
    buffer: Buffer.alloc(size),
  });

  it('gönderilmiş kayda belge ekler ve listede tutar', async () => {
    const { service, adapter } = makeService({
      carbon_provider_entries: [sentEntry()],
    });
    const entry = await service.uploadDocument('hotel-A', ENTRY_ID, pdf());
    expect(adapter.documents[0].replyId).toBe(12345);
    expect(entry.documents.map((d) => d.file_name)).toEqual(['fatura.pdf']);
  });

  it('desteklenmeyen biçim, büyük dosya ve gönderilmemiş kayıt reddedilir', async () => {
    const { service, adapter } = makeService({
      carbon_provider_entries: [
        sentEntry(),
        sentEntry({ id: KEY, status: 'failed' }),
      ],
    });
    await expect(
      service.uploadDocument('hotel-A', ENTRY_ID, pdf(10, 'x.exe')),
    ).rejects.toThrow(/Desteklenen biçimler/);
    await expect(
      service.uploadDocument('hotel-A', ENTRY_ID, pdf(5 * 1024 * 1024)),
    ).rejects.toThrow('Belge en fazla 4 MB olabilir.');
    await expect(service.uploadDocument('hotel-A', KEY, pdf())).rejects.toThrow(
      /başarıyla gönderilmiş/,
    );
    expect(adapter.documents).toHaveLength(0);
  });

  it('başka otelin kaydı bulunamaz', async () => {
    const { service } = makeService({
      carbon_provider_entries: [sentEntry({ hotel_id: 'hotel-B' })],
    });
    await expect(
      service.markDeletedInProvider('hotel-A', ENTRY_ID),
    ).rejects.toThrow('Kayıt bulunamadı.');
  });

  it('3pmetrics arayüzünden silindi işareti yalnızca gönderilmiş kayıtta', async () => {
    const { service } = makeService({
      carbon_provider_entries: [sentEntry()],
    });
    const entry = await service.markDeletedInProvider('hotel-A', ENTRY_ID);
    expect(entry.status).toBe('deleted_in_provider');
    await expect(
      service.markDeletedInProvider('hotel-A', ENTRY_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ThreePMetricsAdapter — yazma uçları', () => {
  type Call = {
    url: string;
    method: string;
    body?: unknown;
    headers: Record<string, string>;
  };
  const make = (
    respond: (
      call: Call,
    ) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>,
  ) => {
    const calls: Call[] = [];
    const adapter = new ThreePMetricsAdapter({
      baseUrl: 'https://connect-test.3pmetrics.io',
      fetchImpl: (url, init) => {
        const call = {
          url,
          method: init.method,
          body: init.body,
          headers: init.headers,
        };
        calls.push(call);
        return respond(call);
      },
    });
    return { adapter, calls };
  };
  const ok = (body: unknown) =>
    Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve(body),
    });
  const creds = { apiKey: 'k' };

  it('POST /cca/replies — uçuş dışı kaynakta value, API key header', async () => {
    const { adapter, calls } = make(() => ok({ replyId: 7, message: 'm' }));
    const res = await adapter.createReply(creds, {
      customerSlug: 'a',
      customerUnitSlug: 'u',
      emissionResourceSlug: 'r',
      date: '2026-09-30',
      value: '10',
      systemOptionValue: '1',
    });
    expect(res.replyId).toBe(7);
    expect(calls[0].url).toBe('https://connect-test.3pmetrics.io/cca/replies');
    expect(calls[0].headers['X-Integration-Api-Key']).toBe('k');
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(JSON.parse(calls[0].body as string)).toEqual({
      customerSlug: 'a',
      customerUnitSlug: 'u',
      emissionResourceSlug: 'r',
      date: '2026-09-30',
      value: '10',
      systemOptionValue: '1',
      userOptionValue: null,
    });
  });

  it('uçuş kaydında value hiç gönderilmez', async () => {
    const { adapter, calls } = make(() => ok({ replyId: 8 }));
    await adapter.createReply(creds, {
      customerSlug: 'a',
      customerUnitSlug: 'u',
      emissionResourceSlug: 'f',
      date: '2026-09-30',
      flight: {
        passengerOrFlightName: 'TK1',
        departureIata: 'IST',
        arrivalIata: 'LHR',
      },
    });
    const body = JSON.parse(calls[0].body as string) as Record<string, unknown>;
    expect('value' in body).toBe(false);
    expect(body.flight).toEqual({
      passengerOrFlightName: 'TK1',
      departureIata: 'IST',
      arrivalIata: 'LHR',
    });
  });

  it('yazma isteğinde ağ hatası -> outcome_unknown (tekrar denenmez)', async () => {
    const { adapter, calls } = make(() => Promise.reject(new Error('timeout')));
    await expect(
      adapter.createReply(creds, {
        customerSlug: 'a',
        customerUnitSlug: 'u',
        emissionResourceSlug: 'r',
        date: '2026-09-30',
        value: '1',
      }),
    ).rejects.toMatchObject({ reason: 'outcome_unknown' });
    expect(calls).toHaveLength(1);
  });

  it('belge yükleme multipart; 413/415 sınıflandırılır', async () => {
    let status = 200;
    const { adapter, calls } = make(() =>
      Promise.resolve({
        status,
        ok: status === 200,
        json: () => Promise.resolve({ fileName: 'f.pdf' }),
      }),
    );
    const doc = {
      fileName: 'f.pdf',
      contentType: 'application/pdf',
      data: Buffer.from('x'),
    };
    await adapter.uploadReplyDocument(creds, 5, doc);
    expect(calls[0].url).toMatch(/\/cca\/replies\/5\/documents$/);
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(calls[0].headers['Content-Type']).toBeUndefined();
    status = 413;
    await expect(
      adapter.uploadReplyDocument(creds, 5, doc),
    ).rejects.toMatchObject({ reason: 'too_large' });
    status = 415;
    await expect(
      adapter.uploadReplyDocument(creds, 5, doc),
    ).rejects.toMatchObject({ reason: 'unsupported_media' });
  });
});

describe('parseEmissionResource — dokümandaki iki şekil', () => {
  it('referans şekli: { description, options: [{ name, value }] }', () => {
    const r = parseEmissionResource({
      slug: 'vehicle-fuel',
      title: 'Araç Yakıt Tüketimi',
      ghgScope: { id: 1, name: 'Scope 1' },
      systemOptions: {
        description: 'Yakıt Türü',
        options: [{ name: 'Doğalgaz (m3)', value: '1' }],
      },
      userOptions: {
        description: 'Araç Plakası',
        options: [{ name: '34ABC123', value: '1' }],
      },
      inputMode: null,
    });
    expect(r.systemOptions?.description).toBe('Yakıt Türü');
    expect(r.userOptions?.options).toEqual([{ name: '34ABC123', value: '1' }]);
    expect(r.inputMode).toBeNull();
  });

  it('iş akışı örneği: [{ id, value, label }] -> gönderilen değer id', () => {
    const r = parseEmissionResource({
      slug: 'electricity-consumption',
      title: 'Elektrik Tüketimi',
      systemOptions: [{ id: 1, value: 'kWh', label: 'Kilowatt-saat' }],
      userOptions: null,
    });
    expect(r.systemOptions?.options).toEqual([
      { name: 'Kilowatt-saat', value: '1' },
    ]);
  });

  it('uçuş kaynağı inputMode ve requiredFields taşınır', () => {
    const r = parseEmissionResource({
      slug: 'flights',
      title: 'Uçuşlar',
      inputMode: 'flight-route-v1',
      requiredFields: ['flightDate', 'departureIata'],
      lookups: { airports: '/cca/lookups/airports{?query,limit,country}' },
    });
    expect(r.inputMode).toBe('flight-route-v1');
    expect(r.requiredFields).toEqual(['flightDate', 'departureIata']);
  });
});
