import type { HoldingHistory, HoldingHistoryInput, Portfolio, PortfolioLedger } from '../types';
import { recalculatePortfolio } from '../utils/calculator';
import { fetchHistoricalUsdKrwExchangeRate } from './tossApi';

const STORAGE_KEY = 'portfolio-platform-guest-ledgers-v1';
const MIGRATION_KEY = 'portfolio-platform-guest-migration-v1';
const GUEST_ID = 'guest';

type StoredWorkspace = { histories: Record<string, HoldingHistory[]> };

const defaults = (): Portfolio[] => {
  const now = Date.now();
  return [
    {
      id: 'guest-real',
      userId: GUEST_ID,
      name: '실제 포트폴리오',
      type: 'REAL',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'guest-virtual',
      userId: GUEST_ID,
      name: '가상 포트폴리오',
      type: 'VIRTUAL',
      createdAt: now,
      updatedAt: now,
    },
  ];
};

const read = (): StoredWorkspace => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredWorkspace;
    return value.histories && typeof value.histories === 'object' ? value : { histories: {} };
  } catch {
    return { histories: {} };
  }
};

const write = (workspace: StoredWorkspace) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));

export const loadGuestPortfolioWorkspace = (): PortfolioLedger[] => {
  const workspace = read();
  return defaults().map((portfolio) => {
    const histories = workspace.histories[portfolio.id] ?? [];
    const recalculated = recalculatePortfolio(portfolio, histories);
    return { portfolio, ...recalculated };
  });
};

/** Fills transaction-date USD/KRW rates for guest records without requiring an account. */
export const backfillGuestPortfolioHistoricalExchangeRates = async (): Promise<
  PortfolioLedger[]
> => {
  const workspace = read();
  const missingDates = [
    ...new Set(
      Object.values(workspace.histories)
        .flat()
        .filter((history) => history.market === 'US' && !history.exchangeRate)
        .map((history) => history.date),
    ),
  ];
  if (!missingDates.length) return loadGuestPortfolioWorkspace();

  const rateResults = await Promise.allSettled(
    missingDates.map(
      async (date) => [date, await fetchHistoricalUsdKrwExchangeRate(date)] as const,
    ),
  );
  const ratesByDate = new Map(
    rateResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  );
  let updated = false;

  Object.entries(workspace.histories).forEach(([portfolioId, histories]) => {
    workspace.histories[portfolioId] = histories.map((history) => {
      const rate =
        history.market === 'US' && !history.exchangeRate
          ? ratesByDate.get(history.date)
          : undefined;
      if (!rate) return history;
      updated = true;
      return {
        ...history,
        exchangeRate: rate.rate,
        exchangeRateDate: rate.resolvedDate,
        exchangeRateSource: rate.source,
        updatedAt: Date.now(),
      };
    });
  });

  if (updated) write(workspace);
  return loadGuestPortfolioWorkspace();
};

/** Removes guest data only after a signed-in workspace has stored every history row. */
export const clearGuestPortfolioWorkspace = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MIGRATION_KEY);
};

export const getGuestPortfolioMigrationUserId = (): string | null => {
  try {
    const value = JSON.parse(localStorage.getItem(MIGRATION_KEY) ?? 'null') as unknown;
    return typeof value === 'object' &&
      value !== null &&
      (value as { status?: unknown }).status === 'TRANSFERRING' &&
      typeof (value as { userId?: unknown }).userId === 'string'
      ? (value as { userId: string }).userId
      : null;
  } catch {
    return null;
  }
};

export const markGuestPortfolioMigrationStarted = (userId: string): void => {
  localStorage.setItem(
    MIGRATION_KEY,
    JSON.stringify({ userId, status: 'TRANSFERRING', startedAt: Date.now() }),
  );
};

export const clearGuestPortfolioMigration = (): void => {
  localStorage.removeItem(MIGRATION_KEY);
};

export const addGuestHoldingHistory = async (
  input: HoldingHistoryInput,
): Promise<PortfolioLedger> => {
  const workspace = read();
  const portfolio = defaults().find((item) => item.id === input.portfolioId);
  if (!portfolio) throw new Error('임시 포트폴리오를 찾을 수 없습니다.');
  const now = Date.now();
  let historicalRate: Awaited<ReturnType<typeof fetchHistoricalUsdKrwExchangeRate>> | undefined;
  if (input.market === 'US') {
    try {
      historicalRate = await fetchHistoricalUsdKrwExchangeRate(input.date);
    } catch {
      // The record remains usable in USD and shows "환율 없음" in KRW until a later retry succeeds.
    }
  }
  const history: HoldingHistory = {
    id: crypto.randomUUID(),
    portfolioId: portfolio.id,
    portfolioType: portfolio.type,
    ticker: input.ticker.trim().toUpperCase(),
    ...(input.name ? { name: input.name } : {}),
    market: input.market,
    type: input.type,
    price: input.price,
    quantity: input.quantity,
    grossAmount: input.price * input.quantity,
    fee: input.fee ?? 0,
    tax: input.tax ?? 0,
    realizedPnL: 0,
    date: input.date,
    ...(historicalRate
      ? {
          exchangeRate: historicalRate.rate,
          exchangeRateDate: historicalRate.resolvedDate,
          exchangeRateSource: historicalRate.source,
        }
      : {}),
    createdAt: now,
    source: input.source ?? 'MANUAL',
  };
  const histories = [...(workspace.histories[portfolio.id] ?? []), history];
  workspace.histories[portfolio.id] = histories;
  write(workspace);
  const recalculated = recalculatePortfolio(portfolio, histories);
  return { portfolio, ...recalculated };
};

export const deleteGuestHoldingHistory = (
  portfolioId: string,
  historyId: string,
): PortfolioLedger => {
  const workspace = read();
  const portfolio = defaults().find((item) => item.id === portfolioId);
  if (!portfolio) throw new Error('임시 포트폴리오를 찾을 수 없습니다.');

  const histories = workspace.histories[portfolio.id] ?? [];
  const nextHistories = histories.filter((history) => history.id !== historyId);
  if (nextHistories.length === histories.length) {
    throw new Error('삭제할 거래 기록을 찾을 수 없습니다.');
  }

  workspace.histories[portfolio.id] = nextHistories;
  write(workspace);
  const recalculated = recalculatePortfolio(portfolio, nextHistories);
  return { portfolio, ...recalculated };
};
