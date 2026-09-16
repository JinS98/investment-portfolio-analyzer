import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { searchStocks } from '../../services/tossApi';
import type { Holding, HoldingHistoryInput, MarketType, Portfolio } from '../../types';
import type { StockSearchItem } from '../../types/market';
import { validateBuyInput, validateSellInput } from '../../utils/calculator';
import { formatNumericInput, parseNumericInput } from '../../utils/numericInput';
import { loadRecentStockSearches, saveRecentStockSearch } from '../../utils/recentStockSearches';
import styles from './TransactionModal.module.scss';

export type TransactionModalType = 'BUY' | 'SELL';

export interface TransactionModalPreset {
  ticker?: string;
  name?: string;
  market?: MarketType;
  price?: number;
}

interface TransactionModalProps {
  isOpen: boolean;
  type: TransactionModalType;
  portfolio: Portfolio | null;
  holdings: Holding[];
  preset?: TransactionModalPreset;
  isSaving?: boolean;
  onTypeChange: (type: TransactionModalType) => void;
  onClose: () => void;
  onSubmit: (input: HoldingHistoryInput) => Promise<void>;
}

type Draft = {
  ticker: string;
  name: string;
  market: MarketType;
  price: string;
  quantity: string;
  date: string;
  fee: string;
  tax: string;
};

const koreaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const initialDraft = (preset?: TransactionModalPreset): Draft => ({
  ticker: preset?.ticker ?? '',
  name: preset?.name ?? '',
  market: preset?.market ?? 'KR',
  price: preset?.price === undefined ? '' : formatNumericInput(String(preset.price)),
  quantity: '',
  date: koreaDate(),
  fee: '0',
  tax: '0',
});

const DEFAULT_FEE_RATE = 0.00015;
const DEFAULT_KR_SELL_TAX_RATE = 0.002;

const estimateCosts = (
  grossAmount: number | null,
  market: MarketType,
  type: TransactionModalType,
) => {
  if (grossAmount === null) return { fee: 0, tax: 0 };
  return {
    fee: grossAmount * DEFAULT_FEE_RATE,
    tax: type === 'SELL' && market === 'KR' ? grossAmount * DEFAULT_KR_SELL_TAX_RATE : 0,
  };
};

const money = (value: number, market: MarketType) => {
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: market === 'US' ? 2 : 0,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  });
  return market === 'KR' ? `${formatted}원` : `$${formatted}`;
};

const marketOf = (market: string): MarketType =>
  ['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(market) ? 'KR' : 'US';

export function TransactionModal({ isOpen, type, preset, ...props }: TransactionModalProps) {
  if (!isOpen) return null;
  const resetKey = `${type}:${preset?.market ?? 'KR'}:${preset?.ticker ?? ''}:${preset?.price ?? ''}`;
  return (
    <TransactionModalDialog key={resetKey} isOpen={isOpen} type={type} preset={preset} {...props} />
  );
}

function TransactionModalDialog({
  isOpen,
  type,
  portfolio,
  holdings,
  preset,
  isSaving = false,
  onTypeChange,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(preset));
  const [error, setError] = useState('');
  const [isFeeCustomized, setIsFeeCustomized] = useState(false);
  const [isTaxCustomized, setIsTaxCustomized] = useState(false);
  const [matches, setMatches] = useState<StockSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<StockSearchItem[]>(() =>
    loadRecentStockSearches(),
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  useEffect(() => {
    if (!isOpen || type !== 'BUY' || preset?.ticker || draft.ticker || !searchQuery.trim()) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      searchStocks(searchQuery.trim(), controller.signal)
        .then((items) => {
          if (active) setMatches(items);
        })
        .catch(() => {
          if (active) setMatches([]);
        })
        .finally(() => {
          if (active) {
            setIsSearching(false);
            setHasSearched(true);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.ticker, isOpen, preset?.ticker, searchQuery, type]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const selectedHolding = useMemo(
    () =>
      holdings.find(
        (holding) => holding.ticker === draft.ticker && holding.market === draft.market,
      ),
    [draft.market, draft.ticker, holdings],
  );
  const price = parseNumericInput(draft.price);
  const quantity = parseNumericInput(draft.quantity);
  const fee = draft.fee.trim() ? parseNumericInput(draft.fee) : 0;
  const tax = draft.tax.trim() ? parseNumericInput(draft.tax) : 0;
  const grossAmount = Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity : null;
  const expectedPnL =
    type === 'SELL' &&
    selectedHolding &&
    grossAmount !== null &&
    Number.isFinite(fee) &&
    Number.isFinite(tax)
      ? (price - selectedHolding.averagePrice) * quantity - fee - tax
      : null;

  const setTradeNumeric = (field: 'price' | 'quantity', value: string) => {
    setDraft((current) => {
      const next = { ...current, [field]: formatNumericInput(value) };
      const nextPrice = parseNumericInput(next.price);
      const nextQuantity = parseNumericInput(next.quantity);
      const nextGross =
        Number.isFinite(nextPrice) && Number.isFinite(nextQuantity)
          ? nextPrice * nextQuantity
          : null;
      const nextCosts = estimateCosts(nextGross, next.market, type);
      return {
        ...next,
        ...(isFeeCustomized ? {} : { fee: formatNumericInput(String(nextCosts.fee)) }),
        ...(isTaxCustomized ? {} : { tax: formatNumericInput(String(nextCosts.tax)) }),
      };
    });
  };

  const setCost = (field: 'fee' | 'tax', value: string) => {
    if (field === 'fee') setIsFeeCustomized(true);
    else setIsTaxCustomized(true);
    setDraft((current) => ({ ...current, [field]: formatNumericInput(value) }));
  };

  const selectHolding = (value: string) => {
    const holding = holdings.find((item) => `${item.market}:${item.ticker}` === value);
    if (!holding) return;
    setDraft((current) => ({
      ...current,
      ticker: holding.ticker,
      name: holding.name ?? '',
      market: holding.market,
      ...(current.price ? {} : { price: formatNumericInput(String(holding.averagePrice)) }),
    }));
  };

  const selectSearchResult = (item: StockSearchItem) => {
    setDraft((current) => ({
      ...current,
      ticker: item.symbol,
      name: item.name,
      market: marketOf(item.market),
    }));
    setSearchQuery(`${item.name} (${item.symbol})`);
    setMatches([]);
    setHasSearched(false);
    setRecentSearches(saveRecentStockSearch(item));
  };

  const changeType = (nextType: TransactionModalType) => {
    if (nextType === type) return;
    setError('');
    onTypeChange(nextType);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!portfolio) {
      setError('로그인 후 포트폴리오를 불러와주세요.');
      return;
    }

    const input: HoldingHistoryInput = {
      portfolioId: portfolio.id,
      portfolioType: portfolio.type,
      ticker: draft.ticker.trim().toUpperCase(),
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      market: draft.market,
      type,
      price,
      quantity,
      fee,
      tax,
      date: draft.date,
    };

    try {
      if (type === 'BUY') validateBuyInput(input);
      else {
        validateSellInput(input);
        if (!selectedHolding) throw new Error('매도할 보유 종목을 선택해주세요.');
        if (quantity > selectedHolding.quantity) {
          throw new Error(
            `매도 수량은 현재 보유 수량 ${selectedHolding.quantity} 이하로 입력해주세요.`,
          );
        }
      }
      setError('');
      await onSubmit(input);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '거래 기록 저장에 실패했습니다.',
      );
    }
  };

  if (!isOpen) return null;

  const isPresetStock = Boolean(preset?.ticker && preset?.market);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && !isSaving && onClose()}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              {portfolio?.type === 'VIRTUAL' ? '가상 포트폴리오' : '실제 포트폴리오'}
            </p>
            <h2 id="transaction-modal-title">거래 기록 추가</h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSaving}
            aria-label="거래 기록 모달 닫기"
          >
            ×
          </button>
        </header>

        <div className={styles.typeTabs} role="tablist" aria-label="거래 구분">
          <button
            type="button"
            role="tab"
            aria-selected={type === 'BUY'}
            className={type === 'BUY' ? styles.activeBuy : undefined}
            onClick={() => changeType('BUY')}
            disabled={isSaving}
          >
            매수 기록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === 'SELL'}
            className={type === 'SELL' ? styles.activeSell : undefined}
            onClick={() => changeType('SELL')}
            disabled={isSaving || !holdings.length}
          >
            매도 기록
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          {type === 'SELL' && !isPresetStock ? (
            <label>
              보유 종목
              <select
                value={selectedHolding ? `${selectedHolding.market}:${selectedHolding.ticker}` : ''}
                onChange={(event) => selectHolding(event.target.value)}
                disabled={isSaving}
                required
              >
                <option value="">종목을 선택하세요</option>
                {holdings.map((holding) => (
                  <option
                    key={`${holding.market}:${holding.ticker}`}
                    value={`${holding.market}:${holding.ticker}`}
                  >
                    {holding.name ?? holding.ticker} ·{' '}
                    {holding.quantity.toLocaleString('ko-KR')}주
                  </option>
                ))}
              </select>
            </label>
          ) : !isPresetStock ? (
            <div className={styles.stockFields}>
              <label className={styles.searchField}>
                종목 검색
                <input
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setDraft((current) => ({
                      ...current,
                      ticker: '',
                      name: '',
                    }));
                    setMatches([]);
                    setHasSearched(false);
                  }}
                  placeholder="종목명 또는 티커를 입력하세요"
                  autoCapitalize="characters"
                  disabled={isSaving}
                  required
                />
                {!draft.ticker && !isSearching && !matches.length && searchQuery.trim() && hasSearched && (
                  <small className={styles.searchHint}>일치하는 종목이 없습니다.</small>
                )}
                {isSearching && <small className={styles.searchHint}>종목 검색 중…</small>}
                {isSearchFocused && !searchQuery.trim() && recentSearches.length > 0 && (
                  <ul className={styles.searchResults} aria-label="최근 검색 종목">
                    <li className={styles.searchResultsTitle}>최근 검색</li>
                    {recentSearches.map((item) => (
                      <li key={`recent-${item.market}-${item.symbol}`}>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSearchResult(item)}
                        >
                          <strong>{item.name}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {isSearchFocused && !!matches.length && (
                  <ul className={styles.searchResults} role="listbox">
                    {matches.map((item) => (
                      <li key={`${item.market}-${item.symbol}`} role="option">
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSearchResult(item)}
                        >
                          <strong>{item.name}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
            </div>
          ) : (
            <p className={styles.selectedStockInfo}>
              선택 종목: <strong>{draft.name || draft.ticker}</strong> ·{' '}
              {draft.market === 'KR' ? '국내 (KRW)' : '미국 (USD)'}
            </p>
          )}

          {type === 'SELL' && selectedHolding && (
            <p className={styles.holdingInfo}>
              현재 보유: <strong>{selectedHolding.quantity.toLocaleString('ko-KR')}주</strong> ·
              평단가 <strong>{money(selectedHolding.averagePrice, selectedHolding.market)}</strong>
            </p>
          )}

          <div className={styles.numericFields}>
            <label>
              거래 단가
              <input
                inputMode="decimal"
                value={draft.price}
                onChange={(event) => setTradeNumeric('price', event.target.value)}
                placeholder={draft.market === 'KR' ? '예: 72,000' : '예: 185.50'}
                disabled={isSaving}
                required
              />
            </label>
            <label>
              수량
              <input
                inputMode="decimal"
                value={draft.quantity}
                onChange={(event) => setTradeNumeric('quantity', event.target.value)}
                placeholder="예: 10"
                disabled={isSaving}
                required
              />
            </label>
            <label>
              거래일
              <input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, date: event.target.value }))
                }
                disabled={isSaving}
                required
              />
            </label>
          </div>

          <details className={styles.costDetails}>
            <summary>수수료·세금 입력 (기본 추정값 적용)</summary>
            <div className={styles.numericFields}>
              <label>
                수수료
                <input
                  inputMode="decimal"
                  value={draft.fee}
                  onChange={(event) => setCost('fee', event.target.value)}
                  placeholder="0"
                  disabled={isSaving}
                />
              </label>
              <label>
                세금
                <input
                  inputMode="decimal"
                  value={draft.tax}
                  onChange={(event) => setCost('tax', event.target.value)}
                  placeholder="0"
                  disabled={isSaving}
                />
              </label>
            </div>
          </details>

          <p className={styles.costGuide}>
            기본값: 수수료는 거래금액의 0.015%, 국내 매도 세금은 0.2%로 추정합니다. 실제 비용에 맞게
            수정하세요.
          </p>

          <div className={styles.preview}>
            <span>예상 거래금액</span>
            <strong>{grossAmount === null ? '입력 필요' : money(grossAmount, draft.market)}</strong>
            {type === 'SELL' && (
              <>
                <span>예상 실현손익</span>
                <strong
                  className={
                    expectedPnL === null || expectedPnL >= 0 ? styles.positive : styles.negative
                  }
                >
                  {expectedPnL === null ? '입력 필요' : money(expectedPnL, draft.market)}
                </strong>
              </>
            )}
          </div>

          <p className={styles.helpText}>
            이 기록은 포트폴리오에만 저장되며 실제 증권 주문을 실행하지 않습니다.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSaving}
            >
              취소
            </button>
            <button
              type="submit"
              className={type === 'BUY' ? styles.submitBuy : styles.submitSell}
              disabled={isSaving}
            >
              {isSaving ? '저장 중…' : type === 'BUY' ? '매수 기록 저장' : '매도 기록 저장'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
