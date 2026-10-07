import type { ReactNode } from 'react';
import styles from './Collapse.module.scss';

interface CollapseProps {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
}

export function Collapse({ open, children, id, className }: CollapseProps) {
  return (
    <div
      id={id}
      className={`${styles.collapse} ${open ? styles.open : ''} ${className ?? ''}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
