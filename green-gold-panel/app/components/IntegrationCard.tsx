'use client';

import { useState } from 'react';

export function IntegrationCard({
  embedCode,
  allowedOrigins,
  widgetSrc,
  apiBaseUrl,
  publicKey,
  widgetSrcConfigured,
}: {
  embedCode: string;
  allowedOrigins?: string[];
  widgetSrc: string;
  apiBaseUrl: string;
  publicKey: string;
  widgetSrcConfigured: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano erişilemezse sessizce geç */
    }
  }

  const origins = allowedOrigins ?? [];
  const hasOrigins = origins.length > 0;

  return (
    <section className="gg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Embed kodu
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Aşağıdaki kodu sitenizin ödeme (checkout) sayfasına yapıştırın.
          </p>
        </div>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-[#cfdad2] px-3 py-1.5 text-sm font-medium text-[#315d50] transition hover:bg-[#f1f6f2] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/30"
        >
          {copied ? 'Kopyalandı ✓' : 'Kopyala'}
        </button>
      </div>

      {/* Bağlantı bilgileri — public key BİLEREK maskelenmiyor (embed kodunda
          zaten görünür, hassas değil). Service role burada asla yer almaz. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ConnectionField label="Widget script URL" value={widgetSrc} />
        <ConnectionField label="API URL" value={apiBaseUrl} />
        <ConnectionField label="Public widget key" value={publicKey} />
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl bg-[#073c32] p-4 text-xs leading-relaxed text-[#e9f4ef]">
        <code>{embedCode}</code>
      </pre>

      {!widgetSrcConfigured && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          Widget script adresi henüz yapılandırılmadı (
          <code className="text-amber-900">NEXT_PUBLIC_WIDGET_SRC</code> /{' '}
          <code className="text-amber-900">NEXT_PUBLIC_SITE_URL</code>{' '}
          eksik). Yukarıdaki embed kodu geçici bir placeholder adres içeriyor
          — canlıya almadan önce ayarlanmalı.
        </div>
      )}

      {/* İzinli domain durumu */}
      <div className="mt-5 border-t border-neutral-200 pt-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          İzinli domain’ler
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Widget yalnızca Ayarlar’daki izinli domain’lerde çalışır.
        </p>

        {hasOrigins ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {origins.map((o) => (
              <li
                key={o}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700"
              >
                {o}
              </li>
            ))}
          </ul>
        ) : (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Henüz izinli domain eklenmemiş — widget hiçbir sitede çalışmaz.
            Ayarlar’dan otelinizin domain’ini ekleyin.
          </div>
        )}
      </div>
    </section>
  );
}

function ConnectionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-xs text-neutral-800">
        {value}
      </div>
    </div>
  );
}
