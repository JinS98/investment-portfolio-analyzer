import { useRef, type MouseEvent, type ReactNode } from 'react';
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from '@shared/hooks';
import styles from './Overlay.module.scss';

interface OverlayProps {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  closeDisabled?: boolean;
  mobileBottom?: boolean;
  className?: string;
  kind: 'dialog' | 'drawer';
  children: ReactNode;
}

function Overlay({
  open,
  labelledBy,
  onClose,
  closeDisabled = false,
  mobileBottom = false,
  className = '',
  kind,
  children,
}: OverlayProps) {
  const contentRef = useRef<HTMLElement>(null);
  const close = () => {
    if (!closeDisabled) onClose();
  };
  useBodyScrollLock(open);
  useEscapeKey(open && !closeDisabled, close);
  useFocusTrap(open, contentRef);

  if (!open) return null;
  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };
  const Element = kind === 'drawer' ? 'aside' : 'section';
  return (
    <div
      className={`${styles.overlay} ${kind === 'drawer' ? styles.drawerOverlay : ''} ${mobileBottom ? styles.mobileBottom : ''}`}
      onMouseDown={handleBackdrop}
    >
      <Element
        ref={contentRef}
        className={`${styles[kind]} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </Element>
    </div>
  );
}

export type DialogProps = Omit<OverlayProps, 'kind'>;
export function Dialog(props: DialogProps) {
  return <Overlay {...props} kind="dialog" />;
}

export function Drawer(props: DialogProps) {
  return <Overlay {...props} kind="drawer" />;
}
