'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { normalizeEmailInput } from '@/lib/email';
import { LeafIcon } from '../components/LeafIcon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = normalizeEmailInput(email);
    setEmail(normalizedEmail);

    const supabase = createClient();
    // Prod'da güvenilir origin env'den; yoksa tarayıcı origin'i (dev).
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    // Hatayı yut: kayıtlı/kayıtsız ayrımını sızdırmamak için (enumeration önleme).
    await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--ds-color-bg-soft)] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--ds-palette-ink-900)] text-[var(--ds-palette-sun-300)]">
            <LeafIcon />
          </span>
          <div>
            <div className="text-[15px] font-bold tracking-[0.14em] text-[var(--ds-color-heading)]">
              GREEN GOLD
            </div>
            <div className="text-xs text-neutral-500">Otel Paneli</div>
          </div>
        </div>

        <div className="gg-card p-7">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ds-palette-pine-600)]">
            Şifre kurtarma
          </div>
          <h1 className="mt-3 font-sans tracking-tight text-3xl font-medium text-[var(--ds-color-heading)]">
            Şifreni sıfırla
          </h1>
          <p className="mt-2 mb-6 text-sm text-[var(--ds-color-text-muted)]">
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
                className="block rounded text-center text-sm font-medium text-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40"
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
                  onChange={(e) =>
                    setEmail(normalizeEmailInput(e.currentTarget.value))
                  }
                  className="w-full rounded-lg border border-[var(--ds-color-border)] bg-[var(--ds-color-bg-soft)] px-3 py-2.5 text-sm text-[var(--ds-color-heading)] outline-none focus:border-[var(--ds-palette-pine-600)] focus:ring-2 focus:ring-[var(--ds-color-data-1)]/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="min-h-[44px] w-full rounded-lg bg-[var(--ds-palette-pine-700)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40 disabled:opacity-60"
              >
                {loading ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
              </button>

              <Link
                href="/login"
                className="block rounded text-center text-sm font-medium text-neutral-600 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40"
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
