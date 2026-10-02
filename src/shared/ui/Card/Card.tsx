import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.scss';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: 'none' | 'small' | 'medium' | 'large';
  children: ReactNode;
}

export function Card({
  as: Component = 'section',
  padding = 'large',
  className = '',
  ...props
}: CardProps) {
  return (
    <Component {...props} className={`${styles.card} ${styles[padding]} ${className}`.trim()} />
  );
}
