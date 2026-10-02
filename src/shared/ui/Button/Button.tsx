import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.scss';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  loading = false,
  loadingLabel = '처리 중',
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  label: string;
  icon: ReactNode;
}

export function IconButton({ label, icon, className = '', ...props }: IconButtonProps) {
  return (
    <Button {...props} className={`${styles.icon} ${className}`.trim()} aria-label={label}>
      {icon}
    </Button>
  );
}
