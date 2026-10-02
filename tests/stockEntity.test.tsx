import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockAvatar, isKoreanMarket, marketFromCurrency } from '@entities/stock';
import { formatCompactMoney, formatCurrentMoney, formatMarketMoney } from '@shared/lib';

describe('stock entity presentation', () => {
  it('falls back to the stock initial when its image fails', () => {
    const { container } = render(<StockAvatar name="Apple" ticker="AAPL" market="US" />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByLabelText('Apple 종목 아이콘')).toHaveTextContent('A');
  });

  it('maps market identifiers consistently', () => {
    expect(isKoreanMarket('KOSDAQ')).toBe(true);
    expect(isKoreanMarket('NASDAQ')).toBe(false);
    expect(marketFromCurrency('USD')).toBe('US');
  });
});

describe('shared currency formatting', () => {
  it('formats KR and US market values', () => {
    expect(formatMarketMoney(70000, 'KR')).toBe('70,000원');
    expect(formatMarketMoney(200, 'US')).toBe('$200.00');
    expect(formatCurrentMoney(10, 'US', 'KRW', 1400)).toBe('14,000원');
    expect(formatCompactMoney(2_000_000, 'USD', 'USD')).toBe('$2.0M');
  });
});
