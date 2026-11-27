import {
  ConnectHubClient,
  ConnectHubError,
  type ConnectHubFetch,
} from './connecthub.client';

type Call = { url: string; init: Parameters<ConnectHubFetch>[1] };

function fakeFetch(
  responder: (call: Call) => {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  },
) {
  const calls: Call[] = [];
  const impl: ConnectHubFetch = (url, init) => {
    const call = { url, init };
    calls.push(call);
    const r = responder(call);
    return Promise.resolve({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: {
        get: (name: string) => r.headers?.[name.toLowerCase()] ?? null,
      },
      json: () =>
        r.body === undefined
          ? Promise.reject(new Error('no body'))
          : Promise.resolve(r.body),
    });
  };
  return { impl, calls };
}

const record = {
  item: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  unit: '7d4e5f6a-8b90-4e8a-9c21-3f2a9c1e5b7d',
  period: '2026-10',
  quantity: 240,
  uom: 'kg',
  external_id: 'PO-88123-4',
};

describe('ConnectHubClient', () => {
  it('X-Api-Key başlığıyla yazar ve 201 sonucunu ayrıştırır', async () => {
    const { impl, calls } = fakeFetch(() => ({
      status: 201,
      body: {
        written: 1,
        rejected: 0,
        results: [
          {
            external_id: 'PO-88123-4',
            status: 'pending_approval',
            record_id: '0b3e0d2a-1111-4111-8111-111111111111',
            error: null,
            warnings: [],
          },
        ],
      },
    }));
    const client = new ConnectHubClient({ fetchImpl: impl });
    const res = await client.writeRecords('ch_live_x', [record]);
    expect(calls[0].url).toBe('https://connect.3pmetrics.io/v1/records');
    expect(calls[0].init.headers['X-Api-Key']).toBe('ch_live_x');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      records: [record],
    });
    expect(res.results[0].status).toBe('pending_approval');
  });

  it('207 kısmi sonucu hata saymaz', async () => {
    const { impl } = fakeFetch(() => ({
      status: 207,
      body: {
        written: 0,
        rejected: 1,
        results: [
          {
            external_id: 'PO-88123-4',
            status: 'rejected',
            record_id: null,
            error: { code: 'UNKNOWN_UOM', message: 'uom' },
            warnings: null,
          },
        ],
      },
    }));
    const res = await new ConnectHubClient({ fetchImpl: impl }).writeRecords(
      'k',
      [record],
    );
    expect(res.rejected).toBe(1);
    expect(res.results[0].error?.code).toBe('UNKNOWN_UOM');
    expect(res.results[0].warnings).toEqual([]);
  });

  it('409 kapalı dönem → period_closed (+ satır sonuçları taşınır)', async () => {
    const { impl } = fakeFetch(() => ({
      status: 409,
      body: {
        written: 0,
        rejected: 1,
        results: [
          {
            external_id: 'PO-88123-4',
            status: 'rejected',
            record_id: null,
            error: { code: 'PERIOD_CLOSED', message: 'kapalı' },
            warnings: [],
          },
        ],
      },
    }));
    const failure = await new ConnectHubClient({ fetchImpl: impl })
      .writeRecords('k', [record])
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ConnectHubError);
    expect((failure as ConnectHubError).reason).toBe('period_closed');
    expect((failure as ConnectHubError).writeResponse?.results).toHaveLength(1);
  });

  it('yazma sırasında bağlantı koparsa outcome_unknown (tekrar göndermek güvenli)', async () => {
    const impl: ConnectHubFetch = () => Promise.reject(new Error('timeout'));
    const failure = await new ConnectHubClient({ fetchImpl: impl })
      .writeRecords('k', [record])
      .catch((e: unknown) => e);
    expect((failure as ConnectHubError).reason).toBe('outcome_unknown');
  });

  it('1000 kayıttan fazlasını göndermez', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: {} }));
    const many = Array.from({ length: 1001 }, () => record);
    await expect(
      new ConnectHubClient({ fetchImpl: impl }).writeRecords('k', many),
    ).rejects.toMatchObject({ reason: 'invalid_request' });
    expect(calls).toHaveLength(0);
  });

  it('onaylı kayıtları sayfa sayfa okur', async () => {
    const row = (i: number) => ({
      record_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      item: record.item,
      unit: record.unit,
      period: '2026-10',
      quantity: i,
      uom: 'kg',
      description: null,
      source: 'API',
      external_id: null,
    });
    const { impl, calls } = fakeFetch((call) => {
      const offset = Number(new URL(call.url).searchParams.get('offset'));
      const count = offset === 0 ? 500 : 3;
      return {
        status: 200,
        body: {
          data: Array.from({ length: count }, (_, i) => row(offset + i)),
        },
      };
    });
    const rows = await new ConnectHubClient({
      fetchImpl: impl,
    }).readApprovedRecords('k', { unit: record.unit });
    expect(rows).toHaveLength(503);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0].url).searchParams.get('unit')).toBe(record.unit);
  });

  it('faktör paketinde If-None-Match gönderir; 304 → notModified', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 304 }));
    const res = await new ConnectHubClient({
      fetchImpl: impl,
    }).getFactorPackage('k', '5b7d3f2a-9c1e-4e8a-9c21-7d4e5f6a8b90', '"9f2c"');
    expect(res).toEqual({ notModified: true });
    expect(calls[0].init.headers['If-None-Match']).toBe('"9f2c"');
  });

  it('403 → forbidden (ör. "Faktörleri içer" kapalı)', async () => {
    const { impl } = fakeFetch(() => ({
      status: 403,
      body: { title: 'Forbidden', detail: 'Include factors is off' },
    }));
    await expect(
      new ConnectHubClient({ fetchImpl: impl }).listFactorPackages('k', 2025),
    ).rejects.toMatchObject({ reason: 'forbidden' });
  });

  it('şema dışı yanıtta sayı uydurmaz → invalid_response', async () => {
    const { impl } = fakeFetch(() => ({
      status: 200,
      body: { data: [{ id: 'x', name: 'n', year: '2025', content_hash: 'h' }] },
    }));
    await expect(
      new ConnectHubClient({ fetchImpl: impl }).listFactorPackages('k'),
    ).rejects.toMatchObject({ reason: 'invalid_response' });
  });
});
