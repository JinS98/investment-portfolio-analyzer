import { useState } from 'react';
import type { MarketType } from '../../../types';
import styles from './StockAvatar.module.scss';

interface StockAvatarProps {
  name?: string;
  ticker: string;
  market?: MarketType;
  className?: string;
}

export function StockAvatar({ name, ticker, market, className = '' }: StockAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const label = (name?.trim() || ticker).charAt(0);
  const iconUrl = `https://static.toss.im/png-icons/securities/icn-sec-fill-${ticker.toUpperCase()}.png`;

  return (
    <span
      className={`${styles.avatar} ${className}`.trim()}
      data-market={market}
      aria-label={`${name || ticker} 종목 아이콘`}
    >
      {!hasImageError ? <img src={iconUrl} alt="" onError={() => setHasImageError(true)} /> : label}
    </span>
  );
}
