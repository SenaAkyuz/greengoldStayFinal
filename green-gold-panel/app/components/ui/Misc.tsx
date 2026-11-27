import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Misc.module.css';

/** Altın ince çizgili bölüm ayırıcı (isteğe bağlı ortada etiket). */
export function Divider({ label }: { label?: ReactNode }) {
  return label ? (
    <div className={styles.divider} role="separator">
      {label}
    </div>
  ) : (
    <hr className={cx(styles.divider, styles.plain)} />
  );
}

/** Yükleniyor iskeleti; ekran okuyucudan gizli (üst öğe aria-busy taşır). */
export function Skeleton({
  width = '100%',
  height = 16,
}: {
  width?: number | string;
  height?: number | string;
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/**
 * Oran göstergesi (0–1). Değer metin olarak da yazılır; çubuk yalnız görsel.
 * `value` aralık dışındaysa sınırlanır.
 */
export function Meter({
  label,
  value,
  valueText,
}: {
  label: ReactNode;
  value: number;
  valueText: string;
}) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={styles.meterValue}>{valueText}</span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}
