import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiEdit2, FiPlus } from 'react-icons/fi';
import { TransactionModal } from '../TransactionModal/TransactionModal';
import { RecurringInvestmentModal } from '../RecurringInvestmentModal/RecurringInvestmentModal';
import {
  executeDueRecurringInvestmentRule,
  loadRecurringInvestmentRules,
  setRecurringInvestmentRuleStatus,
} from '../../services/portfolioLedgerService';
import { fetchCurrentPrices } from '../../services/tossApi';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Holding, HoldingHistory, PortfolioType, RecurringInvestmentRule } from '../../types';
import { formatRate } from '../../utils/calculator';
import { calculatePortfolioFxPerformance } from '../../utils/portfolioFxPerformance';
import { getNextPendingRecurringInvestmentDate } from '../../utils/recurringInvestment';
import styles from './PortfolioManager.module.scss';

const money = (value: number, market: 'KR' | 'US') => {
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: market === 'US' ? 2 : 0,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  });
  return market === 'KR' ? `${formatted}원` : `$${formatted}`;
};

const EMPTY_HOLDINGS: Holding[] = [];
const EMPTY_HISTORIES: HoldingHistory[] = [];
const WEEKDAY_LABELS = ['', '월요일', '화요일', '수요일', '목요일', '금요일'];

interface StockAvatarProps {
  name?: string;
  ticker: string;
  market: Holding['market'];
}

function StockAvatar({ name, ticker, market }: StockAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const label = (name ?? ticker).trim().charAt(0);
  const iconUrl = `https://static.toss.im/png-icons/securities/icn-sec-fill-${ticker.toUpperCase()}.png`;

  return (
    <span className={styles.stockAvatar} data-market={market} aria-hidden="true">
      {!hasImageError && <img src={iconUrl} alt="" onError={() => setHasImageError(true)} />}
      {hasImageError && label}
    </span>
  );
}

interface PortfolioManagerProps {
  portfolioType?: PortfolioType;
}

type ColumnId =
  | 'averagePrice'
  | 'currentPrice'
  | 'quantity'
  | 'investment'
  | 'evaluatedValue'
  | 'profitAmount'
  | 'profitRate';
type SummaryCurrency = 'KRW' | 'USD';

const COLUMN_OPTIONS: Array<{ id: ColumnId; label: string }> = [
  { id: 'averagePrice', label: '평단가' },
  { id: 'currentPrice', label: '현재가' },
  { id: 'quantity', label: '보유 수량' },
  { id: 'investment', label: '투자원금' },
  { id: 'evaluatedValue', label: '평가금액' },
  { id: 'profitAmount', label: '평가손익' },
  { id: 'profitRate', label: '수익률' },
];
const DEFAULT_VISIBLE_COLUMNS = COLUMN_OPTIONS.map((column) => column.id);
const columnStorageKey = (portfolioType?: PortfolioType) =>
  `portfolio-table-columns-v1-${portfolioType ?? 'all'}`;
const summaryCurrencyStorageKey = 'portfolio-summary-currency';

const readVisibleColumns = (portfolioType?: PortfolioType): ColumnId[] => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(columnStorageKey(portfolioType)) ?? '[]',
    ) as unknown;
    if (
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved.every((column): column is ColumnId =>
        COLUMN_OPTIONS.some((option) => option.id === column),
      )
    ) {
      return saved;
    }
  } catch {
    // 기본 열 구성으로 표시한다.
  }
  return DEFAULT_VISIBLE_COLUMNS;
};

export function PortfolioManager({ portfolioType }: PortfolioManagerProps) {
  const userId = useAuthStore((state) => state.user?.uid);
  const selectedHoldings = usePortfolioStore((state) => state.holdings);
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const prices = usePortfolioStore((state) => state.prices);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const isLoading = usePortfolioStore((state) => state.isLoading);
  const ledgerError = usePortfolioStore((state) => state.ledgerError);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const isTransactionModalOpen = usePortfolioStore((state) => state.isTransactionModalOpen);
  const transactionModalType = usePortfolioStore((state) => state.transactionModalType);
  const transactionModalPreset = usePortfolioStore((state) => state.transactionModalPreset);
  const setPrices = usePortfolioStore((state) => state.setPrices);
  const setActivePortfolioId = usePortfolioStore((state) => state.setActivePortfolioId);
  const openTransactionModal = usePortfolioStore((state) => state.openTransactionModal);
  const closeTransactionModal = usePortfolioStore((state) => state.closeTransactionModal);
  const setTransactionModalType = usePortfolioStore((state) => state.setTransactionModalType);
  const addHoldingHistory = usePortfolioStore((state) => state.addHoldingHistory);
  const loadPortfolioLedgers = usePortfolioStore((state) => state.loadPortfolioLedgers);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurringRule, setEditingRecurringRule] = useState<RecurringInvestmentRule | null>(null);
  const [updatingRecurringRuleId, setUpdatingRecurringRuleId] = useState<string | null>(null);
  const [openRuleStatusId, setOpenRuleStatusId] = useState<string | null>(null);
  const [recurringExecutionErrors, setRecurringExecutionErrors] = useState<Record<string, string>>({});
  const executedPortfolioRef = useRef<string | null>(null);
  const [recurringRuleData, setRecurringRuleData] = useState<{
    portfolioId: string | null;
    rules: RecurringInvestmentRule[];
  }>({ portfolioId: null, rules: [] });
  const [actionNotice, setActionNotice] = useState('');
  const [columnMenuMarket, setColumnMenuMarket] = useState<'KR' | 'US' | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() =>
    readVisibleColumns(portfolioType),
  );
  const [summaryCurrency, setSummaryCurrency] = useState<SummaryCurrency>(() =>
    localStorage.getItem(summaryCurrencyStorageKey) === 'USD' ? 'USD' : 'KRW',
  );
  const activePortfolio = portfolioType
    ? portfolios.find((portfolio) => portfolio.type === portfolioType)
    : portfolios.find((portfolio) => portfolio.id === activePortfolioId);
  const activeRecurringPortfolioId = activePortfolio?.id;
  const holdings = activePortfolio
    ? (portfolioLedgers[activePortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
    : selectedHoldings;
  const histories = activePortfolio
    ? (portfolioLedgers[activePortfolio.id]?.histories ?? EMPTY_HISTORIES)
    : EMPTY_HISTORIES;
  const recurringRules =
    recurringRuleData.portfolioId === activeRecurringPortfolioId ? recurringRuleData.rules : [];

  const updateRecurringRuleStatus = async (rule: RecurringInvestmentRule, status: 'ACTIVE' | 'PAUSED') => {
    if (!userId) return;
    setUpdatingRecurringRuleId(rule.id);
    try {
      const updated = await setRecurringInvestmentRuleStatus(userId, rule.portfolioId, rule.id, status);
      setRecurringRuleData((current) =>
        current.portfolioId === rule.portfolioId
          ? { ...current, rules: current.rules.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setActionNotice(status === 'ACTIVE' ? '적립식 투자 규칙을 재개했습니다.' : '적립식 투자 규칙을 일시 정지했습니다.');
    } catch (cause) {
      setActionNotice(cause instanceof Error ? cause.message : '적립식 투자 규칙 상태를 변경하지 못했습니다.');
    } finally {
      setUpdatingRecurringRuleId(null);
      setOpenRuleStatusId(null);
    }
  };

  const retryRecurringRule = async (rule: RecurringInvestmentRule) => {
    if (!userId || !activePortfolio) return;
    setUpdatingRecurringRuleId(rule.id);
    try {
      const result = await executeDueRecurringInvestmentRule(userId, rule.id, activePortfolio.id);
      if (result.rule) {
        setRecurringRuleData((current) => ({
          ...current,
          rules: current.rules.map((item) => (item.id === result.rule?.id ? result.rule : item)),
        }));
      }
      if (result.executedCount) await loadPortfolioLedgers(userId);
      setRecurringExecutionErrors((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
      setActionNotice(result.executedCount ? `적립식 투자 ${result.executedCount}건을 반영했습니다.` : '반영할 예정 매수가 없습니다.');
    } catch (cause) {
      setRecurringExecutionErrors((current) => ({
        ...current,
        [rule.id]: cause instanceof Error ? cause.message : '적립식 투자 자동 반영에 실패했습니다.',
      }));
    } finally {
      setUpdatingRecurringRuleId(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    const portfolioId = activeRecurringPortfolioId;
    if (!userId || !portfolioId) {
      return () => {
        mounted = false;
      };
    }
    void loadRecurringInvestmentRules(userId, portfolioId)
      .then((rules) => {
        if (mounted) setRecurringRuleData({ portfolioId, rules });
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setActionNotice(
            cause instanceof Error ? cause.message : '적립식 투자 규칙을 불러오지 못했습니다.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeRecurringPortfolioId, userId]);

  useEffect(() => {
    if (!userId || !activePortfolio) return;
    if (recurringRuleData.portfolioId !== activePortfolio.id || executedPortfolioRef.current === activePortfolio.id) return;
    executedPortfolioRef.current = activePortfolio.id;
    const dueRules = recurringRuleData.rules.filter((rule) => rule.status === 'ACTIVE');
    if (!dueRules.length) return;
    void (async () => {
      const results = [];
      const errors: Record<string, string> = {};
      for (const rule of dueRules) {
        try {
          results.push(await executeDueRecurringInvestmentRule(userId, rule.id, activePortfolio.id));
        } catch (cause) {
          errors[rule.id] = cause instanceof Error ? cause.message : '적립식 투자 자동 반영에 실패했습니다.';
        }
      }
      return { results, errors };
    })()
      .then(async ({ results, errors }) => {
        setRecurringExecutionErrors(errors);
        const executedCount = results.reduce((total, result) => total + result.executedCount, 0);
        const updatedRules = results.flatMap((result) => (result.rule ? [result.rule] : []));
        if (updatedRules.length) {
          setRecurringRuleData((current) =>
            current.portfolioId === activePortfolio.id
              ? {
                  ...current,
                  rules: current.rules.map((rule) => updatedRules.find((item) => item.id === rule.id) ?? rule),
                }
              : current,
          );
        }
        if (executedCount) {
          await loadPortfolioLedgers(userId);
          setActionNotice(`적립식 투자 ${executedCount}건을 거래일 종가로 반영했습니다.`);
        }
      })
      .catch((cause: unknown) => {
        setActionNotice(cause instanceof Error ? cause.message : '적립식 투자 자동 반영에 실패했습니다.');
      });
  }, [activePortfolio, loadPortfolioLedgers, recurringRuleData.portfolioId, recurringRuleData.rules, userId]);

  const grouped = useMemo(
    () =>
      (['KR', 'US'] as const)
        .map((market) => ({
          market,
          holdings: holdings.filter((holding) => holding.market === market),
        }))
        .filter((group) => group.holdings.length),
    [holdings],
  );
  const fxPerformance = useMemo(
    () => calculatePortfolioFxPerformance(holdings, histories, prices, exchangeRate?.rate ?? null),
    [exchangeRate?.rate, histories, holdings, prices],
  );
  const combinedSummary = summaryCurrency === 'USD' ? fxPerformance.usd : fxPerformance.krw;
  const isSummaryCurrencyAvailable = combinedSummary !== null;
  const summaryUnavailableMessage =
    summaryCurrency === 'KRW' &&
    histories.some((history) => history.market === 'US' && !history.exchangeRate)
      ? '거래일 환율 보정 중'
      : summaryCurrency === 'USD'
        ? '환율 미조회'
        : '시세 미조회';
  const summaryMoney = (value: number) => money(value, summaryCurrency === 'USD' ? 'US' : 'KR');

  useEffect(() => {
    localStorage.setItem(summaryCurrencyStorageKey, summaryCurrency);
  }, [summaryCurrency]);

  const refreshPrices = async () => {
    if (!holdings.length) return;
    setIsRefreshing(true);
    setActionNotice('');
    try {
      const refreshed = await fetchCurrentPrices([
        ...new Set(holdings.map((holding) => holding.ticker)),
      ]);
      setPrices({ ...prices, ...refreshed });
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : '현재가를 불러오지 못했습니다.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openTransaction = (params: Parameters<typeof openTransactionModal>[0] = {}) => {
    if (!userId) {
      setActionNotice('로그인 후 거래 기록을 추가할 수 있습니다.');
      return;
    }
    if (!activePortfolio) {
      setActionNotice('포트폴리오를 불러온 뒤 다시 시도해주세요.');
      return;
    }
    setActionNotice('');
    openTransactionModal({ ...params, portfolioId: activePortfolio.id });
  };

  const submitTransaction = async (input: Parameters<typeof addHoldingHistory>[1]) => {
    if (!userId) throw new Error('로그인 후 거래 기록을 추가해주세요.');
    await addHoldingHistory(userId, input);
  };

  const updateVisibleColumns = (nextColumns: ColumnId[]) => {
    setVisibleColumns(nextColumns);
    localStorage.setItem(columnStorageKey(portfolioType), JSON.stringify(nextColumns));
  };

  const toggleColumn = (column: ColumnId) =>
    updateVisibleColumns(
      visibleColumns.includes(column)
        ? visibleColumns.filter((item) => item !== column)
        : [...visibleColumns, column],
    );
  const isColumnVisible = (column: ColumnId) => visibleColumns.includes(column);

  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <div>
          <h2>{activePortfolio?.name ?? '내 포트폴리오'}</h2>
          <p className={styles.description}>
            매수·매도 이력에서 자동 계산된 보유 수량과 이동평균 평단가입니다.
          </p>
        </div>
        {activePortfolio && (
          <div className={styles.summaryControls}>
            <div className={styles.currencyToggle} role="group" aria-label="포트폴리오 요약 통화">
              <button
                type="button"
                className={summaryCurrency === 'USD' ? styles.activeCurrency : undefined}
                aria-pressed={summaryCurrency === 'USD'}
                onClick={() => setSummaryCurrency('USD')}
              >
                $
              </button>
              <button
                type="button"
                className={summaryCurrency === 'KRW' ? styles.activeCurrency : undefined}
                aria-pressed={summaryCurrency === 'KRW'}
                onClick={() => setSummaryCurrency('KRW')}
              >
                원
              </button>
            </div>
            <span className={styles.portfolioType}>
              {activePortfolio.type === 'REAL' ? '실제 포트폴리오' : '가상 포트폴리오'}
            </span>
          </div>
        )}
      </div>

      {!portfolioType && portfolios.length > 1 && (
        <div className={styles.portfolioTabs} role="tablist" aria-label="포트폴리오 선택">
          {portfolios.map((portfolio) => (
            <button
              key={portfolio.id}
              type="button"
              role="tab"
              aria-selected={portfolio.id === activePortfolioId}
              className={portfolio.id === activePortfolioId ? styles.activeTab : undefined}
              onClick={() => setActivePortfolioId(portfolio.id)}
            >
              {portfolio.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.portfolioIntro}>
        <span>
          보유 종목 <strong>{holdings.length}개</strong>
        </span>
        <span>
          국내 {grouped.find((group) => group.market === 'KR')?.holdings.length ?? 0}개 · 미국{' '}
          {grouped.find((group) => group.market === 'US')?.holdings.length ?? 0}개
        </span>
      </div>

      <div className={styles.combinedSummary} aria-label="포트폴리오 요약">
        <span>
          현재 계좌 금액 ({summaryCurrency === 'USD' ? '$' : '원'})
          <strong className={styles.accountValue}>
            {!isSummaryCurrencyAvailable
              ? summaryUnavailableMessage
              : summaryMoney(combinedSummary.currentValue)}
          </strong>
        </span>
        <span>
          통합 평가손익 ({summaryCurrency === 'USD' ? '$' : '원'})
          <strong
            className={
              combinedSummary === null || combinedSummary.profitAmount >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {!isSummaryCurrencyAvailable
              ? summaryUnavailableMessage
              : summaryMoney(combinedSummary.profitAmount)}
          </strong>
        </span>
        <span>
          통합 평가 수익률
          <strong
            className={
              combinedSummary === null || combinedSummary.profitRate >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {combinedSummary === null
              ? summaryUnavailableMessage
              : formatRate(combinedSummary.profitRate)}
          </strong>
        </span>
      </div>

      <div className={styles.performanceGuide} role="status">
        {summaryCurrency === 'KRW' && fxPerformance.krw ? (
          <>
            <span>
              주가 손익{' '}
              <strong
                className={
                  fxPerformance.krw.stockProfitAmount >= 0 ? styles.positive : styles.negative
                }
              >
                {money(fxPerformance.krw.stockProfitAmount, 'KR')}
              </strong>
            </span>
            <span>
              환차익{' '}
              <strong
                className={
                  fxPerformance.krw.foreignExchangeProfitAmount >= 0
                    ? styles.positive
                    : styles.negative
                }
              >
                {money(fxPerformance.krw.foreignExchangeProfitAmount, 'KR')}
              </strong>
            </span>
            <small>평가손익에는 거래일 환율과 현재 환율의 차이를 반영합니다.</small>
          </>
        ) : summaryCurrency === 'USD' ? (
          <small>달러 기준 성과에는 환율 변동을 포함하지 않습니다.</small>
        ) : (
          <small>거래일 환율을 확인한 뒤 원화 기준 성과를 계산합니다.</small>
        )}
      </div>

      {ledgerError && (
        <p className={styles.error} role="alert">
          거래 원장 오류: {ledgerError}
        </p>
      )}
      {actionNotice && (
        <p className={styles.notice} role="status">
          {actionNotice}
        </p>
      )}

      {!activePortfolio && isLoading ? (
        <p className={styles.empty}>거래 원장을 불러오는 중입니다.</p>
      ) : !holdings.length ? (
        <div className={styles.emptyState}>
          <p>아직 보유 종목이 없습니다.</p>
          <div className={styles.actionButtons}>
            {userId && (
              <button type="button" onClick={() => setIsRecurringModalOpen(true)}>
                적립식 투자
              </button>
            )}
            <button type="button" onClick={() => openTransaction({ type: 'BUY' })}>
              첫 매수 기록 추가
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.actions}>
            <span>
              KRW와 USD는 통화별로 따로 표시합니다. 현재가는 보유 종목 기준으로 갱신합니다.
            </span>
            <div className={styles.actionButtons}>
              {userId && (
                <button type="button" onClick={() => setIsRecurringModalOpen(true)}>
                  적립식 투자
                </button>
              )}
              <button type="button" onClick={() => openTransaction({ type: 'BUY' })}>
                매수 기록 추가
              </button>
              <button type="button" onClick={() => void refreshPrices()} disabled={isRefreshing}>
                {isRefreshing ? '시세 갱신 중…' : '현재가 갱신'}
              </button>
            </div>
          </div>

          {grouped.map(({ market, holdings: marketHoldings }) => {
            const totalInvestment = marketHoldings.reduce(
              (sum, holding) => sum + holding.investedAmount,
              0,
            );
            const hasEveryPrice = marketHoldings.every(
              (holding) => prices[holding.ticker] !== undefined,
            );
            const totalValue = hasEveryPrice
              ? marketHoldings.reduce(
                  (sum, holding) =>
                    sum + (prices[holding.ticker] ?? holding.averagePrice) * holding.quantity,
                  0,
                )
              : null;
            const profit = totalValue === null ? null : totalValue - totalInvestment;

            return (
              <div className={styles.tableWrap} key={market}>
                <div className={styles.tableHeader}>
                  <h3>{market === 'KR' ? '국내 주식 (KRW)' : '미국 주식 (USD)'}</h3>
                  <div className={styles.columnSettings}>
                    <button
                      type="button"
                      className={styles.settingsButton}
                      aria-label="표시 항목 설정"
                      aria-expanded={columnMenuMarket === market}
                      onClick={() =>
                        setColumnMenuMarket((current) => (current === market ? null : market))
                      }
                    >
                      ⚙
                    </button>
                    {columnMenuMarket === market && (
                      <div className={styles.columnMenu}>
                        <div className={styles.columnMenuHeader}>
                          <strong>표시 항목</strong>
                          <button
                            type="button"
                            onClick={() => updateVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                          >
                            모두 보기
                          </button>
                        </div>
                        {COLUMN_OPTIONS.map((column) => (
                          <label key={column.id}>
                            <input
                              type="checkbox"
                              checked={isColumnVisible(column.id)}
                              onChange={() => toggleColumn(column.id)}
                            />
                            {column.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.marketSummary}>
                  <span>
                    투자원금 <strong>{money(totalInvestment, market)}</strong>
                  </span>
                  <span>
                    평가금액{' '}
                    <strong>
                      {totalValue === null ? '시세 미조회' : money(totalValue, market)}
                    </strong>
                  </span>
                  <span>
                    평가손익{' '}
                    <strong
                      className={profit === null || profit >= 0 ? styles.positive : styles.negative}
                    >
                      {profit === null ? '시세 미조회' : money(profit, market)}
                    </strong>
                  </span>
                  <span>
                    수익률{' '}
                    <strong
                      className={profit === null || profit >= 0 ? styles.positive : styles.negative}
                    >
                      {profit === null
                        ? '시세 미조회'
                        : formatRate(totalInvestment ? (profit / totalInvestment) * 100 : 0)}
                    </strong>
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>종목</th>
                      {isColumnVisible('averagePrice') && <th>평단가</th>}
                      {isColumnVisible('currentPrice') && <th>현재가</th>}
                      {isColumnVisible('quantity') && <th>보유 수량</th>}
                      {isColumnVisible('investment') && <th>투자원금</th>}
                      {isColumnVisible('evaluatedValue') && <th>평가금액</th>}
                      {isColumnVisible('profitAmount') && <th>평가손익</th>}
                      {isColumnVisible('profitRate') && <th>수익률</th>}
                      <th>기록</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketHoldings.map((holding) => {
                      const currentPrice = prices[holding.ticker];
                      const evaluatedValue =
                        currentPrice === undefined ? null : currentPrice * holding.quantity;
                      const profitAmount =
                        evaluatedValue === null ? null : evaluatedValue - holding.investedAmount;
                      const profitRate =
                        profitAmount === null || holding.investedAmount <= 0
                          ? null
                          : (profitAmount / holding.investedAmount) * 100;
                      return (
                        <tr key={`${holding.market}-${holding.ticker}`}>
                          <td>
                            <div className={styles.stockCell}>
                              <StockAvatar
                                name={holding.name}
                                ticker={holding.ticker}
                                market={holding.market}
                              />
                              <span>
                                <strong>{holding.name ?? holding.ticker}</strong>
                              </span>
                            </div>
                          </td>
                          {isColumnVisible('averagePrice') && (
                            <td>{money(holding.averagePrice, holding.market)}</td>
                          )}
                          {isColumnVisible('currentPrice') && (
                            <td>
                              {currentPrice === undefined
                                ? '시세 미조회'
                                : money(currentPrice, holding.market)}
                            </td>
                          )}
                          {isColumnVisible('quantity') && (
                            <td>{holding.quantity.toLocaleString('ko-KR')}</td>
                          )}
                          {isColumnVisible('investment') && (
                            <td>{money(holding.investedAmount, holding.market)}</td>
                          )}
                          {isColumnVisible('evaluatedValue') && (
                            <td>
                              {evaluatedValue === null
                                ? '—'
                                : money(evaluatedValue, holding.market)}
                            </td>
                          )}
                          {isColumnVisible('profitAmount') && (
                            <td
                              className={
                                profitAmount === null || profitAmount >= 0
                                  ? styles.positive
                                  : styles.negative
                              }
                            >
                              {profitAmount === null ? '—' : money(profitAmount, holding.market)}
                            </td>
                          )}
                          {isColumnVisible('profitRate') && (
                            <td
                              className={
                                profitRate === null || profitRate >= 0
                                  ? styles.positive
                                  : styles.negative
                              }
                            >
                              {profitRate === null ? '—' : formatRate(profitRate)}
                            </td>
                          )}
                          <td>
                            <button
                              type="button"
                              className={styles.recordButton}
                              onClick={() =>
                                openTransaction({
                                  type: 'BUY',
                                  ticker: holding.ticker,
                                  name: holding.name,
                                  market: holding.market,
                                  price: currentPrice,
                                })
                              }
                              aria-label={`${holding.name ?? holding.ticker} 매수 기록 추가`}
                              title="매수 기록 추가"
                            >
                              <FiPlus aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
      {userId && activePortfolio && recurringRules.length > 0 ? (
        <section className={styles.recurringRules} aria-labelledby="recurring-rules-title">
          <div className={styles.recurringRulesHeader}>
            <div>
              <h3 id="recurring-rules-title">적립식 투자</h3>
              <p>저장한 자동 매수 규칙입니다.</p>
            </div>
            <button type="button" onClick={() => setIsRecurringModalOpen(true)}>
              규칙 추가
            </button>
          </div>
          <ul>
            {recurringRules.map((rule) => (
              <li key={rule.id}>
                <strong className={styles.recurringStock}>
                  <StockAvatar name={rule.name} ticker={rule.ticker} market={rule.market} />
                  {rule.name ?? rule.ticker}
                </strong>
                <span>
                  {rule.frequency === 'WEEKLY'
                    ? `매주 ${WEEKDAY_LABELS[rule.weeklyDay ?? 1]}`
                    : `매월 ${rule.monthlyDay}일`}
                </span>
                <span>{rule.quantity.toLocaleString('ko-KR')}주</span>
                <span>다음 매수 {rule.status === 'ACTIVE' ? getNextPendingRecurringInvestmentDate(rule) : '-'}</span>
                <div className={styles.ruleStatusMenu}>
                  <button
                    type="button"
                    className={`${styles.ruleStatusTrigger} ${rule.status === 'ACTIVE' ? styles.ruleActive : styles.rulePaused}`}
                    onClick={() => setOpenRuleStatusId((current) => (current === rule.id ? null : rule.id))}
                    onBlur={() => window.setTimeout(() => setOpenRuleStatusId(null), 120)}
                    disabled={updatingRecurringRuleId === rule.id}
                    aria-expanded={openRuleStatusId === rule.id}
                    aria-label={`${rule.name ?? rule.ticker} 적립식 투자 상태`}
                  >
                    {rule.status === 'ACTIVE' ? '진행 중' : '일시 정지'}
                    <FiChevronDown aria-hidden="true" />
                  </button>
                  {openRuleStatusId === rule.id ? (
                    <div className={styles.ruleStatusOptions} role="menu">
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => void updateRecurringRuleStatus(rule, 'ACTIVE')}>
                        진행 중
                      </button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => void updateRecurringRuleStatus(rule, 'PAUSED')}>
                        일시 정지
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className={styles.ruleActions}>
                  <button
                    type="button"
                    className={styles.ruleEditButton}
                    onClick={() => {
                      setEditingRecurringRule(rule);
                      setIsRecurringModalOpen(true);
                    }}
                    aria-label={`${rule.name ?? rule.ticker} 적립식 투자 수정`}
                    title="수정"
                  >
                    <FiEdit2 aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {Object.entries(recurringExecutionErrors).map(([ruleId, error]) => {
            const rule = recurringRules.find((item) => item.id === ruleId);
            if (!rule) return null;
            return (
              <div key={ruleId} className={styles.recurringExecutionError} role="alert">
                <span>{rule.name ?? rule.ticker}: {error}</span>
                <button type="button" onClick={() => void retryRecurringRule(rule)} disabled={updatingRecurringRuleId === rule.id}>
                  다시 시도
                </button>
              </div>
            );
          })}
        </section>
      ) : null}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        type={transactionModalType}
        portfolio={activePortfolio ?? null}
        holdings={holdings}
        preset={transactionModalPreset ?? undefined}
        isSaving={isSaving}
        onTypeChange={setTransactionModalType}
        onClose={closeTransactionModal}
        onSubmit={submitTransaction}
      />
      {userId && activePortfolio ? (
        <RecurringInvestmentModal
          key={editingRecurringRule?.id ?? 'new'}
          isOpen={isRecurringModalOpen}
          userId={userId}
          portfolio={activePortfolio}
          rule={editingRecurringRule ?? undefined}
          onClose={() => {
            setIsRecurringModalOpen(false);
            setEditingRecurringRule(null);
          }}
          onSaved={(rule) => {
            setRecurringRuleData((current) =>
              current.portfolioId === rule.portfolioId
                ? {
                    ...current,
                    rules: current.rules.some((item) => item.id === rule.id)
                      ? current.rules.map((item) => (item.id === rule.id ? rule : item))
                      : [...current.rules, rule],
                  }
                : current,
            );
            setActionNotice(editingRecurringRule ? '적립식 투자 규칙을 수정했습니다.' : '적립식 투자 규칙을 저장했습니다.');
            setEditingRecurringRule(null);
            executedPortfolioRef.current = null;
          }}
          onDeleted={(ruleId) => {
            setRecurringRuleData((current) => ({
              ...current,
              rules: current.rules.filter((item) => item.id !== ruleId),
            }));
            setActionNotice('적립식 투자 규칙을 삭제했습니다.');
            setEditingRecurringRule(null);
          }}
        />
      ) : null}
    </section>
  );
}
