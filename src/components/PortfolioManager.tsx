import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { searchStocks } from '../services/tossApi';
import type { StockSearchItem } from '../types/market';
import { formatRate } from '../utils/calculator';
import { formatNumericInput, parseNumericInput } from '../utils/numericInput';
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
  const [isSearching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [draft, setDraft] = useState<Draft>({ buyPrice: '', quantity: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ buyPrice: '', quantity: '' });
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (selected || !query.trim()) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setHasSearched(false);
      searchStocks(query.trim(), controller.signal)
        .then((items) => { if (active) setMatches(items); })
        .catch(() => { if (active) setMatches([]); })
        .finally(() => { if (active) { setSearching(false); setHasSearched(true); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  const grouped = useMemo(() => {
    const stocks = computedData?.stocks ?? [];
    return (['KR', 'US'] as const).map((market) => ({ market, stocks: stocks.filter((stock) => stock.market === market) })).filter((group) => group.stocks.length);
  }, [computedData]);

  function choose(item: StockSearchItem) { setSelected(item); setQuery(`${item.name} (${item.symbol})`); setMatches([]); setSearching(false); setHasSearched(false); setError(''); }
  function valid(d: Draft) { return parseNumericInput(d.buyPrice) > 0 && parseNumericInput(d.quantity) > 0; }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!selected) { setError('검색 목록에서 종목을 선택해주세요.'); return; }
    if (!valid(draft)) { setError('매수가와 수량은 0보다 큰 숫자로 입력해주세요.'); return; }
    if (portfolio.some((stock) => stock.ticker === selected.symbol)) { setError('이미 포트폴리오에 있는 종목입니다. 기존 행에서 매수가와 수량을 수정해주세요.'); return; }
    setSaving(true);
    try {
      await addStock({ ticker: selected.symbol, name: selected.name, market: marketOf(selected.market), buyPrice: parseNumericInput(draft.buyPrice), quantity: parseNumericInput(draft.quantity) });
      setSelected(null); setQuery(''); setDraft({ buyPrice: '', quantity: '' }); setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '종목 저장에 실패했습니다.');
    } finally { setSaving(false); }
  }
  async function save(id: string) {
    if (!valid(editDraft)) { setError('매수가와 수량은 0보다 큰 숫자로 입력해주세요.'); return; }
    setSaving(true);
    try {
      await updateStock(id, { buyPrice: parseNumericInput(editDraft.buyPrice), quantity: parseNumericInput(editDraft.quantity) });
      setEditing(null); setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '종목 수정에 실패했습니다.');
    } finally { setSaving(false); }
  }
  async function remove(id: string, name: string) {
    if (!window.confirm(`${name}을(를) 삭제할까요?`)) return;
    setSaving(true);
    try { await removeStock(id); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : '종목 삭제에 실패했습니다.'); }
    finally { setSaving(false); }
  }
  return <section className={styles.section}>
    <h2>내 포트폴리오</h2>
    <form className={styles.form} onSubmit={add}>
      <div className={styles.search}><label htmlFor="portfolio-stock">종목 검색</label>
        <div className={styles.searchInput}>
          <input id="portfolio-stock" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setMatches([]); setSearching(false); setHasSearched(false); }} placeholder="삼성전자, 애플, AAPL" autoComplete="off" aria-describedby="portfolio-stock-status" aria-invalid={Boolean(query.trim() && !selected && hasSearched)} disabled={isSaving} />
          {selected && <span className={styles.selectedCheck} aria-label="종목 선택 완료">✓</span>}
          {!selected && !!query.trim() && !!matches.length && <ul role="listbox">{matches.map((item) => <li key={`${item.market}-${item.symbol}`} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><strong>{item.name}</strong> {item.symbol} · {item.market}</li>)}</ul>}
          <p id="portfolio-stock-status" className={selected ? styles.selectionConfirmed : styles.selectionHint} role="status">
            {selected ? `✓ ${selected.name} (${selected.symbol}) 선택 완료` : isSearching ? '종목 검색 중… 검색 결과에서 종목을 선택해주세요.' : query.trim() && hasSearched && !matches.length ? '일치하는 종목이 없습니다. 다른 이름이나 종목 코드를 입력해주세요.' : query.trim() ? '검색 결과에서 종목을 선택해야 추가할 수 있습니다.' : '종목명 또는 코드를 입력한 뒤 검색 결과에서 선택해주세요.'}
          </p>
        </div>
      </div>
      <label>매수가<input inputMode="decimal" type="text" value={draft.buyPrice} onChange={(event) => setDraft({ ...draft, buyPrice: formatNumericInput(event.target.value) })} placeholder={selected && marketOf(selected.market) === 'US' ? '예: 185.50' : '예: 72,000'} required disabled={isSaving} /></label>
      <label>수량<input inputMode="decimal" type="text" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: formatNumericInput(event.target.value) })} placeholder="예: 10" required disabled={isSaving} /></label>
      <button type="submit" disabled={isSaving}>{isSaving ? '저장 중…' : '종목 추가'}</button>
    </form>
    <p className={styles.currencyGuide}>
      {selected ? `${marketOf(selected.market) === 'KR' ? '국내' : '미국'} 주식 선택됨 — 매수가를 ${marketOf(selected.market) === 'KR' ? '원(KRW)' : '달러(USD)'}로 입력하세요.` : '국내 주식은 원(KRW), 미국 주식은 달러(USD)로 매수가를 입력하세요.'}
현재는 환율을 적용하지 않아 KRW와 USD 합계를 따로 표시합니다.
    </p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!portfolio.length ? <p className={styles.empty}>종목을 검색해 매수가와 수량을 입력하세요.</p> : <>
      <div className={styles.actions}><span>현재가 기준으로 계산됩니다. KRW와 USD는 통화별로 따로 합산합니다.</span><button type="button" onClick={refreshPrices} disabled={isLoading || isSaving}>{isLoading ? '시세 갱신 중…' : '현재가 갱신'}</button></div>
      {grouped.map(({ market, stocks }) => {
        const totalBuy = stocks.reduce((sum, stock) => sum + stock.buyPrice * stock.quantity, 0);
        const totalValue = stocks.reduce((sum, stock) => sum + stock.evaluatedValue, 0);
        const profit = totalValue - totalBuy;
        return <div className={styles.tableWrap} key={market}><h3>{market === 'KR' ? '국내 주식 (KRW)' : '미국 주식 (USD)'}</h3><div className={styles.marketSummary}><span>매수금액 <strong>{money(totalBuy, market)}</strong></span><span>평가금액 <strong>{money(totalValue, market)}</strong></span><span>손익 <strong className={profit >= 0 ? styles.positive : styles.negative}>{money(profit, market)} · {formatRate(totalBuy ? profit / totalBuy * 100 : 0)}</strong></span></div><table><thead><tr><th>종목</th><th>매수가</th><th>현재가</th><th>수량</th><th>평가금액</th><th>손익</th><th>수익률</th><th>관리</th></tr></thead><tbody>
          {stocks.map((stock) => <tr key={stock.id}><td><strong>{stock.name ?? stock.ticker}</strong><small>{stock.ticker}</small></td>{editing === stock.id ? <>
            <td><input aria-label={`${stock.ticker} 매수가`} inputMode="decimal" type="text" value={editDraft.buyPrice} onChange={(event) => setEditDraft({ ...editDraft, buyPrice: formatNumericInput(event.target.value) })} disabled={isSaving} /></td><td>{money(stock.currentPrice, stock.market)}</td><td><input aria-label={`${stock.ticker} 수량`} inputMode="decimal" type="text" value={editDraft.quantity} onChange={(event) => setEditDraft({ ...editDraft, quantity: formatNumericInput(event.target.value) })} disabled={isSaving} /></td><td>{money(stock.evaluatedValue, stock.market)}</td><td>{money(stock.profitAmount, stock.market)}</td><td className={stock.profitRate >= 0 ? styles.positive : styles.negative}>{formatRate(stock.profitRate)}</td><td><button disabled={isSaving} onClick={() => void save(stock.id)}>저장</button><button disabled={isSaving} onClick={() => setEditing(null)}>취소</button></td>
          </> : <><td>{money(stock.buyPrice, stock.market)}</td><td>{prices[stock.ticker] === undefined ? '시세 미조회' : money(stock.currentPrice, stock.market)}</td><td>{stock.quantity.toLocaleString('ko-KR')}</td><td>{money(stock.evaluatedValue, stock.market)}</td><td className={stock.profitAmount >= 0 ? styles.positive : styles.negative}>{money(stock.profitAmount, stock.market)}</td><td className={stock.profitRate >= 0 ? styles.positive : styles.negative}>{formatRate(stock.profitRate)}</td><td><button disabled={isSaving} onClick={() => { setEditing(stock.id); setEditDraft({ buyPrice: formatNumericInput(String(stock.buyPrice)), quantity: formatNumericInput(String(stock.quantity)) }); }}>수정</button><button disabled={isSaving} onClick={() => void remove(stock.id, stock.name ?? stock.ticker)}>삭제</button></td></>}</tr>)}
        </tbody><tfoot><tr><th colSpan={4}>합계</th><td>{money(totalValue, market)}</td><td className={profit >= 0 ? styles.positive : styles.negative}>{money(profit, market)}</td><td className={profit >= 0 ? styles.positive : styles.negative}>{formatRate(totalBuy ? profit / totalBuy * 100 : 0)}</td><td /></tr></tfoot></table></div>;
      })}
    </>}
  </section>;
}
