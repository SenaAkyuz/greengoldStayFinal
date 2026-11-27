import { notFound } from 'next/navigation';
import { ButtonLink, EmptyState, PageHeader, StatusPill } from '../../../components/ui';
import { BASE, SCREENS } from '../screens';
import styles from '@/app/components/panel/panel.module.css';

/**
 * Henüz yeni tasarıma geçirilmemiş ekranlar için yer tutucu. Ekranın BUGÜNKÜ
 * işlevini anlatır; yeni işlev göstermez veya uydurmaz.
 */
export default async function NotYetPreview({ params }: { params: Promise<{ ekran: string }> }) {
  const { ekran } = await params;
  const screen = SCREENS.find((s) => s.key === ekran && !s.preview);
  if (!screen) notFound();
  return (
    <div className={styles.narrow}>
      <PageHeader size="compact" eyebrow="Önizleme" title={screen.label} />
      <EmptyState
        title="Bu ekran henüz yeni tasarıma geçirilmedi"
        description={<>Bugünkü işlevi: {screen.purpose}<br /><br />Mevcut adres: <code>{screen.route}</code> {screen.soon && <StatusPill tone="neutral">Faz 2</StatusPill>}</>}
        actions={<ButtonLink href={BASE} variant="secondary">Genel bakışa dön</ButtonLink>}
      />
    </div>
  );
}
