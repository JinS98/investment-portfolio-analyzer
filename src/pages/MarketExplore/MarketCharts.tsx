import { useId, useMemo } from 'react';
import type { DisplayCurrency } from '../../store/displayCurrencyStore';
import type { Currency, MarketIndicatorCandle } from '../../types/market';
import { money } from './marketPresentation';
import styles from './MarketExplorePage.module.scss';

export function MiniLineChart({
  candles,
  currency,
  displayCurrency,
  exchangeRate,
}: {
  candles: MarketIndicatorCandle[];
  currency?: Currency;
  displayCurrency: DisplayCurrency;
  exchangeRate?: number | null;
}) {
  const gradientId = useId();
  const chart = useMemo(() => {
    if (candles.length < 2) return null;
    const width = 640;
    const height = 260;
    const padding = { top: 18, right: 12, bottom: 30, left: 12 };
    const values = candles.map((candle) => candle.closePrice);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(max * 0.01, 1);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = values.map((value, index) => ({
      x: padding.left + (index / (values.length - 1)) * innerWidth,
      y: padding.top + (1 - (value - min) / range) * innerHeight,
    }));
    const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const area = `M ${points[0].x} ${height - padding.bottom} L ${line.replaceAll(',', ' ')} L ${points.at(-1)!.x} ${height - padding.bottom} Z`;
    const changeRate = ((values.at(-1)! - values[0]) / values[0]) * 100;
    return {
      width,
      height,
      padding,
      line,
      area,
      points,
      min,
      max,
      changeRate,
      startDate: new Date(candles[0].timestamp).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
      }),
      endDate: new Date(candles.at(-1)!.timestamp).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
      }),
    };
  }, [candles]);
  if (!chart) return null;
  return (
    <div
      className={`${styles.chartWrap} ${chart.changeRate >= 0 ? styles.positiveChart : styles.negativeChart}`}
    >
      <svg
        className={styles.miniChart}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        aria-label="최근 30일 지수 흐름"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((position) => (
          <line
            key={position}
            x1={chart.padding.left}
            x2={chart.width - chart.padding.right}
            y1={chart.padding.top + chart.height * 0.72 * position}
            y2={chart.padding.top + chart.height * 0.72 * position}
          />
        ))}
        <path d={chart.area} fill={`url(#${gradientId})`} />
        <polyline points={chart.line} fill="none" />
        <circle cx={chart.points.at(-1)!.x} cy={chart.points.at(-1)!.y} r="4" />
        <text x={chart.padding.left} y={chart.height - 7}>
          {chart.startDate}
        </text>
        <text x={chart.width - chart.padding.right} y={chart.height - 7} textAnchor="end">
          {chart.endDate}
        </text>
      </svg>
      <div className={styles.chartStats}>
        <span>
          저점{' '}
          <b>
            {currency
              ? money(chart.min, currency, displayCurrency, exchangeRate)
              : `${chart.min.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`}
          </b>
        </span>
        <span>
          고점{' '}
          <b>
            {currency
              ? money(chart.max, currency, displayCurrency, exchangeRate)
              : `${chart.max.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`}
          </b>
        </span>
        <strong className={chart.changeRate >= 0 ? styles.positive : styles.negative}>
          {chart.changeRate > 0 ? '+' : ''}
          {chart.changeRate.toFixed(2)}%
        </strong>
      </div>
    </div>
  );
}

export function IndicatorSparkline({
  candles,
  positive,
  previousClose,
}: {
  candles: MarketIndicatorCandle[];
  positive: boolean;
  previousClose: number | null;
}) {
  const chart = useMemo(() => {
    if (candles.length < 2) return '';
    const values = candles.map((candle) => candle.closePrice);
    const valuesWithBaseline = previousClose === null ? values : [...values, previousClose];
    const minimum = Math.min(...valuesWithBaseline);
    const range = Math.max(Math.max(...valuesWithBaseline) - minimum, 0.0001);
    const points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 46 - ((value - minimum) / range) * 42;
        return `${x},${y}`;
      })
      .join(' ');
    return {
      points,
      baselineY: previousClose === null ? null : 46 - ((previousClose - minimum) / range) * 42,
    };
  }, [candles, previousClose]);

  if (!chart) return <span className={styles.sparklinePlaceholder} aria-hidden="true" />;
  return (
    <svg
      className={positive ? styles.positiveSparkline : styles.negativeSparkline}
      viewBox="0 0 100 48"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {chart.baselineY !== null ? (
        <line
          className={styles.previousCloseLine}
          x1="0"
          x2="100"
          y1={chart.baselineY}
          y2={chart.baselineY}
        />
      ) : null}
      <polyline points={chart.points} />
    </svg>
  );
}
