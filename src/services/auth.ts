import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { isFirebaseConfigured, auth } from './firebase';
import type { AppUser } from '../types';

export const signInWithGoogle = async (): Promise<AppUser> => {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase 미설정 — .env.local을 먼저 구성해주세요 (Week 4)');
  }
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return toAppUser(result.user);
};

export const signOutUser = async (): Promise<void> => {
  if (!isFirebaseConfigured || !auth) return;
  await signOut(auth);
};

export const subscribeAuthState = (
  callback: (user: AppUser | null) => void,
): (() => void) => {
  if (!isFirebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAppUser(user) : null);
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toAppUser = (user: any): AppUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  photoURL: user.photoURL,
});
