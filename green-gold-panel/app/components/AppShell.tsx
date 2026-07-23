'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from '../actions';

export type ActivePage =
  | 'overview'
  | 'guest-demo'
  | 'reservations'
  | 'payments'
  | 'carbon'
  | 'funnel'
  | 'certificates'
  | 'reports'
  | 'integration'
  | 'settings';

type NavItem = {
  key: ActivePage;
  label: string;
  href: string;
  icon: React.ReactNode;
};

// Sidebar sırası brief'teki 9 sekme hikâyesini izler; bu adımda YALNIZCA
// mevcut sayfalar linklidir. Misafir Demo / Rezervasyonlar / Tahsilatlar /
// Sertifikalar / Raporlar / Entegrasyon sonraki alt adımlarda eklenecek.
const NAV: NavItem[] = [
  { key: 'overview', label: 'Genel Bakış', href: '/', icon: <GridIcon /> },
  { key: 'guest-demo', label: 'Misafir Demo', href: '/misafir-demo', icon: <EyeIcon /> },
  { key: 'reservations', label: 'Rezervasyonlar', href: '/rezervasyonlar', icon: <CalendarIcon /> },
  { key: 'payments', label: 'Tahsilatlar', href: '/tahsilatlar', icon: <CardIcon /> },
  { key: 'carbon', label: 'Karbon Etkisi', href: '/karbon', icon: <LeafIcon /> },
  { key: 'funnel', label: 'Dönüşüm', href: '/funnel', icon: <FunnelIcon /> },
  { key: 'certificates', label: 'Sertifikalar', href: '/sertifikalar', icon: <AwardIcon /> },
  { key: 'reports', label: 'Raporlar', href: '/raporlar', icon: <ReportIcon /> },
  { key: 'integration', label: 'Entegrasyon', href: '/entegrasyon', icon: <CodeIcon /> },
  { key: 'settings', label: 'Ayarlar', href: '/ayarlar', icon: <GearIcon /> },
];

export function AppShell({
  hotelName,
  city,
  active,
  children,
}: {
  hotelName?: string;
  city?: string | null;
  active: ActivePage;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-full bg-neutral-50">
      {/* Masaüstü sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <BrandBlock />
        <NavList active={active} />
      </aside>

      {/* Mobil açılır menü */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <BrandBlock />
            <NavList active={active} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* İçerik alanı */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* İnce üst bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menüyü aç"
              aria-expanded={menuOpen}
              className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-300 text-neutral-700 md:hidden"
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-neutral-900">
                {hotelName ?? 'Otel Paneli'}
              </div>
              {city && (
                <div className="truncate text-xs text-neutral-500">{city}</div>
              )}
            </div>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              Çıkış
            </button>
          </form>
        </header>

        {children}
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-4">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">
        <LeafIcon />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-neutral-900">Green Gold</div>
        <div className="text-xs text-neutral-500">Otel Paneli</div>
      </div>
    </div>
  );
}

function NavList({
  active,
  onNavigate,
}: {
  active: ActivePage;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ' +
              (isActive
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900')
            }
          >
            <span
              className={isActive ? 'text-emerald-700' : 'text-neutral-400'}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LeafIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20c0-8 6-14 16-14 0 10-6 14-14 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 16c3-3 6-4.5 9-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FunnelIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 5h18l-7 8v6l-4 2v-8L3 5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 12a7.4 7.4 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7.3 7.3 0 0 0-2.2-1.3L14.4 2h-4l-.4 2.4a7.3 7.3 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7.3 7.3 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.3 7.3 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.07-.43.1-.86.1-1.3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AwardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 13.5L8 21l4-2 4 2-1-7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l5 5v13H7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 13h6M10 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
