import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FiX } from 'react-icons/fi';
import {
  addRecurringInvestmentRule,
  deleteRecurringInvestmentRule,
  updateRecurringInvestmentRule,
} from '../../services/portfolioLedgerService';
import { searchStocks } from '../../services/tossApi';
import type {
  Portfolio,
  RecurringInvestmentFrequency,
  RecurringInvestmentRule,
} from '../../types';
import type { StockSearchItem } from '../../types/market';
import styles from './RecurringInvestmentModal.module.scss';

type Draft = {
  ticker: string;
  name: string;
  market: 'KR' | 'US';
  quantity: string;
  frequency: RecurringInvestmentFrequency;
  weeklyDay: string;
  monthlyDay: string;
  startDate: string;
};

interface RecurringInvestmentModalProps {
  isOpen: boolean;
  userId: string;
  portfolio: Portfolio;
  rule?: RecurringInvestmentRule;
  onClose: () => void;
  onSaved: (rule: RecurringInvestmentRule) => void;
  onDeleted: (ruleId: string) => void;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const marketOf = (market: string): 'KR' | 'US' =>
  ['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(market) ? 'KR' : 'US';
const initialDraft = (rule?: RecurringInvestmentRule): Draft => ({
  ticker: rule?.ticker ?? '',
  name: rule?.name ?? '',
  market: rule?.market ?? 'KR',
  quantity: String(rule?.quantity ?? 10),
  frequency: rule?.frequency ?? 'MONTHLY',
  weeklyDay: String(rule?.weeklyDay ?? 1),
  monthlyDay: String(rule?.monthlyDay ?? 1),
  startDate: rule?.startDate ?? today(),
});

export function RecurringInvestmentModal({
  isOpen,
  userId,
  portfolio,
  rule,
  onClose,
  onSaved,
  onDeleted,
}: RecurringInvestmentModalProps) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(rule));
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<StockSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || draft.ticker || !query.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      searchStocks(query.trim(), controller.signal)
        .then(setMatches)
        .catch(() => setMatches([]))
        .finally(() => setIsSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.ticker, isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const selectStock = (stock: StockSearchItem) => {
    setDraft((current) => ({
      ...current,
      ticker: stock.symbol,
      name: stock.name,
      market: marketOf(stock.market),
    }));
    setQuery(stock.name);
    setMatches([]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    if (!draft.ticker) {
      setError('종목을 선택해 주세요.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('수량은 0보다 큰 값으로 입력해 주세요.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const input = {
        portfolioId: portfolio.id,
        portfolioType: portfolio.type,
        ticker: draft.ticker,
        name: draft.name,
        market: draft.market,
        quantity,
        frequency: draft.frequency,
        ...(draft.frequency === 'WEEKLY'
          ? { weeklyDay: Number(draft.weeklyDay) }
          : { monthlyDay: Number(draft.monthlyDay) }),
        startDate: draft.startDate,
      };
      const savedRule = rule
        ? await updateRecurringInvestmentRule(userId, rule.id, input)
        : await addRecurringInvestmentRule(userId, input);
      onSaved(savedRule);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '적립식 투자 규칙을 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeRule = async () => {
    if (!rule || isSaving || !window.confirm(`${draft.name || draft.ticker} 적립식 투자 규칙을 삭제할까요?`)) return;
    setIsSaving(true);
    setError('');
    try {
      await deleteRecurringInvestmentRule(userId, portfolio.id, rule.id);
      onDeleted(rule.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '적립식 투자 규칙을 삭제하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="recurring-investment-title">
        <header>
          <div>
            <p>{portfolio.type === 'REAL' ? '실제 포트폴리오' : '가상 포트폴리오'}</p>
            <h2 id="recurring-investment-title">{rule ? '적립식 투자 수정' : '적립식 투자 설정'}</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={isSaving} aria-label="닫기">
            <FiX />
          </button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          {rule ? (
            <div className={styles.stockReadOnly}>
              <span>종목</span>
              <strong>{draft.name || draft.ticker}</strong>
            </div>
          ) : (
          <label className={styles.searchField}>
            종목 검색
            <input
              value={query}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={(event) => {
                setQuery(event.target.value);
                setDraft((current) => ({ ...current, ticker: '', name: '' }));
                setMatches([]);
              }}
              placeholder="종목명 또는 코드를 입력하세요"
              disabled={isSaving}
              required
            />
            {isFocused && !draft.ticker && (isSearching || matches.length > 0) ? (
              <ul className={styles.results}>
                {isSearching ? <li>검색 중...</li> : null}
                {matches.map((stock) => (
                  <li key={`${stock.market}-${stock.symbol}`}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectStock(stock)}>
                      {stock.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          )}
          <div className={styles.fields}>
            <label>
              매수 수량
              <input inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} disabled={isSaving} required />
            </label>
            <label>
              시작일
              <input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} disabled={isSaving} required />
            </label>
          </div>
          <fieldset>
            <legend>매수 주기</legend>
            <div className={styles.frequencyButtons}>
              <button type="button" className={draft.frequency === 'WEEKLY' ? styles.active : undefined} onClick={() => setDraft((current) => ({ ...current, frequency: 'WEEKLY' }))}>매주</button>
              <button type="button" className={draft.frequency === 'MONTHLY' ? styles.active : undefined} onClick={() => setDraft((current) => ({ ...current, frequency: 'MONTHLY' }))}>매월</button>
            </div>
            {draft.frequency === 'WEEKLY' ? (
              <select value={draft.weeklyDay} onChange={(event) => setDraft((current) => ({ ...current, weeklyDay: event.target.value }))} disabled={isSaving}>
                {['월요일', '화요일', '수요일', '목요일', '금요일'].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
              </select>
            ) : (
              <select value={draft.monthlyDay} onChange={(event) => setDraft((current) => ({ ...current, monthlyDay: event.target.value }))} disabled={isSaving}>
                {Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>매월 {index + 1}일</option>)}
              </select>
            )}
          </fieldset>
          <p className={styles.guide}>주말·휴장일 또는 해당 일이 없는 달은 다음 거래일에 실행합니다. 모의 포트폴리오는 거래일 종가를 사용하고, 실제 포트폴리오는 토스 체결가를 확인한 뒤 확정합니다.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <footer>
            {rule ? (
              <button type="button" className={styles.deleteButton} onClick={() => void removeRule()} disabled={isSaving}>
                삭제
              </button>
            ) : null}
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>취소</button>
            <button type="submit" disabled={isSaving}>{isSaving ? '저장 중...' : rule ? '수정 저장' : '규칙 저장'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
