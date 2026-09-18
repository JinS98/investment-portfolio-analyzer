import { fetchStockRankings, fetchStocks } from './tossApi';
import type { Currency, RankingMarketCountry, StockRankingItem } from '../types/market';

const MARKET_OVERVIEW_TTL = 5 * 60 * 1000;

export interface MarketExploreStock {
  rank: number;
  symbol: string;
  name: string;
  market: string;
  currency: Currency;
  price: number | null;
  changeRate: number | null;
  tradingAmount: number | null;
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
