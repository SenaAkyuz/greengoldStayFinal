import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isDevToolsEnabled } from '@/lib/dev-only';
import { PreviewFrame } from './PreviewFrame';

export const metadata: Metadata = {
  title: 'Otel paneli önizlemesi (örnek veri)',
  robots: { index: false, follow: false },
};

/**
 * Otel paneli tasarım önizlemesi — ÖRNEK VERİ, yalnız `next dev`.
 * Production'da 404; örnek veri modülleri de production'da hata fırlatır.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (!isDevToolsEnabled()) notFound();
  return <PreviewFrame>{children}</PreviewFrame>;
}
