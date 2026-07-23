import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public: oturum gerekmez (giriş, şifre kurtarma, recovery callback).
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

// Guest-only: girişliyken panele geri at. Kurtarma sayfaları BURADA OLMAMALI —
// recovery oturumu da "girişli" sayılır; /reset-password'ı guest-only yapmak
// kullanıcıyı yanlışlıkla `/`ye atardı.
const GUEST_ONLY_PREFIXES = ['/login'];

function matchesPrefix(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * Güncel @supabase/ssr middleware deseni: oturumu tazeler (cookie senkronu),
 * girişsiz kullanıcıyı /login'e yönlendirir. Cookie akışını BOZMA.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() token'ı sunucuda doğrular — getSession'a göre güvenli.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = matchesPrefix(path, PUBLIC_PREFIXES);
  const isGuestOnly = matchesPrefix(path, GUEST_ONLY_PREFIXES);

  // Girişsiz kullanıcı korumalı bir sayfaya giderse /login'e at.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Girişliyken yalnızca guest-only sayfada (/login) panele geri al.
  // /reset-password guest-only DEĞİL — recovery oturumu burada kalmalı.
  if (user && isGuestOnly) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
