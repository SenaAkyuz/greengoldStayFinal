'use client';

import { useEffect, useState } from 'react';
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
  isDemo = false,
  children,
}: {
  hotelName?: string;
  city?: string | null;
  active: ActivePage;
  isDemo?: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Mobil drawer açıkken: Esc ile kapat + arka plan scroll'unu kilitle.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-full bg-[#f5f7f3]">
      {/* Masaüstü sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[278px] shrink-0 flex-col bg-[#064b3d] text-white md:flex">
        <BrandBlock />
        <HotelBlock hotelName={hotelName} city={city} />
        <NavList active={active} />
        <ConnectionStatus />
        <SidebarLogout />
      </aside>

      {/* Mobil açılır menü */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="gg-safe-top absolute inset-y-0 left-0 flex w-[min(278px,85vw)] max-w-[278px] flex-col bg-[#064b3d] text-white shadow-2xl">
            <BrandBlock />
            <HotelBlock hotelName={hotelName} city={city} />
            <NavList active={active} onNavigate={() => setMenuOpen(false)} />
            <ConnectionStatus />
            <SidebarLogout />
          </div>
        </div>
      )}

      {/* İçerik alanı */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* İnce üst bar */}
        <header className="gg-safe-top sticky top-0 z-30 flex h-[74px] items-center justify-between gap-3 border-b border-[#dce4dc] bg-[#f8faf7]/94 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menüyü aç"
              aria-expanded={menuOpen}
              className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-300 text-neutral-700 md:hidden"
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

          <div className="flex items-center gap-3">
            {isDemo && (
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Demo modu — salt okunur
              </span>
            )}
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#dbe4dd] bg-white text-xs font-bold text-[#075442] shadow-sm">
              {(hotelName ?? 'GG').slice(0, 2).toUpperCase()}
            </span>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-semibold text-[#17372d]">Otel Yöneticisi</div>
              <div className="text-xs text-[#718079]">Green Gold Portal</div>
            </div>
          </div>
        </header>

        {isDemo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 sm:px-7">
            Bu veriler <strong>temsilidir</strong>; gerçek performans ölçümü
            değildir.
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
      <span className="grid h-12 w-12 place-items-center rounded-full border border-[#c9eb47] text-xl font-semibold text-[#c9eb47]">
        G
      </span>
      <div className="leading-tight">
        <div className="text-[18px] font-bold tracking-[0.16em] text-white">GREEN GOLD</div>
        <div className="mt-1 text-[9px] tracking-[0.25em] text-[#9cc7ba]">HOTEL PORTAL</div>
      </div>
    </div>
  );
}

function HotelBlock({
  hotelName,
  city,
}: {
  hotelName?: string;
  city?: string | null;
}) {
  const initials = (hotelName ?? 'Otel')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="mx-4 my-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#c9eb47] text-sm font-extrabold text-[#064b3d]">
        {initials}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{hotelName ?? 'Otel Paneli'}</div>
        <div className="mt-1 truncate text-[11px] text-[#9cc7ba]">{city ?? 'Otel hesabı'}</div>
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
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
      {NAV.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition ' +
              (isActive
                ? 'bg-[#19705c] text-white shadow-sm'
                : 'text-[#c6ddd6] hover:bg-white/[0.06] hover:text-white')
            }
          >
            <span
              className={isActive ? 'text-[#d8f064]' : 'text-[#8fc0b2]'}
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

function ConnectionStatus() {
  return (
    <div className="mx-4 mb-3 rounded-xl border border-white/[0.06] bg-white/[0.07] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-white">
        <span className="h-2 w-2 rounded-full bg-[#c9eb47] shadow-[0_0_0_5px_rgba(201,235,71,.12)]" />
        Sistem bağlantısı aktif
      </div>
      <div className="mt-1 pl-4 text-[10px] text-[#8fb9ae]">Güvenli bağlantı</div>
    </div>
  );
}

function SidebarLogout() {
  return (
    <form action={signOut} className="border-t border-white/10 px-4 py-4">
      <button
        type="submit"
        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#c6ddd6] transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#c9eb47]/40"
      >
        ↪ Güvenli çıkış
      </button>
    </form>
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
