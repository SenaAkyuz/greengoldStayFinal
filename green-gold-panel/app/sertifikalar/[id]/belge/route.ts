import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { renderCarbonDocument } from '@/lib/carbon-document';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^GG-[A-F0-9]{20}$/.test(id)) return new Response('Belge bulunamadı.', { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Oturum gerekli.', { status: 401 });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return new Response('Oturum gerekli.', { status: 401 });
  const response = await getHotel(session.access_token);
  if (response.error) return new Response('Belge yüklenemedi.', { status: 502 });
  const report = response.data?.carbon_reports?.find(item => item.id === id);
  if (!report) return new Response('Belge bulunamadı.', { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(renderCarbonDocument(report), { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${id}.html"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  } });
}
