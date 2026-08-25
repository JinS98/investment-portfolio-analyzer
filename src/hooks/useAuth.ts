import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { subscribeAuthState, signInWithGoogle, signOutUser } from '../services/auth';
import { clearTossToken } from '../services/tossAuth';

export const useAuth = () => {
  const { user, isAuthLoading, setUser, setAuthLoading } = useAuthStore();
  const reset = usePortfolioStore((s) => s.reset);

  useEffect(() => {
    const unsubscribe = subscribeAuthState((authUser) => {
      setUser(authUser);
      setAuthLoading(false);
      if (!authUser) {
        reset();
        clearTossToken(); // 로그아웃 시 토스 토큰도 초기화
      }
    });
    return unsubscribe;
  }, [setUser, setAuthLoading, reset]);

  const login = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[useAuth] login error:', err);
    }
  };

  const logout = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('[useAuth] logout error:', err);
    }
  };

  return { user, isAuthLoading, login, logout };
};
