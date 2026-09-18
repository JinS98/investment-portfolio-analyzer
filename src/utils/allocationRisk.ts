import type { ExchangeRate, Holding, PriceMap, RecurringInvestmentRule } from '../types';

export interface ProjectedPosition {
  key: string;
  ticker: string;
  name: string;
  market: 'KR' | 'US';
  currentValue: number;
  scheduledValue: number;
  currentWeight: number;
  projectedWeight: number;
}

export interface AllocationWarning {
  type: 'STOCK' | 'COUNTRY' | 'CURRENCY';
  label: string;
  weight: number;
  message: string;
}

export interface ProjectedAllocation {
  positions: ProjectedPosition[];
  currentTotal: number;
  projectedTotal: number;
  countryWeights: Record<'KR' | 'US', number>;
  currencyWeights: Record<'KRW' | 'USD', number>;
  warnings: AllocationWarning[];
  unavailableTickers: string[];
}

const keyOf = (market: 'KR' | 'US', ticker: string) => `${market}:${ticker}`;

export function calculateProjectedAllocation(
  holdings: Holding[],
  rules: RecurringInvestmentRule[],
  prices: PriceMap,
  exchangeRate: ExchangeRate | null,
  quantityOverrides: Record<string, number> = {},
  hypotheticalPurchase?: { ticker: string; name?: string; market: 'KR' | 'US'; quantity: number },
): ProjectedAllocation {
  const unavailable = new Set<string>();
  const positions = new Map<string, Omit<ProjectedPosition, 'currentWeight' | 'projectedWeight'>>();
  const multiplier = (market: 'KR' | 'US') => market === 'US' ? (exchangeRate?.rate ?? 0) : 1;

  holdings.forEach((holding) => {
    const price = prices[holding.ticker];
    const fx = multiplier(holding.market);
    if (!price || !fx) {
      unavailable.add(holding.name ?? holding.ticker);
      return;
    }
    const key = keyOf(holding.market, holding.ticker);
    positions.set(key, {
      key,
      ticker: holding.ticker,
      name: holding.name ?? holding.ticker,
      market: holding.market,
      currentValue: price * holding.quantity * fx,
      scheduledValue: 0,
    });
  });

  rules.filter((rule) => rule.status === 'ACTIVE').forEach((rule) => {
    const price = prices[rule.ticker];
    const fx = multiplier(rule.market);
    if (!price || !fx) {
      unavailable.add(rule.name ?? rule.ticker);
      return;
    }
    const key = keyOf(rule.market, rule.ticker);
    const current = positions.get(key) ?? {
      key,
      ticker: rule.ticker,
      name: rule.name ?? rule.ticker,
      market: rule.market,
      currentValue: 0,
      scheduledValue: 0,
    };
    const quantity = quantityOverrides[rule.id] ?? rule.quantity;
    current.scheduledValue += price * Math.max(0, quantity) * fx;
    positions.set(key, current);
  });

  if (hypotheticalPurchase && hypotheticalPurchase.quantity > 0) {
    const price = prices[hypotheticalPurchase.ticker];
    const fx = multiplier(hypotheticalPurchase.market);
    if (!price || !fx) {
      unavailable.add(hypotheticalPurchase.name ?? hypotheticalPurchase.ticker);
    } else {
      const key = keyOf(hypotheticalPurchase.market, hypotheticalPurchase.ticker);
      const current = positions.get(key) ?? {
        key,
        ticker: hypotheticalPurchase.ticker,
        name: hypotheticalPurchase.name ?? hypotheticalPurchase.ticker,
        market: hypotheticalPurchase.market,
        currentValue: 0,
        scheduledValue: 0,
      };
      current.scheduledValue += price * hypotheticalPurchase.quantity * fx;
      positions.set(key, current);
    }
  }

  const currentTotal = [...positions.values()].reduce((sum, position) => sum + position.currentValue, 0);
  const projectedTotal = [...positions.values()].reduce((sum, position) => sum + position.currentValue + position.scheduledValue, 0);
  const resultPositions = [...positions.values()].map((position) => ({
    ...position,
    currentWeight: currentTotal > 0 ? (position.currentValue / currentTotal) * 100 : 0,
    projectedWeight: projectedTotal > 0 ? ((position.currentValue + position.scheduledValue) / projectedTotal) * 100 : 0,
  })).sort((left, right) => right.projectedWeight - left.projectedWeight);

  const countryWeights = { KR: 0, US: 0 };
  resultPositions.forEach((position) => { countryWeights[position.market] += position.projectedWeight; });
  const currencyWeights = { KRW: countryWeights.KR, USD: countryWeights.US };
  const warnings: AllocationWarning[] = [];
  resultPositions.filter((position) => position.projectedWeight >= 40).forEach((position) => warnings.push({
    type: 'STOCK', label: position.name, weight: position.projectedWeight,
    message: `${position.name} 예상 비중이 40%를 넘습니다. 다음 매수 전 분산 여부를 확인하세요.`,
  }));
  (Object.entries(countryWeights) as Array<['KR' | 'US', number]>).filter(([, weight]) => weight >= 80).forEach(([country, weight]) => warnings.push({
    type: 'COUNTRY', label: country === 'KR' ? '한국' : '미국', weight,
    message: `${country === 'KR' ? '한국' : '미국'} 자산 예상 비중이 80%를 넘습니다.`,
  }));
  (Object.entries(currencyWeights) as Array<['KRW' | 'USD', number]>).filter(([, weight]) => weight >= 80).forEach(([currency, weight]) => warnings.push({
    type: 'CURRENCY', label: currency, weight,
    message: `${currency} 노출 예상 비중이 80%를 넘습니다. 환율 변동 영향을 확인하세요.`,
  }));

  return { positions: resultPositions, currentTotal, projectedTotal, countryWeights, currencyWeights, warnings, unavailableTickers: [...unavailable] };
}
