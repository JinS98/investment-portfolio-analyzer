import type { createPortfolioManagerViewModel } from '../../model/portfolioViewModel';
import { formatMarketMoney, type DisplayCurrency } from '@shared/lib';
import { formatRate } from '../../../../utils/calculator';
import styles from './PortfolioManager.module.scss';

export type PortfolioSummaryMetricType = 'accountValue' | 'profitAmount' | 'profitRate';

interface PortfolioSummaryMetricProps {
  metric: PortfolioSummaryMetricType;
  viewModel: ReturnType<typeof createPortfolioManagerViewModel>;
  displayCurrency: DisplayCurrency;
}

export function PortfolioSummaryMetric({
  metric,
  viewModel,
  displayCurrency,
}: PortfolioSummaryMetricProps) {
  const { combinedSummary, isSummaryCurrencyAvailable, summaryUnavailableMessage } = viewModel;
  const market = displayCurrency === 'USD' ? 'US' : 'KR';
  const currencyLabel = displayCurrency === 'USD' ? '$' : '원';
  const value =
    metric === 'accountValue'
      ? combinedSummary?.currentValue
      : metric === 'profitAmount'
        ? combinedSummary?.profitAmount
        : combinedSummary?.profitRate;
  const label =
    metric === 'accountValue'
      ? `현재 계좌 금액 (${currencyLabel})`
      : metric === 'profitAmount'
        ? `통합 평가손익 (${currencyLabel})`
        : '통합 평가 수익률';
  const formatted =
    !isSummaryCurrencyAvailable || value === undefined
      ? summaryUnavailableMessage
      : metric === 'profitRate'
        ? formatRate(value)
        : formatMarketMoney(value, market);

  return (
    <section className={styles.summaryMetricWidget} aria-label={label}>
      <span>{label}</span>
      <strong
        className={
          metric === 'accountValue' || value === undefined
            ? ''
            : value < 0
              ? styles.negative
              : styles.positive
        }
      >
        {formatted}
      </strong>
    </section>
  );
}
