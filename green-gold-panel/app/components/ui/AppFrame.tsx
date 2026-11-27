'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cx } from './cx';
import { resolveActiveKey } from './nav';
import styles from './AppFrame.module.css';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /** Kısa sayı (ör. bekleyen işlem). */
  badge?: string;
  /** Henüz kullanıma açılmamış (Faz 2) — "Yakında" etiketi. */
  soon?: boolean;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}

/**
 * Uygulama çerçevesi: koyu petrol yan menü (logo, otel, gruplu menü) + üst
 * çubuk. Tablet/mobilde yan menü soldan açılan çekmeceye dönüşür.
 * Yalnız düzen: menü öğeleri, otel bilgisi ve üst çubuk içeriği dışarıdan
 * gelir; aktif öğe adresten bulunur (`activeKey` ile ezilebilir).
 */
export function AppFrame({
  groups,
  activeKey,
  homeHref = '/',
  hotelName,
  hotelMeta,
  title,
  topbar,
  footer,
  children,
}: {
  groups: NavGroup[];
  activeKey?: string;
  homeHref?: string;
  hotelName?: string;
  hotelMeta?: string;
  /** Masaüstü üst çubuktaki sayfa adı. */
  title?: ReactNode;
  /** Üst çubuğun sağı (ör. dönem seçimi, kullanıcı). */
  topbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/';
  // Çekmece açıldığı adreste açık sayılır: sayfa değişince kendiliğinden
  // kapanır (effect içinde state güncellemeden).
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    setOpenOn(value ? pathname : null);
  };
  const active =
    activeKey ?? resolveActiveKey(pathname, groups.flatMap((g) => g.items));

  // Esc ile kapanır.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const brand = (variant: 'side' | 'top') => (
    <Link
      href={homeHref}
      className={cx(styles.brand, variant === 'top' && styles.mobileBrand)}
    >
      <Image
        src="/brand/greengold-logo.png"
        alt=""
        width={36}
        height={36}
        className={styles.logo}
        priority={variant === 'side'}
      />
      <span className={cx(styles.brandName, variant === 'top' && styles.brandNameDark)}>
        GreenGold <span>Stay</span>
      </span>
    </Link>
  );

  return (
    <div className={styles.frame}>
      <aside
        id="ds-side"
        className={cx(styles.side, open && styles.open)}
        aria-label="Yan menü"
      >
        {brand('side')}
        {hotelName && (
          <div className={styles.hotel}>
            <span className={styles.hotelMark} aria-hidden="true">
              {initials(hotelName)}
            </span>
            <div>
              <div className={styles.hotelName}>{hotelName}</div>
              {hotelMeta && <div className={styles.hotelMeta}>{hotelMeta}</div>}
            </div>
          </div>
        )}
        {groups.map((group, gi) => (
          <nav key={gi} aria-label={group.title ?? 'Ana menü'}>
            {group.title && <p className={styles.navTitle}>{group.title}</p>}
            <ul className={styles.nav}>
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={styles.link}
                    aria-current={item.key === active ? 'page' : undefined}
                  >
                    {item.icon && (
                      <span className={styles.icon} aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                    {item.badge && <span className={styles.badge}>{item.badge}</span>}
                    {item.soon && <span className={styles.soon}>Yakında</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        {footer && <div className={styles.sideFoot}>{footer}</div>}
      </aside>
      <button
        type="button"
        className={cx(styles.scrim, open && styles.open)}
        aria-label="Menüyü kapat"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={open}
              aria-controls="ds-side"
              aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
              onClick={() => setOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            {brand('top')}
            {title && <span className={styles.topTitle}>{title}</span>}
          </div>
          {topbar && <div className={styles.topRight}>{topbar}</div>}
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
