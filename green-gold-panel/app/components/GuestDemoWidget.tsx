'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

// Dev'de widget bundle panel public'ten servis edilir; prod'da CDN adresi verilir.
const WIDGET_SRC =
  process.env.NEXT_PUBLIC_WIDGET_SRC ?? '/green-gold-widget.v1.js?v=20261127-1';

const TAG = 'green-gold-widget';
// Script yüklendi ama custom element hâlâ tanımlı değilse bu süre sonunda hata
// durumuna düşeriz (sessiz beyaz alan yerine erişilebilir bir mesaj).
const DEFINE_TIMEOUT_MS = 8000;

type LoadState = 'loading' | 'ready' | 'error';
export type PreviewOverride = {
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  currency: string;
  source?: 'hotel' | 'regional';
};

const subscribePreview = () => () => {};
const readPreview = () => {
  try { return window.sessionStorage.getItem('greengold_demo_carbon_preview'); }
  catch { return null; }
};
const readServerPreview = () => null;

function parsePreview(raw: string | null): PreviewOverride | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PreviewOverride>;
    return Number.isFinite(value.amount_per_night) && Number(value.amount_per_night) >= 0 &&
      Number.isFinite(value.estimated_co2_per_night_kg) && Number(value.estimated_co2_per_night_kg) > 0 &&
      typeof value.currency === 'string'
      ? value as PreviewOverride
      : null;
  } catch {
    return null;
  }
}

export function GuestDemoWidget({
  publicKey,
  apiBase,
  allowStoredPreview,
  fixedPreview,
  initialNights = 1,
}: {
  publicKey: string;
  apiBase: string;
  allowStoredPreview: boolean;
  /** Demo senaryosu: temsili gecelik değerler (yalnız önizleme; veritabanına dokunmaz). */
  fixedPreview?: PreviewOverride | null;
  initialNights?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const [nights, setNights] = useState(initialNights);
  const [rooms, setRooms] = useState(1);
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const rawPreview = useSyncExternalStore(subscribePreview, readPreview, readServerPreview);
  const storedPreview = useMemo(() => parsePreview(rawPreview), [rawPreview]);
  const previewOverride = fixedPreview ?? (allowStoredPreview ? storedPreview : null);
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
      s.src = attempt === 0 ? WIDGET_SRC : `${WIDGET_SRC}${WIDGET_SRC.includes('?') ? '&' : '?'}retry=${attempt}`;
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
    el.setAttribute('data-rooms', String(rooms));
    el.setAttribute('data-lang', lang);
    if (previewOverride) {
      el.setAttribute('data-preview-amount', String(previewOverride.amount_per_night));
      el.setAttribute('data-preview-co2', String(previewOverride.estimated_co2_per_night_kg));
      el.setAttribute('data-preview-currency', previewOverride.currency);
      el.setAttribute('data-preview-source', previewOverride.source === 'regional' ? 'regional' : 'hotel');
    }
    host.appendChild(el);
    elRef.current = el;
    return () => {
      el.remove();
      elRef.current = null;
    };
    // nights/rooms/lang bilerek dışarıda: onları setAttribute ile canlı güncelliyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, apiBase, loadState, previewOverride]);

  // Seçiciler attribute'ları canlı değiştirir (öğe yeniden çizilir).
  useEffect(() => {
    elRef.current?.setAttribute('data-nights', String(nights));
  }, [nights]);
  useEffect(() => {
    elRef.current?.setAttribute('data-rooms', String(rooms));
  }, [rooms]);
  useEffect(() => {
    elRef.current?.setAttribute('data-lang', lang);
  }, [lang]);

  return (
    <div className="mt-7 grid gap-6 xl:grid-cols-[230px_1fr]">
      {/* Kontroller */}
      <div className="gg-card h-fit p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ds-palette-pine-600)]">Önizleme kontrolleri</div>
        <h2 className="mt-2 font-sans tracking-tight text-xl font-medium text-[var(--ds-color-heading)]">Önizleme ayarları</h2>

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
          <label
            htmlFor="demo-rooms"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Oda sayısı
          </label>
          <input
            id="demo-rooms"
            type="number"
            min={1}
            max={20}
            value={rooms}
            onChange={(e) =>
              setRooms(Math.max(1, Math.floor(Number(e.currentTarget.value) || 1)))
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
                  'min-h-[44px] rounded-md px-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40 ' +
                  (lang === l
                    ? 'bg-[var(--ds-palette-pine-700)] text-white'
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
      <div className="gg-card overflow-hidden" lang={lang}>
        {/* Sahte adres çubuğu: 320px'de kırılmasın diye sabit px yerine esnek. */}
        <div className="flex h-11 items-center gap-2 border-b border-[var(--ds-color-border)] bg-[var(--ds-palette-sage-50)] px-3 sm:px-4">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ds-tone-danger-border)]" />
          <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ds-palette-sun-500)] sm:block" />
          <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ds-color-data-1)] sm:block" />
          <span className="ml-1 min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1.5 text-center text-[9px] text-[var(--ds-palette-rule-300)] shadow-sm sm:ml-3">
            book.hoteliniz.com
          </span>
        </div>
        <div className="border-b border-[var(--ds-palette-sage-50)] px-5 py-5 sm:px-7">
          <div className="font-sans tracking-tight text-lg tracking-[0.18em] text-[var(--ds-color-heading)] sm:text-xl">
            {BOOKING_FRAME[lang].hotel}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[var(--ds-palette-rule-300)]">
            {BOOKING_FRAME[lang].tagline}
          </div>
        </div>

        <CheckoutSteps lang={lang} />

        <div className="bg-white p-5 sm:p-10">
          <div className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ds-palette-pine-600)]">{BOOKING_FRAME[lang].summary}</div>
            <h3 className="mt-2 font-sans tracking-tight text-2xl font-medium text-[var(--ds-color-heading)]">{BOOKING_FRAME[lang].title}</h3>
            <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">{BOOKING_FRAME[lang].stay(rooms, nights)}</p>
          </div>

          {/* Widget'ın checkout akışındaki yeri — vurgulu çerçeve. */}
          <div className="max-w-2xl rounded-xl border-2 border-dashed border-[var(--ds-color-data-muted)] bg-[var(--ds-color-bg-soft)] p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ds-palette-pine-600)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ds-palette-pine-600)]">
                {BOOKING_FRAME[lang].step}
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
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[var(--ds-palette-pine-700)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-data-1)]/40"
                >
                  Yeniden dene
                </button>
              </div>
            ) : (
              <>
                {loadState === 'loading' && (
                  <p className="px-1 py-2 text-xs text-[var(--ds-color-text-muted)]" role="status">
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
              <FakeField label={BOOKING_FRAME[lang].card} />
              <FakeField label={BOOKING_FRAME[lang].billing} />
            </div>
            <div className="mt-3 h-11 rounded-lg bg-[var(--ds-color-border)]" />
          </div>
          <p className="mt-2 max-w-2xl text-[11px] text-[var(--ds-palette-rule-300)]">
            Yukarıdaki ödeme alanları temsilidir; bu sayfada ödeme alınmaz.
          </p>
        </div>
      </div>
    </div>
  );
}

// Temsili rezervasyon kabuğunun metinleri — widget dili seçilince kabuk da
// aynı dilde görünür (UX-4.6). Panel açıklamaları (otel yöneticisine) Türkçe kalır.
export const BOOKING_FRAME = {
  tr: {
    hotel: 'OTELİNİZ',
    tagline: 'Rezervasyon · Güvenli ödeme',
    summary: 'Rezervasyon özeti',
    title: 'Konaklamanızı tamamlayın',
    stay: (rooms: number, nights: number) => `${rooms} oda · ${nights} gece · Vergiler dahil`,
    step: 'Green Gold adımı',
    card: 'Kart bilgileri',
    billing: 'Fatura adresi',
    steps: ['Tarih', 'Oda', 'Green Stay', 'Ödeme', 'Onay'],
    navLabel: 'Temsili rezervasyon adımları',
    current: '(bulunduğunuz adım)',
    done: '(tamamlandı)',
  },
  en: {
    hotel: 'YOUR HOTEL',
    tagline: 'Booking · Secure payment',
    summary: 'Booking summary',
    title: 'Complete your stay',
    stay: (rooms: number, nights: number) =>
      `${rooms} room${rooms === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'} · Taxes included`,
    step: 'Green Gold step',
    card: 'Card details',
    billing: 'Billing address',
    steps: ['Dates', 'Room', 'Green Stay', 'Payment', 'Confirmation'],
    navLabel: 'Sample booking steps',
    current: '(current step)',
    done: '(completed)',
  },
} as const;

// Checkout adım göstergesi. Yalnızca görsel kabuk — gerçek bir booking akışı
// değildir; Green Stay adımının akıştaki yerini anlatır.
const ACTIVE_STEP = 2; // 'Green Stay'

function CheckoutSteps({ lang }: { lang: 'tr' | 'en' }) {
  const STEPS = BOOKING_FRAME[lang].steps;
  const f = BOOKING_FRAME[lang];
  return (
    <nav
      aria-label={f.navLabel}
      className="border-b border-[var(--ds-palette-sage-50)] bg-[var(--ds-color-bg-soft)] px-3 py-3 sm:px-7"
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
                    ? 'bg-[var(--ds-palette-pine-700)] text-white'
                    : isDone
                      ? 'bg-[var(--ds-palette-sage-100)] text-[var(--ds-palette-pine-600)]'
                      : 'bg-white text-[var(--ds-palette-rule-300)] ring-1 ring-[var(--ds-color-border)]')
                }
              >
                {/* Renk tek başına anlam taşımasın: durum metinle de veriliyor. */}
                <span className="tabular-nums">{i + 1}</span>
                {label}
                {isActive && <span className="sr-only">{f.current}</span>}
                {isDone && <span className="sr-only">{f.done}</span>}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-[var(--ds-color-border-strong)]">
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
    <div className="rounded-lg border border-[var(--ds-color-border)] bg-white px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--ds-palette-rule-300)]">
        {label}
      </div>
      <div className="mt-1.5 h-3 w-2/3 rounded bg-[var(--ds-palette-sage-50)]" />
    </div>
  );
}
