import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
// Tasarım token'ları önce: yalnızca --ds-* değişkenlerini tanımlar.
import "./design/tokens.css";
import "./globals.css";
import { createClient } from '@/lib/supabase/server';
import { SessionGuard } from './components/SessionGuard';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Yeni tasarım dilinin fontu (referans: DM Sans). Yalnızca --font-ds-sans
// değişkenini tanımlar; kullanan bileşen yoksa hiçbir sayfa değişmez.
// latin-ext: Türkçe karakterler (ğ, ş, ı, İ).
const dsSans = DM_Sans({
  variable: "--font-ds-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// OG görselinin mutlak adresi için (tanımlı değilse Next yerel adresi kullanır).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: SITE_URL && /^https?:\/\//.test(SITE_URL) ? new URL(SITE_URL) : undefined,
  title: "GreenGold Stay",
  description: "Oteller için tahmini karbon ayak izi ve gönüllü katkı",
};

// viewport-fit=cover → iPhone çentik/safe-area env() değerleri aktifleşir.
// userScalable kapatılmaz (a11y): iOS oto-zoom'u input font-size:16px ile önlenir.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b393a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${dsSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user && <SessionGuard userId={user.id} />}
        {children}
      </body>
    </html>
  );
}
