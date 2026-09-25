import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Green Gold · Otel Paneli",
  description: "Widget etkileşim özeti ve entegrasyon",
};

// viewport-fit=cover → iPhone çentik/safe-area env() değerleri aktifleşir.
// userScalable kapatılmaz (a11y): iOS oto-zoom'u input font-size:16px ile önlenir.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#064b3d",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user && <SessionGuard userId={user.id} />}
        {children}
      </body>
    </html>
  );
}
