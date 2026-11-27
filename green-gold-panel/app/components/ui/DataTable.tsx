import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'start' | 'end';
  /** Mobil kart görünümünde başlık satırı olarak (etiketsiz) gösterilir. */
  primary?: boolean;
  hideOnMobile?: boolean;
}

/**
 * Masaüstünde tablo, mobilde kart listesi (aynı işaretleme; ekran okuyucu
 * tablo anlamını korur). `caption` erişilebilirlik için zorunlu.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  captionHidden = false,
  emptyText = 'Gösterilecek kayıt yok.',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  captionHidden?: boolean;
  emptyText?: ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={cx(styles.caption, captionHidden && 'sr-only')}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(styles.th, c.align === 'end' && styles.end)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className={styles.tr}>
              <td className={styles.emptyCell} colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={styles.tr}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-label={c.header}
                    data-primary={c.primary || undefined}
                    className={cx(
                      styles.td,
                      c.align === 'end' && styles.end,
                      c.hideOnMobile && styles.hideMobile,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
