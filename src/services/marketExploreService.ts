import { fetchStockRankings, fetchStocks } from './tossApi';
import type { Currency, RankingMarketCountry, StockRankingItem } from '../types/market';

const MARKET_OVERVIEW_TTL = 5 * 60 * 1000;

export interface MarketExploreStock {
  rank: number;
  overallRank: number | null;
  symbol: string;
  name: string;
  market: string;
  currency: Currency;
  price: number | null;
  changeRate: number | null;
  tradingAmount: number | null;
}

/**
 * Combines the country-specific rankings into one KRW-comparable ranking.
 * The original currency and amount remain on each item for display.
 */
export function rankMarketExploreStocks(
  stocks: MarketExploreStock[],
  usdKrwRate: number,
): MarketExploreStock[] {
  const tradingAmountInKrw = (stock: MarketExploreStock) => {
    if (stock.tradingAmount === null) return -1;
    return stock.currency === 'USD' ? stock.tradingAmount * usdKrwRate : stock.tradingAmount;
  };

  return stocks
    .slice()
    .sort((left, right) => tradingAmountInKrw(right) - tradingAmountInKrw(left))
    .map((stock, index) => ({ ...stock, overallRank: index + 1 }));
}

const cachedOverviews = new Map<RankingMarketCountry, { expiresAt: number; stocks: MarketExploreStock[] }>();
const pendingOverviews = new Map<RankingMarketCountry, Promise<MarketExploreStock[]>>();

/** Loads the market page's initial quick-explore data only when the page is opened. */
export async function fetchMarketExploreOverview(
  marketCountry: RankingMarketCountry,
): Promise<MarketExploreStock[]> {
  const cached = cachedOverviews.get(marketCountry);
  if (cached && cached.expiresAt > Date.now()) return cached.stocks;
  const pending = pendingOverviews.get(marketCountry);
  if (pending) return pending;

  const request = fetchStockRankings(marketCountry, 20)
    .then(async ({ rankings }) => {
      const stocks = await fetchStocks(rankings.map((ranking) => ranking.symbol));
      const stocksBySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
      const result = rankings.flatMap((ranking: StockRankingItem) => {
        const stock = stocksBySymbol.get(ranking.symbol);
        if (!stock) return [];
        return [{
          rank: ranking.rank,
          overallRank: null,
          symbol: ranking.symbol,
          name: stock.name,
          market: stock.market,
          currency: ranking.currency,
          price: ranking.price,
          changeRate: ranking.changeRate,
          tradingAmount: ranking.tradingAmount,
        }];
      });
      cachedOverviews.set(marketCountry, { expiresAt: Date.now() + MARKET_OVERVIEW_TTL, stocks: result });
      return result;
    })
    .finally(() => {
      pendingOverviews.delete(marketCountry);
    });
  pendingOverviews.set(marketCountry, request);
  return request;
}
