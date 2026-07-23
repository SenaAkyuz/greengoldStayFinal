'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// Davet akışı: yeni yönetici ilk şifresini belirler. Recovery (/reset-password)
// akışından AYRI — davet linki tek kullanımlık ve hassastır.
export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasCallbackError = searchParams.get('error') === 'invalid_or_expired';

  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasCallbackError) {
      setSessionOk(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setSessionOk(!!data.user);
    });
  }, [hasCallbackError]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Şifre en az 8 karakter olmalı.');
      return;
    }
    if (password !== confirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(
        'Şifre belirlenemedi. Davet linkinin süresi dolmuş olabilir; operatörden yeni link isteyin.',
      );
      setLoading(false);
      return;
    }

    // Davet oturumunu kapat: proxy girişli kullanıcıyı /login'den /'ye atıyor.
    await supabase.auth.signOut();
    router.push('/login?welcome=1');
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
          <h1 className="text-lg font-semibold text-neutral-900">
            Hesabınızı etkinleştirin
          </h1>

          {sessionOk === null && (
            <p className="mt-1 text-sm text-neutral-500">Kontrol ediliyor…</p>
          )}

          {sessionOk === false && (
            <div className="mt-4 space-y-4">
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Davet bağlantısı geçersiz veya süresi dolmuş. Bu bağlantı tek
                kullanımlıktır — operatörden yeni bir davet linki isteyin.
              </div>
              <Link
                href="/login"
                className="block text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Girişe dön
              </Link>
            </div>
          )}

          {sessionOk === true && (
            <>
              <p className="mt-1 mb-5 text-sm text-neutral-500">
                Panele erişmek için bir şifre belirleyin (en az 8 karakter).
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
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
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-neutral-700"
                  >
                    Şifre
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="mb-1.5 block text-sm font-medium text-neutral-700"
                  >
                    Şifre (tekrar)
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.currentTarget.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 disabled:opacity-60"
                >
                  {loading ? 'Kaydediliyor…' : 'Şifreyi belirle ve gir'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
