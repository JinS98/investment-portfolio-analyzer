import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchStocks, fetchQuotes, fetchCandlePage, searchStocks } from '../services/tossApi';
import type { StockInfo, Quote, CandlePage, StockSearchItem } from '../types/market';
import styles from './MarketDataPanel.module.scss';

export function MarketDataPanel() {
  const [symbol, setSymbol] = useState('005930');
  const [selected, setSelected] = useState<StockSearchItem | null>(null);
  const [suggestions, setSuggestions] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!open || selected || composing || !symbol.trim()) return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchStocks(symbol.trim(), AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]))
        .then((items) => { if (current) setSuggestions(items); })
        .catch((err: unknown) => { if (current) setSearchError(err instanceof Error ? err.message : '검색에 실패했습니다.'); })
        .finally(() => { if (current) setSearching(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [symbol, open, selected, composing]);
  function choose(item: StockSearchItem) {
    setSelected(item); setSymbol(item.name); setOpen(false); setSuggestions([]); setSearching(false); setActive(-1); setSearchError('');
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ stock: StockInfo; quote: Quote; page: CandlePage } | null>(null);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (composing) return;
    if (!selected && !/^[A-Za-z0-9.-]+$/.test(symbol.trim())) {
      setError('검색 결과에서 조회할 종목을 선택해주세요.'); return;
    }
    setOpen(false);
    setLoading(true); setError(''); setResult(null);
    try {
      const ticker = selected?.symbol ?? symbol.trim().toUpperCase();
      const [stocks, quotes, page] = await Promise.all([fetchStocks([ticker]), fetchQuotes([ticker]), fetchCandlePage(ticker)]);
      const stock = stocks.find((item) => item.symbol === ticker);
      const quote = quotes.find((item) => item.symbol === ticker);
      if (!stock || !quote) throw new Error('조회된 종목 또는 현재가가 없습니다. 종목 코드를 확인해주세요.');
      setResult({ stock, quote, page });
    } catch (err) { setError(err instanceof Error ? err.message : '조회에 실패했습니다.'); }
    finally { setLoading(false); }
  }
  return <section className={styles.panel} aria-busy={loading}>
    <h2>종목·현재가·일봉 조회</h2>
    <form onSubmit={search} className={styles.form}>
      <label htmlFor="stock-symbol">종목명 또는 코드</label>
      <div className={styles.searchBox} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setSearching(false); }
      }}>
      <input id="stock-symbol" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="stock-suggestions"
        aria-activedescendant={open && active >= 0 ? `stock-option-${active}` : undefined}
        value={symbol} maxLength={80} autoComplete="off"
        onFocus={() => { if (!selected) setOpen(true); }}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onChange={(event) => { setSymbol(event.target.value); setSelected(null); setSuggestions([]); setSearchError(''); setSearching(false); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { setOpen(false); setSearching(false); }
          if (open && suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault(); setActive((index) => event.key === 'ArrowDown' ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1));
          }
          if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
        }} placeholder="삼성전자, 애플, AAPL" required disabled={loading} />
      {open && <div className={styles.suggestions}>
        {searching && <p role="status">종목 검색 중… 처음 검색할 때는 목록 준비에 잠시 시간이 걸립니다.</p>}
        {searchError && <p role="alert">{searchError}</p>}
        <ul id="stock-suggestions" role="listbox" aria-label="종목 검색 결과">
          {suggestions.map((item, index) => <li key={`${item.market}-${item.symbol}`} id={`stock-option-${index}`} role="option" aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
            <strong>{item.name}</strong> <span>{item.symbol} · {item.market}</span>
          </li>)}
        </ul>
        {!searching && !searchError && symbol.trim() && !suggestions.length && <p>검색 결과에서 종목을 선택하세요. 코드로 직접 조회할 수도 있습니다.</p>}
      </div>}
      </div>
      <button disabled={loading}>{loading ? '조회 중…' : '조회'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <>
      <h3>{result.stock.name} ({result.stock.symbol})</h3>
      <p>{result.stock.englishName} · {result.stock.market}</p>
      <p>현재가: {result.quote.price.toLocaleString('ko-KR')} {result.quote.currency}</p>
      <p>시세 기준: {result.quote.timestamp ? new Date(result.quote.timestamp).toLocaleString('ko-KR') : '제공되지 않음'}</p>
      <p>일봉 {result.page.candles.length}개 조회 · 최근 10개 표시</p>
      {result.page.candles.length === 0 ? <p>일봉 데이터가 없습니다.</p> : <div className={styles.scroll}><table>
        <thead><tr><th>거래일</th><th>시가</th><th>고가</th><th>저가</th><th>종가</th><th>거래량</th><th>통화</th></tr></thead>
        <tbody>{result.page.candles.slice(-10).reverse().map((candle) => <tr key={candle.timestamp}>
          <td>{candle.date}</td>{[candle.openPrice, candle.highPrice, candle.lowPrice, candle.closePrice, candle.volume].map((value, index) => <td key={index}>{value.toLocaleString('ko-KR')}</td>)}<td>{candle.currency}</td>
        </tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
