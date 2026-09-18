import type { ExchangeRate, Holding, HoldingHistory, PortfolioHistory, PriceMap } from '../../types';
import styles from './PortfolioAlertSummary.module.scss';

interface PortfolioAlertSummaryProps {
  holdings: Holding[];
  histories: HoldingHistory[];
  portfolioHistory: PortfolioHistory[];
  prices: PriceMap;
  exchangeRate: ExchangeRate | null;
  lastUpdated: string | null;
  failedTickers: string[];
}

const koreaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function PortfolioAlertSummary({ holdings, histories, portfolioHistory, prices, exchangeRate, lastUpdated, failedTickers }: PortfolioAlertSummaryProps) {
  const pending = histories.filter((history) => history.source === 'RECURRING' && history.portfolioType === 'REAL' && history.recurringExecutionStatus !== 'CONFIRMED');
  const todayRecurring = histories.filter((history) => history.source === 'RECURRING' && history.date === koreaToday());
  const sortedHistory = [...portfolioHistory].sort((left, right) => left.date.localeCompare(right.date));
  const latest = sortedHistory.at(-1);
  const previous = sortedHistory.at(-2);
  const rateChange = latest && previous ? latest.totalProfitRate - previous.totalProfitRate : null;
  const positionValues = holdings.map((holding) => ({
    holding,
    value: (prices[holding.ticker] ?? 0) * holding.quantity * (holding.market === 'US' ? (exchangeRate?.rate ?? 0) : 1),
  }));
  const totalValue = positionValues.reduce((sum, item) => sum + item.value, 0);
  const concentrated = positionValues
    .map((item) => ({ ...item, weight: totalValue > 0 ? (item.value / totalValue) * 100 : 0 }))
    .filter((item) => item.weight >= 40)
    .sort((left, right) => right.weight - left.weight);
  const alerts = [
    ...(pending.length ? [{ tone: 'warning', title: `체결 확인 ${pending.length}건`, description: '실제 포트폴리오의 자동매수 가격·수량을 확인해 주세요.', action: '거래 내역 보기' }] : []),
    ...(rateChange !== null && Math.abs(rateChange) >= 5 ? [{ tone: 'notice', title: '수익률 급변', description: `직전 기록보다 ${rateChange > 0 ? '+' : ''}${rateChange.toFixed(2)}%p 변했습니다.` }] : []),
    ...concentrated.slice(0, 2).map((item) => ({ tone: 'warning', title: '종목 비중 초과', description: `${item.holding.name ?? item.holding.ticker} 비중이 ${item.weight.toFixed(1)}%입니다.` })),
    ...(failedTickers.length ? [{ tone: 'error', title: '현재가 갱신 실패', description: `${failedTickers.join(', ')} 시세를 가져오지 못했습니다.` }] : []),
  ];

  return (
    <section className={styles.section} aria-labelledby="portfolio-alert-title">
      <div className={styles.header}>
        <div><h2 id="portfolio-alert-title">포트폴리오 알림</h2><p>가격 갱신과 자동매수 상태를 요약합니다.</p></div>
        <span>{lastUpdated ? `갱신 ${new Date(lastUpdated).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '갱신 전'}</span>
      </div>
      <div className={styles.statuses}>
        <div><small>오늘 자동 반영</small><strong>{todayRecurring.length}건</strong></div>
        <div><small>체결 확인 필요</small><strong className={pending.length ? styles.caution : undefined}>{pending.length}건</strong></div>
        <div><small>현재가 갱신 실패</small><strong className={failedTickers.length ? styles.caution : undefined}>{failedTickers.length}종목</strong></div>
      </div>
      {alerts.length ? <ul>{alerts.map((alert, index) => <li className={styles[alert.tone]} key={`${alert.title}-${index}`}><div><b>{alert.title}</b><span>{alert.description}</span></div>{alert.action ? <button type="button" onClick={() => { window.location.hash = '#transactions'; }}>{alert.action}</button> : null}</li>)}</ul> : <p className={styles.clear}>지금 확인이 필요한 알림이 없습니다.</p>}
    </section>
  );
}
