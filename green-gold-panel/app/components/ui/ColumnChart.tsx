import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './ColumnChart.module.css';

export interface ColumnDatum {
  key: string;
  label: string;
  /** null → veri yok (kesik çizgiyle gösterilir, 0 çizilmez). */
  value: number | null;
  valueText: string;
  current?: boolean;
}

/**
 * Sütun grafiği. Görsel sütunlar aria-hidden; aynı değerler ekran okuyucu
 * için gizli tabloda verilir.
 */
export function ColumnChart({
  data,
  caption,
  legend = true,
  legendLabels = { on: 'Hesaplanan ay', current: 'Seçili ay', missing: 'Sonuç yok' },
}: {
  data: ColumnDatum[];
  caption: string;
  legend?: boolean;
  /** Gösterge metinleri (ör. günlük seri için "Görüntülenme", "Katkı niyeti olan gün"). */
  legendLabels?: { on: string; current: string; missing?: string | null };
}) {
  // Uzun serilerde (ör. 30 gün) etiketler sıkışmasın: yaklaşık 7 etiket.
  const step = data.length > 14 ? Math.ceil(data.length / 7) : 1;
  const max = Math.max(0, ...data.map((d) => d.value ?? 0));
  const n = { '--ds-n': data.length } as CSSProperties;
  return (
    <figure style={{ margin: 0 }}>
      <div className={styles.chart} style={n} aria-hidden="true">
        {data.map((d) => (
          <div key={d.key} className={styles.col} title={`${d.label}: ${d.valueText}`}>
            {d.value === null ? (
              <span className={styles.missing} />
            ) : (
              <span
                className={cx(styles.bar, styles.on, d.current && styles.current)}
                style={{ height: `${max > 0 ? Math.max(2, (d.value / max) * 100) : 0}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className={styles.labels} style={n} aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key} className={cx(d.current && step === 1 && styles.labelCurrent)}>
            {i % step === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
      {legend && (
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.key}><span className={cx(styles.sw, styles.swOn)} />{legendLabels.on}</span>
          <span className={styles.key}><span className={cx(styles.sw, styles.swCur)} />{legendLabels.current}</span>
          {legendLabels.missing && (
            <span className={styles.key}><span className={cx(styles.sw, styles.swMiss)} />{legendLabels.missing}</span>
          )}
        </div>
      )}
      <div className={styles.srWrap}>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}><th scope="row">{d.label}</th><td>{d.valueText}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
