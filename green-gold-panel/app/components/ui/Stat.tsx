import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Stat.module.css';

/**
 * Büyük sayı + birim (ör. "24 kg CO₂e"). `value` null ise "—" gösterilir;
 * eksik veri asla 0 gibi gösterilmez.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  size = 'md',
}: {
  label: ReactNode;
  value: ReactNode | null;
  unit?: ReactNode;
  hint?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={cx(styles.stat, size === 'lg' && styles.lg, empty && styles.empty)}>
      <span className={styles.label}>{label}</span>
      <span className={styles.valueRow}>
        <span className={styles.value}>{empty ? '—' : value}</span>
        {!empty && unit && <span className={styles.unit}>{unit}</span>}
      </span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
