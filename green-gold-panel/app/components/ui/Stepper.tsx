import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Stepper.module.css';

export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';

export interface StepItem {
  key: string;
  label: ReactNode;
  /** Kısa durum metni (ör. "Onay bekliyor"). */
  status?: ReactNode;
  state: StepState;
  href?: string;
}

const STATE_TEXT: Record<StepState, string> = {
  done: 'tamamlandı',
  current: 'şu anki adım',
  upcoming: 'sıradaki',
  blocked: 'beklemede',
};

/** Adım göstergesi: masaüstünde yatay, mobilde dikey. */
export function Stepper({
  steps,
  label = 'İlerleme',
}: {
  steps: StepItem[];
  label?: string;
}) {
  return (
    <nav aria-label={label}>
      <ol
        className={styles.list}
        style={{ '--ds-steps': steps.length } as CSSProperties}
      >
        {steps.map((step, index) => {
          const content = (
            <>
              <span className={styles.marker}>
                <span className={styles.num} aria-hidden="true">
                  {step.state === 'done' ? '✓' : index + 1}
                </span>
                <span className={styles.line} aria-hidden="true" />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{step.label}</span>
                <span className="sr-only">, {STATE_TEXT[step.state]}</span>
                {step.status && (
                  <span className={styles.status}>{step.status}</span>
                )}
              </span>
            </>
          );
          return (
            <li
              key={step.key}
              className={cx(styles.item, styles[step.state])}
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              {step.href ? (
                <Link href={step.href} className={styles.inner}>
                  {content}
                </Link>
              ) : (
                <span className={styles.inner}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
