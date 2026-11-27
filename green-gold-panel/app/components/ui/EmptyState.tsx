import type { ReactNode } from 'react';
import { Illustration, type IllustrationName } from './Illustration';
import styles from './EmptyState.module.css';

/** Veri yokken ne yapılacağını söyleyen yönlendirici boş durum. */
export function EmptyState({
  title,
  description,
  actions,
  icon,
  illustration,
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** Çizgi illüstrasyon (ikon yerine, daha geniş boş durumlar için). */
  illustration?: IllustrationName;
  headingLevel?: 2 | 3;
}) {
  const H = `h${headingLevel}` as const;
  return (
    <div className={styles.empty}>
      {illustration && <Illustration name={illustration} className={styles.art} />}
      {!illustration && icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <H className={styles.title}>{title}</H>
      {description && <p className={styles.description}>{description}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
