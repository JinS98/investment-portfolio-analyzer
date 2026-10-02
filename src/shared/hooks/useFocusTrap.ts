import { useEffect, type RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(open: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) return;

    const elements = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
    const initial = elements()[0] ?? container;
    initial.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const available = elements();
      if (available.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      trigger?.focus();
    };
  }, [containerRef, open]);
}
