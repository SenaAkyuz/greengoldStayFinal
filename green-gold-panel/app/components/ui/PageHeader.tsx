import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './PageHeader.module.css';

/** Küçük bölüm etiketi (ör. "02 / Otel paneli") — önünde ince çizgi. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>;
}

/**
 * Sayfa başlığı: tek h1.
 *  - `size="default"`: açıklama sağ sütunda (referanstaki bölüm başlığı).
 *  - `size="compact"`: iş ekranları için; açıklama başlığın altında, eylemler
 *    sağda — gereksiz dikey boşluk oluşmaz.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = 'default',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: 'default' | 'compact';
}) {
  if (size === 'compact') {
    return (
      <header className={cx(styles.header, styles.compact)}>
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.lead}>{description}</p>}
        </div>
        {actions && <div className={cx(styles.side, styles.actions)}>{actions}</div>}
      </header>
    );
  }
  return (
    <header className={cx(styles.header, !description && styles.single)}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {(description || actions) && (
        <div className={styles.side}>
          {description && <p className={styles.description}>{description}</p>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </header>
  );
}
