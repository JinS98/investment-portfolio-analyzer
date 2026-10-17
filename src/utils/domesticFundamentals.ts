import type { DomesticMetricInputs, StockFundamentals } from '../services/marketInsightsApi.ts';

export function calculateDomesticFundamentals(
  inputs: DomesticMetricInputs,
  price: number | null,
): StockFundamentals {
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0;
  const positive = (value: number | null): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  const finiteRatio = (value: number | null) =>
    value !== null && Number.isFinite(value) ? value : null;
  return {
    per: finiteRatio(validPrice && positive(inputs.eps) ? price / inputs.eps : null),
    pbr: finiteRatio(validPrice && positive(inputs.bps) ? price / inputs.bps : null),
    roe: finiteRatio(inputs.roe),
    dividendYield: finiteRatio(
      validPrice &&
        inputs.dividendPerShare !== null &&
        Number.isFinite(inputs.dividendPerShare) &&
        inputs.dividendPerShare >= 0
        ? (inputs.dividendPerShare / price) * 100
        : null,
    ),
    marketCap: null,
  };
}
