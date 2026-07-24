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
            className="rounded-full bg-[#075442] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#043f34]"
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
        </div>

        {/* Zorunlu dürüstlük ibareleri */}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-[#d2e5d6] bg-[#edf6ee] px-4 py-3 text-xs text-[#174d3f]">
            Bu bir <strong>önizlemedir</strong>; buradaki etkileşimler raporlara
            yansımaz ve ödeme alınmaz.
          </div>
          <div className="rounded-xl border border-[#e6e2c8] bg-[#faf7e8] px-4 py-3 text-xs text-[#6b5d1f]">
            Karbon değerleri <strong>tahminidir</strong>; doğrulanmış bir karbon
            dengelemesi (offset) değildir.
          </div>
        </div>

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
              className="mt-5 inline-block rounded-full bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#043f34]"
            >
              Paneli görüntüle
            </Link>
          </div>
        )}

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
            className="mt-4 inline-block rounded-full bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#043f34] sm:mt-0"
          >
            Paneli görüntüle
          </Link>
        </div>
      </div>
    </main>
  );
}
