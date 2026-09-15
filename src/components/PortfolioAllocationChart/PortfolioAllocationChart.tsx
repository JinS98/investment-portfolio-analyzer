import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ExchangeRate, Holding, PriceMap, StockItem } from '../../types';
import styles from './PortfolioAllocationChart.module.scss';

interface PortfolioAllocationChartProps {
  portfolio: Array<StockItem | Holding>;
  prices: PriceMap;
  exchangeRate: ExchangeRate | null;
  title?: string;
  description?: string;
}

const COLORS = ['#4f9cff', '#38c172', '#f5a524', '#a78bfa', '#ec6a5c', '#22c5c9'];

export function PortfolioAllocationChart({
  portfolio,
  prices,
  exchangeRate,
  title = '포트폴리오 비중',
  description = '현재가 기준 평가금액을 원화로 환산해 표시합니다.',
}: PortfolioAllocationChartProps) {
  const byTicker = portfolio.reduce<
    Record<string, { ticker: string; name: string; value: number; market: Holding['market'] }>
  >((stocks, stock) => {
    const fallbackPrice = 'averagePrice' in stock ? stock.averagePrice : stock.buyPrice;
    const currentPrice = prices[stock.ticker] ?? fallbackPrice;
    const exchangeMultiplier = stock.market === 'US' ? (exchangeRate?.rate ?? 0) : 1;
    const existing = stocks[stock.ticker];
    stocks[stock.ticker] = {
      ticker: stock.ticker,
      name: stock.name || stock.ticker,
      market: stock.market,
      value: (existing?.value ?? 0) + currentPrice * stock.quantity * exchangeMultiplier,
    };
    return stocks;
  }, {});
  const allocations = Object.values(byTicker).filter((stock) => stock.value > 0);

  const total = allocations.reduce((sum, stock) => sum + stock.value, 0);
  const withWeight = allocations.map((stock, index) => ({
    ...stock,
    weight: total > 0 ? (stock.value / total) * 100 : 0,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <section className={styles.section} aria-labelledby="allocation-title">
      <div className={styles.header}>
        <div>
          <h2 id="allocation-title">{title}</h2>
          <p>{description}</p>
        </div>
        {exchangeRate && (
          <span className={styles.rate}>
            USD/KRW {exchangeRate.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {!portfolio.length && <p className={styles.empty}>종목을 추가하면 비중 차트가 표시됩니다.</p>}
      {portfolio.length > 0 &&
        !exchangeRate &&
        portfolio.some((stock) => stock.market === 'US') && (
          <p className={styles.empty}>미국 종목 비중은 환율을 불러온 뒤 계산합니다.</p>
        )}
      {withWeight.length > 0 && (
        <div className={styles.content}>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={withWeight}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {withWeight.map((stock) => (
                    <Cell key={stock.ticker} fill={stock.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <p className={styles.total}>
              총 평가금액{' '}
              <strong>{total.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원</strong>
            </p>
          </div>
          <ul className={styles.list}>
            {[...withWeight]
              .sort((a, b) => b.weight - a.weight)
              .map((stock) => (
                <li key={stock.ticker}>
                  <span className={styles.dot} style={{ backgroundColor: stock.color }} />
                  <span className={styles.name}>
                    {stock.name} <small>({stock.ticker})</small>
                  </span>
                  <strong>{stock.weight.toFixed(2)}%</strong>
                  <span className={styles.value}>
                    {stock.value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
