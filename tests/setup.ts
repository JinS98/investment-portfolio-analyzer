import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../src/store/authStore';
import { useDisplayCurrencyStore } from '../src/store/displayCurrencyStore';
import { usePortfolioStore } from '../src/store/portfolioStore';

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const resetAppStores = () => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useDisplayCurrencyStore.setState(useDisplayCurrencyStore.getInitialState(), true);
  usePortfolioStore.setState(usePortfolioStore.getInitialState(), true);
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.style.cssText = '';
  window.location.hash = '';
  resetAppStores();

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  resetAppStores();
  vi.unstubAllGlobals();
});
