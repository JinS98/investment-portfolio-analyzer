import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ExchangeRate,
  HoldingHistory,
  PortfolioHistory,
  StockItem,
  TossCandleItem,
} from '../../types';
import {
  fetchMarketIndicatorCandles,
  fetchUsMarketIndices,
  type UsIndexRange,
} from '../../services/tossApi';
import {
  calculateMaxDrawdown,
  calculatePerformanceMetrics,
  calculateTimeWeightedPerformance,
  commonStartDate,
  normalizePerformance,
  selectPerformanceRange,
  type PerformanceRange,
  type ReturnPoint,
  type ValuePoint,
} from '../../utils/investmentPerformanceAnalysis';
import styles from './PortfolioPerformanceChart.module.scss';

interface PortfolioPerformanceChartProps {
  portfolio: StockItem[];
  historicalData: Record<string, TossCandleItem[]>;
  portfolioHistory: PortfolioHistory[];
  holdingHistories: HoldingHistory[];
  exchangeRate: ExchangeRate | null;
  isLoading: boolean;
}

interface ChartPoint {
  date: string;
  portfolio?: number;
  kospi?: number;
  sp500?: number;
}
const ranges: Array<{ value: PerformanceRange; label: string }> = [
  { value: '1M', label: '1개월' },
  { value: '3M', label: '3개월' },
  { value: '6M', label: '6개월' },
  { value: 'ALL', label: '전체' },
];
const kospiCounts: Record<PerformanceRange, number> = { '1M': 35, '3M': 100, '6M': 190, ALL: 200 };
const usRanges: Record<PerformanceRange, UsIndexRange> = {
  '1M': '1mo',
  '3M': '3mo',
  '6M': '6mo',
  ALL: 'max',
};
const formatDate = (date: string) => date.slice(5).replace('-', '/');
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

function mergeSeries(
  portfolio: ReturnPoint[],
  kospi: ReturnPoint[],
  sp500: ReturnPoint[],
): ChartPoint[] {
  const maps = [portfolio, kospi, sp500].map(
    (series) => new Map(series.map((point) => [point.date, point.returnRate])),
  );
  const dates = [...new Set([...portfolio, ...kospi, ...sp500].map((point) => point.date))].sort();
  const latest: Array<number | undefined> = [undefined, undefined, undefined];
  return dates.map((date) => {
    maps.forEach((series, index) => {
      if (series.has(date)) latest[index] = series.get(date);
    });
    return { date, portfolio: latest[0], kospi: latest[1], sp500: latest[2] };
  });
}

export function PortfolioPerformanceChart({
  portfolioHistory,
  holdingHistories,
  isLoading,
}: PortfolioPerformanceChartProps) {
  const [range, setRange] = useState<PerformanceRange>('3M');
  const [benchmarkData, setBenchmarkData] = useState<{
    range?: PerformanceRange;
    kospi: ValuePoint[];
    sp500: ValuePoint[];
    error: string;
  }>({ kospi: [], sp500: [], error: '' });

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetchMarketIndicatorCandles('KOSPI', kospiCounts[range]),
      fetchUsMarketIndices(usRanges[range]),
    ]).then(([kospiResult, usResult]) => {
      if (!active) return;
      const kospi =
        kospiResult.status === 'fulfilled'
          ? kospiResult.value.map((point) => ({
              date: point.timestamp.slice(0, 10),
              value: point.closePrice,
            }))
          : [];
      const sp500 =
        usResult.status === 'fulfilled'
          ? (usResult.value.find((item) => item.symbol === 'SP500')?.candles ?? []).map(
              (point) => ({ date: point.timestamp.slice(0, 10), value: point.closePrice }),
            )
          : [];
      const failures = [kospiResult, usResult].filter(
        (result) => result.status === 'rejected',
      ).length;
      setBenchmarkData({
        range,
        kospi,
        sp500,
        error:
          failures === 2
            ? '기준 지수 데이터를 불러오지 못했습니다.'
            : failures
              ? '일부 기준 지수 데이터를 불러오지 못했습니다.'
              : '',
      });
    });
    return () => {
      active = false;
    };
  }, [range]);

  const result = useMemo(() => {
    const savedPoints = portfolioHistory.map((point) => ({
      date: point.date,
      value: point.totalValue,
    }));
    const usesSavedHistory = savedPoints.length >= 2;
    const source = usesSavedHistory ? savedPoints : [];
    let portfolioPoints = selectPerformanceRange(source, range);
    let kospiPoints =
      benchmarkData.range === range ? selectPerformanceRange(benchmarkData.kospi, range) : [];
    let sp500Points =
      benchmarkData.range === range ? selectPerformanceRange(benchmarkData.sp500, range) : [];
    const startDate = commonStartDate([portfolioPoints, kospiPoints, sp500Points]);
    if (startDate) {
      portfolioPoints = portfolioPoints.filter((point) => point.date >= startDate);
      kospiPoints = kospiPoints.filter((point) => point.date >= startDate);
      sp500Points = sp500Points.filter((point) => point.date >= startDate);
    }
    const portfolioReturns = usesSavedHistory
      ? calculateTimeWeightedPerformance(
          portfolioPoints,
          holdingHistories.flatMap((history) => {
            if (history.market === 'US' && !history.exchangeRate) return [];
            const multiplier = history.market === 'US' ? history.exchangeRate! : 1;
            const amount =
              history.type === 'BUY'
                ? history.grossAmount + history.fee + history.tax
                : -(history.grossAmount - history.fee - history.tax);
            return [{ date: history.date, amount: amount * multiplier }];
          }),
        )
      : normalizePerformance(portfolioPoints);
    const valueMetrics = calculatePerformanceMetrics(portfolioPoints);
    return {
      points: portfolioPoints,
      metrics: valueMetrics
        ? { ...valueMetrics, maxDrawdown: calculateMaxDrawdown(portfolioReturns) }
        : null,
      chart: mergeSeries(
        portfolioReturns,
        normalizePerformance(kospiPoints),
        normalizePerformance(sp500Points),
      ),
    };
  }, [benchmarkData, holdingHistories, portfolioHistory, range]);

  const latest = result.chart.at(-1)?.portfolio;
  const benchmarkLoading = benchmarkData.range !== range;
  return (
    <section className={styles.section} aria-labelledby="performance-title">
      <div className={styles.header}>
        <div>
          <h2 id="performance-title">포트폴리오 수익률 비교</h2>
          <p>같은 시작점을 기준으로 코스피·S&amp;P 500과 수익률을 비교합니다.</p>
        </div>
        {latest !== undefined ? (
          <strong className={latest >= 0 ? styles.positive : styles.negative}>
            {latest >= 0 ? '+' : ''}
            {latest.toFixed(2)}%
          </strong>
        ) : null}
      </div>
      <div className={styles.rangeTabs} role="group" aria-label="분석 기간">
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
      {(isLoading || benchmarkLoading) && (
        <p className={styles.status}>수익률 데이터를 불러오는 중입니다.</p>
      )}
      {!isLoading && !benchmarkLoading && !result.points.length && (
        <p className={styles.status}>평가 이력이 쌓이면 기간별 수익률을 비교할 수 있습니다.</p>
      )}
      {holdingHistories.some((history) => history.market === 'US' && !history.exchangeRate) ? (
        <p className={styles.warning}>
          환율 없음: 저장된 환율이 없는 과거 미국 거래는 차트 현금 흐름에서 제외했습니다.
        </p>
      ) : null}
      {!benchmarkLoading && benchmarkData.error ? (
        <p className={styles.warning}>{benchmarkData.error}</p>
      ) : null}
      {!isLoading && !benchmarkLoading && result.points.length > 0 && result.metrics ? (
        <>
          <div className={styles.metrics}>
            <div>
              <span>구간 최고 평가금액</span>
              <strong>{won(result.metrics.highestValue)}</strong>
            </div>
            <div>
              <span>구간 최저 평가금액</span>
              <strong>{won(result.metrics.lowestValue)}</strong>
            </div>
            <div>
              <span>최대 낙폭</span>
              <strong className={styles.negative}>{result.metrics.maxDrawdown.toFixed(2)}%</strong>
            </div>
          </div>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={result.chart} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  minTickGap={32}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                  width={52}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <Tooltip
                  labelFormatter={(label) => `${label}`}
                  formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="내 포트폴리오"
                  stroke="#e5484d"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="kospi"
                  name="코스피"
                  stroke="#64748b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sp500"
                  name="S&P 500"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </section>
  );
}
