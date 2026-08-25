import type { PriceMap, MonthlyChangeMap } from '../types';

/**
 * 전달 종가 대비 등락률 계산
 * 토스 캔들 API로 가져온 전달 종가 스냅샷 기준
 *
 * @returns { AAPL: -2.1, TSM: -8.2, '005930': +3.5 }
 */
export const calcMonthlyChange = (
  lastMonthPrices: PriceMap,
  currentPrices: PriceMap,
): MonthlyChangeMap => {
  const changes: MonthlyChangeMap = {};

  Object.keys(lastMonthPrices).forEach((ticker) => {
    const prev = lastMonthPrices[ticker];
    const curr = currentPrices[ticker];
    if (prev && curr) {
      changes[ticker] = Math.round(((curr - prev) / prev) * 100 * 10) / 10;
    }
  });

  return changes;
};
