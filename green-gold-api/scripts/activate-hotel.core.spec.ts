import {
  isValidOrigin,
  hasValidOrigin,
  runActivateHotel,
  type ActivateHotelDeps,
} from './activate-hotel.core';

describe('isValidOrigin / hasValidOrigin', () => {
  it('geçerli origin (https, host, yol yok)', () => {
    expect(isValidOrigin('https://otel.com')).toBe(true);
    expect(isValidOrigin('http://localhost:3001')).toBe(true);
  });
  it('yol/query/fragment içeren reddedilir', () => {
    expect(isValidOrigin('https://otel.com/path')).toBe(false);
    expect(isValidOrigin('https://otel.com?a=1')).toBe(false);
  });
  it('boş/geçersiz reddedilir', () => {
    expect(isValidOrigin('')).toBe(false);
    expect(isValidOrigin('notaurl')).toBe(false);
    expect(isValidOrigin(null)).toBe(false);
  });
  it('hasValidOrigin: en az bir geçerli varsa true', () => {
    expect(hasValidOrigin(['bad', 'https://ok.com'])).toBe(true);
    expect(hasValidOrigin([])).toBe(false);
    expect(hasValidOrigin(null)).toBe(false);
  });
});

function makeDeps(
  hotel: {
    id: string;
    name: string;
    status: string;
    allowed_origins: string[] | null;
  } | null,
): { deps: ActivateHotelDeps; statusSet: { id: string; status: string }[] } {
  const statusSet: { id: string; status: string }[] = [];
  const deps: ActivateHotelDeps = {
    getHotelByKey: async () => hotel,
    setStatus: async (id, status) => {
      statusSet.push({ id, status });
    },
  };
  return { deps, statusSet };
}

describe('runActivateHotel', () => {
  it('geçerli origin varsa pending -> active', async () => {
    const { deps, statusSet } = makeDeps({
      id: 'h1',
      name: 'Otel',
      status: 'pending',
      allowed_origins: ['https://otel.com'],
    });
    const res = await runActivateHotel('key-1', deps);
    expect(res.changed).toBe(true);
    expect(statusSet).toEqual([{ id: 'h1', status: 'active' }]);
  });

  it('geçerli origin YOKSA aktivasyonu reddeder (yazma yok)', async () => {
    const { deps, statusSet } = makeDeps({
      id: 'h1',
      name: 'Otel',
      status: 'pending',
      allowed_origins: [],
    });
    await expect(runActivateHotel('key-1', deps)).rejects.toThrow(
      /allowed_origin/,
    );
    expect(statusSet).toHaveLength(0);
  });

  it('otel bulunamazsa hata', async () => {
    const { deps } = makeDeps(null);
    await expect(runActivateHotel('yok', deps)).rejects.toThrow(/bulunamadı/);
  });

  it('zaten active -> no-op (alreadyActive)', async () => {
    const { deps, statusSet } = makeDeps({
      id: 'h1',
      name: 'Otel',
      status: 'active',
      allowed_origins: ['https://otel.com'],
    });
    const res = await runActivateHotel('key-1', deps);
    expect(res.alreadyActive).toBe(true);
    expect(statusSet).toHaveLength(0);
  });

  it('dry-run: geçerli olsa bile yazma yapmaz', async () => {
    const { deps, statusSet } = makeDeps({
      id: 'h1',
      name: 'Otel',
      status: 'pending',
      allowed_origins: ['https://otel.com'],
    });
    const res = await runActivateHotel('key-1', deps, { dryRun: true });
    expect(res.changed).toBe(false);
    expect(statusSet).toHaveLength(0);
  });
});
