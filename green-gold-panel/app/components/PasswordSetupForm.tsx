'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LeafIcon } from './LeafIcon';

// Davet (/set-password) ve kurtarma (/reset-password) akışlarının ortak formu.
// Akışlar route olarak AYRI kalır (davet linki tek kullanımlık ve hassastır);
// yalnızca metinler ve başarı/geçersiz bağlantı yönlendirmeleri farklıdır.
export interface PasswordSetupCopy {
  kicker: string;
  title: string;
  intro: string;
  invalidLink: string;
  invalidLinkHref: string;
  invalidLinkLabel: string;
  updateError: string;
  passwordLabel: string;
  confirmLabel: string;
  submitLabel: string;
  submittingLabel: string;
  successHref: string;
}

export function PasswordSetupForm({ copy }: { copy: PasswordSetupCopy }) {
  return (
    <Suspense fallback={null}>
      <PasswordSetupInner copy={copy} />
    </Suspense>
  );
}

function PasswordSetupInner({ copy }: { copy: PasswordSetupCopy }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasCallbackError = searchParams.get('error') === 'invalid_or_expired';

  // null: kontrol sürüyor, true: geçerli oturum, false: geçersiz/expired.
  // Async token doğrulaması yalnızca callback hatası yokken çalışır.
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasCallbackError) return; // hata render'da bilinir — token'ı doğrulama.
    let active = true;
    const supabase = createClient();
    // getUser() token'ı doğrular — davet/recovery oturumu var mı diye bakıyoruz.
    supabase.auth.getUser().then(({ data }) => {
      if (active) setTokenValid(!!data.user);
    });
    return () => {
      active = false;
    };
  }, [hasCallbackError]);

  // Görüntülenen durum: callback hatası varsa kesin geçersiz; yoksa async sonuç.
  const sessionOk = hasCallbackError ? false : tokenValid;

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
      setError(copy.updateError);
      setLoading(false);
      return;
    }

    // Davet/recovery oturumunu kapat: proxy girişli kullanıcıyı /login'den /'ye atıyor.
    // scope: 'local' — yalnızca bu tarayıcı (paylaşılan hesaplarda güvenli).
    await supabase.auth.signOut({ scope: 'local' });
    router.push(copy.successHref);
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[#f5f7f3] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
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

        <div className="gg-card p-7">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#347866]">
            {copy.kicker}
          </div>
          <h1 className="mt-3 font-[Georgia] text-3xl font-medium text-[#102b22]">
            {copy.title}
          </h1>

          {sessionOk === null && (
            <p className="mt-2 text-sm text-[#5a6862]">Kontrol ediliyor…</p>
          )}

          {sessionOk === false && (
            <div className="mt-4 space-y-4">
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {copy.invalidLink}
              </div>
              <Link
                href={copy.invalidLinkHref}
                className="block rounded text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40"
              >
                {copy.invalidLinkLabel}
              </Link>
            </div>
          )}

          {sessionOk === true && (
            <>
              <p className="mt-2 mb-6 text-sm text-[#5a6862]">{copy.intro}</p>
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
                    {copy.passwordLabel}
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    className="w-full rounded-lg border border-[#d8e1da] bg-[#fbfcfb] px-3 py-2.5 text-sm text-[#17372d] outline-none focus:border-[#347866] focus:ring-2 focus:ring-[#5c9f80]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="mb-1.5 block text-sm font-medium text-neutral-700"
                  >
                    {copy.confirmLabel}
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.currentTarget.value)}
                    className="w-full rounded-lg border border-[#d8e1da] bg-[#fbfcfb] px-3 py-2.5 text-sm text-[#17372d] outline-none focus:border-[#347866] focus:ring-2 focus:ring-[#5c9f80]/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] w-full rounded-lg bg-[#075442] px-4 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40 disabled:opacity-60"
                >
                  {loading ? copy.submittingLabel : copy.submitLabel}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
