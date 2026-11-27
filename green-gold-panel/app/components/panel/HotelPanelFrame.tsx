'use client';
import type { ReactNode } from 'react';
import { AppFrame, StatusPill, type NavGroup } from '../ui';
import {
  IconAward, IconBuilding, IconCalendar, IconCard, IconCode, IconDoc,
  IconEye, IconFunnel, IconGauge, IconGear, IconGrid, IconLeaf,
} from './icons';
import { SignOutControl } from './SignOutControl';
import styles from './panel.module.css';

/**
 * Gerçek otel paneli çerçevesi (yeni tasarım). Menü öğeleri ve davranışlar
 * eski AppShell ile aynıydı (G2 sonrası AppShell kaldırıldı): aynı adresler, Faz 2 alanları "Yakında", demo
 * kullanıcıya "salt okunur" göstergesi + temsili veri şeridi, "Hesap
 * değiştir" ve "Güvenli çıkış" (signOut). Yeni öğe: Tesis profili.
 *
 * Geçiş: D aşamasında yalnız Genel bakış ve Tesis profili bu çerçevede;
 * G aşamasında tüm sayfalar bu çerçeveye geçti.
 * E aşamasında "Karbon ölçümü" (/karbon-olcumu) eklendi.
 */
export const LIVE_NAV: NavGroup[] = [
  { items: [{ key: 'overview', label: 'Genel bakış', href: '/', icon: <IconGrid /> }] },
  {
    title: 'Karbon',
    items: [
      { key: 'measurement', label: 'Karbon ölçümü', href: '/karbon-olcumu', icon: <IconGauge /> },
      { key: 'carbon', label: 'Karbon etkisi', href: '/karbon', icon: <IconLeaf /> },
    ],
  },
  {
    title: 'Misafir ve raporlar',
    items: [
      { key: 'guest-preview', label: 'Misafir önizleme', href: '/misafir-onizleme', icon: <IconEye /> },
      { key: 'funnel', label: 'Dönüşüm', href: '/funnel', icon: <IconFunnel /> },
      { key: 'reports', label: 'Raporlar', href: '/raporlar', icon: <IconDoc /> },
    ],
  },
  {
    title: 'Rezervasyon (Faz 2)',
    items: [
      { key: 'reservations', label: 'Rezervasyonlar', href: '/rezervasyonlar', icon: <IconCalendar />, soon: true },
      { key: 'payments', label: 'Tahsilatlar', href: '/tahsilatlar', icon: <IconCard />, soon: true },
      { key: 'certificates', label: 'Sertifikalar', href: '/sertifikalar', icon: <IconAward />, soon: true },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { key: 'profile', label: 'Tesis profili', href: '/tesis-profili', icon: <IconBuilding /> },
      { key: 'integration', label: 'Entegrasyon', href: '/entegrasyon', icon: <IconCode /> },
      { key: 'settings', label: 'Ayarlar', href: '/ayarlar', icon: <IconGear /> },
    ],
  },
];

function initials(name?: string | null) {
  return (name ?? 'GG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('') || 'GG';
}

export function HotelPanelFrame({
  hotelName,
  city,
  isDemo = false,
  title,
  children,
}: {
  hotelName?: string | null;
  city?: string | null;
  isDemo?: boolean;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppFrame
      groups={LIVE_NAV}
      homeHref="/"
      hotelName={hotelName ?? 'Otel paneli'}
      hotelMeta={city ?? 'Otel hesabı'}
      title={title}
      topbar={
        <>
          {isDemo && (
            <>
              <span className={styles.hideXs}>
                <StatusPill tone="warning">Demo hesabı · veriler temsilidir</StatusPill>
              </span>
              <span className={styles.showXs}>
                <StatusPill tone="warning">Demo</StatusPill>
              </span>
            </>
          )}
          {/* Dar ekranda menüdeki "Güvenli çıkış" kullanılır (aynı eylem). */}
          <SignOutControl variant="top" />
          <span className={styles.avatar} aria-hidden="true">
            {initials(hotelName)}
          </span>
        </>
      }
      footer={
        <>
          <SignOutControl variant="side" />
          <p className={styles.sideNote}>
            Ölçüm altyapısı: 3P Metrics · sonuçlar tahminidir.
          </p>
        </>
      }
    >
      {children}
    </AppFrame>
  );
}
