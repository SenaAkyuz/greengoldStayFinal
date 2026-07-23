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
    <main className="flex min-h-full items-center justify-center bg-neutral-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-700 text-white">
            <LeafIcon />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-neutral-900">
              Green Gold
            </div>
            <div className="text-xs text-neutral-500">Otel Paneli</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-neutral-900">Giriş yap</h1>
          <p className="mt-1 mb-5 text-sm text-neutral-500">
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 disabled:opacity-60"
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
          </form>

          {demoEnabled && <DemoLogin />}
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
        Kimlik bilgileri sunucuda kalır; production’da görünmez.
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
      {pending ? 'Giriş yapılıyor…' : 'Demo olarak gir (yalnızca geliştirme)'}
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
