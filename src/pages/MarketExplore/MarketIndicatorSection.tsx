import type { DisplayCurrency } from '../../store/displayCurrencyStore';
import { Dialog } from '@shared/ui';
import type { MarketIndexData, MarketIndexSymbol, MarketIndicatorCandle } from '../../types/market';
import { IndicatorSparkline, MiniLineChart } from './MarketCharts';
import styles from './MarketExplorePage.module.scss';

export type IndicatorCardChart = {
  candles: MarketIndicatorCandle[];
  previousClose: number | null;
};

interface MarketIndicatorSectionProps {
  indicators: MarketIndexData[];
  intradayIndicators: Partial<Record<MarketIndexSymbol, IndicatorCardChart>>;
  selectedIndicator: MarketIndexSymbol;
  indicatorCandles: MarketIndicatorCandle[];
  isDialogOpen: boolean;
  displayCurrency: DisplayCurrency;
  exchangeRate?: number | null;
  onSelect: (symbol: MarketIndexSymbol) => void;
  onClose: () => void;
}

export function MarketIndicatorSection({
  indicators,
  intradayIndicators,
  selectedIndicator,
  indicatorCandles,
  isDialogOpen,
  displayCurrency,
  exchangeRate,
  onSelect,
  onClose,
}: MarketIndicatorSectionProps) {
  return (
    <>
      <section className={styles.indicatorSection} aria-label="주요 지수">
        <div className={styles.sectionTitle}>
          <h2>주요 지수</h2>
          <span>카드를 선택하면 최근 30일 흐름을 볼 수 있어요.</span>
        </div>
        <div className={styles.indicatorCards}>
          {(['KOSPI', 'KOSDAQ', 'NASDAQ', 'SP500'] as const).map((symbol) => {
            const indicator = indicators.find((item) => item.symbol === symbol);
            return (
              <button
                key={symbol}
                type="button"
                className={selectedIndicator === symbol ? styles.selectedIndicator : undefined}
                onClick={() => {
                  onSelect(symbol);
                }}
                aria-pressed={selectedIndicator === symbol}
              >
                <span>
                  {symbol === 'KOSPI'
                    ? '코스피'
                    : symbol === 'KOSDAQ'
                      ? '코스닥'
                      : symbol === 'NASDAQ'
                        ? '나스닥'
                        : 'S&P 500'}
                </span>
                <span className={styles.indicatorValue}>
                  <strong>
                    {indicator
                      ? `${indicator.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`
                      : '-'}
                  </strong>
                  <IndicatorSparkline
                    candles={intradayIndicators[symbol]?.candles ?? []}
                    positive={(indicator?.changeRate ?? 0) >= 0}
                    previousClose={intradayIndicators[symbol]?.previousClose ?? null}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <Dialog
        open={isDialogOpen}
        labelledBy="indicator-dialog-title"
        onClose={onClose}
        className={styles.indicatorDialog}
      >
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="indicator-dialog-title">
              {selectedIndicator === 'KOSPI'
                ? '코스피'
                : selectedIndicator === 'KOSDAQ'
                  ? '코스닥'
                  : selectedIndicator === 'NASDAQ'
                    ? '나스닥'
                    : 'S&P 500'}{' '}
              최근 30일
            </h2>
            <p>일별 종가 기준 흐름입니다.</p>
          </div>
          <button type="button" onClick={() => onClose()} aria-label="지수 차트 닫기">
            ×
          </button>
        </div>
        {indicatorCandles.length ? (
          <MiniLineChart
            candles={indicatorCandles}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate}
          />
        ) : (
          <p className={styles.chartLoading}>차트를 불러오는 중입니다.</p>
        )}
      </Dialog>
    </>
  );
}
