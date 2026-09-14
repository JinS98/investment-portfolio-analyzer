import type { PortfolioHistory } from '../../types';
import { calcMonthlyComparison } from '../../utils/monthlyAnalysis';
import styles from './MonthlyComparisonPanel.module.scss';

interface MonthlyComparisonPanelProps {
  history: PortfolioHistory[];
}

const money = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;

export function MonthlyComparisonPanel({ history }: MonthlyComparisonPanelProps) {
  const comparison = calcMonthlyComparison(history);
  const latest = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <section className={styles.section} aria-labelledby="monthly-comparison-title">
      <div className={styles.header}>
        <div>
          <h2 id="monthly-comparison-title">월간 비교</h2>
          <p>지난달 마지막 저장 기록과 최신 평가금액을 비교합니다.</p>
        </div>
        {comparison && (
          <strong className={comparison.changeAmount >= 0 ? styles.positive : styles.negative}>
            {comparison.changeAmount >= 0 ? '+' : ''}
            {comparison.changeRate.toFixed(2)}%
          </strong>
        )}
      </div>

      {!latest && <p className={styles.empty}>저장된 평가금액 이력이 없습니다.</p>}
      {latest && !comparison && (
        <div className={styles.empty}>
          <strong>지난달 기록이 필요합니다.</strong>
          <span>
            현재 저장된 최신 기록은 {latest.date}입니다. 지난달 말 기록이 쌓이면 월간 비교를
            표시합니다.
          </span>
        </div>
      )}
      {comparison && (
        <div className={styles.content}>
          <div className={styles.value}>
            <span>{comparison.previousMonth.replace('-', '.')} 말</span>
            <strong>{money(comparison.previousMonthEnd.totalValue)}</strong>
            <small>{comparison.previousMonthEnd.date} 저장</small>
          </div>
          <div className={styles.arrow} aria-hidden="true">
            →
          </div>
          <div className={styles.value}>
            <span>현재</span>
            <strong>{money(comparison.current.totalValue)}</strong>
            <small>{comparison.current.date} 저장</small>
          </div>
          <div className={styles.change}>
            <span>월간 증감</span>
            <strong className={comparison.changeAmount >= 0 ? styles.positive : styles.negative}>
              {comparison.changeAmount >= 0 ? '+' : ''}
              {money(comparison.changeAmount)}
            </strong>
          </div>
        </div>
      )}
    </section>
  );
}
