import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithCredential,
  type Auth,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { signInWithEmail, signOutUser, signUpWithEmail } from '../src/services/auth';
import {
  addGuestHoldingHistory,
  loadGuestPortfolioWorkspace,
} from '../src/services/localPortfolioLedgerService';
import {
  addPortfolioHoldingHistory,
  addRecurringInvestmentRule,
  canMigrateGuestPortfolioWorkspace,
  confirmRecurringHoldingHistory,
  deletePortfolioHoldingHistory,
  executeDueRecurringInvestmentRule,
  loadPortfolioWorkspace,
  loadRecurringInvestmentExecutions,
  migrateGuestPortfolioWorkspace,
} from '../src/services/portfolioLedgerService';
import type { HoldingHistoryInput, PortfolioLedger } from '../src/types';

const mocked = vi.hoisted(() => ({
  database: null as Firestore | null,
  auth: null as Auth | null,
  failCloseDate: null as string | null,
  closeDates: new Map<string, string>(),
}));

vi.mock('../src/services/firebase', () => ({
  isFirebaseConfigured: true,
  get db() {
    return mocked.database;
  },
  get auth() {
    return mocked.auth;
  },
}));

vi.mock('../src/services/tossApi', () => ({
  fetchClosePriceOnOrAfter: async (_ticker: string, scheduledDate: string) => {
    if (mocked.failCloseDate === scheduledDate) throw new Error('종가 조회 실패');
    return { date: mocked.closeDates.get(scheduledDate) ?? scheduledDate, closePrice: 100 };
  },
  fetchHistoricalUsdKrwExchangeRate: async () => {
    throw new Error('KR 거래에서 환율을 요청하지 않아야 합니다.');
  },
}));

vi.mock('../src/utils/recurringInvestment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/recurringInvestment')>()),
  koreaToday: () => '2026-10-08',
}));

const projectId = 'demo-portfolio-day34';
const rules = readFileSync(resolve('firestore.rules'), 'utf8');
let environment: RulesTestEnvironment;
let authApp: FirebaseApp;

const useAccount = (userId: string) => {
  mocked.database = environment.authenticatedContext(userId).firestore() as unknown as Firestore;
};

const guestBuy = (portfolioId: 'guest-real' | 'guest-virtual'): HoldingHistoryInput => ({
  portfolioId,
  portfolioType: portfolioId === 'guest-real' ? 'REAL' : 'VIRTUAL',
  ticker: portfolioId === 'guest-real' ? '005930' : '035420',
  market: 'KR',
  type: 'BUY',
  price: 100,
  quantity: 1,
  date: '2026-10-01',
});

const ledgerOf = (ledgers: PortfolioLedger[], type: 'REAL' | 'VIRTUAL') => {
  const ledger = ledgers.find((item) => item.portfolio.type === type);
  if (!ledger) throw new Error(`${type} 원장이 없습니다.`);
  return ledger;
};

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
  authApp = initializeApp(
    { apiKey: 'demo-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId },
    'day34-integration',
  );
  const auth = getAuth(authApp);
  connectAuthEmulator(
    auth,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`,
    {
      disableWarnings: true,
    },
  );
  await setPersistence(auth, inMemoryPersistence);
  mocked.auth = auth;
});

beforeEach(async () => {
  await environment.clearFirestore();
  localStorage.clear();
  mocked.database = null;
  mocked.failCloseDate = null;
  mocked.closeDates.clear();
  await signOutUser();
});

afterAll(async () => {
  await signOutUser();
  await deleteApp(authApp);
  await environment.cleanup();
});

test('email login and emulated Google identity keep portfolios separate', async () => {
  const email = `day34-${randomUUID()}@example.test`;
  const signedUp = await signUpWithEmail(email, 'day34-password');
  expect(signedUp.email).toBe(email);
  await signOutUser();
  expect((await signInWithEmail(email, 'day34-password')).uid).toBe(signedUp.uid);

  useAccount(signedUp.uid);
  await loadPortfolioWorkspace(signedUp.uid);
  await addPortfolioHoldingHistory(signedUp.uid, {
    ...guestBuy('guest-real'),
    portfolioId: 'real',
  });
  await signOutUser();

  const googleCredential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub: `google-${randomUUID()}`,
      email: `google-${randomUUID()}@example.test`,
      email_verified: true,
    }),
  );
  const googleUser = (await signInWithCredential(mocked.auth!, googleCredential)).user;
  expect(googleUser.uid).not.toBe(signedUp.uid);
  useAccount(googleUser.uid);
  const googleWorkspace = await loadPortfolioWorkspace(googleUser.uid);
  expect(googleWorkspace.flatMap((item) => item.histories)).toHaveLength(0);
  await expect(loadPortfolioWorkspace(signedUp.uid)).rejects.toThrow();
  await expect(
    getDoc(doc(mocked.database!, 'users', signedUp.uid, 'portfolios', 'real')),
  ).rejects.toThrow();

  useAccount(signedUp.uid);
  expect(ledgerOf(await loadPortfolioWorkspace(signedUp.uid), 'REAL').histories).toHaveLength(1);
});

test('new account imports both guest ledgers exactly once', async () => {
  const userId = 'new-account';
  await addGuestHoldingHistory(guestBuy('guest-real'));
  await addGuestHoldingHistory(guestBuy('guest-virtual'));
  const guestLedgers = loadGuestPortfolioWorkspace();
  useAccount(userId);
  expect(await canMigrateGuestPortfolioWorkspace(userId)).toBe(true);
  expect(await migrateGuestPortfolioWorkspace(userId, guestLedgers)).toBe(true);
  const first = await loadPortfolioWorkspace(userId);
  expect(ledgerOf(first, 'REAL').histories).toHaveLength(1);
  expect(ledgerOf(first, 'VIRTUAL').histories).toHaveLength(1);
  expect(await migrateGuestPortfolioWorkspace(userId, guestLedgers)).toBe(false);
  const second = await loadPortfolioWorkspace(userId);
  expect(ledgerOf(second, 'REAL').histories).toHaveLength(1);
  expect(ledgerOf(second, 'VIRTUAL').histories).toHaveLength(1);
});

test('partial guest migration can resume without duplicating the first portfolio', async () => {
  const userId = 'retry-account';
  await addGuestHoldingHistory(guestBuy('guest-real'));
  await addGuestHoldingHistory(guestBuy('guest-virtual'));
  const guestLedgers = loadGuestPortfolioWorkspace();
  const brokenLedgers = guestLedgers.map((ledger) =>
    ledger.portfolio.type === 'VIRTUAL'
      ? {
          ...ledger,
          histories: ledger.histories.map((history) => ({ ...history, type: 'SELL' as const })),
        }
      : ledger,
  );
  useAccount(userId);
  await expect(migrateGuestPortfolioWorkspace(userId, brokenLedgers)).rejects.toThrow();
  const partial = await loadPortfolioWorkspace(userId);
  expect(ledgerOf(partial, 'REAL').histories).toHaveLength(1);
  expect(ledgerOf(partial, 'VIRTUAL').histories).toHaveLength(0);
  expect(ledgerOf(loadGuestPortfolioWorkspace(), 'VIRTUAL').histories).toHaveLength(1);

  expect(
    await migrateGuestPortfolioWorkspace(userId, guestLedgers, { allowExistingHistories: true }),
  ).toBe(true);
  expect(
    await migrateGuestPortfolioWorkspace(userId, guestLedgers, { allowExistingHistories: true }),
  ).toBe(true);
  const complete = await loadPortfolioWorkspace(userId);
  expect(ledgerOf(complete, 'REAL').histories).toHaveLength(1);
  expect(ledgerOf(complete, 'VIRTUAL').histories).toHaveLength(1);
});

test('existing account refuses guest migration and preserves its ledger', async () => {
  const userId = 'existing-account';
  useAccount(userId);
  await loadPortfolioWorkspace(userId);
  await addPortfolioHoldingHistory(userId, { ...guestBuy('guest-real'), portfolioId: 'real' });
  await addGuestHoldingHistory(guestBuy('guest-real'));
  const guestLedgers = loadGuestPortfolioWorkspace();
  expect(await canMigrateGuestPortfolioWorkspace(userId)).toBe(false);
  expect(await migrateGuestPortfolioWorkspace(userId, guestLedgers)).toBe(false);
  expect(ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').histories).toHaveLength(1);
  expect(ledgerOf(loadGuestPortfolioWorkspace(), 'REAL').histories).toHaveLength(1);
});

test('weekly catch-up, holiday adjustment, failed retry and confirmation stay idempotent', async () => {
  const userId = 'recurring-account';
  useAccount(userId);
  await loadPortfolioWorkspace(userId);
  const rule = await addRecurringInvestmentRule(userId, {
    portfolioId: 'real',
    portfolioType: 'REAL',
    ticker: '005930',
    market: 'KR',
    quantity: 1,
    frequency: 'WEEKLY',
    weeklyDay: 1,
    startDate: '2026-09-21',
  });
  mocked.failCloseDate = '2026-09-28';
  await expect(executeDueRecurringInvestmentRule(userId, rule.id, 'real')).rejects.toThrow(
    '종가 조회 실패',
  );
  expect(ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').histories).toHaveLength(0);
  expect((await loadRecurringInvestmentExecutions(userId, 'real'))[0]?.result).toBe('FAILED');

  mocked.failCloseDate = null;
  mocked.closeDates.set('2026-10-05', '2026-10-06');
  const retry = await executeDueRecurringInvestmentRule(userId, rule.id, 'real', {
    triggeredByRetry: true,
  });
  expect(retry.executedCount).toBe(3);
  const ledger = ledgerOf(await loadPortfolioWorkspace(userId), 'REAL');
  expect(ledger.histories.map((item) => item.scheduledDate)).toEqual([
    '2026-09-21',
    '2026-09-28',
    '2026-10-05',
  ]);
  expect(ledger.histories.at(-1)?.date).toBe('2026-10-06');
  expect(ledger.histories.every((item) => item.recurringExecutionStatus === 'PENDING')).toBe(true);
  const historyId = ledger.histories[0]!.id;
  const confirmed = await confirmRecurringHoldingHistory(userId, 'real', historyId, {
    price: 105,
    quantity: 2,
    fee: 1,
    tax: 0,
  });
  expect(confirmed.histories.find((item) => item.id === historyId)?.recurringExecutionStatus).toBe(
    'CONFIRMED',
  );
  expect(confirmed.holdings[0]?.quantity).toBe(4);
  expect((await executeDueRecurringInvestmentRule(userId, rule.id, 'real')).executedCount).toBe(0);
  expect(ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').histories).toHaveLength(3);
  expect(
    (await loadRecurringInvestmentExecutions(userId, 'real')).map((item) => item.result),
  ).toEqual(['SUCCEEDED', 'FAILED']);
});

test('monthly virtual catch-up and simultaneous execution create one row per scheduled day', async () => {
  const userId = 'monthly-account';
  useAccount(userId);
  await loadPortfolioWorkspace(userId);
  const rule = await addRecurringInvestmentRule(userId, {
    portfolioId: 'virtual',
    portfolioType: 'VIRTUAL',
    ticker: '005930',
    market: 'KR',
    quantity: 1,
    frequency: 'MONTHLY',
    monthlyDay: 1,
    startDate: '2026-01-01',
  });
  const results = await Promise.all([
    executeDueRecurringInvestmentRule(userId, rule.id, 'virtual'),
    executeDueRecurringInvestmentRule(userId, rule.id, 'virtual'),
  ]);
  expect(results.every((item) => item.executedCount === 10)).toBe(true);
  const ledger = ledgerOf(await loadPortfolioWorkspace(userId), 'VIRTUAL');
  expect(ledger.histories.map((item) => item.scheduledDate)).toEqual([
    '2026-01-01',
    '2026-02-02',
    '2026-03-02',
    '2026-04-01',
    '2026-05-01',
    '2026-06-01',
    '2026-07-01',
    '2026-08-03',
    '2026-09-01',
    '2026-10-01',
  ]);
  expect(new Set(ledger.histories.map((item) => item.id)).size).toBe(10);
  expect(ledger.histories.every((item) => item.recurringExecutionStatus === 'CONFIRMED')).toBe(
    true,
  );
  expect((await executeDueRecurringInvestmentRule(userId, rule.id, 'virtual')).executedCount).toBe(
    0,
  );
});

test('two scheduled days sharing the first open market day retain both purchases', async () => {
  const userId = 'long-holiday-account';
  useAccount(userId);
  await loadPortfolioWorkspace(userId);
  const rule = await addRecurringInvestmentRule(userId, {
    portfolioId: 'real',
    portfolioType: 'REAL',
    ticker: '005930',
    market: 'KR',
    quantity: 1,
    frequency: 'WEEKLY',
    weeklyDay: 1,
    startDate: '2026-09-28',
  });
  mocked.closeDates.set('2026-09-28', '2026-10-06');
  mocked.closeDates.set('2026-10-05', '2026-10-06');

  expect((await executeDueRecurringInvestmentRule(userId, rule.id, 'real')).executedCount).toBe(2);
  const histories = ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').histories;
  expect(histories.map((item) => item.scheduledDate).sort()).toEqual(['2026-09-28', '2026-10-05']);
  expect(histories.map((item) => item.date)).toEqual(['2026-10-06', '2026-10-06']);
  expect(new Set(histories.map((item) => item.id)).size).toBe(2);
});

test('concurrent manual buys retain both histories, holdings and persisted summary', async () => {
  const userId = 'concurrent-manual-account';
  useAccount(userId);
  const startingRevision =
    ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').ledgerRevision ?? 0;
  await Promise.all([
    addPortfolioHoldingHistory(userId, { ...guestBuy('guest-real'), portfolioId: 'real' }),
    addPortfolioHoldingHistory(userId, {
      ...guestBuy('guest-real'),
      portfolioId: 'real',
      ticker: '035420',
      quantity: 2,
    }),
  ]);

  const ledger = ledgerOf(await loadPortfolioWorkspace(userId), 'REAL');
  expect(ledger.histories).toHaveLength(2);
  expect(ledger.holdings.map((holding) => holding.quantity).sort()).toEqual([1, 2]);
  expect(ledger.ledgerRevision).toBe(startingRevision + 2);
  const reference = doc(mocked.database!, 'users', userId, 'portfolios', 'real');
  const storedHoldings = await getDocs(collection(reference, 'holdings'));
  const storedSummary = await getDoc(doc(reference, 'summary', 'current'));
  expect(storedHoldings.size).toBe(2);
  expect(storedSummary.data()?.byMarket).toEqual(ledger.summary.byMarket);
}, 15_000);

test('two due recurring rules can write the same portfolio without losing holdings', async () => {
  const userId = 'concurrent-rules-account';
  useAccount(userId);
  const startingRevision =
    ledgerOf(await loadPortfolioWorkspace(userId), 'REAL').ledgerRevision ?? 0;
  const first = await addRecurringInvestmentRule(userId, {
    portfolioId: 'real',
    portfolioType: 'REAL',
    ticker: '005930',
    market: 'KR',
    quantity: 1,
    frequency: 'MONTHLY',
    monthlyDay: 1,
    startDate: '2026-10-01',
  });
  const second = await addRecurringInvestmentRule(userId, {
    portfolioId: 'real',
    portfolioType: 'REAL',
    ticker: '035420',
    market: 'KR',
    quantity: 1,
    frequency: 'MONTHLY',
    monthlyDay: 1,
    startDate: '2026-10-01',
  });
  await Promise.all([
    executeDueRecurringInvestmentRule(userId, first.id, 'real'),
    executeDueRecurringInvestmentRule(userId, second.id, 'real'),
  ]);
  const ledger = ledgerOf(await loadPortfolioWorkspace(userId), 'REAL');
  expect(ledger.histories).toHaveLength(2);
  expect(ledger.holdings).toHaveLength(2);
  expect(ledger.ledgerRevision).toBe(startingRevision + 2);
  const reference = doc(mocked.database!, 'users', userId, 'portfolios', 'real');
  expect((await getDocs(collection(reference, 'holdings'))).size).toBe(2);
  expect((await getDoc(doc(reference, 'summary', 'current'))).data()?.byMarket).toEqual(
    ledger.summary.byMarket,
  );
}, 15_000);

test('concurrent delete and new buy keep the final holdings consistent', async () => {
  const userId = 'concurrent-delete-account';
  useAccount(userId);
  await loadPortfolioWorkspace(userId);
  const first = await addPortfolioHoldingHistory(userId, {
    ...guestBuy('guest-real'),
    portfolioId: 'real',
  });
  const historyId = first.histories[0]!.id;
  await Promise.all([
    deletePortfolioHoldingHistory(userId, 'real', historyId),
    addPortfolioHoldingHistory(userId, {
      ...guestBuy('guest-real'),
      portfolioId: 'real',
      ticker: '035420',
    }),
  ]);
  const ledger = ledgerOf(await loadPortfolioWorkspace(userId), 'REAL');
  expect(ledger.histories.map((history) => history.ticker)).toEqual(['035420']);
  expect(ledger.holdings.map((holding) => holding.ticker)).toEqual(['035420']);
  const reference = doc(mocked.database!, 'users', userId, 'portfolios', 'real');
  expect((await getDocs(collection(reference, 'holdings'))).size).toBe(1);
  expect((await getDoc(doc(reference, 'summary', 'current'))).data()?.byMarket).toEqual(
    ledger.summary.byMarket,
  );
}, 15_000);
