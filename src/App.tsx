import { useEffect, useState } from 'react';
import { pageFromHash, type AppPage } from './app/navigation';
import { Content } from './components/layout/Content/Content';
import { Header } from './components/layout/Header/Header';
import { AuthDialog } from './components/AuthDialog/AuthDialog';
import { useAuth } from './hooks/useAuth';
import { useDisplayCurrencyStore } from './store/displayCurrencyStore';
import styles from './App.module.scss';

const readInitialTheme = (): 'light' | 'dark' => {
  const savedTheme = localStorage.getItem('portfolio-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function App() {
  const { user, isAuthLoading, login, loginWithEmail, signUpWithEmail, logout } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(readInitialTheme);
  const [page, setPage] = useState<AppPage>(() => pageFromHash(window.location.hash));
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const displayCurrency = useDisplayCurrencyStore((state) => state.displayCurrency);
  const setDisplayCurrency = useDisplayCurrencyStore((state) => state.setDisplayCurrency);

  useEffect(() => {
    const syncPage = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('portfolio-theme', theme);
  }, [theme]);

  if (isAuthLoading) {
    return (
      <div className={styles.loading}>
        <p>초기화 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Header
        activePage={page}
        displayCurrency={displayCurrency}
        theme={theme}
        user={user}
        onCurrencyChange={setDisplayCurrency}
        onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        onLogin={() => setIsAuthDialogOpen(true)}
        onLogout={logout}
      />
      <Content page={page} onLogin={() => setIsAuthDialogOpen(true)} />
      {isAuthDialogOpen ? (
        <AuthDialog
          onClose={() => setIsAuthDialogOpen(false)}
          onGoogleLogin={login}
          onEmailLogin={loginWithEmail}
          onEmailSignUp={signUpWithEmail}
        />
      ) : null}
    </div>
  );
}

export default App;
