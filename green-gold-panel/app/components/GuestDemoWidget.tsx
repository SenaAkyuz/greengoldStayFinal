'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Dev'de widget bundle panel public'ten servis edilir; prod'da CDN adresi verilir.
const WIDGET_SRC =
  process.env.NEXT_PUBLIC_WIDGET_SRC ?? '/green-gold-widget.v1.js';

const TAG = 'green-gold-widget';
// Script yüklendi ama custom element hâlâ tanımlı değilse bu süre sonunda hata
// durumuna düşeriz (sessiz beyaz alan yerine erişilebilir bir mesaj).
const DEFINE_TIMEOUT_MS = 8000;

type LoadState = 'loading' | 'ready' | 'error';

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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // Yeniden dene: script'i baştan enjekte etmek için sayaç.
  const [attempt, setAttempt] = useState(0);

  // Widget script'ini yükle. Script zaten varsa (aynı sayfada iki önizleme)
  // TEKRAR EKLEME; yalnızca tanımlanmasını bekle.
  useEffect(() => {
    let cancelled = false;
    const onFail = () => {
      if (!cancelled) setLoadState('error');
    };

    // whenDefined, element zaten tanımlıysa da asenkron çözülür; bu yüzden
    // effect gövdesinde senkron setState yapmaya gerek kalmaz.
    customElements
      .whenDefined(TAG)
      .then(() => {
        if (!cancelled) setLoadState('ready');
      })
      .catch(onFail);

    const timer = setTimeout(() => {
      if (!cancelled && !customElements.get(TAG)) onFail();
    }, DEFINE_TIMEOUT_MS);

    // Script zaten varsa (aynı sayfada iki önizleme) TEKRAR EKLEME.
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-ggw-preview]',
    );
    if (existing) {
      existing.addEventListener('error', onFail);
    } else if (!customElements.get(TAG)) {
      const s = document.createElement('script');
      s.src = attempt === 0 ? WIDGET_SRC : `${WIDGET_SRC}?retry=${attempt}`;
      s.async = true;
      s.dataset.ggwPreview = 'true';
      s.addEventListener('error', onFail);
      document.body.appendChild(s);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      existing?.removeEventListener('error', onFail);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    // Başarısız script'i kaldır ki effect yenisini enjekte edebilsin.
    document
      .querySelectorAll('script[data-ggw-preview]')
      .forEach((el) => el.remove());
    setLoadState('loading');
    setAttempt((a) => a + 1);
  }, []);

  // <green-gold-widget> öğesini bir kez oluştur (data-preview="true").
  // Hata durumunda host DOM'da olmaz; loadState değişince yeniden çalışır.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const el = document.createElement(TAG);
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
  }, [publicKey, apiBase, loadState]);

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
                aria-pressed={lang === l}
                className={
                  'min-h-[44px] rounded-md px-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40 ' +
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

      {/* Temsili booking çerçevesi — TAMAMI GÖRSEL KABUKTUR.
          İşlevsel olan tek parça, aşağıdaki gerçek widget önizlemesidir. */}
      <div className="gg-card overflow-hidden">
        {/* Sahte adres çubuğu: 320px'de kırılmasın diye sabit px yerine esnek. */}
        <div className="flex h-11 items-center gap-2 border-b border-[#dde4de] bg-[#eef1ee] px-3 sm:px-4">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ef9c88]" />
          <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-[#e4c16f] sm:block" />
          <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-[#83c59f] sm:block" />
          <span className="ml-1 min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1.5 text-center text-[9px] text-[#7f8a84] shadow-sm sm:ml-3">
            book.hoteliniz.com
          </span>
        </div>
        <div className="border-b border-[#e7ebe7] px-5 py-5 sm:px-7">
          <div className="font-[Georgia] text-lg tracking-[0.18em] text-[#17372d] sm:text-xl">
            OTELİNİZ
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#84918b]">
            Rezervasyon · Güvenli ödeme
          </div>
        </div>

        <CheckoutSteps />

        <div className="bg-white p-5 sm:p-10">
          <div className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#347866]">Rezervasyon özeti</div>
            <h3 className="mt-2 font-[Georgia] text-2xl font-medium text-[#102b22]">Konaklamanızı tamamlayın</h3>
            <p className="mt-1 text-xs text-[#77847e]">{nights} gece · 2 yetişkin · Vergiler dahil</p>
          </div>

          {/* Widget'ın checkout akışındaki yeri — vurgulu çerçeve. */}
          <div className="max-w-2xl rounded-xl border-2 border-dashed border-[#a8cbb6] bg-[#fbfcfb] p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#347866]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#347866]">
                Green Gold adımı
              </span>
            </div>

            {loadState === 'error' ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-center"
              >
                <p className="text-sm font-semibold text-amber-900">
                  Önizleme yüklenemedi
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-amber-800">
                  Widget dosyasına ulaşılamadı. Bağlantınızı kontrol edip tekrar
                  deneyebilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[#075442] px-5 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40"
                >
                  Yeniden dene
                </button>
              </div>
            ) : (
              <>
                {loadState === 'loading' && (
                  <p className="px-1 py-2 text-xs text-[#77847e]" role="status">
                    Önizleme yükleniyor…
                  </p>
                )}
                <div ref={hostRef} />
              </>
            )}
          </div>

          {/* Temsili ödeme önizlemesi — gerçek ödeme alanı DEĞİLDİR. */}
          <div className="mt-5 max-w-2xl" aria-hidden="true">
            <div className="grid gap-3 sm:grid-cols-2">
              <FakeField label="Kart bilgileri" />
              <FakeField label="Fatura adresi" />
            </div>
            <div className="mt-3 h-11 rounded-lg bg-[#dfe6e0]" />
          </div>
          <p className="mt-2 max-w-2xl text-[11px] text-[#8b968f]">
            Yukarıdaki ödeme alanları temsilidir; bu sayfada ödeme alınmaz.
          </p>
        </div>
      </div>
    </div>
  );
}

// Checkout adım göstergesi. Yalnızca görsel kabuk — gerçek bir booking akışı
// değildir; Green Stay adımının akıştaki yerini anlatır.
const STEPS = ['Tarih', 'Oda', 'Green Stay', 'Ödeme', 'Onay'] as const;
const ACTIVE_STEP = 2; // 'Green Stay'

function CheckoutSteps() {
  return (
    <nav
      aria-label="Temsili rezervasyon adımları"
      className="border-b border-[#e7ebe7] bg-[#f7f9f7] px-3 py-3 sm:px-7"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((label, i) => {
          const isActive = i === ACTIVE_STEP;
          const isDone = i < ACTIVE_STEP;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
                  (isActive
                    ? 'bg-[#075442] text-white'
                    : isDone
                      ? 'bg-[#e2efe6] text-[#2f6b58]'
                      : 'bg-white text-[#8b968f] ring-1 ring-[#e1e6e2]')
                }
              >
                {/* Renk tek başına anlam taşımasın: durum metinle de veriliyor. */}
                <span className="tabular-nums">{i + 1}</span>
                {label}
                {isActive && <span className="sr-only">(bulunduğunuz adım)</span>}
                {isDone && <span className="sr-only">(tamamlandı)</span>}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-[#c3cec7]">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function FakeField({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[#e1e6e2] bg-white px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-[#a3ada7]">
        {label}
      </div>
      <div className="mt-1.5 h-3 w-2/3 rounded bg-[#eef1ee]" />
    </div>
  );
}
