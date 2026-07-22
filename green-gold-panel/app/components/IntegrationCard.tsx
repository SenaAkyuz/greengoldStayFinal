'use client';

import { useState } from 'react';

export function IntegrationCard({ embedCode }: { embedCode: string }) {
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

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Entegrasyon
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Aşağıdaki kodu sitenizin ödeme (checkout) sayfasına yapıştırın.
          </p>
        </div>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        >
          {copied ? 'Kopyalandı ✓' : 'Kopyala'}
        </button>
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
        <code>{embedCode}</code>
      </pre>

      <p className="mt-3 text-xs text-neutral-400">
        Not: <code className="text-neutral-500">cdn.greengold.example</code>{' '}
        geçici bir adrestir; yayına alındığında gerçek CDN adresiyle
        güncellenecektir.
      </p>
    </section>
  );
}
