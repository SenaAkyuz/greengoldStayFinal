import type { ReactNode } from 'react';
import { cx } from './cx';
import type { Tone } from './tone';
import styles from './Notice.module.css';

const ICON_PATH: Record<Tone, string> = {
  neutral: 'M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  info: 'M12 11v5m0-8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  success: 'm8 12.5 2.5 2.5L16 9.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  warning: 'M12 9v4m0 3h.01M10.3 4.2 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.2a2 2 0 0 0-3.4 0Z',
  danger: 'M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  pending: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
};

/**
 * Bilgilendirme kutusu (kompakt). Uyarı ve hata `role="alert"` (anında
 * okunur), diğerleri `role="status"`. Varsayılan `layout="inline"`: başlık ve
 * metin aynı satırda akar, eylem sağda. Uzun açıklamalar için `"block"`.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  layout = 'inline',
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  layout?: 'inline' | 'block';
  className?: string;
}) {
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={cx(styles.notice, styles[tone], styles[layout], className)}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={ICON_PATH[tone]} />
      </svg>
      <div className={styles.body}>
        {title && <strong className={styles.title}>{title}</strong>}
        {children}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
