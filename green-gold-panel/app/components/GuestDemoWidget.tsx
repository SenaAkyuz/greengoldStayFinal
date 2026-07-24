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
    <div className="mt-7 grid gap-6 xl:grid-cols-[230px_1fr]">
      {/* Kontroller */}
      <div className="gg-card h-fit p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#347866]">Demo kontrolleri</div>
        <h2 className="mt-2 font-[Georgia] text-xl font-medium text-[#102b22]">Önizleme ayarları</h2>

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
                    ? 'bg-[#075442] text-white'
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
      <div className="gg-card overflow-hidden">
        <div className="flex h-11 items-center gap-2 border-b border-[#dde4de] bg-[#eef1ee] px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef9c88]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e4c16f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#83c59f]" />
          <span className="ml-3 rounded-md bg-white px-14 py-1.5 text-[9px] text-[#7f8a84] shadow-sm">
            book.hoteliniz.com
          </span>
        </div>
        <div className="border-b border-[#e7ebe7] px-7 py-5">
          <div className="font-[Georgia] text-xl tracking-[0.18em] text-[#17372d]">OTELİNİZ</div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#84918b]">Rezervasyon · Güvenli ödeme</div>
        </div>
        <div className="bg-white p-7 sm:p-10">
          <div className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#347866]">Rezervasyon özeti</div>
            <h3 className="mt-2 font-[Georgia] text-2xl font-medium text-[#102b22]">Konaklamanızı tamamlayın</h3>
            <p className="mt-1 text-xs text-[#77847e]">{nights} gece · 2 yetişkin · Vergiler dahil</p>
          </div>
          <div className="max-w-2xl rounded-xl border border-[#dfe6e0] bg-[#fbfcfb] p-3 sm:p-4">
            <div ref={hostRef} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="h-10 rounded-lg border border-[#e1e6e2] bg-white" />
            <div className="h-10 rounded-lg border border-[#e1e6e2] bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
