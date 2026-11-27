import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = { value: { access_token: 'TOKEN' } as { access_token: string } | null };
vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: async () => ({ data: { session: session.value } }) } }),
}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { saveFacilityProfile } from '../app/tesis-profili/actions';
import { PROFILE_IDLE } from '../app/components/panel/profile-state';

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
const valid = { countryCode: 'TR', rooms: '96', totalArea: '9.800', roomsArea: '6000', meetingArea: '600' };

beforeEach(() => {
  session.value = { access_token: 'TOKEN' };
  revalidatePath.mockClear();
  vi.unstubAllGlobals();
});

describe('saveFacilityProfile (Server Action)', () => {
  it('geçerli profil: PUT …/profile, hotel_id yok, sayfalar yenilenir', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { country: 'Türkiye' }, error: null })));
    vi.stubGlobal('fetch', fetchMock);
    const r = await saveFacilityProfile(PROFILE_IDLE, form(valid));
    expect(r.status).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/dashboard\/carbon-provider\/connecthub\/profile$/);
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ country: 'Türkiye', country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000, meeting_area_m2: 600 });
    expect(JSON.stringify(body)).not.toMatch(/hotel/);
    expect(revalidatePath).toHaveBeenCalledWith('/tesis-profili');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('geçersiz form → istek atılmaz, alan hataları döner', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await saveFacilityProfile(PROFILE_IDLE, form({ ...valid, roomsArea: '9000', meetingArea: '1000' }));
    expect(r.status).toBe('error');
    expect(r.fieldErrors?.roomsArea).toMatch(/aşamaz/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('oturum yoksa istek atılmaz', async () => {
    session.value = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await saveFacilityProfile(PROFILE_IDLE, form(valid))).message).toMatch(/Oturum/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'demo_read_only', /Demo/],
    [503, 'carbon_schema_not_ready', /etkin değil/],
    [400, 'carbon_country_code_invalid', /Ülke kodu/],
  ])('backend %s %s → kullanıcı metni', async (status, code, re) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, data: null, error: { code, message: 'iç ileti' } }), { status })));
    const r = await saveFacilityProfile(PROFILE_IDLE, form(valid));
    expect(r.status).toBe('error');
    expect(r.message).toMatch(re);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
