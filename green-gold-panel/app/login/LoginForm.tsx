'use client';

import { Suspense, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { demoLogin, type DemoLoginState } from './actions';

export default function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginInner demoEnabled={demoEnabled} />
    </Suspense>
  );
}

function LoginInner({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
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
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError('Giriş başarısız. E-posta veya şifre hatalı.');
      setLoading(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="grid min-h-full bg-[#f5f7f3] lg:grid-cols-[52%_48%]">
      <section className="relative hidden overflow-hidden bg-[#064b3d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-32 -left-32 h-[430px] w-[430px] rounded-full border border-[#c9eb47]/20" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-[#c9eb47] font-[Georgia] text-xl text-[#c9eb47]">G</span>
          <div>
            <div className="font-bold tracking-[0.18em]">GREEN GOLD</div>
            <div className="mt-1 text-[9px] tracking-[0.26em] text-[#9cc7ba]">HOTEL PORTAL</div>
          </div>
        </div>
        <div className="relative max-w-xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9eb47]">Sürdürülebilir konaklama</div>
          <h2 className="mt-5 font-[Georgia] text-5xl leading-[1.08]">Otelinizin Green Stay yolculuğunu yönetin.</h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-[#b9d3cb]">Widget etkileşimlerini, tahmini karbon etkisini ve entegrasyon ayarlarını tek panelden takip edin.</p>
        </div>
        <div className="relative text-xs text-[#8fb9ae]">Green Gold · Hotel Sustainability Platform</div>
      </section>

      <div className="flex items-center justify-center px-5 py-14">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#064b3d] text-[#c9eb47]">
            <LeafIcon />
          </span>
          <div>
            <div className="text-[15px] font-bold tracking-[0.14em] text-[#12372c]">
              GREEN GOLD
            </div>
            <div className="text-xs text-neutral-500">Otel Paneli</div>
          </div>
        </div>

        <div className="gg-card p-7 sm:p-9">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#347866]">Otel yönetim paneli</div>
          <h1 className="mt-3 font-[Georgia] text-4xl font-medium text-[#102b22]">Giriş yap</h1>
          <p className="mt-2 mb-7 text-sm text-[#6d7b75]">
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
                onChange={(e) => setEmail(e.currentTarget.value)}
                className="w-full rounded-lg border border-[#d8e1da] bg-[#fbfcfb] px-3 py-2.5 text-sm text-[#17372d] outline-none focus:border-[#347866] focus:ring-2 focus:ring-[#5c9f80]/20"
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
                className="w-full rounded-lg border border-[#d8e1da] bg-[#fbfcfb] px-3 py-2.5 text-sm text-[#17372d] outline-none focus:border-[#347866] focus:ring-2 focus:ring-[#5c9f80]/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#075442] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40 disabled:opacity-60"
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
      className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-300 disabled:opacity-60"
    >
      {pending ? 'Demo açılıyor…' : 'Demo panelini görüntüle'}
    </button>
  );
}

function LeafIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 20c0-8 6-14 16-14 0 10-6 14-14 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 16c3-3 6-4.5 9-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
