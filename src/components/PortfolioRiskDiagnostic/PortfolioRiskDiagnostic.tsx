import { useEffect, useMemo, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { loadRecurringInvestmentRules } from '../../services/portfolioLedgerService';
import { useAuthStore } from '../../store/authStore';
import type { ExchangeRate, Holding, PriceMap, RecurringInvestmentRule, RiskData } from '../../types';
import { calculateProjectedAllocation } from '../../utils/allocationRisk';
import styles from './PortfolioRiskDiagnostic.module.scss';

interface PortfolioRiskDiagnosticProps {
  portfolioId?: string;
  holdings: Holding[];
  prices: PriceMap;
  exchangeRate: ExchangeRate | null;
  riskData: RiskData | null;
  isRiskLoading: boolean;
}

interface StockChoice {
  ticker: string;
  name?: string;
  market: 'KR' | 'US';
}

const volatilityLevel = (value: number | null) => value === null ? '판단 불가' : value < 20 ? '보통' : value < 40 ? '주의' : '기준 초과';
const drawdownLevel = (value: number | null) => value === null ? '판단 불가' : value > -10 ? '보통' : value > -30 ? '주의' : '기준 초과';
const concentrationLevel = (value: number, moderate: number, high: number) => value < moderate ? '보통' : value < high ? '주의' : '기준 초과';

export function PortfolioRiskDiagnostic({ portfolioId, holdings, prices, exchangeRate, riskData, isRiskLoading }: PortfolioRiskDiagnosticProps) {
  const userId = useAuthStore((state) => state.user?.uid);
  const [ruleData, setRuleData] = useState<{ portfolioId?: string; rules: RecurringInvestmentRule[] }>({ rules: [] });
  const [selectedStockKey, setSelectedStockKey] = useState('');
  const [previewQuantity, setPreviewQuantity] = useState('');
  const [isStockPickerOpen, setIsStockPickerOpen] = useState(false);

  useEffect(() => {
    if (!userId || !portfolioId) return;
    let active = true;
    void loadRecurringInvestmentRules(userId, portfolioId)
      .then((rules) => {
        if (active) setRuleData({ portfolioId, rules });
      })
      .catch(() => {
        if (active) setRuleData({ portfolioId, rules: [] });
      });
    return () => { active = false; };
  }, [portfolioId, userId]);

  const rules = ruleData.portfolioId === portfolioId ? ruleData.rules : [];
  const activeRules = rules.filter((rule) => rule.status === 'ACTIVE');
  const stockChoicesByKey = new Map<string, StockChoice>();
  holdings.forEach((holding) => stockChoicesByKey.set(`${holding.market}:${holding.ticker}`, {
    ticker: holding.ticker,
    name: holding.name,
    market: holding.market,
  }));
  activeRules.forEach((rule) => stockChoicesByKey.set(`${rule.market}:${rule.ticker}`, {
    ticker: rule.ticker,
    name: rule.name,
    market: rule.market,
  }));
  const stockChoices = [...stockChoicesByKey.values()];
  const selectedStock = stockChoices.find((stock) => `${stock.market}:${stock.ticker}` === selectedStockKey) ?? stockChoices[0];
  const selectedRule = selectedStock ? activeRules.find((rule) => rule.ticker === selectedStock.ticker && rule.market === selectedStock.market) : undefined;
  const defaultQuantity = selectedRule?.quantity ?? 1;
  const quantity = previewQuantity === '' ? defaultQuantity : Number(previewQuantity);
  const analysis = useMemo(() => calculateProjectedAllocation(
    holdings,
    activeRules,
    prices,
    exchangeRate,
    selectedRule && Number.isFinite(quantity) ? { [selectedRule.id]: quantity } : {},
    !selectedRule && selectedStock && Number.isFinite(quantity)
      ? { ...selectedStock, quantity }
      : undefined,
  ), [activeRules, exchangeRate, holdings, prices, quantity, selectedRule, selectedStock]);
  const previewPosition = selectedStock ? analysis.positions.find((position) => position.ticker === selectedStock.ticker && position.market === selectedStock.market) : undefined;
  const riskCards = riskData ? [
    {
      label: '연환산 변동성',
      value: riskData.volatility === null ? '-' : `${riskData.volatility.toFixed(2)}%`,
      note: '종목 비중을 반영한 평균',
      level: volatilityLevel(riskData.volatility),
      description: '일별 수익률의 흔들림을 1년 단위로 환산한 값입니다. 낮을수록 가격 흐름이 안정적입니다.',
      range: '일반적으로 20% 미만은 낮음, 20~40%는 보통, 40% 초과는 높은 변동성으로 봅니다. 시장과 종목 특성에 따라 달라질 수 있습니다.',
    },
    {
      label: '최대 낙폭 (MDD)',
      value: riskData.mdd === null ? '-' : `${riskData.mdd.toFixed(2)}%`,
      note: '분석 종목 중 가장 큰 하락폭',
      level: drawdownLevel(riskData.mdd),
      description: '분석 기간의 고점에서 저점까지 가장 크게 하락한 비율입니다. 0%에 가까울수록 방어력이 좋습니다.',
      range: '보통 -10% 이내는 낮은 하락, -10~-30%는 주의, -30% 이하는 큰 하락으로 해석합니다.',
      loss: true,
    },
    {
      label: '상위 2종목 집중도',
      value: `${riskData.concentration.toFixed(2)}%`,
      note: '비중이 높은 두 종목의 합계',
      level: concentrationLevel(riskData.concentration, 40, 60),
      description: '평가금액이 가장 큰 두 종목이 전체 자산에서 차지하는 비중입니다. 낮을수록 여러 종목에 분산되어 있습니다.',
      range: '40% 미만은 비교적 분산, 40~60%는 집중 주의, 60% 초과는 높은 집중도로 봅니다.',
    },
    {
      label: '최대 단일 종목 비중',
      value: `${riskData.maxWeight.toFixed(2)}%`,
      note: '현재 평가액 기준',
      level: concentrationLevel(riskData.maxWeight, 20, 35),
      description: '가장 비중이 큰 한 종목이 전체 자산에서 차지하는 비율입니다. 낮을수록 개별 종목 충격의 영향이 작습니다.',
      range: '20% 미만은 비교적 분산, 20~35%는 주의, 35% 초과는 특정 종목 의존도가 높은 편입니다.',
    },
  ] : [];

  return (
    <section className={styles.section} aria-labelledby="allocation-risk-title">
      <div className={styles.header}>
        <div><h2 id="allocation-risk-title">포트폴리오 리스크 진단</h2><p>시장 변동 위험과 현재·예상 자산 집중도를 함께 확인합니다.</p></div>
        <span>활성 자동매수 {activeRules.length}개</span>
      </div>

      <div className={styles.blockHeader}>
        <div><h3>시장 위험 요약</h3><p>최근 90일 일봉을 기준으로 계산합니다.</p></div>
        {riskData ? <span>분석 대상 {riskData.stocks.length}개{riskData.analyzedTickers.length !== riskData.stocks.length ? ` · 계산 완료 ${riskData.analyzedTickers.length}개` : ''}</span> : null}
      </div>
      <div className={styles.riskLegend} aria-label="리스크 수치 색상 기준">
        <span><i className={styles.levelNormal} />보통</span>
        <span><i className={styles.levelCaution} />주의</span>
        <span><i className={styles.levelHigh} />기준 초과</span>
        <small>색상은 각 지표의 툴팁에 표시된 구간 기준입니다.</small>
      </div>
      {isRiskLoading ? <p className={styles.status}>가격 이력을 불러와 시장 위험을 계산하는 중입니다.</p> : null}
      {!isRiskLoading && !riskData ? <p className={styles.status}>가격 이력을 갱신하면 시장 위험을 분석합니다.</p> : null}
      {!isRiskLoading && riskData ? <div className={styles.riskMetrics}>
        {riskCards.map((card, index) => {
          const tooltipId = `risk-metric-tooltip-${index}`;
          return <div className={styles.riskMetricCard} key={card.label} tabIndex={0} aria-describedby={tooltipId}>
            <small>{card.label}<i aria-hidden="true">?</i></small>
            <strong className={card.level === '보통' ? styles.levelNormal : card.level === '주의' ? styles.levelCaution : card.level === '기준 초과' ? styles.levelHigh : undefined}>{card.value}</strong>
            <span>{card.note}</span>
            <div className={styles.metricTooltip} id={tooltipId} role="tooltip">
              <b>현재 단계: {card.level}</b>
              <p>{card.description}</p>
              <p>{card.range}</p>
            </div>
          </div>;
        })}
      </div> : null}

      <div className={styles.blockHeader}>
        <div><h3>보유·예정 매수 집중도</h3><p>현재 보유 자산과 활성 자동매수의 다음 1회를 반영합니다.</p></div>
      </div>

      {!holdings.length ? <p className={styles.empty}>보유 종목을 추가하면 종목·국가·통화 집중도를 확인할 수 있습니다.</p> : null}

      {holdings.length ? <><div className={styles.exposure}>
        <div><small>한국 / KRW</small><strong>{analysis.countryWeights.KR.toFixed(1)}%</strong><i><b style={{ width: `${analysis.countryWeights.KR}%` }} /></i></div>
        <div><small>미국 / USD</small><strong>{analysis.countryWeights.US.toFixed(1)}%</strong><i><b style={{ width: `${analysis.countryWeights.US}%` }} /></i></div>
      </div>

      {analysis.warnings.length ? <ul className={styles.warnings}>{analysis.warnings.map((warning) => <li key={`${warning.type}:${warning.label}`}><b>{warning.type === 'STOCK' ? '종목' : warning.type === 'COUNTRY' ? '국가' : '통화'} {warning.weight.toFixed(1)}%</b><span>{warning.message}</span></li>)}</ul> : <p className={styles.clear}>현재 기준으로 집중도 경고가 없습니다.</p>}

      <div className={styles.positionList}>
        <div className={styles.positionHead}><span>종목</span><span>현재 비중</span><span>다음 매수 후</span><span>변화</span></div>
        {analysis.positions.map((position) => <div className={styles.positionRow} key={position.key}><strong>{position.name}</strong><span>{position.currentWeight.toFixed(1)}%</span><span>{position.projectedWeight.toFixed(1)}%</span><span className={position.projectedWeight > position.currentWeight ? styles.increase : undefined}>{position.projectedWeight >= position.currentWeight ? '+' : ''}{(position.projectedWeight - position.currentWeight).toFixed(1)}%p</span></div>)}
      </div>

      {selectedStock ? <div className={styles.preview}>
        <div><h3>추가 매수 비중 미리보기</h3><p>저장하지 않고 종목과 매수 수량에 따른 예상 비중을 확인합니다.</p></div>
        <div className={styles.stockPicker}>
          <span>종목</span>
          <button type="button" className={styles.stockPickerTrigger} onClick={() => setIsStockPickerOpen((current) => !current)} onBlur={() => window.setTimeout(() => setIsStockPickerOpen(false), 120)} aria-expanded={isStockPickerOpen} aria-haspopup="listbox">
            {selectedStock.name ?? selectedStock.ticker}<FiChevronDown aria-hidden="true" />
          </button>
          {isStockPickerOpen ? <ul className={styles.stockPickerOptions} role="listbox" aria-label="미리보기 종목 선택">{stockChoices.map((stock) => {
            const key = `${stock.market}:${stock.ticker}`;
            return <li key={key} role="option" aria-selected={key === `${selectedStock.market}:${selectedStock.ticker}`}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedStockKey(key); setPreviewQuantity(''); setIsStockPickerOpen(false); }}>{stock.name ?? stock.ticker}</button></li>;
          })}</ul> : null}
        </div>
        <label><span>매수 수량</span><input type="number" min="0" step="1" value={previewQuantity || defaultQuantity} onChange={(event) => setPreviewQuantity(event.target.value)} /></label>
        <div className={styles.previewResult}><span>현재 {previewPosition?.currentWeight.toFixed(1) ?? '0.0'}%</span><b>→</b><strong>예상 {previewPosition?.projectedWeight.toFixed(1) ?? '0.0'}%</strong></div>
      </div> : null}

      {analysis.unavailableTickers.length ? <p className={styles.unavailable}>현재가가 없어 제외된 종목: {analysis.unavailableTickers.join(', ')}</p> : null}

      {!isRiskLoading && riskData ? <div className={styles.riskDetail}>
        <div className={styles.blockHeader}><div><h3>종목별 시장 위험</h3><p>변동성과 고점 대비 최대 하락폭을 종목별로 비교합니다.</p></div></div>
        {riskData.insufficientTickers.length ? <p className={styles.unavailable}>일봉 데이터가 부족한 종목: {riskData.insufficientTickers.map((ticker) => holdings.find((holding) => holding.ticker === ticker)?.name ?? ticker).join(', ')}</p> : null}
        <div className={styles.riskTableWrap}><table><thead><tr><th>종목</th><th>일봉 수</th><th>연환산 변동성</th><th>MDD</th></tr></thead><tbody>{riskData.stocks.map((stock) => <tr key={stock.ticker}><td>{holdings.find((holding) => holding.ticker === stock.ticker)?.name ?? stock.ticker}</td><td>{stock.observations}</td><td>{stock.volatility === null ? '데이터 부족' : `${stock.volatility.toFixed(2)}%`}</td><td className={styles.loss}>{stock.mdd === null ? '데이터 부족' : `${stock.mdd.toFixed(2)}%`}</td></tr>)}</tbody></table></div>
      </div> : null}</> : null}
    </section>
  );
}
