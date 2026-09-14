import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { subscribeAuthState, signInWithGoogle, signOutUser } from '../services/auth';

export const useAuth = () => {
  const { user, isAuthLoading, setUser, setAuthLoading } = useAuthStore();
  const reset = usePortfolioStore((s) => s.reset);

  useEffect(() => {
    const unsubscribe = subscribeAuthState((authUser) => {
      setUser(authUser);
      setAuthLoading(false);
      if (!authUser) {
        reset();
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
