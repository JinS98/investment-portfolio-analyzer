import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExchangeRate, StockItem, TossCandleItem } from '../types';
import { calcPortfolioHistory } from '../utils/portfolioHistory';
import styles from './PortfolioPerformanceChart.module.scss';

interface PortfolioPerformanceChartProps {
  portfolio: StockItem[];
  historicalData: Record<string, TossCandleItem[]>;
  exchangeRate: ExchangeRate | null;
  isLoading: boolean;
}

const formatDate = (date: string) => date.slice(5).replace('-', '/');

export function PortfolioPerformanceChart({ portfolio, historicalData, exchangeRate, isLoading }: PortfolioPerformanceChartProps) {
  const data = calcPortfolioHistory(portfolio, historicalData, exchangeRate);
  const latest = data.at(-1);
  const lowest = data.reduce((min, point) => point.returnRate < min ? point.returnRate : min, 0);

  return (
    <section className={styles.section} aria-labelledby="performance-title">
      <div className={styles.header}>
        <div>
          <h2 id="performance-title">포트폴리오 추이</h2>
          <p>보유 수량과 일별 종가를 기준으로 한 원화 평가금액 추이입니다.</p>
        </div>
        {latest && <strong className={latest.returnRate >= 0 ? styles.positive : styles.negative}>{latest.returnRate >= 0 ? '+' : ''}{latest.returnRate.toFixed(2)}%</strong>}
      </div>

      {isLoading && <p className={styles.status}>일봉 데이터를 불러오는 중입니다...</p>}
      {!isLoading && !data.length && <p className={styles.status}>현재가를 새로고침하면 최근 일봉 기준 추이를 표시합니다.</p>}
      {!isLoading && data.length > 0 && (
        <>
          <div className={styles.metrics}>
            <span>시작 평가금액 <strong>{data[0].value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원</strong></span>
            <span>현재 평가금액 <strong>{latest!.value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원</strong></span>
            <span>기간 중 최저 수익률 <strong className={styles.negative}>{lowest.toFixed(2)}%</strong></span>
          </div>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
                <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={32} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `${Number(value).toLocaleString('ko-KR', { notation: 'compact' })}`} width={72} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip labelFormatter={(label) => `${label}`} formatter={(value) => [`${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`, '평가금액']} />
                <Line type="monotone" dataKey="value" stroke="#4f9cff" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
