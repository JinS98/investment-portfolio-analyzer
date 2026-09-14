import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioHistory } from '../../types';
import { calcHistorySummary, selectHistoryRange } from '../../utils/historyAnalysis';
import type { HistoryRange } from '../../utils/historyAnalysis';
import styles from './PortfolioHistoryPanel.module.scss';

interface PortfolioHistoryPanelProps {
  history: PortfolioHistory[];
}

const ranges: Array<{ value: HistoryRange; label: string }> = [
  { value: '1M', label: '1개월' },
  { value: '3M', label: '3개월' },
  { value: 'ALL', label: '전체' },
];
const money = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;

export function PortfolioHistoryPanel({ history }: PortfolioHistoryPanelProps) {
  const [range, setRange] = useState<HistoryRange>('1M');
  const data = useMemo(() => selectHistoryRange(history, range), [history, range]);
  const summary = useMemo(() => calcHistorySummary(data), [data]);

  return (
    <section className={styles.section} aria-labelledby="saved-history-title">
      <div className={styles.header}>
        <div>
          <h2 id="saved-history-title">실제 평가금액 이력</h2>
          <p>새로고침 시 저장된 일별 평가금액을 기준으로 표시합니다.</p>
        </div>
        <div className={styles.rangeButtons} role="group" aria-label="이력 조회 기간">
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              className={range === item.value ? styles.active : undefined}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!summary && (
        <p className={styles.empty}>
          저장된 평가금액 이력이 없습니다. 현재가를 새로고침하면 오늘 기록이 저장됩니다.
        </p>
      )}
      {summary && (
        <>
          <div className={styles.summary}>
            <div>
              <span>기간 증감</span>
              <strong className={summary.changeAmount >= 0 ? styles.positive : styles.negative}>
                {summary.changeAmount >= 0 ? '+' : ''}
                {money(summary.changeAmount)}
              </strong>
            </div>
            <div>
              <span>기간 수익률</span>
              <strong className={summary.changeRate >= 0 ? styles.positive : styles.negative}>
                {summary.changeRate >= 0 ? '+' : ''}
                {summary.changeRate.toFixed(2)}%
              </strong>
            </div>
            <div>
              <span>최고 평가금액</span>
              <strong>{money(summary.highestValue)}</strong>
            </div>
            <div>
              <span>최저 평가금액</span>
              <strong>{money(summary.lowestValue)}</strong>
            </div>
          </div>
          {data.length < 2 ? (
            <p className={styles.empty}>
              차트는 서로 다른 날짜의 기록이 2개 이상 쌓이면 표시됩니다.
            </p>
          ) : (
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => date.slice(5).replace('-', '/')}
                    minTickGap={32}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis
                    dataKey="totalValue"
                    tickFormatter={(value) =>
                      Number(value).toLocaleString('ko-KR', { notation: 'compact' })
                    }
                    width={72}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip
                    labelFormatter={(date) => `${date}`}
                    formatter={(value) => [money(Number(value)), '평가금액']}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalValue"
                    stroke="#3fb950"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  );
}
