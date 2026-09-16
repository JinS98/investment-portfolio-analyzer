import type { Holding, HoldingHistory, PriceMap } from '../types';

type CostState = {
  market: 'KR' | 'US';
  ticker: string;
  quantity: number;
  nativeCost: number;
  krwCost: number | null;
};

export interface CurrencyPerformance {
  currentValue: number;
  costBasis: number;
  profitAmount: number;
  profitRate: number;
}

export interface KrwPerformance extends CurrencyPerformance {
  stockProfitAmount: number;
  foreignExchangeProfitAmount: number;
  realizedProfitAmount: number | null;
}

export interface PortfolioFxPerformance {
  krw: KrwPerformance | null;
  usd: CurrencyPerformance | null;
}

export interface RealizedKrwPnL {
  profitAmount: number;
  stockProfitAmount: number;
  foreignExchangeProfitAmount: number;
}

type LedgerCostResult = {
  states: CostState[];
  realized: RealizedKrwPnL | null;
};

const keyOf = (market: 'KR' | 'US', ticker: string) => `${market}:${ticker}`;

const sortedHistories = (histories: HoldingHistory[]) =>
  [...histories].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.createdAt - right.createdAt ||
      left.id.localeCompare(right.id),
  );

function calculateLedgerCosts(histories: HoldingHistory[]): LedgerCostResult {
  const states = new Map<string, CostState>();
  let realizedProfitAmount = 0;
  let realizedStockProfitAmount = 0;
  let realizedForeignExchangeProfitAmount = 0;
  let isRealizedKrwAvailable = true;

  for (const history of sortedHistories(histories)) {
    const key = keyOf(history.market, history.ticker);
    const grossAmount = history.price * history.quantity;
    const exchangeRate = history.market === 'US' ? history.exchangeRate : 1;
    const krwGrossAmount = exchangeRate ? grossAmount * exchangeRate : null;

    if (history.type === 'BUY') {
      const current = states.get(key) ?? {
        market: history.market,
        ticker: history.ticker,
        quantity: 0,
        nativeCost: 0,
        krwCost: 0,
      };
      current.quantity += history.quantity;
      current.nativeCost += grossAmount;
      current.krwCost =
        current.krwCost === null || krwGrossAmount === null
          ? null
          : current.krwCost + krwGrossAmount;
      states.set(key, current);
      continue;
    }

    const current = states.get(key);
    if (!current || current.quantity <= 0) continue;
    const nativeCostPerUnit = current.nativeCost / current.quantity;
    const krwCostPerUnit = current.krwCost === null ? null : current.krwCost / current.quantity;
    const netProceeds = grossAmount - history.fee - history.tax;
    if (krwCostPerUnit === null || exchangeRate === undefined) {
      isRealizedKrwAvailable = false;
    } else {
      realizedProfitAmount += netProceeds * exchangeRate - krwCostPerUnit * history.quantity;
      realizedStockProfitAmount +=
        ((history.price - nativeCostPerUnit) * history.quantity - history.fee - history.tax) *
        exchangeRate;
      realizedForeignExchangeProfitAmount +=
        nativeCostPerUnit * history.quantity * exchangeRate - krwCostPerUnit * history.quantity;
    }
    current.quantity -= history.quantity;
    current.nativeCost -= nativeCostPerUnit * history.quantity;
    current.krwCost =
      krwCostPerUnit === null ? null : current.krwCost! - krwCostPerUnit * history.quantity;
    if (current.quantity <= Number.EPSILON) states.delete(key);
  }

  return {
    states: [...states.values()],
    realized: isRealizedKrwAvailable
      ? {
          profitAmount: realizedProfitAmount,
          stockProfitAmount: realizedStockProfitAmount,
          foreignExchangeProfitAmount: realizedForeignExchangeProfitAmount,
        }
      : null,
  };
}

/** Calculates realized Korean-won PnL using each sale's transaction-date exchange rate. */
export function calculateRealizedKrwPnL(histories: HoldingHistory[]): number | null {
  return calculateLedgerCosts(histories).realized?.profitAmount ?? null;
}

export function calculateRealizedKrwPnLBreakdown(
  histories: HoldingHistory[],
): RealizedKrwPnL | null {
  return calculateLedgerCosts(histories).realized;
}

/**
 * Calculates current portfolio performance in USD and KRW. KRW results require a current
 * USD/KRW rate and historical rates for every US transaction contributing to the ledger.
 */
export function calculatePortfolioFxPerformance(
  holdings: Holding[],
  histories: HoldingHistory[],
  prices: PriceMap,
  currentExchangeRate: number | null,
): PortfolioFxPerformance {
  const { states, realized } = calculateLedgerCosts(histories);
  const holdingsByKey = new Map(
    holdings.map((holding) => [keyOf(holding.market, holding.ticker), holding]),
  );
  const hasUsHolding = holdings.some((holding) => holding.market === 'US');
  const hasCurrentExchangeRate = Boolean(currentExchangeRate && currentExchangeRate > 0);
  if (hasUsHolding && !hasCurrentExchangeRate) return { krw: null, usd: null };

  let krwCurrentValue = 0;
  let krwCostBasis = 0;
  let usdCurrentValue = 0;
  let usdCostBasis = 0;
  let stockProfitAmount = 0;
  let foreignExchangeProfitAmount = 0;
  let isKrwAvailable = true;

  for (const state of states) {
    const holding = holdingsByKey.get(keyOf(state.market, state.ticker));
    const currentPrice = prices[state.ticker];
    if (!holding || currentPrice === undefined || !Number.isFinite(currentPrice)) {
      return { krw: null, usd: null };
    }
    const currentNativeValue = currentPrice * holding.quantity;
    if (state.market === 'KR') {
      krwCurrentValue += currentNativeValue;
      krwCostBasis += state.nativeCost;
      if (hasCurrentExchangeRate) {
        usdCurrentValue += currentNativeValue / currentExchangeRate!;
        usdCostBasis += state.nativeCost / currentExchangeRate!;
      }
      stockProfitAmount += currentNativeValue - state.nativeCost;
      continue;
    }

    if (hasCurrentExchangeRate) {
      usdCurrentValue += currentNativeValue;
      usdCostBasis += state.nativeCost;
    }
    krwCurrentValue += currentNativeValue * currentExchangeRate!;
    if (state.krwCost === null) {
      isKrwAvailable = false;
      continue;
    }
    krwCostBasis += state.krwCost;
    stockProfitAmount += (currentNativeValue - state.nativeCost) * currentExchangeRate!;
    foreignExchangeProfitAmount += state.nativeCost * currentExchangeRate! - state.krwCost;
  }

  const usdProfitAmount = usdCurrentValue - usdCostBasis;
  const usd: CurrencyPerformance | null = hasCurrentExchangeRate
    ? {
        currentValue: usdCurrentValue,
        costBasis: usdCostBasis,
        profitAmount: usdProfitAmount,
        profitRate: usdCostBasis > 0 ? (usdProfitAmount / usdCostBasis) * 100 : 0,
      }
    : null;
  if (!isKrwAvailable) return { krw: null, usd };

  const krwProfitAmount = krwCurrentValue - krwCostBasis;
  return {
    usd,
    krw: {
      currentValue: krwCurrentValue,
      costBasis: krwCostBasis,
      profitAmount: krwProfitAmount,
      profitRate: krwCostBasis > 0 ? (krwProfitAmount / krwCostBasis) * 100 : 0,
      stockProfitAmount,
      foreignExchangeProfitAmount,
      realizedProfitAmount: realized?.profitAmount ?? null,
    },
  };
}
