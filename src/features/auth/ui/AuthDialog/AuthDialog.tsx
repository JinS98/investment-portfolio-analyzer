import { useState } from 'react';
import styles from './AuthDialog.module.scss';

interface AuthDialogProps {
  onClose: () => void;
  onGoogleLogin: () => Promise<unknown>;
  onEmailLogin: (email: string, password: string) => Promise<unknown>;
  onEmailSignUp: (email: string, password: string) => Promise<unknown>;
}

const messageFromError = (error: unknown) => {
  if (!(error instanceof Error)) return '로그인 처리 중 오류가 발생했습니다.';
  if (error.message.includes('auth/email-already-in-use'))
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (error.message.includes('auth/invalid-credential'))
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (error.message.includes('auth/weak-password')) return '비밀번호는 6자 이상 입력해 주세요.';
  if (error.message.includes('auth/operation-not-allowed'))
    return 'Firebase에서 이메일/비밀번호 로그인을 활성화해 주세요.';
  return error.message;
};

export function AuthDialog({
  onClose,
  onGoogleLogin,
  onEmailLogin,
  onEmailSignUp,
}: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setLoading(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (authError) {
      setError(messageFromError(authError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          ×
        </button>
        <h2 id="auth-title">{mode === 'login' ? '로그인' : '회원가입'}</h2>
        <p>
          {mode === 'login'
            ? '계정으로 포트폴리오를 안전하게 불러옵니다.'
            : '이메일로 새 계정을 만들 수 있습니다.'}
        </p>
        <button
          type="button"
          className={styles.google}
          disabled={loading}
          onClick={() => void run(onGoogleLogin)}
        >
          Google로 계속하기
        </button>
        <div className={styles.divider}>
          <span>또는</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              mode === 'login' ? onEmailLogin(email, password) : onEmailSignUp(email, password),
            );
          }}
        >
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              disabled={loading}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
        <button
          type="button"
          className={styles.modeButton}
          disabled={loading}
          onClick={() => {
            setMode((current) => (current === 'login' ? 'signup' : 'login'));
            setError('');
          }}
        >
          {mode === 'login' ? '이메일 계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
        </button>
      </section>
    </div>
  );
}
