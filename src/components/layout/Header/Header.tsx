import { useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiLogOut } from 'react-icons/fi';
import { NAVIGATION_ITEMS, type AppPage } from '../../../app/navigation';
import type { AppUser, Currency } from '../../../types';
import styles from './Header.module.scss';

interface HeaderProps {
  activePage: AppPage;
  displayCurrency: Currency;
  theme: 'light' | 'dark';
  user: AppUser | null;
  onCurrencyChange: (currency: Currency) => void;
  onThemeToggle: () => void;
  onLogin: () => void;
  onLogout: () => Promise<void>;
}

export function Header({
  activePage,
  displayCurrency,
  theme,
  user,
  onCurrencyChange,
  onThemeToggle,
  onLogin,
  onLogout,
}: HeaderProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAccountMenuOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isAccountMenuOpen]);

  const handleLogout = async () => {
    setIsAccountMenuOpen(false);
    await onLogout();
  };

  return (
    <nav className={styles.nav} aria-label="주요 메뉴">
      <span className={styles.navBrand}>
        <img className={styles.navLogo} src="/portfolio-logo.png" alt="" />
        Portfolio Platform
      </span>
      <div className={styles.navMenu}>
        {NAVIGATION_ITEMS.map((item) => (
          <a
            key={item.page}
            href={item.hash}
            className={activePage === item.page ? styles.navMenuActive : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
      <div className={styles.navRight}>
        <div className={styles.currencyToggle} role="group" aria-label="표시 통화">
          <button
            type="button"
            className={displayCurrency === 'USD' ? styles.currencyActive : undefined}
            aria-pressed={displayCurrency === 'USD'}
            onClick={() => onCurrencyChange('USD')}
          >
            $
          </button>
          <button
            type="button"
            className={displayCurrency === 'KRW' ? styles.currencyActive : undefined}
            aria-pressed={displayCurrency === 'KRW'}
            onClick={() => onCurrencyChange('KRW')}
          >
            원
          </button>
        </div>
        <button
          type="button"
          className={styles.themeToggle}
          onClick={onThemeToggle}
          aria-label={theme === 'light' ? '어두운 테마로 변경' : '밝은 테마로 변경'}
          title={theme === 'light' ? '어두운 테마' : '밝은 테마'}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
        {user ? (
          <div className={styles.accountMenu} ref={accountMenuRef}>
            <button
              type="button"
              className={styles.accountTrigger}
              onClick={() => setIsAccountMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
            >
              <span className={styles.navUser}>{user.displayName ?? user.email}</span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {isAccountMenuOpen ? (
              <div className={styles.accountDropdown} role="menu">
                <button type="button" role="menuitem" onClick={() => void handleLogout()}>
                  <FiLogOut aria-hidden="true" />
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className={styles.navBtn} onClick={onLogin}>
            로그인
          </button>
        )}
      </div>
    </nav>
  );
}
