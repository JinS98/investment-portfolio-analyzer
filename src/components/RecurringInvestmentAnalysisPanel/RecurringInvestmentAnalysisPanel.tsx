import { useEffect, useState } from 'react';
import { loadRecurringInvestmentRules } from '../../services/portfolioLedgerService';
import { useAuthStore } from '../../store/authStore';
import type { HoldingHistory, PriceMap, RecurringInvestmentRule } from '../../types';
import { RecurringInvestmentPerformance } from '../RecurringInvestmentPerformance/RecurringInvestmentPerformance';
import styles from './RecurringInvestmentAnalysisPanel.module.scss';

interface RecurringInvestmentAnalysisPanelProps {
  portfolioId?: string;
  histories: HoldingHistory[];
  prices: PriceMap;
}

export function RecurringInvestmentAnalysisPanel({
  portfolioId,
  histories,
  prices,
}: RecurringInvestmentAnalysisPanelProps) {
  const userId = useAuthStore((state) => state.user?.uid);
  const [ruleData, setRuleData] = useState<{
    portfolioId?: string;
    rules: RecurringInvestmentRule[];
    error: string;
  }>({ rules: [], error: '' });

  useEffect(() => {
    if (!userId || !portfolioId) return;

    let active = true;
    void loadRecurringInvestmentRules(userId, portfolioId)
      .then((loadedRules) => {
        if (active) setRuleData({ portfolioId, rules: loadedRules, error: '' });
      })
      .catch((cause) => {
        if (active) {
          setRuleData({
            portfolioId,
            rules: [],
            error: cause instanceof Error ? cause.message : '적립식 투자 규칙을 불러오지 못했습니다.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [portfolioId, userId]);

  const isLoading = Boolean(userId && portfolioId && ruleData.portfolioId !== portfolioId);
  const rules = ruleData.portfolioId === portfolioId ? ruleData.rules : [];
  const error = ruleData.portfolioId === portfolioId ? ruleData.error : '';

  return (
    <section className={styles.panel} aria-labelledby="recurring-analysis-title">
      {isLoading ? <p className={styles.status}>적립식 투자 성과를 불러오는 중입니다.</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!isLoading && !error && !rules.length ? (
        <div className={styles.empty}>
          <h2 id="recurring-analysis-title">적립식 투자 성과</h2>
          <p>등록된 적립식 투자 규칙이 없습니다.</p>
          <a href="#dashboard">대시보드에서 규칙 추가</a>
        </div>
      ) : null}
      {!isLoading && !error && rules.length ? (
        <RecurringInvestmentPerformance
          rules={rules}
          histories={histories}
          prices={prices}
          standalone
          titleId="recurring-analysis-title"
        />
      ) : null}
    </section>
  );
}
