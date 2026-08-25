import type { TossCandleItem, RiskData } from '../types';

/**
 * 변동성 계산 (연율화 표준편차)
 * 토스 캔들 일봉 데이터 기반 — Week 5에서 연동
 */
const calcVolatility = (candles: TossCandleItem[]): number => {
  if (candles.length < 2) return 0;

  const returns = candles.slice(1).map((c, i) => {
    const prev = candles[i].closePrice;
    return prev > 0 ? (c.closePrice - prev) / prev : 0;
  });

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // 연율화 %
};

/**
 * MDD (최대 낙폭) 계산
 */
const calcMDD = (candles: TossCandleItem[]): number => {
  if (candles.length < 2) return 0;

  let peak = candles[0].closePrice;
  let mdd = 0;

  for (const c of candles) {
    if (c.closePrice > peak) peak = c.closePrice;
    const drawdown = peak > 0 ? ((peak - c.closePrice) / peak) * 100 : 0;
    if (drawdown > mdd) mdd = drawdown;
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
  if (!tickers.length) return { volatility: 0, mdd: 0, concentration: 0 };

  // 가중 평균 변동성
  let volatility = 0;
  let mdd = 0;

  for (const ticker of tickers) {
    const candles = historicalData[ticker];
    const w = (weights[ticker] ?? 0) / 100;
    volatility += calcVolatility(candles) * w;
    mdd = Math.max(mdd, calcMDD(candles));
  }

  // 집중도: 상위 2개 종목 비중 합
  const sortedWeights = Object.values(weights).sort((a, b) => b - a);
  const concentration = sortedWeights.slice(0, 2).reduce((a, b) => a + b, 0);

  return {
    volatility: Math.round(volatility * 10) / 10,
    mdd: Math.round(mdd * 10) / 10,
    concentration: Math.round(concentration * 10) / 10,
  };
};
