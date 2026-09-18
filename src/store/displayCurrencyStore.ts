import { create } from 'zustand';

export type DisplayCurrency = 'USD' | 'KRW';

const storageKey = 'portfolio-display-currency';

const readInitialCurrency = (): DisplayCurrency => {
  try {
    const saved =
      localStorage.getItem(storageKey) ?? localStorage.getItem('portfolio-summary-currency');
    return saved === 'USD' ? 'USD' : 'KRW';
  } catch {
    return 'KRW';
  }
};

interface DisplayCurrencyState {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
}

export const useDisplayCurrencyStore = create<DisplayCurrencyState>((set) => ({
  displayCurrency: readInitialCurrency(),
  setDisplayCurrency: (displayCurrency) => {
    try {
      localStorage.setItem(storageKey, displayCurrency);
      localStorage.removeItem('portfolio-summary-currency');
    } catch {
      // The preference remains available for the current session.
    }
    set({ displayCurrency });
  },
}));
