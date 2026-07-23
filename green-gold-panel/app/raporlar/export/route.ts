import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiBaseUrl } from '@/lib/api';
import { normalizeRange } from '@/lib/range';

/**
 * CSV indirmeyi server üzerinden proxy'ler: token yalnızca sunucuda kullanılır,
 * tarayıcı URL'sinde key/token sızmaz. Tarayıcı sadece /raporlar/export?range=..
 * adresini çağırır.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return new Response('Oturum bulunamadı.', { status: 401 });
  }

  const range = normalizeRange(
    request.nextUrl.searchParams.get('range') ?? undefined,
  );

  const apiRes = await fetch(
    `${getApiBaseUrl()}/dashboard/export.csv?range=${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );

  if (!apiRes.ok) {
    return new Response('Rapor indirilemedi. API çalışıyor mu?', {
      status: 502,
    });
  }

  const body = await apiRes.arrayBuffer();
  return new Response(body, {
    headers: {
      'Content-Type':
        apiRes.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'Content-Disposition':
        apiRes.headers.get('content-disposition') ??
        'attachment; filename="green-gold.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
