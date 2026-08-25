import { create } from 'zustand';
import type { AppUser } from '../types';

interface AuthState {
  user: AppUser | null;
  isAuthLoading: boolean;
  setUser: (user: AppUser | null) => void;
  setAuthLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthLoading: true,
  setUser: (user) => set({ user }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
}));
