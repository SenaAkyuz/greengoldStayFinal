'use client';

import Image from 'next/image';
import { BRAND_LOGO, MARKETING_IMAGES } from '@/lib/marketing-assets';
import { Suspense, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { normalizeEmailInput } from '@/lib/email';
import { demoLogin, type DemoLoginState } from './actions';

/**
 * Supabase auth hatasını kullanıcıya gösterilecek mesaja çevirir.
 *
 * Kimlik bilgisi hataları (kullanıcı yok / şifre yanlış) AYNI genel mesajı
 * alır — ayırmak, bir e-postanın sistemde kayıtlı olup olmadığını dışarıdan
 * öğrenmeye izin verirdi. Kimlik dışı sebepler ise ayrı yazılır, çünkü
 * hepsini "şifre hatalı" göstermek çözülebilir sorunları gizliyordu.
 */
function loginErrorMessage(error: { message?: string; status?: number }): string {
  const raw = (error.message ?? '').toLowerCase();
  if (raw.includes('email not confirmed')) {
    return 'E-posta adresiniz henüz doğrulanmamış. Doğrulama bağlantısı için destek ekibiyle iletişime geçin.';
  }
  if (error.status === 429 || raw.includes('rate limit') || raw.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.';
  }
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  return 'Giriş başarısız. E-posta adresinizi ve şifrenizi kontrol edin.';
}

export default function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginInner demoEnabled={demoEnabled} />
    </Suspense>
  );
}

function LoginInner({ demoEnabled }: { demoEnabled: boolean }) {
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const welcome = searchParams.get('welcome') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const normalizedEmail = normalizeEmailInput(email);
    setEmail(normalizedEmail);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      // Kimlik bilgisi hataları için TEK ve GENEL mesaj kalır: "kullanıcı yok"
      // ile "şifre yanlış"ı ayırmak hesap sayımına (enumeration) izin verirdi.
      // Ama kimlik DIŞI sebepler (onaysız e-posta, deneme limiti) ayrı yazılır —
      // aksi halde çözülebilir bir sorun "şifre hatalı" diye görünüyordu.
      setError(loginErrorMessage(error));
      setLoading(false);
      return;
    }
    window.location.replace('/');
  }

  return (
    <main className="grid flex-1 bg-[var(--ds-color-bg-soft)] lg:grid-cols-[52%_48%]">
      <section className="relative isolate hidden overflow-hidden bg-[var(--ds-palette-ink-900)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Image src={MARKETING_IMAGES.login.src} alt="" fill sizes="52vw" priority className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgba(7,42,43,0.96)] via-[rgba(7,42,43,0.72)] to-[rgba(7,42,43,0.5)]" />
        <Link href="/" className="relative flex w-fit items-center gap-3 rounded-lg text-white no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-palette-sun-300)]">
          <Image src={BRAND_LOGO.src} alt="" width={44} height={44} className="rounded-full" />
          <span className="text-2xl font-bold tracking-[-0.058em]">GreenGold<span className="font-normal"> Stay</span></span>
        </Link>
        <div className="relative max-w-xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ds-palette-sun-300)]">Otel yönetim paneli</div>
          <h2 className="mt-5 font-sans text-5xl font-medium leading-[1.06] tracking-[-0.055em]">Misafir ilgisini ve tahmini etkiyi tek yerden izleyin.</h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-[var(--ds-color-inverse-muted)]">Misafir ekranı etkileşimleri, karbon ölçümü ve entegrasyon ayarları tek panelde.</p>
        </div>
        <div className="relative text-xs text-[var(--ds-color-inverse-muted)]">Ölçüm altyapısı: 3P Metrics · Sonuçlar tahminidir.</div>
      </section>

      <div className="flex items-center justify-center px-5 py-14">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex w-fit items-center gap-3 no-underline lg:hidden">
          <Image src={BRAND_LOGO.src} alt="" width={42} height={42} className="rounded-full" />
          <div>
            <div className="text-lg font-bold tracking-[-0.05em] text-[var(--ds-color-heading)]">
              GreenGold<span className="font-normal"> Stay</span>
            </div>
            <div className="text-xs text-neutral-500">Otel paneli</div>
          </div>
        </Link>

        <div className="gg-card p-7 sm:p-9">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ds-palette-pine-600)]">Otel yönetim paneli</div>
          <h1 className="mt-3 font-sans tracking-tight text-4xl font-medium text-[var(--ds-color-heading)]">Giriş yap</h1>
          <p className="mt-2 mb-7 text-sm text-[var(--ds-color-text-muted)]">
            Otel yönetim paneline erişmek için giriş yapın.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            {resetSuccess && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                Şifreniz güncellendi, yeni şifrenizle giriş yapabilirsiniz.
              </div>
            )}

            {welcome && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                Hesabınız etkinleştirildi. Belirlediğiniz şifreyle giriş
                yapabilirsiniz.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-neutral-700"
              >
                E-posta
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) =>
                  setEmail(normalizeEmailInput(e.currentTarget.value))
                }
                className="w-full rounded-lg border border-[var(--ds-color-border)] bg-[var(--ds-color-bg-soft)] px-3 py-2.5 text-sm text-[var(--ds-color-heading)] outline-none focus:border-[var(--ds-palette-pine-600)] focus:ring-2 focus:ring-[var(--ds-color-data-1)]/20"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Şifre
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Şifremi unuttum
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                className="w-full rounded-lg border border-[var(--ds-color-border)] bg-[var(--ds-color-bg-soft)] px-3 py-2.5 text-sm text-[var(--ds-color-heading)] outline-none focus:border-[var(--ds-palette-pine-600)] focus:ring-2 focus:ring-[var(--ds-color-data-1)]/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-lg bg-[var(--ds-palette-pine-700)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40 disabled:opacity-60"
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
          </form>

          {demoEnabled && <DemoLogin />}
        </div>
      </div>
      </div>
    </main>
  );
}

function DemoLogin() {
  const [state, formAction] = useActionState<DemoLoginState, FormData>(
    demoLogin,
    { error: null },
  );

  return (
    <div className="mt-5 border-t border-neutral-200 pt-5">
      {state.error && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}
      <form action={formAction}>
        <DemoSubmitButton />
      </form>
      <p className="mt-2 text-center text-xs text-neutral-400">
        İnceleme hesabıdır; gerçek ödeme veya rezervasyon verisi içermez.
      </p>
    </div>
  );
}

function DemoSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-300 disabled:opacity-60"
    >
      {pending ? 'Demo açılıyor…' : 'Demo panelini görüntüle'}
    </button>
  );
}
