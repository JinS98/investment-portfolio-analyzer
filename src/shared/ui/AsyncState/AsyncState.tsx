import type { ReactNode } from 'react';
import styles from './AsyncState.module.scss';

interface AsyncStateProps {
  status: 'loading' | 'empty' | 'error';
  message: string;
  action?: ReactNode;
}

export function AsyncState({ status, message, action }: AsyncStateProps) {
  return (
    <div
      className={`${styles.state} ${status === 'error' ? styles.error : ''}`}
      role={status === 'error' ? 'alert' : 'status'}
    >
      <p>{message}</p>
      {action}
    </div>
  );
}
