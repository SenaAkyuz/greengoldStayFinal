import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Yalnızca allow-list edilmiş relative hedefler — open redirect'i engeller.
const ALLOWED_NEXT = new Set(['/reset-password']);

function safeNext(raw: string | null): string {
  if (raw && ALLOWED_NEXT.has(raw)) return raw;
  return '/reset-password';
}

/**
 * Supabase Auth recovery callback'i.
 * PKCE akışında `code`, özel recovery e-posta şablonu kullanılırsa
 * `token_hash` gelir. İkisini de oturuma çevirip cookie'yi kurar,
 * ardından güvenli `next` hedefine yönlendirir.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNext(searchParams.get('next'));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  } else if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Hata/expired: ham Supabase mesajını URL'ye koymadan nazik hataya yönlendir.
  return NextResponse.redirect(
    new URL('/reset-password?error=invalid_or_expired', origin),
  );
}
