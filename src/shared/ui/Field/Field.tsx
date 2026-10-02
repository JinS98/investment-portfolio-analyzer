import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import styles from './Field.module.scss';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const generatedId = useId();
  const childId = isValidElement(children) ? (children.props as { id?: string }).id : undefined;
  const controlId = childId ?? `field-${generatedId}`;
  const descriptionId = error || hint ? `${controlId}-description` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: controlId,
        'aria-invalid': Boolean(error) || undefined,
        'aria-describedby': descriptionId,
      })
    : children;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label} {required && <span className={styles.required}>*</span>}
      </label>
      {control}
      {(error || hint) && (
        <p id={descriptionId} className={error ? styles.error : styles.hint}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
