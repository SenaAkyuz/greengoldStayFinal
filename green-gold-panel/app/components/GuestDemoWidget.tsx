'use client';

import { useEffect, useRef, useState } from 'react';

// Dev'de widget bundle panel public'ten servis edilir; prod'da CDN adresi verilir.
const WIDGET_SRC =
  process.env.NEXT_PUBLIC_WIDGET_SRC ?? '/green-gold-widget.v1.js';

export function GuestDemoWidget({
  publicKey,
  apiBase,
}: {
  publicKey: string;
  apiBase: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const [nights, setNights] = useState(1);
  const [lang, setLang] = useState<'tr' | 'en'>('tr');

  // Widget script'ini bir kez yükle.
  useEffect(() => {
    if (document.querySelector('script[data-ggw-preview]')) return;
    const s = document.createElement('script');
    s.src = WIDGET_SRC;
    s.async = true;
    s.dataset.ggwPreview = 'true';
    document.body.appendChild(s);
  }, []);

  // <green-gold-widget> öğesini bir kez oluştur (data-preview="true").
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const el = document.createElement('green-gold-widget');
    el.setAttribute('data-key', publicKey);
    el.setAttribute('data-api', apiBase);
    el.setAttribute('data-preview', 'true');
    el.setAttribute('data-nights', String(nights));
    el.setAttribute('data-lang', lang);
    host.appendChild(el);
    elRef.current = el;
    return () => {
      el.remove();
      elRef.current = null;
    };
    // nights/lang bilerek dışarıda: onları setAttribute ile canlı güncelliyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, apiBase]);

  // Seçiciler attribute'ları canlı değiştirir (öğe yeniden çizilir).
  useEffect(() => {
    elRef.current?.setAttribute('data-nights', String(nights));
  }, [nights]);
  useEffect(() => {
    elRef.current?.setAttribute('data-lang', lang);
  }, [lang]);

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
      {/* Kontroller */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Önizleme ayarları</h2>

        <div className="mt-4">
          <label
            htmlFor="demo-nights"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Gece sayısı
          </label>
          <input
            id="demo-nights"
            type="number"
            min={1}
            max={30}
            value={nights}
            onChange={(e) =>
              setNights(Math.max(1, Math.floor(Number(e.currentTarget.value) || 1)))
            }
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">
            Dil
          </span>
          <div className="inline-flex rounded-lg border border-neutral-300 p-0.5">
            {(['tr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                  (lang === l
                    ? 'bg-emerald-700 text-white'
                    : 'text-neutral-600 hover:bg-neutral-50')
                }
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canlı widget */}
      <div className="flex items-start justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6">
        <div ref={hostRef} />
      </div>
    </div>
  );
}
