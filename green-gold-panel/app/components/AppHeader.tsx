import Link from 'next/link';
import { signOut } from '../actions';

type ActivePage = 'overview' | 'carbon';

const NAV: { key: ActivePage; label: string; href: string }[] = [
  { key: 'overview', label: 'Genel Bakış', href: '/' },
  { key: 'carbon', label: 'Karbon Etkisi', href: '/karbon' },
];

export function AppHeader({
  hotelName,
  city,
  active,
}: {
  hotelName?: string;
  city?: string | null;
  active: ActivePage;
}) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">
            <LeafIcon />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-neutral-900">
              {hotelName ?? 'Otel Paneli'}
            </div>
            {city && <div className="text-xs text-neutral-500">{city}</div>}
          </div>
        </div>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition ' +
                  (isActive
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-neutral-600 hover:bg-neutral-50')
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            Çıkış
          </button>
        </form>
      </div>

      {/* Dar ekranda nav'ı alt satıra al */}
      <div className="mx-auto flex max-w-5xl gap-1 px-5 pb-2.5 sm:hidden">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={
                'rounded-lg px-3 py-1.5 text-sm font-medium transition ' +
                (isActive
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-neutral-600 hover:bg-neutral-50')
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
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
