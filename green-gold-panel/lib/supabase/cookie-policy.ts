import type { CookieOptions } from '@supabase/ssr';

export function sessionCookieOptions(options: CookieOptions): CookieOptions {
  if (options.maxAge === 0) return options;
  const result = { ...options, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };
  delete result.maxAge;
  delete result.expires;
  return result;
}

export function isAuthCookie(name: string) {
  return /^sb-.+-auth-token(?:\.\d+|-code-verifier)?$/.test(name);
}
