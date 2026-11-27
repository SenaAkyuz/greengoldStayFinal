import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  children: ReactNode;
}

function classes(p: CommonProps, extra?: string) {
  return cx(
    styles.button,
    styles[p.variant ?? 'primary'],
    p.size === 'sm' && styles.sm,
    p.size === 'lg' && styles.lg,
    p.fullWidth && styles.full,
    extra,
  );
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** İşlem sürerken: buton pasifleşir, ekran okuyucuya "meşgul" bildirilir. */
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  loading = false,
  loadingLabel,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes({ variant, size, fullWidth, children }, className)}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        iconStart
      )}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {!loading && iconEnd}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps {
  href: string;
  className?: string;
  external?: boolean;
}

/** Görünümü buton olan bağlantı (gezinme için; işlem için Button kullanın). */
export function ButtonLink({
  href,
  external,
  className,
  iconStart,
  iconEnd,
  children,
  ...p
}: ButtonLinkProps) {
  const cls = classes({ ...p, children }, className);
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
        {iconStart}
        <span>{children}</span>
        {iconEnd}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {iconStart}
      <span>{children}</span>
      {iconEnd}
    </Link>
  );
}
