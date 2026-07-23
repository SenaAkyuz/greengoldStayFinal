import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Yalnızca allow-list edilmiş relative hedefler — open redirect'i engeller.
// /reset-password: şifre kurtarma (recovery). /set-password: yeni kullanıcı davet
// akışı — ayrı tutulur, karıştırılmaz.
const ALLOWED_NEXT = new Set(['/reset-password', '/set-password']);

// token_hash ile gelebilecek OTP tipleri (recovery + davet/set-password).
const OTP_TYPES = new Set<EmailOtpType>([
  'recovery',
  'invite',
  'signup',
  'magiclink',
  'email',
]);

function safeNext(raw: string | null): string {
  if (raw && ALLOWED_NEXT.has(raw)) return raw;
  return '/reset-password';
}

/**
 * Supabase Auth callback'i — hem recovery (şifre sıfırlama) hem invite
 * (yeni kullanıcı şifre belirleme) linkleri buraya döner.
 * PKCE akışında `code`, özel e-posta şablonunda `token_hash` gelir. İkisini de
 * oturuma çevirir, cookie'yi kurar ve güvenli `next` hedefine yönlendirir.
 * Link tek kullanımlık/hassastır.
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
  } else if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Hata/expired: ham Supabase mesajını URL'ye koymadan, ilgili akışın nazik
  // hatasına yönlendir (recovery -> /reset-password, davet -> /set-password).
  return NextResponse.redirect(
    new URL(`${next}?error=invalid_or_expired`, origin),
  );
}
