import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import styles from './MetricGrid.module.css';

export interface MetricItem {
  key: string;
  label: ReactNode;
  /** null → "—" (eksik veri 0 gibi gösterilmez). */
  value: ReactNode | null;
  unit?: ReactNode;
  hint?: ReactNode;
}

/** İnce çizgilerle ayrılmış metrik hücreleri (mobilde alt alta). */
export function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <dl
      className={styles.grid}
      style={{ '--ds-cols': Math.min(items.length, 4) } as CSSProperties}
    >
      {items.map((m) => {
        const empty = m.value === null || m.value === undefined || m.value === '';
        return (
          <div key={m.key} className={cx(styles.metric, empty && styles.empty)}>
            <dt className={styles.label}>{m.label}</dt>
            <dd className={styles.valueRow}>
              <span className={styles.value}>{empty ? '—' : m.value}</span>
              {!empty && m.unit && <span className={styles.unit}>{m.unit}</span>}
            </dd>
            {m.hint && <dd className={styles.hint}>{m.hint}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
