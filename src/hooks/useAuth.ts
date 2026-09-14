import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';
import {
  subscribeAuthState,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail as createEmailAccount,
} from '../services/auth';

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

  const login = () => signInWithGoogle();
  const loginWithEmail = (email: string, password: string) => signInWithEmail(email, password);
  const signUpWithEmail = (email: string, password: string) => createEmailAccount(email, password);

  const logout = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('[useAuth] logout error:', err);
    }
  };

  return { user, isAuthLoading, login, loginWithEmail, signUpWithEmail, logout };
};
