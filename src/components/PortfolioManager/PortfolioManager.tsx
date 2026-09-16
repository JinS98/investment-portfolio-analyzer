import { useEffect, useMemo, useState } from 'react';
import { TransactionModal } from '../TransactionModal/TransactionModal';
import { fetchCurrentPrices } from '../../services/tossApi';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Holding, PortfolioType } from '../../types';
import { formatRate } from '../../utils/calculator';
import styles from './PortfolioManager.module.scss';

const money = (value: number, market: 'KR' | 'US') => {
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: market === 'US' ? 2 : 0,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  });
  return market === 'KR' ? `${formatted}원` : `$${formatted}`;
};

const EMPTY_HOLDINGS: Holding[] = [];

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
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const holdings = activePortfolio
    ? (portfolioLedgers[activePortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
    : selectedHoldings;

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
  const combinedSummary = useMemo(() => {
    const hasMissingPrice = holdings.some((holding) => prices[holding.ticker] === undefined);
    const hasUsHolding = holdings.some((holding) => holding.market === 'US');
    const exchangeRateValue = exchangeRate?.rate;

    if (hasMissingPrice || (hasUsHolding && !exchangeRateValue)) {
      return {
        evaluatedValue: null,
        unrealizedPnL: null,
        profitRate: null,
      };
    }

    const totalInvestment = holdings.reduce(
      (sum, holding) =>
        sum + holding.investedAmount * (holding.market === 'US' ? (exchangeRateValue ?? 1) : 1),
      0,
    );
    const totalEvaluated = holdings.reduce(
      (sum, holding) =>
        sum +
        (prices[holding.ticker] ?? holding.averagePrice) *
          holding.quantity *
          (holding.market === 'US' ? (exchangeRateValue ?? 1) : 1),
      0,
    );
    const unrealizedPnL = totalEvaluated - totalInvestment;
    return {
      evaluatedValue: totalEvaluated,
      unrealizedPnL,
      profitRate: totalInvestment > 0 ? (unrealizedPnL / totalInvestment) * 100 : 0,
    };
  }, [exchangeRate?.rate, holdings, prices]);
  const isSummaryCurrencyAvailable = summaryCurrency === 'KRW' || Boolean(exchangeRate?.rate);
  const summaryMoney = (value: number) =>
    money(
      summaryCurrency === 'USD' ? value / exchangeRate!.rate : value,
      summaryCurrency === 'USD' ? 'US' : 'KR',
    );

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
            {!isSummaryCurrencyAvailable || combinedSummary.evaluatedValue === null
              ? summaryCurrency === 'USD'
                ? '환율 미조회'
                : '시세 미조회'
              : summaryMoney(combinedSummary.evaluatedValue)}
          </strong>
        </span>
        <span>
          통합 평가손익 ({summaryCurrency === 'USD' ? '$' : '원'})
          <strong
            className={
              combinedSummary.unrealizedPnL === null || combinedSummary.unrealizedPnL >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {!isSummaryCurrencyAvailable || combinedSummary.unrealizedPnL === null
              ? summaryCurrency === 'USD'
                ? '환율 미조회'
                : '시세 미조회'
              : summaryMoney(combinedSummary.unrealizedPnL)}
          </strong>
        </span>
        <span>
          통합 평가 수익률
          <strong
            className={
              combinedSummary.profitRate === null || combinedSummary.profitRate >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {combinedSummary.profitRate === null
              ? '시세 미조회'
              : formatRate(combinedSummary.profitRate)}
          </strong>
        </span>
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
          <button type="button" onClick={() => openTransaction({ type: 'BUY' })}>
            첫 매수 기록 추가
          </button>
        </div>
      ) : (
        <>
          <div className={styles.actions}>
            <span>
              KRW와 USD는 통화별로 따로 표시합니다. 현재가는 보유 종목 기준으로 갱신합니다.
            </span>
            <div className={styles.actionButtons}>
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
                                <small>{holding.ticker}</small>
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
                              onClick={() =>
                                openTransaction({
                                  type: 'BUY',
                                  ticker: holding.ticker,
                                  name: holding.name,
                                  market: holding.market,
                                  price: currentPrice,
                                })
                              }
                            >
                              기록 추가
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
    </section>
  );
}
