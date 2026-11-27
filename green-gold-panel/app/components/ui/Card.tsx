import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: 'none' | 'md' | 'lg';
  variant?: 'default' | 'muted' | 'accent' | 'highlight';
  /** Anlamlı bir bölümse 'section' kullanın (başlıkla birlikte). */
  as?: 'div' | 'section' | 'article';
}

export function Card({
  padding = 'md',
  variant = 'default',
  as: Tag = 'div',
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        styles.card,
        padding === 'md' && styles.padMd,
        padding === 'lg' && styles.padLg,
        padding === 'none' && styles.padNone,
        variant === 'muted' && styles.muted,
        variant === 'accent' && styles.accent,
        variant === 'highlight' && styles.highlight,
        className,
      )}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  headingLevel = 2,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  id?: string;
}) {
  const H = `h${headingLevel}` as const;
  return (
    <div className={styles.header}>
      <div>
        <H className={styles.title} id={id}>
          {title}
        </H>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

/**
 * Kartın üstündeki tam genişlik başlık şeridi (referans: rapor kartı).
 * Kartı `padding="none"` ile kullanın; içerik için `CardBody`.
 */
export function CardStrip({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.strip}>
      <div className={styles.stripLead}>
        {leading}
        <div>
          <span className={styles.stripTitle}>{title}</span>
          {subtitle && <span className={styles.stripSub}>{subtitle}</span>}
        </div>
      </div>
      {actions && <div className={styles.stripActions}>{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.body, className)}>{children}</div>;
}
