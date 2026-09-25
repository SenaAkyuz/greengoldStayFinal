import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sessionCookieOptions, isAuthCookie } from '../lib/supabase/cookie-policy';

const auth = vi.hoisted(() => ({ user: null as null | { id: string }, refresh: false }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (values: unknown[]) => void } }) => ({
    auth: { getUser: async () => {
      if (auth.refresh) options.cookies.setAll([{ name: 'sb-test-auth-token', value: auth.user ? 'renewed' : '', options: { path: '/', maxAge: auth.user ? 1000 : 0 } }]);
      return { data: { user: auth.user } };
    } },
  }),
}));
import { updateSession } from '../lib/supabase/middleware';

beforeEach(() => { auth.user = null; auth.refresh = false; });
describe('session boundaries', () => {
  it('redirects anonymous protected requests without leaking query parameters', async () => {
    const result = await updateSession(new NextRequest('https://panel.test/ayarlar?input=private'));
    expect(result.headers.get('location')).toBe('https://panel.test/login');
    expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('keeps expired cookie deletion on login redirects', async () => {
    auth.refresh = true;
    const result = await updateSession(new NextRequest('https://panel.test/'));
    expect(result.cookies.get('sb-test-auth-token')?.maxAge).toBe(0);
  });
  it('keeps renewed session cookies when redirecting an authenticated login', async () => {
    auth.user = { id: 'hotel-A-user' }; auth.refresh = true;
    const result = await updateSession(new NextRequest('https://panel.test/login'));
    expect(result.headers.get('location')).toBe('https://panel.test/');
    expect(result.cookies.get('sb-test-auth-token')?.value).toBe('renewed');
    expect(result.cookies.get('sb-test-auth-token')?.maxAge).toBeUndefined();
  });
  it.each(['/demo', '/reset-password', '/set-password', '/auth/callback'])('preserves the public/recovery flow: %s', async (path) => {
    auth.user = { id: 'user' };
    const result = await updateSession(new NextRequest(`https://panel.test${path}`));
    expect(result.headers.get('location')).toBeNull();
  });
  it('removes persistence but preserves explicit deletion', () => {
    expect(sessionCookieOptions({ maxAge: 400, expires: new Date(), path: '/' })).not.toHaveProperty('maxAge');
    expect(sessionCookieOptions({ maxAge: 0 }).maxAge).toBe(0);
    expect(isAuthCookie('sb-project-auth-token.0')).toBe(true);
    expect(isAuthCookie('other-cookie')).toBe(false);
  });
  it('migrates an existing persistent auth cookie on a normal page visit', async () => {
    auth.user = { id: 'user' };
    const request = new NextRequest('https://panel.test/ayarlar', { headers: { cookie: 'sb-project-auth-token.0=existing' } });
    const result = await updateSession(request);
    expect(result.cookies.get('sb-project-auth-token.0')?.value).toBe('existing');
    expect(result.cookies.get('sb-project-auth-token.0')?.maxAge).toBeUndefined();
  });
});
