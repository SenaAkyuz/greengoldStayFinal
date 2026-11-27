import type { ReactNode } from 'react';
import { AppFrame, StatusPill, type NavGroup } from '../../components/ui';
import {
  IconAward, IconBuilding, IconCalendar, IconCard, IconCode, IconDoc,
  IconEye, IconFunnel, IconGauge, IconGear, IconGrid, IconLeaf,
} from './icons';
import { BASE, SCREENS, previewHref, type Screen } from './screens';
import styles from '@/app/components/panel/panel.module.css';

const ICONS: Record<string, ReactNode> = {
  genel: <IconGrid />, 'karbon-olcumu': <IconGauge />, 'karbon-etkisi': <IconLeaf />,
  'misafir-onizleme': <IconEye />, donusum: <IconFunnel />, raporlar: <IconDoc />,
  rezervasyonlar: <IconCalendar />, tahsilatlar: <IconCard />, sertifikalar: <IconAward />,
  'tesis-profili': <IconBuilding />, entegrasyon: <IconCode />, ayarlar: <IconGear />,
};

const GROUPS: { id: Screen['group']; title?: string }[] = [
  { id: 'main' },
  { id: 'carbon', title: 'Karbon' },
  { id: 'guest', title: 'Misafir ve raporlar' },
  { id: 'phase2', title: 'Rezervasyon (Faz 2)' },
  { id: 'admin', title: 'Yönetim' },
];

export function PreviewFrame({ children }: { children: ReactNode }) {
  const groups: NavGroup[] = GROUPS.map((g) => ({
    title: g.title,
    items: SCREENS.filter((s) => s.group === g.id).map((s) => ({
      key: s.key,
      label: s.label,
      href: previewHref(s),
      icon: ICONS[s.key],
      soon: s.soon,
      badge: s.key === 'karbon-olcumu' ? '1' : undefined,
    })),
  }));
  return (
    <>
      <div className={styles.devBanner}>
        <strong>Tasarım önizlemesi</strong> · örnek veri · yalnız geliştirme ortamında görünür · hiçbir işlem kaydedilmez
      </div>
      <AppFrame
        groups={groups}
        homeHref={BASE}
        hotelName="Avlu Han"
        hotelMeta="Örnek otel · Türkiye"
        title="Otel paneli"
        topbar={
          <>
            <span className={styles.hideXs}><StatusPill tone="pending">Örnek veri</StatusPill></span>
            <span className={styles.avatar} aria-label="Kullanıcı: Örnek Yönetici">ÖY</span>
          </>
        }
        footer={<>Ölçüm altyapısı: 3pmetrics<br />Sonuçlar tahminidir; doğrulanmış dengeleme değildir.</>}
      >
        {children}
      </AppFrame>
    </>
  );
}
