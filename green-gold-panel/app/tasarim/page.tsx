import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevToolsEnabled } from '@/lib/dev-only';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ControlGroup,
  DataTable,
  Divider,
  EmptyState,
  Field,
  Meter,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Stat,
  StatusPill,
  Stepper,
  TextInput,
  Textarea,
  TONES,
} from '../components/ui';
import { DialogDemo } from './DialogDemo';
import styles from './tasarim.module.css';

export const metadata: Metadata = {
  title: 'Tasarım galerisi (yalnız geliştirme)',
  robots: { index: false, follow: false },
};

/**
 * Tasarım galerisi — yalnızca `next dev` ile açılır; production'da 404.
 * Bileşenleri ve durumlarını tek ekranda görmek içindir; veri veya API yok.
 */
const SWATCHES = [
  '--ds-color-bg',
  '--ds-color-surface',
  '--ds-color-surface-muted',
  '--ds-color-border',
  '--ds-color-primary',
  '--ds-color-primary-soft',
  '--ds-color-accent',
  '--ds-color-accent-soft',
  '--ds-color-text',
  '--ds-color-text-muted',
];

const TONE_LABEL: Record<(typeof TONES)[number], string> = {
  neutral: 'Taslak',
  info: 'Bilgi',
  success: 'Tamamlandı',
  warning: 'Dikkat',
  danger: 'Hata',
  pending: 'Onay bekliyor',
};

type Row = { name: string; scope: string; amount: string; state: (typeof TONES)[number] };
const ROWS: Row[] = [
  { name: 'Örnek kalem A', scope: 'Kapsam 2', amount: '1.000 kWh', state: 'success' },
  { name: 'Örnek kalem B', scope: 'Kapsam 1', amount: '500 m³', state: 'pending' },
  { name: 'Örnek kalem C', scope: 'Kapsam 1', amount: '40 L', state: 'warning' },
];

export default function DesignGalleryPage() {
  if (!isDevToolsEnabled()) notFound();
  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        Yalnız geliştirme ortamında görünür · örnek içerik · veri yok
      </div>
      <main className={styles.container}>
        <PageHeader
          eyebrow="00 / Tasarım dili"
          title="Bileşen galerisi"
          description="Green Gold Stay ekranlarının ortak yapı taşları. Renk ve ölçüler app/design/tokens.css dosyasından gelir."
          actions={
            <>
              <Button variant="secondary">İkincil</Button>
              <Button>Birincil eylem</Button>
            </>
          }
        />

        <section className={styles.section} aria-labelledby="t-colors">
          <h2 id="t-colors" className={styles.sectionTitle}>Renkler</h2>
          <div className={styles.swatches}>
            {SWATCHES.map((token) => (
              <div key={token} className={styles.swatch}>
                <div className={styles.chip} style={{ background: `var(${token})` }} />
                <div className={styles.swatchName}>{token}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="t-buttons">
          <h2 id="t-buttons" className={styles.sectionTitle}>Butonlar</h2>
          <div className={styles.row}>
            <Button>Birincil</Button>
            <Button variant="secondary">İkincil</Button>
            <Button variant="ghost">Sade</Button>
            <Button variant="danger">Tehlikeli</Button>
            <Button size="sm">Küçük</Button>
            <Button size="lg">Büyük</Button>
            <Button loading loadingLabel="Kaydediliyor…">Kaydet</Button>
            <Button disabled>Pasif</Button>
            <ButtonLink href="/tasarim" variant="secondary">Bağlantı buton</ButtonLink>
            <DialogDemo />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="t-status">
          <h2 id="t-status" className={styles.sectionTitle}>Durum etiketleri ve bildirimler</h2>
          <div className={styles.row}>
            {TONES.map((tone) => (
              <StatusPill key={tone} tone={tone}>{TONE_LABEL[tone]}</StatusPill>
            ))}
          </div>
          <div className={styles.stack} style={{ marginTop: 'var(--ds-space-5)' }}>
            {TONES.map((tone) => (
              <Notice
                key={tone}
                tone={tone}
                title={`${TONE_LABEL[tone]} bildirimi`}
                actions={tone === 'warning' ? <Button size="sm" variant="secondary">Ne yapmalıyım?</Button> : undefined}
              >
                Kullanıcıya ne olduğunu ve sonraki adımı sade bir dille anlatan örnek metin.
              </Notice>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="t-cards">
          <h2 id="t-cards" className={styles.sectionTitle}>Kartlar ve göstergeler</h2>
          <div className={styles.grid3}>
            <Card variant="accent">
              <Stat label="Örnek toplam" value="1,50" unit="t CO₂e" hint="Örnek açıklama" size="lg" />
            </Card>
            <Card>
              <Stat label="Oda-gece başına" value="0,75" unit="kg CO₂e" hint="Örnek açıklama" />
            </Card>
            <Card variant="muted">
              <Stat label="Eksik veri" value={null} unit="kg" hint="Değer yokken 0 değil — gösterilir" />
            </Card>
          </div>
          <Card style={{ marginTop: 'var(--ds-space-5)' }}>
            <CardHeader title="Kart başlığı" description="Kısa açıklama" actions={<Button size="sm" variant="secondary">Düzenle</Button>} />
            <Meter label="Örnek oran" value={0.6} valueText="%60" />
          </Card>
        </section>

        <section className={styles.section} aria-labelledby="t-stepper">
          <h2 id="t-stepper" className={styles.sectionTitle}>Adım göstergesi</h2>
          <Card>
            <Stepper
              steps={[
                { key: '1', label: 'Birinci adım', state: 'done', status: 'Tamamlandı' },
                { key: '2', label: 'İkinci adım', state: 'done', status: 'Tamamlandı' },
                { key: '3', label: 'Üçüncü adım', state: 'current', status: 'Devam ediyor' },
                { key: '4', label: 'Dördüncü adım', state: 'blocked', status: 'Bekliyor' },
                { key: '5', label: 'Beşinci adım', state: 'upcoming' },
              ]}
            />
          </Card>
        </section>

        <section className={styles.section} aria-labelledby="t-forms">
          <h2 id="t-forms" className={styles.sectionTitle}>Form alanları</h2>
          <Card>
            <div className={styles.grid2}>
              <Field id="g-text" label="Metin alanı" hint="Yardımcı açıklama" required>
                {(c) => <TextInput {...c} placeholder="Örnek" />}
              </Field>
              <Field id="g-select" label="Seçim" optionalLabel>
                {(c) => (
                  <Select {...c} defaultValue="">
                    <option value="" disabled>Seçin…</option>
                    <option>Seçenek 1</option>
                    <option>Seçenek 2</option>
                  </Select>
                )}
              </Field>
              <Field id="g-amount" label="Miktar ve birim" hint="Değer + ölçü birimi">
                {(c) => (
                  <ControlGroup>
                    <TextInput {...c} numeric inputMode="decimal" placeholder="0" />
                    <Select aria-label="Ölçü birimi" defaultValue="a">
                      <option value="a">Birim A</option>
                      <option value="b">Birim B</option>
                    </Select>
                  </ControlGroup>
                )}
              </Field>
              <Field id="g-error" label="Hatalı alan" error="Bu alan zorunludur.">
                {(c) => <TextInput {...c} />}
              </Field>
              <Field id="g-disabled" label="Pasif alan" hint="Neden pasif olduğu burada yazar.">
                {(c) => <TextInput {...c} disabled value="Değiştirilemez" readOnly />}
              </Field>
              <Field id="g-note" label="Not" optionalLabel>
                {(c) => <Textarea {...c} placeholder="İsteğe bağlı açıklama" />}
              </Field>
            </div>
          </Card>
        </section>

        <section className={styles.section} aria-labelledby="t-table">
          <h2 id="t-table" className={styles.sectionTitle}>Tablo (mobilde kart)</h2>
          <Card padding="md">
            <DataTable<Row>
              caption="Örnek kalemler"
              rows={ROWS}
              rowKey={(r) => r.name}
              columns={[
                { key: 'name', header: 'Kalem', cell: (r) => r.name, primary: true },
                { key: 'scope', header: 'Kapsam', cell: (r) => r.scope },
                { key: 'amount', header: 'Miktar', cell: (r) => r.amount, align: 'end' },
                { key: 'state', header: 'Durum', cell: (r) => <StatusPill tone={r.state}>{TONE_LABEL[r.state]}</StatusPill> },
              ]}
            />
          </Card>
        </section>

        <Divider label="Boş ve yükleniyor durumları" />
        <div className={styles.grid2}>
          <EmptyState
            title="Henüz veri yok"
            description="Boş durum, kullanıcıya bir sonraki adımı gösterir."
            actions={<Button>İlk adımı başlat</Button>}
            icon={<span>＋</span>}
          />
          <Card aria-busy="true">
            <div className={styles.stack}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="70%" height={34} />
              <Skeleton height={14} />
              <Skeleton width="85%" height={14} />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
