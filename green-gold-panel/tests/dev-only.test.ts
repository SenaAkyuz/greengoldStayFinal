import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
import { devOnlyPublicPrefixes, isDevToolsEnabled } from '../lib/dev-only';
import { updateSession } from '../lib/supabase/middleware';

afterEach(() => vi.unstubAllEnvs());

describe('geliştirme araçları canlıda kapalı', () => {
  it.each([
    ['development', true],
    ['production', false],
    ['test', false],
    [undefined, false],
    ['Development', false],
  ])('NODE_ENV=%s → %s', (env, enabled) => {
    expect(isDevToolsEnabled(env)).toBe(enabled);
    expect(devOnlyPublicPrefixes(env).length > 0).toBe(enabled);
  });

  it.each(['/tasarim', '/onizleme/panel'])('production: %s oturumsuz açılmaz (girişe yönlendirilir)', async (path) => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await updateSession(new NextRequest(`https://panel.test${path}`));
    expect(res.headers.get('location')).toBe('https://panel.test/login');
  });

  it.each(['/tasarim', '/onizleme/panel'])('development: %s oturumsuz açılır', async (path) => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await updateSession(new NextRequest(`https://panel.test${path}`));
    expect(res.headers.get('location')).toBeNull();
  });

  it('development: diğer korumalı sayfalar yine girişe yönlendirir', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    // "/" artık herkese açık ürün ana sayfası (KD-1); alt yollar korumalı kalır.
    for (const path of ['/ayarlar', '/tasarimx', '/onizlemex', '/karbon']) {
      const res = await updateSession(new NextRequest(`https://panel.test${path}`));
      expect(res.headers.get('location')).toBe('https://panel.test/login');
    }
  });
});
