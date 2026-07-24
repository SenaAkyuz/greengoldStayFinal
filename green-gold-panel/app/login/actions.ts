'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export type DemoLoginState = { error: string | null };

// Basit IP başına throttle (buton herkese açık — Supabase auth'a yük binmesin).
// NOT: best-effort, dağıtık DEĞİL — bellek-içi limit Vercel'de instance'lar
// arası paylaşılmaz; production koruması gibi görülmemeli (deploy'da paylaşımlı
// store gerekir). Yine de tek instance'ta kaba kötüye kullanımı yavaşlatır.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const demoHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (demoHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    demoHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  demoHits.set(ip, recent);
  return false;
}

/**
 * Açıkça etkinleştirilen inceleme modu: .env'deki ayrı demo kullanıcıyla giriş.
 * Kimlik bilgileri SADECE sunucuda okunur; client asla görmez.
 * Buton gizlense de action endpoint'i çağrılabileceği için burada da
 * DEMO_LOGIN_ENABLED kontrolü zorunlu.
 */
export async function demoLogin(
  _prev: DemoLoginState,
  _formData: FormData,
): Promise<DemoLoginState> {
  // Katman 2 — yürütme reddi: açıkça etkin değilse giriş deneme.
  if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
    return { error: 'Bu özellik devre dışı.' };
  }

  // Hız sınırı (IP başına).
  const hdrs = await headers();
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(ip)) {
    return { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' };
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
