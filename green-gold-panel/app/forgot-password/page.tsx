'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // Prod'da güvenilir origin env'den; yoksa tarayıcı origin'i (dev).
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    // Hatayı yut: kayıtlı/kayıtsız ayrımını sızdırmamak için (enumeration önleme).
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    setSent(true);
    setLoading(false);
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
            Şifreni sıfırla
          </h1>
          <p className="mt-1 mb-5 text-sm text-neutral-500">
            E-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı
                gönderildi. Gelen kutunu kontrol et.
              </div>
              <Link
                href="/login"
                className="block text-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                Girişe dön
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 disabled:opacity-60"
              >
                {loading ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
              </button>

              <Link
                href="/login"
                className="block text-center text-sm font-medium text-neutral-600 hover:text-neutral-900"
              >
                Girişe dön
              </Link>
            </form>
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
