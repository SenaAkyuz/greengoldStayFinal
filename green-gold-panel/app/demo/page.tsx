import Link from 'next/link';
import type { Metadata } from 'next';
import { getApiBaseUrl } from '@/lib/api';
import { GuestDemoWidget } from '../components/GuestDemoWidget';

export const metadata: Metadata = {
  title: 'Green Gold · Widget Demo',
  description: 'Green Gold sürdürülebilirlik widget’ının canlı önizlemesi.',
};

// PUBLIC sayfa: auth YOK, getUser() YOK, oturum token'ı KULLANILMAZ.
// Tek veri kaynağı, widget'ın kendi public GET /widget/config?key=... çağrısıdır.
// Demo key tasarımı gereği public (embed kodunda zaten görünür; hassas değil).
export default function DemoPage() {
  const demoKey = process.env.NEXT_PUBLIC_DEMO_WIDGET_KEY;
  const apiBase = getApiBaseUrl();

  return (
    <main className="min-h-full bg-[#f5f7f3]">
      {/* Üst bar (public — panel shell'i değil) */}
      <header className="border-b border-[#dce4dc] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#064b3d] font-[Georgia] text-[#c9eb47]">
              G
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-[0.14em] text-[#12372c]">
                GREEN GOLD
              </div>
              <div className="text-[11px] text-neutral-500">Widget Demo</div>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-full bg-[#075442] px-4 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40"
          >
            Paneli görüntüle
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Hero / kısa anlatım */}
        <div className="max-w-2xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#347866]">
            Misafir deneyimi önizlemesi
          </div>
          <h1 className="mt-3 font-[Georgia] text-4xl font-medium tracking-tight text-[#102b22] sm:text-5xl">
            Misafirin gördüğü sürdürülebilirlik adımı
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#5e716a] sm:text-base">
            Green Gold widget’ı, otelin rezervasyon/checkout akışına küçük bir
            adım ekler: misafir konaklamasının tahmini karbon etkisini görür ve
            dilerse bir katkı adımı seçer. Aşağıdaki önizleme canlıdır.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#dbe4dd] bg-white px-3.5 py-1.5 text-xs font-medium text-[#42605a]">
            Giriş yapmadan inceleyebilirsiniz — hesap gerekmez.
          </p>
        </div>

        {/* Zorunlu dürüstlük ibareleri — her madde ayrı ayrı görünür. */}
        <section
          aria-labelledby="durustluk-basligi"
          className="mt-7 rounded-2xl border border-[#d2e5d6] bg-[#edf6ee] px-5 py-4"
        >
          <h2
            id="durustluk-basligi"
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#17614f]"
          >
            Bu sayfa hakkında
          </h2>
          <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-[#174d3f] sm:grid-cols-2">
            {[
              'Bu bir önizlemedir.',
              'Etkileşimler raporlara yansımaz.',
              'Ödeme alınmaz.',
              'Karbon değerleri tahminidir.',
              'Doğrulanmış karbon dengelemesi değildir.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-[3px] text-[#2f7667]">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Canlı önizleme veya nazik "kullanılamıyor" mesajı */}
        {demoKey ? (
          <div className="mt-8">
            <GuestDemoWidget publicKey={demoKey} apiBase={apiBase} />
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-[#dbe4dd] bg-white p-8 text-center">
            <div className="font-[Georgia] text-xl text-[#102b22]">
              Demo şu an kullanılamıyor
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
              Widget önizlemesi geçici olarak devre dışı. Lütfen daha sonra tekrar
              deneyin ya da paneli görüntüleyin.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-[#075442] px-5 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40"
            >
              Paneli görüntüle
            </Link>
          </div>
        )}

        {/* Nasıl çalışır? */}
        <section aria-labelledby="nasil-calisir" className="mt-12">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#347866]">
            Üç adım
          </div>
          <h2
            id="nasil-calisir"
            className="mt-2 font-[Georgia] text-3xl font-medium tracking-tight text-[#102b22]"
          >
            Nasıl çalışır?
          </h2>

          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                t: 'Misafir tahmini etkiyi görür',
                d: 'Konaklamanın tahmini karbon etkisi, checkout akışının içinde gösterilir.',
              },
              {
                t: 'İsterse katkı adımını seçer',
                d: 'Katkı adımı tamamen isteğe bağlıdır; misafir seçmeden de devam edebilir.',
              },
              {
                t: 'Otel eğilimi panelden izler',
                d: 'Görüntülenme, seçim ve dönüşüm özeti otel panelinde toplanır.',
              },
            ].map((s, i) => (
              <li key={s.t} className="gg-card p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#edf5ef] font-semibold text-[#1c6b58] tabular-nums">
                  {i + 1}
                </span>
                <div className="mt-3 text-sm font-semibold text-[#102b22]">
                  {s.t}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#68766f]">
                  {s.d}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-4 rounded-xl border border-[#e6e2c8] bg-[#faf7e8] px-4 py-3 text-xs leading-relaxed text-[#6b5d1f]">
            <strong>Katkı seçimi bir ödeme değildir.</strong> Misafir katkı
            adımını seçtiğinde herhangi bir tahsilat yapılmaz; bu yalnızca bir
            eğilim sinyalidir.
          </p>
        </section>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-[#dbe4dd] bg-white px-6 py-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="font-[Georgia] text-lg text-[#102b22]">
              Otel panelini görmek ister misiniz?
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Etkileşim, dönüşüm ve tahmini karbon özetini demo hesabıyla
              inceleyin.
            </p>
          </div>
          <Link
            href="/login"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-[#075442] px-5 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40 sm:mt-0"
          >
            Paneli görüntüle
          </Link>
        </div>
      </div>
    </main>
  );
}
