import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

// Korunan sayfaların ortak giriş kontrolü: getUser() oturumu sunucuda doğrular,
// getSession() API çağrıları için access token'ı verir. Biri yoksa /login.
export async function requireAccessToken(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) redirect('/login');

  return token;
}
