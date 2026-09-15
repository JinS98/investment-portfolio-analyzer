import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Dashboard from './pages/Dashboard';
import { TransactionHistoryPage } from './pages/TransactionHistory/TransactionHistoryPage';
import { VirtualPortfolioPage } from './pages/VirtualPortfolio/VirtualPortfolioPage';
import { AuthDialog } from './components/AuthDialog/AuthDialog';
import styles from './App.module.scss';

function App() {
  const { user, isAuthLoading, login, loginWithEmail, signUpWithEmail, logout } = useAuth();
  const [page, setPage] = useState<'dashboard' | 'analysis' | 'transactions' | 'virtual'>(() => {
    if (window.location.hash === '#analysis') return 'analysis';
    if (window.location.hash === '#transactions') return 'transactions';
    if (window.location.hash === '#virtual') return 'virtual';
    return 'dashboard';
  });
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  useEffect(() => {
    const syncPage = () => {
      if (window.location.hash === '#analysis') setPage('analysis');
      else if (window.location.hash === '#transactions') setPage('transactions');
      else if (window.location.hash === '#virtual') setPage('virtual');
      else setPage('dashboard');
    };
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  if (isAuthLoading) {
    return (
      <div className={styles.loading}>
        <p>초기화 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <span className={styles.navBrand}>📊 Portfolio Platform</span>
        <div className={styles.navMenu} aria-label="주요 메뉴">
          <a href="#dashboard" className={page === 'dashboard' ? styles.navMenuActive : undefined}>
            대시보드
          </a>
          <a href="#analysis" className={page === 'analysis' ? styles.navMenuActive : undefined}>
            투자 분석
          </a>
          <a
            href="#transactions"
            className={page === 'transactions' ? styles.navMenuActive : undefined}
          >
            거래 내역
          </a>
          <a href="#virtual" className={page === 'virtual' ? styles.navMenuActive : undefined}>
            가상 포트폴리오
          </a>
        </div>
        <div className={styles.navRight}>
          {user ? (
            <>
              <span className={styles.navUser}>{user.displayName ?? user.email}</span>
              <button className={styles.navBtn} onClick={logout}>
                로그아웃
              </button>
            </>
          ) : (
            <button className={styles.navBtn} onClick={() => setIsAuthDialogOpen(true)}>
              로그인
            </button>
          )}
        </div>
      </nav>
      {page === 'transactions' ? (
        <TransactionHistoryPage />
      ) : page === 'virtual' ? (
        <VirtualPortfolioPage />
      ) : (
        <Dashboard view={page} />
      )}
      {isAuthDialogOpen && (
        <AuthDialog
          onClose={() => setIsAuthDialogOpen(false)}
          onGoogleLogin={login}
          onEmailLogin={loginWithEmail}
          onEmailSignUp={signUpWithEmail}
        />
      )}
    </div>
  );
}

export default App;
