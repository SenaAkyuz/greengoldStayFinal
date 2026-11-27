import type { ReactNode } from 'react';
import styles from './BarList.module.css';

export interface BarRow {
  key: string;
  label: ReactNode;
  /** Birinci seri (koyu). */
  primary: number;
  /** İkinci seri (açık); tek seri için verilmez. */
  secondary?: number;
  valueText: string;
}

/**
 * Yatay çubuk listesi (referans: "Haftalık dağılım"). Çubuklar yalnız
 * görseldir; her satırın değeri metin olarak da yazılır.
 */
export function BarList({
  rows,
  legend,
  label,
  layout = 'inline',
}: {
  rows: BarRow[];
  legend?: [string, string?];
  label: string;
  /** 'stacked': uzun etiketler için etiket üstte, çubuk altta. */
  layout?: 'inline' | 'stacked';
}) {
  const max = Math.max(
    0,
    ...rows.map((r) => Math.max(0, r.primary) + Math.max(0, r.secondary ?? 0)),
  );
  const pct = (v: number) => (max > 0 ? (Math.max(0, v) / max) * 100 : 0);
  return (
    <figure
      aria-label={label}
      style={{ margin: 0 }}
      className={layout === 'stacked' ? styles.stacked : undefined}
    >
      {legend && (
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.key}>
            <span className={`${styles.swatch} ${styles.s1}`} />
            {legend[0]}
          </span>
          {legend[1] && (
            <span className={styles.key}>
              <span className={`${styles.swatch} ${styles.s2}`} />
              {legend[1]}
            </span>
          )}
        </div>
      )}
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.key} className={styles.row}>
            <span className={styles.label}>{r.label}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.bar1} style={{ width: `${pct(r.primary)}%` }} />
              {r.secondary !== undefined && (
                <span className={styles.bar2} style={{ width: `${pct(r.secondary)}%` }} />
              )}
            </span>
            <span className={styles.value}>{r.valueText}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
