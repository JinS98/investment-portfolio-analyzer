import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndicatorSparkline, MiniLineChart } from '../src/pages/MarketExplore/MarketCharts';
import { MarketIndicatorSection } from '../src/pages/MarketExplore/MarketIndicatorSection';
import type { MarketIndexData } from '../src/types/market';

const candles = [
  { timestamp: '2026-10-06T09:00:00+09:00', closePrice: 100 },
  { timestamp: '2026-10-06T15:30:00+09:00', closePrice: 90 },
];

describe('market indicator chart colors', () => {
  it('uses the previous close when a Korean index has no change rate', () => {
    const indicators: MarketIndexData[] = [
      { symbol: 'KOSPI', price: 90, changeRate: null, candles: [] },
    ];
    const props = {
      indicators,
      intradayIndicators: { KOSPI: { candles, previousClose: 100 } },
      selectedIndicator: 'KOSPI' as const,
      indicatorCandles: [],
      isDialogOpen: false,
      displayCurrency: 'KRW' as const,
      onSelect: vi.fn(),
      onClose: vi.fn(),
    };
    const { container, rerender } = render(<MarketIndicatorSection {...props} />);

    expect(container.querySelector('svg[class*="negativeSparkline"]')).not.toBeNull();

    rerender(<MarketIndicatorSection {...props} indicators={[{ ...indicators[0], price: 110 }]} />);
    expect(container.querySelector('svg[class*="positiveSparkline"]')).not.toBeNull();

    rerender(
      <MarketIndicatorSection
        {...props}
        intradayIndicators={{ KOSPI: { candles, previousClose: null } }}
      />,
    );
    expect(container.querySelector('svg[class*="neutralSparkline"]')).not.toBeNull();
  });

  it('colors a declining 30-day chart blue using its first and last closes', () => {
    const monthlyCandles = [
      { timestamp: '2026-09-07T15:30:00+09:00', closePrice: 100 },
      { timestamp: '2026-10-06T15:30:00+09:00', closePrice: 90 },
    ];
    const { container } = render(<MiniLineChart candles={monthlyCandles} displayCurrency="KRW" />);

    expect(container.querySelector('[class*="negativeChart"]')).not.toBeNull();
    expect(screen.getByText('-10.00%')).toBeInTheDocument();
  });

  it('renders an unknown daily direction without a gain or loss color', () => {
    const { container } = render(
      <IndicatorSparkline candles={candles} positive={null} previousClose={null} />,
    );

    expect(container.querySelector('svg[class*="neutralSparkline"]')).not.toBeNull();
  });
});
