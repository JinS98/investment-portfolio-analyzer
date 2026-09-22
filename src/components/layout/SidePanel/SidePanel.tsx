import { useEffect } from 'react';
import type { ReactNode } from 'react';
import styles from './SidePanel.module.scss';

interface SidePanelProps {
  isOpen: boolean;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

/** Reusable right-side modal panel with scroll locking and keyboard dismissal. */
export function SidePanel({ isOpen, labelledBy, onClose, children }: SidePanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}
