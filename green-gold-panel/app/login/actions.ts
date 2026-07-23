'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type DemoLoginState = { error: string | null };

/**
 * Yalnızca geliştirme kolaylığı: .env.local'deki demo kullanıcıyla giriş.
 * Kimlik bilgileri SADECE sunucuda okunur; client asla görmez.
 * İki katmanlı prod koruması: buton gizlense de action endpoint'i
 * çağrılabileceği için burada da NODE_ENV kontrolü zorunlu.
 */
export async function demoLogin(
  _prev: DemoLoginState,
  _formData: FormData,
): Promise<DemoLoginState> {
  // Katman 2 — yürütme reddi: prod'da asla giriş deneme.
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Bu özellik devre dışı.' };
  }

  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;

  // Env yoksa özellik yok — hardcoded fallback yok.
  if (!email || !password) {
    return { error: 'Demo girişi yapılandırılmamış.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Şifreyi/ham hatayı asla mesaja koyma.
    return { error: 'Demo girişi başarısız oldu.' };
  }

  redirect('/');
}
