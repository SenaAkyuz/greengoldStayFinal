import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import styles from './Field.module.css';

/** Field'ın denetime geçirdiği erişilebilirlik öznitelikleri. */
export interface ControlA11yProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps {
  /** Benzersiz id (etiket–denetim bağlantısı). Hook kullanmamak için zorunlu. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Zorunlu değilse "(isteğe bağlı)" yazar. */
  optionalLabel?: boolean;
  children: (control: ControlA11yProps) => ReactNode;
  className?: string;
}

/**
 * Etiket + açıklama + hata + denetim. Denetim render-prop ile alınır ki
 * aria bağlantıları her zaman doğru kurulsun:
 *   <Field id="rooms" label="Oda sayısı">{(c) => <TextInput {...c} />}</Field>
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  optionalLabel,
  children,
  className,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
        {!required && optionalLabel && (
          <span className={styles.optional}>(isteğe bağlı)</span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  className,
  numeric,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }) {
  return (
    <input
      {...rest}
      className={cx(styles.control, numeric && styles.numeric, className)}
    />
  );
}

export function Select({
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(styles.control, className)} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(styles.control, className)} />;
}

/** Değer + birim seçimi gibi bitişik denetimler. */
export function ControlGroup({ children }: { children: ReactNode }) {
  return <div className={styles.group}>{children}</div>;
}
