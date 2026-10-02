import type { Holding, HoldingHistory, MarketType, PriceMap } from '../../../types/index.ts';
import { calculatePortfolioFxPerformance } from '../../../utils/portfolioFxPerformance.ts';
import type { DisplayCurrency } from '../../../shared/lib/currency.ts';

export function createPortfolioManagerViewModel(
  holdings: Holding[],
  histories: HoldingHistory[],
  prices: PriceMap,
  exchangeRate: number | null,
  displayCurrency: DisplayCurrency,
) {
  const groups = (['KR', 'US'] as MarketType[])
    .map((market) => ({
      market,
      holdings: holdings.filter((holding) => holding.market === market),
    }))
    .filter((group) => group.holdings.length > 0);
  const fxPerformance = calculatePortfolioFxPerformance(holdings, histories, prices, exchangeRate);
  const combinedSummary = displayCurrency === 'USD' ? fxPerformance.usd : fxPerformance.krw;
  const summaryUnavailableMessage =
    holdings.length === 0
      ? '종목을 추가해 주세요'
      : displayCurrency === 'KRW' &&
          histories.some((history) => history.market === 'US' && !history.exchangeRate)
        ? '환율 없음'
        : displayCurrency === 'USD'
          ? '환율 미조회'
          : '시세 미조회';

  return {
    groups,
    fxPerformance,
    combinedSummary,
    isSummaryCurrencyAvailable: combinedSummary !== null,
    summaryUnavailableMessage,
  };
}
