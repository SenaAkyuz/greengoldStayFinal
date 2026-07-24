import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16: Middleware -> Proxy (aynı işlev, yeni ad/dosya).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Statik dosyalar ve görseller hariç tüm yollar.
    // green-gold-widget*: widget bundle'ı PUBLIC statik varlıktır ve misafir
    // (girişsiz) tarafından çapraz-origin yüklenir — auth proxy'sine GİRMEMELİ,
    // yoksa /login'e 307 yönlendirilir ve widget hiç yüklenmez. v1/v2 kapsanır.
    '/((?!_next/static|_next/image|favicon.ico|green-gold-widget|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
