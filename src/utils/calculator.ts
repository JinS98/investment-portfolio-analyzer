import type {
  ComputedData,
  ComputedStock,
  Holding,
  HoldingHistory,
  HoldingHistoryInput,
  MarketType,
  Portfolio,
  PortfolioSummary,
  PriceMap,
  RecalculatedPortfolio,
  StockItem,
} from '../types';

export interface BuyCalculation {
  holding: Holding;
  grossAmount: number;
  fee: number;
  tax: number;
}

export interface SellCalculation {
  holding: Holding | null;
  grossAmount: number;
  fee: number;
  tax: number;
  realizedPnL: number;
}

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const assertFiniteNumber = (value: number, label: string, allowZero = false): void => {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label}은(는) ${allowZero ? '0 이상' : '0보다 큰'} 유한한 숫자여야 합니다.`);
  }
};

/**
 * 매수 입력값을 계산에 사용할 수 있는 형태로 정규화하고 검증한다.
 * 수수료와 세금을 생략한 경우에만 0으로 처리한다.
 */
const validateTransactionInput = (
  input: HoldingHistoryInput,
  expectedType: HoldingHistoryInput['type'],
): Required<Pick<HoldingHistoryInput, 'fee' | 'tax'>> & HoldingHistoryInput => {
  if (input.type !== expectedType) {
    throw new Error(
      `${expectedType === 'BUY' ? '매수' : '매도'} 계산에는 ${expectedType} 이력만 사용할 수 있습니다.`,
    );
  }
  if (!input.portfolioId.trim()) throw new Error('portfolioId는 비어 있을 수 없습니다.');
  if (!input.ticker.trim()) throw new Error('티커는 비어 있을 수 없습니다.');
  if (input.portfolioType !== 'REAL' && input.portfolioType !== 'VIRTUAL') {
    throw new Error('portfolioType은 REAL 또는 VIRTUAL이어야 합니다.');
  }
  if (input.market !== 'KR' && input.market !== 'US') {
    throw new Error('market은 KR 또는 US여야 합니다.');
  }
  if (!isValidDate(input.date)) throw new Error('거래일은 실제 YYYY-MM-DD 날짜여야 합니다.');

  assertFiniteNumber(input.price, '거래 가격');
  assertFiniteNumber(input.quantity, '거래 수량');
  assertFiniteNumber(input.fee ?? 0, '수수료', true);
  assertFiniteNumber(input.tax ?? 0, '세금', true);

  const grossAmount = input.price * input.quantity;
  if (!Number.isFinite(grossAmount)) throw new Error('거래금액이 유한한 숫자 범위를 벗어났습니다.');

  return { ...input, fee: input.fee ?? 0, tax: input.tax ?? 0 };
};

/** 매수 입력값을 계산에 사용할 수 있는 형태로 정규화하고 검증한다. */
export const validateBuyInput = (
  input: HoldingHistoryInput,
): Required<Pick<HoldingHistoryInput, 'fee' | 'tax'>> & HoldingHistoryInput =>
  validateTransactionInput(input, 'BUY');

/** 매도 입력값을 계산에 사용할 수 있는 형태로 정규화하고 검증한다. */
export const validateSellInput = (
  input: HoldingHistoryInput,
): Required<Pick<HoldingHistoryInput, 'fee' | 'tax'>> & HoldingHistoryInput =>
  validateTransactionInput(input, 'SELL');

const validateExistingHolding = (holding: Holding, input: HoldingHistoryInput): void => {
  if (holding.portfolioId !== input.portfolioId) {
    throw new Error('다른 포트폴리오의 보유 종목에는 거래 기록을 추가할 수 없습니다.');
  }
  if (holding.ticker !== input.ticker || holding.market !== input.market) {
    throw new Error('기존 보유 종목과 매수 기록의 티커 또는 시장이 일치하지 않습니다.');
  }
  assertFiniteNumber(holding.quantity, '기존 보유 수량');
  assertFiniteNumber(holding.averagePrice, '기존 평단가');
  assertFiniteNumber(holding.investedAmount, '기존 보유 원금', true);
};

/**
 * 이동평균법으로 매수 후 보유 상태를 계산한다.
 * 원본 보유 객체를 변경하지 않으며, 매수 비용은 평단가와 원금에서 제외한다.
 */
export const calculateBuy = (
  currentHolding: Holding | undefined,
  input: HoldingHistoryInput,
): BuyCalculation => {
  const normalizedInput = validateBuyInput(input);
  const grossAmount = normalizedInput.price * normalizedInput.quantity;

  if (currentHolding) validateExistingHolding(currentHolding, normalizedInput);

  const previousQuantity = currentHolding?.quantity ?? 0;
  const previousInvestment = currentHolding?.investedAmount ?? 0;
  const quantity = previousQuantity + normalizedInput.quantity;
  const investedAmount = previousInvestment + grossAmount;
  if (!Number.isFinite(quantity) || !Number.isFinite(investedAmount)) {
    throw new Error('매수 후 보유 수량 또는 원금이 유한한 숫자 범위를 벗어났습니다.');
  }

  return {
    holding: {
      portfolioId: normalizedInput.portfolioId,
      ticker: normalizedInput.ticker,
      name: normalizedInput.name ?? currentHolding?.name,
      market: normalizedInput.market,
      quantity,
      averagePrice: investedAmount / quantity,
      investedAmount,
      lastTransactionAt: currentHolding?.lastTransactionAt,
    },
    grossAmount,
    fee: normalizedInput.fee,
    tax: normalizedInput.tax,
  };
};

/**
 * 이동평균법으로 매도 후 보유 상태와 실현손익을 계산한다.
 * 매도 수수료·세금은 실현손익에 한 번만 반영하며, 원본 보유 객체는 변경하지 않는다.
 */
export const calculateSell = (
  currentHolding: Holding | undefined,
  input: HoldingHistoryInput,
): SellCalculation => {
  const normalizedInput = validateSellInput(input);
  if (!currentHolding) throw new Error('보유하지 않은 종목은 매도할 수 없습니다.');
  validateExistingHolding(currentHolding, normalizedInput);

  const quantityTolerance =
    8 * Number.EPSILON * Math.max(1, currentHolding.quantity, normalizedInput.quantity);
  if (normalizedInput.quantity - currentHolding.quantity > quantityTolerance) {
    throw new Error('매도 수량이 현재 보유 수량을 초과합니다.');
  }

  const grossAmount = normalizedInput.price * normalizedInput.quantity;
  const realizedPnL =
    (normalizedInput.price - currentHolding.averagePrice) * normalizedInput.quantity -
    normalizedInput.fee -
    normalizedInput.tax;
  if (!Number.isFinite(grossAmount) || !Number.isFinite(realizedPnL)) {
    throw new Error('매도 계산 결과가 유한한 숫자 범위를 벗어났습니다.');
  }

  const remainingQuantity = currentHolding.quantity - normalizedInput.quantity;
  const isFullSale = Math.abs(remainingQuantity) <= quantityTolerance;
  if (isFullSale) {
    return {
      holding: null,
      grossAmount,
      fee: normalizedInput.fee,
      tax: normalizedInput.tax,
      realizedPnL,
    };
  }

  const investedAmount =
    currentHolding.investedAmount - currentHolding.averagePrice * normalizedInput.quantity;
  if (!Number.isFinite(investedAmount) || investedAmount < 0) {
    throw new Error('매도 후 보유 원금이 올바르지 않습니다.');
  }

  return {
    holding: {
      ...currentHolding,
      quantity: remainingQuantity,
      investedAmount,
    },
    grossAmount,
    fee: normalizedInput.fee,
    tax: normalizedInput.tax,
    realizedPnL,
  };
};

const historyToInput = (history: HoldingHistory): HoldingHistoryInput => ({
  portfolioId: history.portfolioId,
  portfolioType: history.portfolioType,
  ticker: history.ticker,
  name: history.name,
  market: history.market,
  type: history.type,
  price: history.price,
  quantity: history.quantity,
  fee: history.fee,
  tax: history.tax,
  date: history.date,
});

const holdingKey = (ticker: string, market: Holding['market']): string => `${market}:${ticker}`;

const compareHistories = (left: HoldingHistory, right: HoldingHistory): number => {
  const dateOrder = left.date.localeCompare(right.date);
  if (dateOrder !== 0) return dateOrder;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.id.localeCompare(right.id);
};

const createSummary = (
  portfolioId: string,
  histories: HoldingHistory[],
  holdings: Holding[],
): PortfolioSummary => {
  const byMarket: PortfolioSummary['byMarket'] = {};
  const markets = new Set([
    ...histories.map((history) => history.market),
    ...holdings.map((holding) => holding.market),
  ]);

  for (const market of markets) {
    const marketHistories = histories.filter((history) => history.market === market);
    const marketHoldings = holdings.filter((holding) => holding.market === market);
    const totalInvestment = marketHoldings.reduce(
      (sum, holding) => sum + holding.investedAmount,
      0,
    );
    const realizedPnL = marketHistories.reduce((sum, history) => sum + history.realizedPnL, 0);
    const totalFees = marketHistories.reduce((sum, history) => sum + history.fee, 0);
    const totalTaxes = marketHistories.reduce((sum, history) => sum + history.tax, 0);

    byMarket[market] = {
      market,
      totalInvestment,
      totalEvaluated: null,
      unrealizedPnL: null,
      realizedPnL,
      totalFees,
      totalTaxes,
      totalPnL: null,
      netPnL: null,
    };
  }

  return { portfolioId, byMarket };
};

/**
 * 포트폴리오 원장을 정렬해 현재 보유 상태와 손익 요약을 다시 계산한다.
 * 계산 필드(grossAmount, realizedPnL)는 기존 저장값을 신뢰하지 않고 항상 재생성한다.
 */
export const recalculatePortfolio = (
  portfolio: Portfolio,
  sourceHistories: HoldingHistory[],
): RecalculatedPortfolio => {
  const seenIds = new Set<string>();
  const histories = sourceHistories.map((history) => ({ ...history }));

  for (const history of histories) {
    if (!history.id.trim()) throw new Error('이력 ID는 비어 있을 수 없습니다.');
    if (seenIds.has(history.id)) throw new Error(`중복된 이력 ID가 있습니다: ${history.id}`);
    seenIds.add(history.id);
    if (history.portfolioId !== portfolio.id) {
      throw new Error(`이력 "${history.id}"의 portfolioId가 대상 포트폴리오와 다릅니다.`);
    }
    if (history.portfolioType !== portfolio.type) {
      throw new Error(`이력 "${history.id}"의 portfolioType이 대상 포트폴리오와 다릅니다.`);
    }
    if (!Number.isFinite(history.createdAt) || history.createdAt < 0) {
      throw new Error(`이력 "${history.id}"의 createdAt이 올바르지 않습니다.`);
    }
  }

  histories.sort(compareHistories);
  const holdingsByKey = new Map<string, Holding>();
  const recalculatedHistories: HoldingHistory[] = [];

  for (const history of histories) {
    try {
      const input = historyToInput(history);
      const key = holdingKey(history.ticker, history.market);
      const currentHolding = holdingsByKey.get(key);

      if (history.type === 'BUY') {
        const result = calculateBuy(currentHolding, input);
        holdingsByKey.set(key, { ...result.holding, lastTransactionAt: history.createdAt });
        recalculatedHistories.push({
          ...history,
          grossAmount: result.grossAmount,
          fee: result.fee,
          tax: result.tax,
          realizedPnL: 0,
        });
      } else {
        const result = calculateSell(currentHolding, input);
        if (result.holding) {
          holdingsByKey.set(key, { ...result.holding, lastTransactionAt: history.createdAt });
        } else {
          holdingsByKey.delete(key);
        }
        recalculatedHistories.push({
          ...history,
          grossAmount: result.grossAmount,
          fee: result.fee,
          tax: result.tax,
          realizedPnL: result.realizedPnL,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 계산 오류';
      throw new Error(`이력 "${history.id}" 처리 실패: ${message}`);
    }
  }

  const holdings = [...holdingsByKey.values()].sort((left, right) => {
    const marketOrder = left.market.localeCompare(right.market);
    return marketOrder !== 0 ? marketOrder : left.ticker.localeCompare(right.ticker);
  });
  return {
    holdings,
    histories: recalculatedHistories,
    summary: createSummary(portfolio.id, recalculatedHistories, holdings),
  };
};

export const calcPortfolio = (portfolio: StockItem[], prices: PriceMap): ComputedData => {
  let totalBuyValue = 0;
  let totalEvaluatedValue = 0;

  const stocks: Omit<ComputedStock, 'weight'>[] = portfolio.map((stock) => {
    const currentPrice = prices[stock.ticker] ?? stock.buyPrice;
    const evaluatedValue = currentPrice * stock.quantity;
    const buyValue = stock.buyPrice * stock.quantity;
    const profitAmount = evaluatedValue - buyValue;
    const profitRate = buyValue > 0 ? (profitAmount / buyValue) * 100 : 0;

    totalBuyValue += buyValue;
    totalEvaluatedValue += evaluatedValue;

    return { ...stock, currentPrice, evaluatedValue, profitAmount, profitRate, weight: 0 };
  });

  const totalProfitAmount = totalEvaluatedValue - totalBuyValue;
  const totalProfitRate = totalBuyValue > 0 ? (totalProfitAmount / totalBuyValue) * 100 : 0;

  const stocksWithWeight: ComputedStock[] = stocks.map((s) => ({
    ...s,
    weight: totalEvaluatedValue > 0 ? (s.evaluatedValue / totalEvaluatedValue) * 100 : 0,
  }));

  return {
    stocks: stocksWithWeight,
    totalBuyValue,
    totalEvaluatedValue,
    totalProfitAmount,
    totalProfitRate,
  };
};

export const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits;

/** 표시 또는 외부 저장 직전에 통화 단위로 반올림한다. 내부 거래 계산에는 사용하지 않는다. */
export const roundMoney = (value: number, market: MarketType): number => {
  if (!Number.isFinite(value)) throw new Error('금액은 유한한 숫자여야 합니다.');
  const factor = market === 'KR' ? 1 : 100;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const formatRate = (n: number): string => `${n >= 0 ? '+' : ''}${round(n)}%`;
