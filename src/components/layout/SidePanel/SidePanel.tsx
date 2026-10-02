import type { ReactNode } from 'react';
import { Drawer } from '@shared/ui';

interface SidePanelProps {
  isOpen: boolean;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

/** @deprecated Prefer the shared Drawer directly for new call sites. */
export function SidePanel({ isOpen, labelledBy, onClose, children }: SidePanelProps) {
  return (
    <Drawer open={isOpen} labelledBy={labelledBy} onClose={onClose}>
      {children}
    </Drawer>
  );
}
