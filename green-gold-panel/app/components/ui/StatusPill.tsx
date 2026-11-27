import type { ReactNode } from 'react';
import { cx } from './cx';
import type { Tone } from './tone';
import styles from './StatusPill.module.css';

/**
 * Kısa durum etiketi. Anlam yalnızca renkle verilmez: metin her zaman
 * görünür (renk körlüğü / ekran okuyucu).
 */
export function StatusPill({
  tone = 'neutral',
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={cx(styles.pill, styles[tone])}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
