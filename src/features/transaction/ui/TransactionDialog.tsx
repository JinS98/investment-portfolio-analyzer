import type { ReactNode } from 'react';
import { Dialog } from '@shared/ui';

interface TransactionDialogProps {
  open: boolean;
  saving?: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

export function TransactionDialog({
  open,
  saving = false,
  className,
  onClose,
  children,
}: TransactionDialogProps) {
  return (
    <Dialog
      open={open}
      labelledBy="transaction-modal-title"
      onClose={onClose}
      closeDisabled={saving}
      className={className}
    >
      {children}
    </Dialog>
  );
}
