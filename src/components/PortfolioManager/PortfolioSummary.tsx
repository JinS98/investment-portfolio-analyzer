import type { createPortfolioManagerViewModel } from '@features/portfolio-management';
import { formatMarketMoney, type DisplayCurrency } from '@shared/lib';
import { formatRate } from '../../utils/calculator';
import styles from './PortfolioManager.module.scss';

interface PortfolioSummaryProps {
  viewModel: ReturnType<typeof createPortfolioManagerViewModel>;
  displayCurrency: DisplayCurrency;
}

export function PortfolioSummary({ viewModel, displayCurrency }: PortfolioSummaryProps) {
  const { combinedSummary, fxPerformance, isSummaryCurrencyAvailable, summaryUnavailableMessage } =
    viewModel;
  const summaryCurrency = displayCurrency;
  const money = formatMarketMoney;
  const summaryMoney = (value: number) => money(value, summaryCurrency === 'USD' ? 'US' : 'KR');

  return (
    <>
      <div className={styles.combinedSummary} aria-label="포트폴리오 요약">
        <span>
          현재 계좌 금액 ({summaryCurrency === 'USD' ? '$' : '원'})
          <strong className={styles.accountValue}>
            {!isSummaryCurrencyAvailable
              ? summaryUnavailableMessage
              : summaryMoney(combinedSummary!.currentValue)}
          </strong>
        </span>
        <span>
          통합 평가손익 ({summaryCurrency === 'USD' ? '$' : '원'})
          <strong
            className={
              combinedSummary === null || combinedSummary.profitAmount >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {!isSummaryCurrencyAvailable
              ? summaryUnavailableMessage
              : summaryMoney(combinedSummary!.profitAmount)}
          </strong>
        </span>
        <span>
          통합 평가 수익률
          <strong
            className={
              combinedSummary === null || combinedSummary.profitRate >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {combinedSummary === null
              ? summaryUnavailableMessage
              : formatRate(combinedSummary.profitRate)}
          </strong>
        </span>
      </div>

      <div className={styles.performanceGuide} role="status">
        {summaryCurrency === 'KRW' && fxPerformance.krw ? (
          <>
            <span>
              주가 손익{' '}
              <strong
                className={
                  fxPerformance.krw.stockProfitAmount >= 0 ? styles.positive : styles.negative
                }
              >
                {money(fxPerformance.krw.stockProfitAmount, 'KR')}
              </strong>
            </span>
            <span>
              환차익{' '}
              <strong
                className={
                  fxPerformance.krw.foreignExchangeProfitAmount >= 0
                    ? styles.positive
                    : styles.negative
                }
              >
                {money(fxPerformance.krw.foreignExchangeProfitAmount, 'KR')}
              </strong>
            </span>
            <small>평가손익에는 거래일 환율과 현재 환율의 차이를 반영합니다.</small>
          </>
        ) : summaryCurrency === 'USD' ? (
          <small>달러 기준 성과에는 환율 변동을 포함하지 않습니다.</small>
        ) : (
          <small>거래일 환율을 확인한 뒤 원화 기준 성과를 계산합니다.</small>
        )}
      </div>
    </>
  );
}
