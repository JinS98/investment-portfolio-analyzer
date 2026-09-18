import { useMemo, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useDisplayCurrencyStore } from '../../store/displayCurrencyStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { HoldingHistory, PriceMap, RecurringInvestmentRule } from '../../types';
import {
  buildMonthlyPurchaseTrend,
  calculateInvestmentPerformance,
  type InvestmentPerformance,
} from '../../utils/recurringInvestmentPerformance';
import styles from './RecurringInvestmentPerformance.module.scss';

interface RecurringInvestmentPerformanceProps {
  rules: RecurringInvestmentRule[];
  histories: HoldingHistory[];
  prices: PriceMap;
  standalone?: boolean;
  titleId?: string;
}

const money = (value: number, market: 'KR' | 'US') =>
  market === 'KR'
    ? `${Math.round(value).toLocaleString('ko-KR')}원`
    : `$${value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rate = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (value: number | null) =>
  value === null ? '' : value >= 0 ? styles.positive : styles.negative;

function PerformanceCells({
  performance,
  market,
  historicalFxMissing = false,
}: {
  performance: InvestmentPerformance;
  market: 'KR' | 'US';
  historicalFxMissing?: boolean;
}) {
  return (
    <>
      <span>{historicalFxMissing ? '환율 없음' : money(performance.investedAmount, market)}</span>
      <span>
        {performance.evaluatedAmount === null
          ? '현재가 필요'
          : money(performance.evaluatedAmount, market)}
      </span>
      <span className={tone(performance.profitAmount)}>
        {historicalFxMissing
          ? '환율 없음'
          : performance.profitAmount === null
            ? '-'
            : money(performance.profitAmount, market)}
      </span>
      <span className={tone(performance.profitRate)}>
        {historicalFxMissing
          ? '-'
          : performance.profitRate === null
            ? '-'
            : rate(performance.profitRate)}
      </span>
    </>
  );
}

export function RecurringInvestmentPerformance({
  rules,
  histories,
  prices,
  standalone = false,
  titleId,
}: RecurringInvestmentPerformanceProps) {
  const [selectedRuleId, setSelectedRuleId] = useState(rules[0]?.id ?? '');
  const [isRulePickerOpen, setIsRulePickerOpen] = useState(false);
  const displayCurrency = useDisplayCurrencyStore((state) => state.displayCurrency);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const currentExchangeRate = exchangeRate?.rate;

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? rules[0];
  const analysis = useMemo(() => {
    if (!selectedRule) return null;
    const recurringHistories = histories.filter(
      (history) => history.source === 'RECURRING' && history.recurringRuleId === selectedRule.id,
    );
    const manualHistories = histories.filter(
      (history) =>
        history.ticker === selectedRule.ticker &&
        history.market === selectedRule.market &&
        history.source !== 'RECURRING',
    );
    const convertHistory = (history: HoldingHistory) => {
      if (selectedRule.market !== 'US' || displayCurrency === 'USD') return history;
      const fx = history.exchangeRate ?? 1;
      return {
        ...history,
        price: history.price * fx,
        grossAmount: history.grossAmount * fx,
        fee: history.fee * fx,
        tax: history.tax * fx,
        realizedPnL: history.realizedPnL * fx,
      };
    };
    const recurringFxMissing =
      displayCurrency === 'KRW' &&
      selectedRule.market === 'US' &&
      recurringHistories.some((history) => !history.exchangeRate);
    const manualFxMissing =
      displayCurrency === 'KRW' &&
      selectedRule.market === 'US' &&
      manualHistories.some((history) => !history.exchangeRate);
    const nativeCurrentPrice = prices[selectedRule.ticker];
    const currentPrice =
      selectedRule.market === 'US' && displayCurrency === 'KRW'
        ? currentExchangeRate && nativeCurrentPrice
          ? nativeCurrentPrice * currentExchangeRate
          : undefined
        : nativeCurrentPrice;
    return {
      recurring: calculateInvestmentPerformance(
        recurringHistories.map(convertHistory),
        currentPrice,
      ),
      manual: calculateInvestmentPerformance(manualHistories.map(convertHistory), currentPrice),
      monthly: buildMonthlyPurchaseTrend(recurringHistories.map(convertHistory)).slice(-6),
      recurringFxMissing,
      manualFxMissing,
    };
  }, [currentExchangeRate, displayCurrency, histories, prices, selectedRule]);

  if (!selectedRule || !analysis) return null;
  const displayMarket =
    selectedRule.market === 'US' && displayCurrency === 'KRW' ? 'KR' : selectedRule.market;
  const maxMonthlyAmount = Math.max(...analysis.monthly.map((item) => item.amount), 1);

  return (
    <div className={`${styles.analysis} ${standalone ? styles.standalone : ''}`}>
      <div className={styles.header}>
        <div>
          <h4 id={titleId}>적립식 투자 성과</h4>
          <p>자동매수 성과와 같은 종목의 직접 입력 거래를 비교합니다.</p>
        </div>
        <div className={styles.rulePicker}>
          <button
            type="button"
            className={styles.rulePickerTrigger}
            onClick={() => setIsRulePickerOpen((current) => !current)}
            onBlur={() => window.setTimeout(() => setIsRulePickerOpen(false), 120)}
            aria-haspopup="listbox"
            aria-expanded={isRulePickerOpen}
            aria-label="분석할 적립식 규칙"
          >
            <span>{selectedRule.name ?? selectedRule.ticker}</span>
            <FiChevronDown aria-hidden="true" />
          </button>
          {isRulePickerOpen ? (
            <ul className={styles.rulePickerOptions} role="listbox" aria-label="분석할 적립식 규칙">
              {rules.map((rule) => (
                <li key={rule.id} role="option" aria-selected={selectedRule.id === rule.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedRuleId(rule.id);
                      setIsRulePickerOpen(false);
                    }}
                  >
                    {rule.name ?? rule.ticker}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className={styles.summary}>
        <div>
          <small>누적 투자금</small>
          <strong>
            {analysis.recurringFxMissing
              ? '환율 없음'
              : money(analysis.recurring.investedAmount, displayMarket)}
          </strong>
        </div>
        <div>
          <small>현재 평가금액</small>
          <strong>
            {analysis.recurring.evaluatedAmount === null
              ? '현재가 또는 환율 필요'
              : money(analysis.recurring.evaluatedAmount, displayMarket)}
          </strong>
        </div>
        <div>
          <small>평가손익</small>
          <strong className={tone(analysis.recurring.profitAmount)}>
            {analysis.recurringFxMissing
              ? '환율 없음'
              : analysis.recurring.profitAmount === null
                ? '-'
                : money(analysis.recurring.profitAmount, displayMarket)}
          </strong>
        </div>
        <div>
          <small>수익률</small>
          <strong className={tone(analysis.recurring.profitRate)}>
            {analysis.recurringFxMissing
              ? '-'
              : analysis.recurring.profitRate === null
                ? '-'
                : rate(analysis.recurring.profitRate)}
          </strong>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.comparison}>
          <h5>매수 방식 비교</h5>
          <div className={styles.comparisonHead}>
            <span>구분</span>
            <span>투자금</span>
            <span>평가금액</span>
            <span>손익</span>
            <span>수익률</span>
          </div>
          <div className={styles.comparisonRow}>
            <b>적립식 자동</b>
            <PerformanceCells
              performance={analysis.recurring}
              market={displayMarket}
              historicalFxMissing={analysis.recurringFxMissing}
            />
          </div>
          <div className={styles.comparisonRow}>
            <b>직접 입력</b>
            <PerformanceCells
              performance={analysis.manual}
              market={displayMarket}
              historicalFxMissing={analysis.manualFxMissing}
            />
          </div>
        </div>

        <div className={styles.trend}>
          <h5>최근 월별 매수</h5>
          {analysis.monthly.length ? (
            analysis.monthly.map((item) => (
              <div className={styles.trendRow} key={item.month}>
                <div>
                  <b>{item.month.replace('-', '. ')}</b>
                  <span>
                    {item.quantity.toLocaleString('ko-KR')}주 · {item.count}회
                  </span>
                </div>
                <div className={styles.bar}>
                  <i style={{ width: `${Math.max(5, (item.amount / maxMonthlyAmount) * 100)}%` }} />
                </div>
                <strong>
                  {analysis.recurringFxMissing ? '환율 없음' : money(item.amount, displayMarket)}
                </strong>
              </div>
            ))
          ) : (
            <p className={styles.empty}>아직 반영된 자동매수 내역이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
