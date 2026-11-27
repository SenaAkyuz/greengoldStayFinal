import Link from 'next/link';
import { cx } from './cx';
import styles from './SegmentedTabs.module.css';

export interface SegmentItem {
  key: string;
  label: string;
  href: string;
}

/**
 * Hap biçimli görünüm geçişi (ör. dönem, yıl, sekme). Bağlantı tabanlıdır:
 * seçim URL'de durur, sayfa yenilenince korunur; JavaScript gerektirmez.
 */
export function SegmentedTabs({
  items,
  activeKey,
  label,
}: {
  items: SegmentItem[];
  activeKey: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(styles.tab, active && styles.active)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
