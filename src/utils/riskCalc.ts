import type { RiskData, StockRiskData, TossCandleItem } from '../types';

/**
 * 변동성 계산 (연율화 표준편차)
 * 토스 캔들 일봉 데이터 기반 — Week 5에서 연동
 */
export const calcDailyReturns = (candles: TossCandleItem[]): number[] => {
  if (candles.length < 2) return [];

  return candles.slice(1).flatMap((c, i) => {
    const prev = candles[i].closePrice;
    return prev > 0 && Number.isFinite(c.closePrice) ? [(c.closePrice - prev) / prev] : [];
  });
};

export const calcVolatility = (candles: TossCandleItem[]): number | null => {
  const returns = calcDailyReturns(candles);
  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
};

/**
 * MDD (최대 낙폭) 계산
 */
export const calcMDD = (candles: TossCandleItem[]): number | null => {
  if (candles.length < 2) return null;

  let peak = candles[0].closePrice;
  let mdd = 0;

  for (const c of candles) {
    if (c.closePrice > peak) peak = c.closePrice;
    const drawdown = peak > 0 ? ((c.closePrice - peak) / peak) * 100 : 0;
    if (drawdown < mdd) mdd = drawdown;
  }

  return mdd;
};

/**
 * 리스크 분석
 * @param historicalData - 종목별 토스 캔들 데이터
 * @param weights        - 종목별 비중 (0~100)
 */
export const calcRisk = (
  historicalData: Record<string, TossCandleItem[]>,
  weights: Record<string, number>,
): RiskData => {
  const tickers = Object.keys(historicalData);
  const stockRisks: StockRiskData[] = tickers.map((ticker) => {
    const candles = historicalData[ticker];
    return { ticker, observations: candles.length, volatility: calcVolatility(candles), mdd: calcMDD(candles) };
  });
  const analyzed = stockRisks.filter((stock) => stock.volatility !== null && stock.mdd !== null);
  const insufficientTickers = stockRisks.filter((stock) => stock.volatility === null || stock.mdd === null).map((stock) => stock.ticker);
  const sortedWeights = Object.entries(weights).sort(([, a], [, b]) => b - a);
  const concentration = sortedWeights.slice(0, 2).reduce((sum, [, weight]) => sum + weight, 0);
  const maxWeight = sortedWeights[0]?.[1] ?? 0;
  if (!analyzed.length) return {
    volatility: null, mdd: null, concentration: round(concentration), maxWeight: round(maxWeight),
    analyzedTickers: [], insufficientTickers, stocks: stockRisks,
  };

  const analyzedWeight = analyzed.reduce((sum, stock) => sum + (weights[stock.ticker] ?? 0), 0);
  const volatility = analyzed.reduce((sum, stock) => sum + stock.volatility! * (weights[stock.ticker] ?? 0), 0) / analyzedWeight;
  const mdd = Math.min(...analyzed.map((stock) => stock.mdd!));

  return {
    volatility: round(volatility),
    mdd: round(mdd),
    concentration: round(concentration),
    maxWeight: round(maxWeight),
    analyzedTickers: analyzed.map((stock) => stock.ticker),
    insufficientTickers,
    stocks: stockRisks,
  };
};

const round = (value: number): number => Math.round(value * 100) / 100;
