import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
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
  RecurringInvestmentRule,
  RecurringInvestmentRuleInput,
  RecurringInvestmentStatus,
} from '../types';
import { recalculatePortfolio } from '../utils/calculator';
import { createLegacyImportHistory } from '../utils/legacyPortfolioMigration';
import { getPendingRecurringInvestmentDatesUntil, koreaToday } from '../utils/recurringInvestment';
import { db } from './firebase';
import { loadPortfolioStocks } from './portfolioService';
import { fetchClosePriceOnOrAfter, fetchHistoricalUsdKrwExchangeRate } from './tossApi';

const REAL_PORTFOLIO_ID = 'real';
const VIRTUAL_PORTFOLIO_ID = 'virtual';
const LEGACY_MIGRATION_ID = 'legacy-stock-v1';
const DEFAULT_FEE_RATE = 0.00015;
const DEFAULT_KR_SELL_TAX_RATE = 0.002;

const defaultTransactionCosts = (
  grossAmount: number,
  market: HoldingHistoryInput['market'],
  type: HoldingHistoryInput['type'],
) => ({
  fee: grossAmount * DEFAULT_FEE_RATE,
  tax: type === 'SELL' && market === 'KR' ? grossAmount * DEFAULT_KR_SELL_TAX_RATE : 0,
});

const getDatabase = (): Firestore => {
  if (!db) throw new Error('Firebase 설정을 확인해주세요.');
  return db;
};

const portfolioReference = (userId: string, portfolioId: string) =>
  doc(getDatabase(), 'users', userId, 'portfolios', portfolioId);

const recurringInvestmentRulesReference = (userId: string, portfolioId: string) =>
  collection(portfolioReference(userId, portfolioId), 'recurringInvestmentRules');

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

const isCalendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const readRecurringInvestmentRule = (
  value: unknown,
  id: string,
  portfolioId: string,
): RecurringInvestmentRule => {
  const data = asRecord(value, 'Recurring investment rule');
  const portfolioType = readString(data, 'portfolioType', 'Recurring investment rule');
  const frequency = readString(data, 'frequency', 'Recurring investment rule');
  const status = readString(data, 'status', 'Recurring investment rule');
  const startDate = readString(data, 'startDate', 'Recurring investment rule');
  if (readString(data, 'portfolioId', 'Recurring investment rule') !== portfolioId) {
    throw new Error('Recurring investment rule portfolio does not match.');
  }
  if (portfolioType !== 'REAL' && portfolioType !== 'VIRTUAL') {
    throw new Error('Recurring investment rule portfolio type is invalid.');
  }
  if (frequency !== 'WEEKLY' && frequency !== 'MONTHLY') {
    throw new Error('Recurring investment rule frequency is invalid.');
  }
  if (status !== 'ACTIVE' && status !== 'PAUSED') {
    throw new Error('Recurring investment rule status is invalid.');
  }
  if (!isCalendarDate(startDate)) throw new Error('Recurring investment rule start date is invalid.');
  const quantity = readNumber(data, 'quantity', 'Recurring investment rule');
  if (quantity <= 0) throw new Error('Recurring investment rule quantity must be positive.');
  const weeklyDay = data.weeklyDay;
  const monthlyDay = data.monthlyDay;
  if (frequency === 'WEEKLY') {
    if (!Number.isInteger(weeklyDay) || (weeklyDay as number) < 1 || (weeklyDay as number) > 5) {
      throw new Error('Recurring investment rule weekly day is invalid.');
    }
  } else if (!Number.isInteger(monthlyDay) || (monthlyDay as number) < 1 || (monthlyDay as number) > 31) {
    throw new Error('Recurring investment rule monthly day is invalid.');
  }
  return {
    id,
    portfolioId,
    portfolioType,
    ticker: readString(data, 'ticker', 'Recurring investment rule'),
    name: typeof data.name === 'string' ? data.name : undefined,
    market: readMarket(data, 'Recurring investment rule'),
    quantity,
    frequency,
    ...(frequency === 'WEEKLY' ? { weeklyDay: weeklyDay as number } : { monthlyDay: monthlyDay as number }),
    startDate,
    ...(typeof data.lastExecutedDate === 'string' ? { lastExecutedDate: data.lastExecutedDate } : {}),
    status,
    createdAt: readNumber(data, 'createdAt', 'Recurring investment rule'),
    updatedAt: readNumber(data, 'updatedAt', 'Recurring investment rule'),
  };
};

const recurringInvestmentRuleData = (rule: RecurringInvestmentRule): DocumentData => ({
  portfolioId: rule.portfolioId,
  portfolioType: rule.portfolioType,
  ticker: rule.ticker,
  ...(rule.name ? { name: rule.name } : {}),
  market: rule.market,
  quantity: rule.quantity,
  frequency: rule.frequency,
  ...(rule.frequency === 'WEEKLY' ? { weeklyDay: rule.weeklyDay } : { monthlyDay: rule.monthlyDay }),
  startDate: rule.startDate,
  ...(rule.lastExecutedDate ? { lastExecutedDate: rule.lastExecutedDate } : {}),
  status: rule.status,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
});

const createRecurringInvestmentRule = (
  id: string,
  input: RecurringInvestmentRuleInput,
  now: number,
): RecurringInvestmentRule => {
  const rule = {
    id,
    portfolioId: input.portfolioId,
    portfolioType: input.portfolioType,
    ticker: input.ticker.trim().toUpperCase(),
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    market: input.market,
    quantity: input.quantity,
    frequency: input.frequency,
    ...(input.frequency === 'WEEKLY' ? { weeklyDay: input.weeklyDay } : { monthlyDay: input.monthlyDay }),
    startDate: input.startDate,
    status: input.status ?? 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  } satisfies RecurringInvestmentRule;
  return readRecurringInvestmentRule(recurringInvestmentRuleData(rule), id, input.portfolioId);
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
  if (source !== undefined && source !== 'MANUAL' && source !== 'LEGACY_IMPORT' && source !== 'RECURRING') {
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
    recurringRuleId: typeof data.recurringRuleId === 'string' ? data.recurringRuleId : undefined,
    recurringRuleName: typeof data.recurringRuleName === 'string' ? data.recurringRuleName : undefined,
    scheduledDate: typeof data.scheduledDate === 'string' ? data.scheduledDate : undefined,
    recurringExecutionStatus:
      data.recurringExecutionStatus === 'PENDING' || data.recurringExecutionStatus === 'CONFIRMED'
        ? data.recurringExecutionStatus
        : undefined,
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
    ...(history.recurringRuleId ? { recurringRuleId: history.recurringRuleId } : {}),
    ...(history.recurringRuleName ? { recurringRuleName: history.recurringRuleName } : {}),
    ...(history.scheduledDate ? { scheduledDate: history.scheduledDate } : {}),
    ...(history.recurringExecutionStatus ? { recurringExecutionStatus: history.recurringExecutionStatus } : {}),
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
    source: input.source ?? 'MANUAL',
    ...(input.recurringRuleId ? { recurringRuleId: input.recurringRuleId } : {}),
    ...(input.recurringRuleName ? { recurringRuleName: input.recurringRuleName } : {}),
    ...(input.scheduledDate ? { scheduledDate: input.scheduledDate } : {}),
    ...(input.recurringExecutionStatus ? { recurringExecutionStatus: input.recurringExecutionStatus } : {}),
  };
};

const findPortfolio = async (userId: string, portfolioId: string): Promise<Portfolio> => {
  const snapshot = await getDoc(portfolioReference(userId, portfolioId));
  if (!snapshot.exists()) throw new Error('포트폴리오를 찾을 수 없습니다.');
  return readPortfolio(snapshot.data(), snapshot.id, userId);
};

export async function loadRecurringInvestmentRules(
  userId: string,
  portfolioId: string,
): Promise<RecurringInvestmentRule[]> {
  await findPortfolio(userId, portfolioId);
  const snapshot = await getDocs(recurringInvestmentRulesReference(userId, portfolioId));
  return snapshot.docs
    .map((item) => readRecurringInvestmentRule(item.data(), item.id, portfolioId))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export async function addRecurringInvestmentRule(
  userId: string,
  input: RecurringInvestmentRuleInput,
): Promise<RecurringInvestmentRule> {
  const portfolio = await findPortfolio(userId, input.portfolioId);
  if (portfolio.type !== input.portfolioType) {
    throw new Error('Recurring investment rule portfolio type does not match.');
  }
  const reference = doc(recurringInvestmentRulesReference(userId, portfolio.id));
  const rule = createRecurringInvestmentRule(reference.id, input, Date.now());
  await setDoc(reference, recurringInvestmentRuleData(rule));
  return rule;
}

export async function updateRecurringInvestmentRule(
  userId: string,
  ruleId: string,
  input: RecurringInvestmentRuleInput,
): Promise<RecurringInvestmentRule> {
  const portfolio = await findPortfolio(userId, input.portfolioId);
  if (portfolio.type !== input.portfolioType) {
    throw new Error('Recurring investment rule portfolio type does not match.');
  }
  const reference = doc(recurringInvestmentRulesReference(userId, portfolio.id), ruleId);
  const previous = await getDoc(reference);
  if (!previous.exists()) throw new Error('Recurring investment rule was not found.');
  const existing = readRecurringInvestmentRule(previous.data(), previous.id, portfolio.id);
  const next = createRecurringInvestmentRule(ruleId, input, existing.createdAt);
  const rule = { ...next, updatedAt: Date.now() };
  await setDoc(reference, recurringInvestmentRuleData(rule));
  return rule;
}

export async function setRecurringInvestmentRuleStatus(
  userId: string,
  portfolioId: string,
  ruleId: string,
  status: RecurringInvestmentStatus,
): Promise<RecurringInvestmentRule> {
  await findPortfolio(userId, portfolioId);
  const reference = doc(recurringInvestmentRulesReference(userId, portfolioId), ruleId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('Recurring investment rule was not found.');
  const existing = readRecurringInvestmentRule(snapshot.data(), snapshot.id, portfolioId);
  const rule = { ...existing, status, updatedAt: Date.now() };
  await setDoc(reference, recurringInvestmentRuleData(rule));
  return rule;
}

export async function deleteRecurringInvestmentRule(
  userId: string,
  portfolioId: string,
  ruleId: string,
): Promise<void> {
  await findPortfolio(userId, portfolioId);
  const reference = doc(recurringInvestmentRulesReference(userId, portfolioId), ruleId);
  if (!(await getDoc(reference)).exists()) throw new Error('Recurring investment rule was not found.');
  await deleteDoc(reference);
}

/** 도래한 적립식 규칙을 시작일부터 오늘까지 거래일 종가로 소급 반영한다. */
export async function executeDueRecurringInvestmentRule(
  userId: string,
  ruleId: string,
  portfolioId: string,
): Promise<{ executedCount: number; dates: string[]; ledger?: PortfolioLedger; rule?: RecurringInvestmentRule }> {
  const portfolio = await findPortfolio(userId, portfolioId);
  const ruleReference = doc(recurringInvestmentRulesReference(userId, portfolioId), ruleId);
  const ruleSnapshot = await getDoc(ruleReference);
  if (!ruleSnapshot.exists()) throw new Error('Recurring investment rule was not found.');
  const rule = readRecurringInvestmentRule(ruleSnapshot.data(), ruleSnapshot.id, portfolioId);
  const dates = rule.status === 'ACTIVE' ? getPendingRecurringInvestmentDatesUntil(rule, koreaToday()) : [];

  const ledger = await loadPortfolioLedger(userId, portfolio);
  const existingDates = new Set(
    ledger.histories
      .filter((history) => history.recurringRuleId === rule.id)
      .map((history) => history.date),
  );
  const histories = [] as HoldingHistory[];
  const executedDates: string[] = [];
  for (const date of dates) {
    if (existingDates.has(date)) continue;
    const candle = await fetchClosePriceOnOrAfter(rule.ticker, date);
    if (!candle || candle.closePrice <= 0) throw new Error(`${rule.name ?? rule.ticker}의 ${date} 이후 종가를 찾지 못했습니다.`);
    if (existingDates.has(candle.date)) continue;
    const costs = defaultTransactionCosts(candle.closePrice * rule.quantity, rule.market, 'BUY');
    histories.push(
      await createHistory(
        doc(collection(portfolioReference(userId, portfolioId), 'holdingHistories')).id,
        {
          portfolioId,
          portfolioType: portfolio.type,
          ticker: rule.ticker,
          name: rule.name,
          market: rule.market,
          type: 'BUY',
          price: candle.closePrice,
          quantity: rule.quantity,
          fee: costs.fee,
          tax: costs.tax,
          date: candle.date,
          source: 'RECURRING',
          recurringRuleId: rule.id,
          recurringRuleName: rule.name ?? rule.ticker,
          scheduledDate: date,
          recurringExecutionStatus: portfolio.type === 'REAL' ? 'PENDING' : 'CONFIRMED',
        },
        Date.now(),
      ),
    );
    executedDates.push(candle.date);
  }
  const correctedHistories = ledger.histories.map((history) => {
    if (history.source !== 'RECURRING' || history.recurringRuleId !== rule.id || history.fee !== 0) return history;
    const costs = defaultTransactionCosts(history.grossAmount, history.market, history.type);
    return { ...history, fee: costs.fee, tax: history.tax || costs.tax, updatedAt: Date.now() };
  });
  const hasCostCorrection = correctedHistories.some((history, index) => history !== ledger.histories[index]);
  const nextLedger = histories.length || hasCostCorrection
    ? await persistLedger(userId, portfolio, ledger, [...correctedHistories, ...histories])
    : undefined;
  const nextRule = {
    ...rule,
    lastExecutedDate: executedDates.at(-1) ?? dates.at(-1) ?? rule.lastExecutedDate,
    updatedAt: Date.now(),
  };
  if (dates.length) await setDoc(ruleReference, recurringInvestmentRuleData(nextRule));
  return { executedCount: histories.length, dates, ledger: nextLedger, rule: nextRule };
}

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

export async function confirmRecurringHoldingHistory(
  userId: string,
  portfolioId: string,
  historyId: string,
  values: Pick<HoldingHistoryInput, 'price' | 'quantity' | 'fee' | 'tax'>,
): Promise<PortfolioLedger> {
  const portfolio = await findPortfolio(userId, portfolioId);
  const previous = await loadPortfolioLedger(userId, portfolio);
  const existing = previous.histories.find((history) => history.id === historyId);
  if (!existing || existing.source !== 'RECURRING') throw new Error('확정할 적립식 자동매수 이력을 찾지 못했습니다.');
  const confirmed = await createHistory(
    existing.id,
    {
      portfolioId: existing.portfolioId,
      portfolioType: existing.portfolioType,
      ticker: existing.ticker,
      name: existing.name,
      market: existing.market,
      type: existing.type,
      price: values.price,
      quantity: values.quantity,
      fee: values.fee,
      tax: values.tax,
      date: existing.date,
      source: existing.source,
      recurringRuleId: existing.recurringRuleId,
      recurringRuleName: existing.recurringRuleName,
      scheduledDate: existing.scheduledDate,
      recurringExecutionStatus: 'CONFIRMED',
    },
    existing.createdAt,
  );
  const nextHistory = { ...confirmed, updatedAt: Date.now() };
  return persistLedger(
    userId,
    portfolio,
    previous,
    previous.histories.map((history) => (history.id === historyId ? nextHistory : history)),
  );
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
