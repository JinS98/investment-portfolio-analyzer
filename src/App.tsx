import { useAuth } from './hooks/useAuth';
import Dashboard from './pages/Dashboard';
import styles from './App.module.scss';

function App() {
  const { user, isAuthLoading, login, logout } = useAuth();

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
        <div className={styles.navRight}>
          {user ? (
            <>
              <span className={styles.navUser}>{user.displayName ?? user.email}</span>
              <button className={styles.navBtn} onClick={logout}>로그아웃</button>
            </>
          ) : (
            <button className={styles.navBtn} onClick={login}>Google 로그인</button>
          )}
        </div>
      </nav>
      <Dashboard />
    </div>
  );
}

export default App;
