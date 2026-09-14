import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { searchStocks } from '../services/tossApi';
import type { StockSearchItem } from '../types/market';
import { formatRate } from '../utils/calculator';
import styles from './PortfolioManager.module.scss';

type Draft = { buyPrice: string; quantity: string };
const money = (value: number, market: 'KR' | 'US') => new Intl.NumberFormat('ko-KR', {
  style: 'currency', currency: market === 'KR' ? 'KRW' : 'USD', maximumFractionDigits: market === 'KR' ? 0 : 2,
}).format(value);
const marketOf = (market: string): 'KR' | 'US' => ['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(market) ? 'KR' : 'US';

export function PortfolioManager() {
  const { portfolio, computedData, isLoading, prices, addStock, updateStock, removeStock, refreshPrices } = usePortfolio();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<StockSearchItem[]>([]);
  const [selected, setSelected] = useState<StockSearchItem | null>(null);
  const [draft, setDraft] = useState<Draft>({ buyPrice: '', quantity: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ buyPrice: '', quantity: '' });

  useEffect(() => {
    if (selected || !query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchStocks(query.trim(), controller.signal).then(setMatches).catch(() => setMatches([]));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  const grouped = useMemo(() => {
    const stocks = computedData?.stocks ?? [];
    return (['KR', 'US'] as const).map((market) => ({ market, stocks: stocks.filter((stock) => stock.market === market) })).filter((group) => group.stocks.length);
  }, [computedData]);

  function choose(item: StockSearchItem) { setSelected(item); setQuery(`${item.name} (${item.symbol})`); setMatches([]); setError(''); }
  function valid(d: Draft) { return Number.isFinite(Number(d.buyPrice)) && Number(d.buyPrice) > 0 && Number.isFinite(Number(d.quantity)) && Number(d.quantity) > 0; }
  function add(event: FormEvent) {
    event.preventDefault();
    if (!selected) { setError('검색 목록에서 종목을 선택해주세요.'); return; }
    if (!valid(draft)) { setError('매수가와 수량은 0보다 큰 숫자로 입력해주세요.'); return; }
    if (portfolio.some((stock) => stock.ticker === selected.symbol)) { setError('이미 포트폴리오에 있는 종목입니다. 기존 행에서 매수가와 수량을 수정해주세요.'); return; }
    addStock({ ticker: selected.symbol, name: selected.name, market: marketOf(selected.market), buyPrice: Number(draft.buyPrice), quantity: Number(draft.quantity) });
    setSelected(null); setQuery(''); setDraft({ buyPrice: '', quantity: '' }); setError('');
  }
  function save(id: string) {
    if (!valid(editDraft)) { setError('매수가와 수량은 0보다 큰 숫자로 입력해주세요.'); return; }
    updateStock(id, { buyPrice: Number(editDraft.buyPrice), quantity: Number(editDraft.quantity) });
    setEditing(null); setError('');
  }
  return <section className={styles.section}>
    <h2>내 포트폴리오</h2>
    <form className={styles.form} onSubmit={add}>
      <div className={styles.search}><label htmlFor="portfolio-stock">종목 검색</label>
        <input id="portfolio-stock" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="삼성전자, 애플, AAPL" autoComplete="off" />
        {!selected && !!query.trim() && !!matches.length && <ul role="listbox">{matches.map((item) => <li key={`${item.market}-${item.symbol}`} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><strong>{item.name}</strong> {item.symbol} · {item.market}</li>)}</ul>}
      </div>
      <label>매수가<input inputMode="decimal" type="number" min="0" step="any" value={draft.buyPrice} onChange={(event) => setDraft({ ...draft, buyPrice: event.target.value })} required /></label>
      <label>수량<input inputMode="decimal" type="number" min="0" step="any" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required /></label>
      <button type="submit">종목 추가</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!portfolio.length ? <p className={styles.empty}>종목을 검색해 매수가와 수량을 입력하세요.</p> : <>
      <div className={styles.actions}><span>현재가 기준으로 계산됩니다. KRW와 USD는 통화별로 따로 합산합니다.</span><button type="button" onClick={refreshPrices} disabled={isLoading}>{isLoading ? '시세 갱신 중…' : '현재가 갱신'}</button></div>
      {grouped.map(({ market, stocks }) => {
        const totalBuy = stocks.reduce((sum, stock) => sum + stock.buyPrice * stock.quantity, 0);
        const totalValue = stocks.reduce((sum, stock) => sum + stock.evaluatedValue, 0);
        const profit = totalValue - totalBuy;
        return <div className={styles.tableWrap} key={market}><h3>{market === 'KR' ? '국내 주식 (KRW)' : '미국 주식 (USD)'}</h3><div className={styles.marketSummary}><span>매수금액 <strong>{money(totalBuy, market)}</strong></span><span>평가금액 <strong>{money(totalValue, market)}</strong></span><span>손익 <strong className={profit >= 0 ? styles.positive : styles.negative}>{money(profit, market)} · {formatRate(totalBuy ? profit / totalBuy * 100 : 0)}</strong></span></div><table><thead><tr><th>종목</th><th>매수가</th><th>현재가</th><th>수량</th><th>평가금액</th><th>손익</th><th>수익률</th><th>관리</th></tr></thead><tbody>
          {stocks.map((stock) => <tr key={stock.id}><td><strong>{stock.name ?? stock.ticker}</strong><small>{stock.ticker}</small></td>{editing === stock.id ? <>
            <td><input aria-label={`${stock.ticker} 매수가`} type="number" min="0" step="any" value={editDraft.buyPrice} onChange={(event) => setEditDraft({ ...editDraft, buyPrice: event.target.value })} /></td><td>{money(stock.currentPrice, stock.market)}</td><td><input aria-label={`${stock.ticker} 수량`} type="number" min="0" step="any" value={editDraft.quantity} onChange={(event) => setEditDraft({ ...editDraft, quantity: event.target.value })} /></td><td>{money(stock.evaluatedValue, stock.market)}</td><td>{money(stock.profitAmount, stock.market)}</td><td className={stock.profitRate >= 0 ? styles.positive : styles.negative}>{formatRate(stock.profitRate)}</td><td><button onClick={() => save(stock.id)}>저장</button><button onClick={() => setEditing(null)}>취소</button></td>
          </> : <><td>{money(stock.buyPrice, stock.market)}</td><td>{prices[stock.ticker] === undefined ? '시세 미조회' : money(stock.currentPrice, stock.market)}</td><td>{stock.quantity.toLocaleString('ko-KR')}</td><td>{money(stock.evaluatedValue, stock.market)}</td><td className={stock.profitAmount >= 0 ? styles.positive : styles.negative}>{money(stock.profitAmount, stock.market)}</td><td className={stock.profitRate >= 0 ? styles.positive : styles.negative}>{formatRate(stock.profitRate)}</td><td><button onClick={() => { setEditing(stock.id); setEditDraft({ buyPrice: String(stock.buyPrice), quantity: String(stock.quantity) }); }}>수정</button><button onClick={() => { if (window.confirm(`${stock.name ?? stock.ticker}을(를) 삭제할까요?`)) removeStock(stock.id); }}>삭제</button></td></>}</tr>)}
        </tbody><tfoot><tr><th colSpan={4}>합계</th><td>{money(totalValue, market)}</td><td className={profit >= 0 ? styles.positive : styles.negative}>{money(profit, market)}</td><td className={profit >= 0 ? styles.positive : styles.negative}>{formatRate(totalBuy ? profit / totalBuy * 100 : 0)}</td><td /></tr></tfoot></table></div>;
      })}
    </>}
  </section>;
}
