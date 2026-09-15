import { useEffect, useMemo, useRef } from 'react';
import { PortfolioAllocationChart } from '../../components/PortfolioAllocationChart/PortfolioAllocationChart';
import { PortfolioManager } from '../../components/PortfolioManager/PortfolioManager';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { fetchCurrentPrices, fetchUsdKrwExchangeRate } from '../../services/tossApi';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Holding } from '../../types';
import styles from './VirtualPortfolioPage.module.scss';

const EMPTY_HOLDINGS: Holding[] = [];

export function VirtualPortfolioPage() {
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const prices = usePortfolioStore((state) => state.prices);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const setPrices = usePortfolioStore((state) => state.setPrices);
  const setExchangeRate = usePortfolioStore((state) => state.setExchangeRate);
  const lastQuoteRequestKey = useRef('');
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const virtualHoldings = useMemo(() => {
    const virtualPortfolio = portfolios.find((portfolio) => portfolio.type === 'VIRTUAL');
    return virtualPortfolio
      ? (portfolioLedgers[virtualPortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
      : EMPTY_HOLDINGS;
  }, [portfolioLedgers, portfolios]);

  useEffect(() => {
    const tickers = [...new Set(virtualHoldings.map((holding) => holding.ticker))].sort();
    const requestKey = tickers.join('|');
    if (!requestKey || lastQuoteRequestKey.current === requestKey) return;
    lastQuoteRequestKey.current = requestKey;

    void fetchCurrentPrices(tickers)
      .then((nextPrices) => {
        setPrices({ ...usePortfolioStore.getState().prices, ...nextPrices });
      })
      .catch(() => {
        // 조회 실패 시 사용자가 화면의 현재가 갱신 버튼으로 다시 시도할 수 있다.
      });
  }, [setPrices, virtualHoldings]);

  useEffect(() => {
    if (!virtualHoldings.some((holding) => holding.market === 'US')) return;

    void fetchUsdKrwExchangeRate()
      .then((rate) => setExchangeRate(rate))
      .catch(() => {
        // 환율을 불러오지 못하면 비중 차트에서 기존 안내 문구를 표시한다.
      });
  }, [setExchangeRate, virtualHoldings]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>모의 투자</p>
        <h1>가상 포트폴리오</h1>
        <span>가정한 매수·매도 기록을 바탕으로 성과와 종목 비중을 추적합니다.</span>
      </header>

      {isPortfolioLoading ? (
        <p className={styles.status}>가상 포트폴리오를 불러오는 중입니다.</p>
      ) : portfolioError ? (
        <p className={styles.error} role="alert">
          {portfolioError}
        </p>
      ) : (
        <>
          <PortfolioAllocationChart
            portfolio={virtualHoldings}
            prices={prices}
            exchangeRate={exchangeRate}
            title="가상 포트폴리오 비중"
            description="가상 보유 종목의 현재 평가금액을 원화로 환산해 표시합니다."
          />
          <PortfolioManager portfolioType="VIRTUAL" />
        </>
      )}
    </main>
  );
}
