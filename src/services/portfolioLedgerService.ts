import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import type {
  Holding,
  HoldingHistory,
  HoldingHistoryInput,
  HoldingHistorySource,
  Portfolio,
  PortfolioLedger,
  PortfolioSummary,
} from '../types';
import { recalculatePortfolio } from '../utils/calculator';
import { createLegacyImportHistory } from '../utils/legacyPortfolioMigration';
import { db } from './firebase';
import { loadPortfolioStocks } from './portfolioService';
import { fetchHistoricalUsdKrwExchangeRate } from './tossApi';

const REAL_PORTFOLIO_ID = 'real';
const VIRTUAL_PORTFOLIO_ID = 'virtual';
const LEGACY_MIGRATION_ID = 'legacy-stock-v1';

const getDatabase = (): Firestore => {
  if (!db) throw new Error('Firebase 설정을 확인해주세요.');
  return db;
};

const portfolioReference = (userId: string, portfolioId: string) =>
  doc(getDatabase(), 'users', userId, 'portfolios', portfolioId);

const holdingDocumentId = (holding: Pick<Holding, 'market' | 'ticker'>): string =>
  `${holding.market}_${holding.ticker}`;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object')
    throw new Error(`${label} 데이터 형식이 올바르지 않습니다.`);
  return value as Record<string, unknown>;
};

const readString = (data: Record<string, unknown>, key: string, label: string): string => {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label}.${key} 값이 올바르지 않습니다.`);
  return value;
};

const readNumber = (data: Record<string, unknown>, key: string, label: string): number => {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} 값이 올바르지 않습니다.`);
  }
  return value;
};

const readMarket = (data: Record<string, unknown>, label: string): 'KR' | 'US' => {
  const market = readString(data, 'market', label);
  if (market !== 'KR' && market !== 'US')
    throw new Error(`${label}.market 값이 올바르지 않습니다.`);
  return market;
};

const readPortfolio = (value: unknown, id: string, userId: string): Portfolio => {
  const data = asRecord(value, '포트폴리오');
  const type = readString(data, 'type', '포트폴리오');
  if (type !== 'REAL' && type !== 'VIRTUAL')
    throw new Error('포트폴리오.type 값이 올바르지 않습니다.');
  if (readString(data, 'userId', '포트폴리오') !== userId) {
    throw new Error('다른 사용자의 포트폴리오를 읽을 수 없습니다.');
  }
  return {
    id,
    userId,
    name: readString(data, 'name', '포트폴리오'),
    type,
    createdAt: readNumber(data, 'createdAt', '포트폴리오'),
    updatedAt: readNumber(data, 'updatedAt', '포트폴리오'),
  };
};

const readHolding = (value: unknown, portfolioId: string): Holding => {
  const data = asRecord(value, '보유 종목');
  if (readString(data, 'portfolioId', '보유 종목') !== portfolioId) {
    throw new Error('보유 종목의 portfolioId가 일치하지 않습니다.');
  }
  const lastTransactionAt = data.lastTransactionAt;
  if (
    lastTransactionAt !== undefined &&
    (typeof lastTransactionAt !== 'number' || !Number.isFinite(lastTransactionAt))
  ) {
    throw new Error('보유 종목.lastTransactionAt 값이 올바르지 않습니다.');
  }
  return {
    portfolioId,
    ticker: readString(data, 'ticker', '보유 종목'),
    name: typeof data.name === 'string' ? data.name : undefined,
    market: readMarket(data, '보유 종목'),
    quantity: readNumber(data, 'quantity', '보유 종목'),
    averagePrice: readNumber(data, 'averagePrice', '보유 종목'),
    investedAmount: readNumber(data, 'investedAmount', '보유 종목'),
    lastTransactionAt: lastTransactionAt as number | undefined,
  };
};

const readHistory = (value: unknown, id: string): HoldingHistory => {
  const data = asRecord(value, '거래 이력');
  const portfolioType = readString(data, 'portfolioType', '거래 이력');
  const type = readString(data, 'type', '거래 이력');
  if (portfolioType !== 'REAL' && portfolioType !== 'VIRTUAL') {
    throw new Error('거래 이력.portfolioType 값이 올바르지 않습니다.');
  }
  if (type !== 'BUY' && type !== 'SELL') throw new Error('거래 이력.type 값이 올바르지 않습니다.');
  const source = data.source;
  if (source !== undefined && source !== 'MANUAL' && source !== 'LEGACY_IMPORT') {
    throw new Error('거래 이력.source 값이 올바르지 않습니다.');
  }
  const exchangeRate = data.exchangeRate;
  const exchangeRateDate = data.exchangeRateDate;
  const exchangeRateSource = data.exchangeRateSource;
  if (
    exchangeRate !== undefined &&
    (typeof exchangeRate !== 'number' || !Number.isFinite(exchangeRate) || exchangeRate <= 0)
  ) {
    throw new Error('거래 이력.exchangeRate 값이 올바르지 않습니다.');
  }
  if (exchangeRateDate !== undefined && typeof exchangeRateDate !== 'string') {
    throw new Error('거래 이력.exchangeRateDate 값이 올바르지 않습니다.');
  }
  if (exchangeRateSource !== undefined && typeof exchangeRateSource !== 'string') {
    throw new Error('거래 이력.exchangeRateSource 값이 올바르지 않습니다.');
  }
  return {
    id,
    portfolioId: readString(data, 'portfolioId', '거래 이력'),
    portfolioType,
    ticker: readString(data, 'ticker', '거래 이력'),
    name: typeof data.name === 'string' ? data.name : undefined,
    market: readMarket(data, '거래 이력'),
    type,
    price: readNumber(data, 'price', '거래 이력'),
    quantity: readNumber(data, 'quantity', '거래 이력'),
    grossAmount: readNumber(data, 'grossAmount', '거래 이력'),
    fee: readNumber(data, 'fee', '거래 이력'),
    tax: readNumber(data, 'tax', '거래 이력'),
    realizedPnL: readNumber(data, 'realizedPnL', '거래 이력'),
    date: readString(data, 'date', '거래 이력'),
    exchangeRate: exchangeRate as number | undefined,
    exchangeRateDate: exchangeRateDate as string | undefined,
    exchangeRateSource: exchangeRateSource as string | undefined,
    createdAt: readNumber(data, 'createdAt', '거래 이력'),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    source: source as HoldingHistorySource | undefined,
    legacyStockId: typeof data.legacyStockId === 'string' ? data.legacyStockId : undefined,
    importedAt: typeof data.importedAt === 'number' ? data.importedAt : undefined,
    legacyAddedAt: typeof data.legacyAddedAt === 'string' ? data.legacyAddedAt : undefined,
  };
};

const historyData = (history: HoldingHistory): DocumentData => ({
  portfolioId: history.portfolioId,
  portfolioType: history.portfolioType,
  ticker: history.ticker,
  ...(history.name ? { name: history.name } : {}),
  market: history.market,
  type: history.type,
  price: history.price,
  quantity: history.quantity,
  grossAmount: history.grossAmount,
  fee: history.fee,
  tax: history.tax,
  realizedPnL: history.realizedPnL,
  date: history.date,
  ...(history.exchangeRate ? { exchangeRate: history.exchangeRate } : {}),
  ...(history.exchangeRateDate ? { exchangeRateDate: history.exchangeRateDate } : {}),
  ...(history.exchangeRateSource ? { exchangeRateSource: history.exchangeRateSource } : {}),
  createdAt: history.createdAt,
  ...(history.updatedAt ? { updatedAt: history.updatedAt } : {}),
  ...(history.source ? { source: history.source } : {}),
  ...(history.legacyStockId ? { legacyStockId: history.legacyStockId } : {}),
  ...(history.importedAt ? { importedAt: history.importedAt } : {}),
  ...(history.legacyAddedAt ? { legacyAddedAt: history.legacyAddedAt } : {}),
});

const holdingData = (holding: Holding): DocumentData => ({
  portfolioId: holding.portfolioId,
  ticker: holding.ticker,
  ...(holding.name ? { name: holding.name } : {}),
  market: holding.market,
  quantity: holding.quantity,
  averagePrice: holding.averagePrice,
  investedAmount: holding.investedAmount,
  ...(holding.lastTransactionAt ? { lastTransactionAt: holding.lastTransactionAt } : {}),
});

const summaryData = (summary: PortfolioSummary, updatedAt: number): DocumentData => ({
  portfolioId: summary.portfolioId,
  byMarket: summary.byMarket,
  updatedAt,
});

const defaultPortfolio = (userId: string, type: Portfolio['type'], now: number): Portfolio => ({
  id: type === 'REAL' ? REAL_PORTFOLIO_ID : VIRTUAL_PORTFOLIO_ID,
  userId,
  name: type === 'REAL' ? '내 포트폴리오' : '가상 포트폴리오',
  type,
  createdAt: now,
  updatedAt: now,
});

export async function ensureDefaultPortfolios(userId: string): Promise<Portfolio[]> {
  const now = Date.now();
  const defaults = [
    defaultPortfolio(userId, 'REAL', now),
    defaultPortfolio(userId, 'VIRTUAL', now),
  ];
  const snapshots = await Promise.all(
    defaults.map((portfolio) => getDoc(portfolioReference(userId, portfolio.id))),
  );
  const missing = defaults.filter((_, index) => !snapshots[index].exists());
  if (missing.length) {
    const batch = writeBatch(getDatabase());
    missing.forEach((portfolio) => batch.set(portfolioReference(userId, portfolio.id), portfolio));
    await batch.commit();
  }
  return snapshots.map((snapshot, index) =>
    snapshot.exists() ? readPortfolio(snapshot.data(), snapshot.id, userId) : defaults[index],
  );
}

export async function loadPortfolios(userId: string): Promise<Portfolio[]> {
  const snapshot = await getDocs(collection(getDatabase(), 'users', userId, 'portfolios'));
  return snapshot.docs
    .map((item) => readPortfolio(item.data(), item.id, userId))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export async function loadPortfolioLedger(
  userId: string,
  portfolio: Portfolio,
): Promise<PortfolioLedger> {
  const reference = portfolioReference(userId, portfolio.id);
  const [holdingSnapshot, historySnapshot] = await Promise.all([
    getDocs(collection(reference, 'holdings')),
    getDocs(collection(reference, 'holdingHistories')),
  ]);
  holdingSnapshot.docs.forEach((item) => readHolding(item.data(), portfolio.id));
  const histories = historySnapshot.docs.map((item) => readHistory(item.data(), item.id));
  const recalculated = recalculatePortfolio(portfolio, histories);
  return {
    portfolio,
    holdings: recalculated.holdings,
    histories: recalculated.histories,
    summary: recalculated.summary,
  };
}

const persistLedger = async (
  userId: string,
  portfolio: Portfolio,
  previous: PortfolioLedger,
  nextHistories: HoldingHistory[],
  migrationData?: DocumentData,
): Promise<PortfolioLedger> => {
  const recalculated = recalculatePortfolio(portfolio, nextHistories);
  const updatedAt = Date.now();
  const updatedPortfolio = { ...portfolio, updatedAt };
  const reference = portfolioReference(userId, portfolio.id);
  const storedHoldings = await getDocs(collection(reference, 'holdings'));
  const batch = writeBatch(getDatabase());
  batch.set(reference, updatedPortfolio);

  const nextHoldingsById = new Map(
    recalculated.holdings.map((holding) => [holdingDocumentId(holding), holding]),
  );
  const previousHoldingIds = new Set(storedHoldings.docs.map((item) => item.id));
  nextHoldingsById.forEach((holding, id) => {
    batch.set(doc(reference, 'holdings', id), holdingData(holding));
    previousHoldingIds.delete(id);
  });
  previousHoldingIds.forEach((id) => batch.delete(doc(reference, 'holdings', id)));

  const nextHistoryIds = new Set(recalculated.histories.map((history) => history.id));
  recalculated.histories.forEach((history) =>
    batch.set(doc(reference, 'holdingHistories', history.id), historyData(history)),
  );
  previous.histories
    .filter((history) => !nextHistoryIds.has(history.id))
    .forEach((history) => batch.delete(doc(reference, 'holdingHistories', history.id)));

  batch.set(doc(reference, 'summary', 'current'), summaryData(recalculated.summary, updatedAt));
  if (migrationData) batch.set(doc(reference, 'migrations', LEGACY_MIGRATION_ID), migrationData);
  await batch.commit();

  return {
    portfolio: updatedPortfolio,
    holdings: recalculated.holdings,
    histories: recalculated.histories,
    summary: recalculated.summary,
  };
};

export async function migrateLegacyStocks(
  userId: string,
  realPortfolio: Portfolio,
): Promise<boolean> {
  const reference = portfolioReference(userId, realPortfolio.id);
  const migrationReference = doc(reference, 'migrations', LEGACY_MIGRATION_ID);
  if ((await getDoc(migrationReference)).exists()) return false;

  const [legacyStocks, previous] = await Promise.all([
    loadPortfolioStocks(userId),
    loadPortfolioLedger(userId, realPortfolio),
  ]);
  const importedAt = Date.now();
  const existingIds = new Set(previous.histories.map((history) => history.id));
  const importedHistories = legacyStocks
    .filter((stock) => !existingIds.has(`legacy-${stock.id}`))
    .map((stock) => createLegacyImportHistory(stock, realPortfolio.id, importedAt));

  await persistLedger(
    userId,
    realPortfolio,
    previous,
    [...previous.histories, ...importedHistories],
    {
      completedAt: importedAt,
      importedStockCount: importedHistories.length,
    },
  );
  return importedHistories.length > 0;
}

export async function loadPortfolioWorkspace(userId: string): Promise<PortfolioLedger[]> {
  await ensureDefaultPortfolios(userId);
  const firstPortfolios = await loadPortfolios(userId);
  const realPortfolio = firstPortfolios.find((portfolio) => portfolio.type === 'REAL');
  if (!realPortfolio) throw new Error('기본 REAL 포트폴리오를 만들지 못했습니다.');
  await migrateLegacyStocks(userId, realPortfolio);
  const portfolios = await loadPortfolios(userId);
  const ledgers = await Promise.all(
    portfolios.map((portfolio) => loadPortfolioLedger(userId, portfolio)),
  );
  return Promise.all(
    ledgers.map(async (ledger) => {
      try {
        return await backfillPortfolioHistoricalExchangeRates(userId, ledger);
      } catch (error) {
        console.warn('[portfolioLedger] historical exchange-rate backfill skipped:', error);
        return ledger;
      }
    }),
  );
}

const createHistory = async (
  id: string,
  input: HoldingHistoryInput,
  now: number,
): Promise<HoldingHistory> => {
  const historicalRate =
    input.market === 'US' ? await fetchHistoricalUsdKrwExchangeRate(input.date) : undefined;
  return {
    id,
    ...input,
    grossAmount: input.price * input.quantity,
    fee: input.fee ?? 0,
    tax: input.tax ?? 0,
    realizedPnL: 0,
    ...(historicalRate
      ? {
          exchangeRate: historicalRate.rate,
          exchangeRateDate: historicalRate.resolvedDate,
          exchangeRateSource: historicalRate.source,
        }
      : {}),
    createdAt: now,
    source: 'MANUAL',
  };
};

const findPortfolio = async (userId: string, portfolioId: string): Promise<Portfolio> => {
  const snapshot = await getDoc(portfolioReference(userId, portfolioId));
  if (!snapshot.exists()) throw new Error('포트폴리오를 찾을 수 없습니다.');
  return readPortfolio(snapshot.data(), snapshot.id, userId);
};

export async function addPortfolioHoldingHistory(
  userId: string,
  input: HoldingHistoryInput,
): Promise<PortfolioLedger> {
  const portfolio = await findPortfolio(userId, input.portfolioId);
  if (portfolio.type !== input.portfolioType)
    throw new Error('거래 이력의 포트폴리오 타입이 일치하지 않습니다.');
  const previous = await loadPortfolioLedger(userId, portfolio);
  const id = crypto.randomUUID();
  const history = await createHistory(id, input, Date.now());
  return persistLedger(userId, portfolio, previous, [...previous.histories, history]);
}

/** Adds transaction-date USD/KRW rates to older US ledger rows in one batch. */
export async function backfillPortfolioHistoricalExchangeRates(
  userId: string,
  ledger: PortfolioLedger,
): Promise<PortfolioLedger> {
  const missingRates = ledger.histories.filter(
    (history) => history.market === 'US' && !history.exchangeRate,
  );
  if (!missingRates.length) return ledger;

  const ratesByHistoryId = new Map<
    string,
    Awaited<ReturnType<typeof fetchHistoricalUsdKrwExchangeRate>>
  >();
  for (const history of missingRates) {
    ratesByHistoryId.set(history.id, await fetchHistoricalUsdKrwExchangeRate(history.date));
  }
  const histories = ledger.histories.map((history) => {
    const rate = ratesByHistoryId.get(history.id);
    return rate
      ? {
          ...history,
          exchangeRate: rate.rate,
          exchangeRateDate: rate.resolvedDate,
          exchangeRateSource: rate.source,
          updatedAt: Date.now(),
        }
      : history;
  });
  return persistLedger(userId, ledger.portfolio, ledger, histories);
}

export async function deletePortfolioHoldingHistory(
  userId: string,
  portfolioId: string,
  historyId: string,
): Promise<PortfolioLedger> {
  const portfolio = await findPortfolio(userId, portfolioId);
  const previous = await loadPortfolioLedger(userId, portfolio);
  const histories = previous.histories.filter((history) => history.id !== historyId);
  if (histories.length === previous.histories.length)
    throw new Error('삭제할 거래 이력을 찾을 수 없습니다.');
  return persistLedger(userId, portfolio, previous, histories);
}
