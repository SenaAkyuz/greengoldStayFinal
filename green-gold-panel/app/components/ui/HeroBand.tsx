import type { CSSProperties, ReactNode } from 'react';
import styles from './HeroBand.module.css';

export interface HeroStat {
  key: string;
  label: ReactNode;
  /** null → "—" (eksik veri 0 gibi gösterilmez). */
  value: ReactNode | null;
  unit?: ReactNode;
}

/**
 * Koyu karşılama bandı (referans: ana sayfa üst bandı). Sayfa başına en
 * fazla bir tane; h1 bu bileşende olur.
 */
export function HeroBand({
  eyebrow,
  title,
  lead,
  actions,
  stats,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  stats?: HeroStat[];
}) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.top}>
        <div>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 id="hero-title" className={styles.title}>
            {title}
          </h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl
          className={styles.stats}
          style={{ '--ds-cols': Math.min(stats.length, 4) } as CSSProperties}
        >
          {stats.map((s) => {
            const empty = s.value === null || s.value === undefined || s.value === '';
            return (
              <div key={s.key} className={styles.stat}>
                <dt className={styles.statLabel}>{s.label}</dt>
                <dd className={styles.statValue}>
                  {empty ? '—' : s.value}
                  {!empty && s.unit && <span className={styles.statUnit}>{s.unit}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
