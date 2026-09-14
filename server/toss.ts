import type { Plugin, Connect } from 'vite';
import { createStockSearch } from './stockSearch.ts';
import type { StockSearchItem } from '../src/types/market.ts';

const BASE = 'https://openapi.tossinvest.com';
export function tossPlugin(env: Record<string, string>): Plugin {
  let token: { value: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    if (pending) return pending;
    pending = (async () => {
      const clientId = env.TOSS_CLIENT_ID;
      const clientSecret = env.TOSS_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('.env.local에 TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET을 설정해주세요.');
      const response = await fetch(`${BASE}/oauth2/token`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      });
      if (!response.ok) throw new Error(`토스 인증 실패 (${response.status}). 키와 허용 IP를 확인해주세요.`);
      const data = await response.json() as { access_token?: unknown; expires_in?: unknown };
      if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || data.expires_in <= 0) throw new Error('토큰 응답이 올바르지 않습니다.');
      token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
      return token.value;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  const searchStocks = createStockSearch(async () => {
    const items: StockSearchItem[] = [];
    const markets = ['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX', 'KR_ETC', 'US_ETC'];
    for (const [position, market] of markets.entries()) {
      // STOCK_ALL allows one request per second. Keep market requests sequential.
      if (position) await new Promise((resolve) => setTimeout(resolve, 1100));
      const request = async () => fetch(`${BASE}/api/v1/stocks/all?market=${market}&status=ACTIVE`, {
        headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(15_000),
      });
      let response = await request();
      if (response.status === 401) { token = undefined; response = await request(); }
      if (!response.ok) throw new Error(`종목 목록 조회 실패 (${response.status}). 잠시 후 다시 검색해주세요.`);
      const data = await response.json() as { result?: unknown };
      if (!Array.isArray(data.result)) throw new Error('잘못된 종목 목록 응답입니다.');
      for (const row of data.result) {
        if (!row || typeof row.symbol !== 'string' || typeof row.name !== 'string') throw new Error('종목 정보가 누락되었습니다.');
        items.push({ symbol: row.symbol, name: row.name, market });
      }
    }
    return items;
  });
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/toss/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const endpoint = url.pathname.slice('/api/toss/'.length);
    if (req.method !== 'GET' || !['search', 'stocks', 'prices', 'candles', 'exchange-rate'].includes(endpoint)) {
      res.statusCode = 404; res.end('{}'); return;
    }
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        res.statusCode = 403; res.end('{}'); return;
      }
      if (endpoint === 'search') {
        const query = url.searchParams.get('q')?.trim() ?? '';
        if (query.length > 80) { res.statusCode = 400; res.end(JSON.stringify({ message: '검색어는 80자 이내로 입력해주세요.' })); return; }
        res.end(JSON.stringify({ result: await searchStocks(query) })); return;
      }
      const params = new URLSearchParams();
      if (endpoint === 'exchange-rate') {
        params.set('baseCurrency', 'USD');
        params.set('quoteCurrency', 'KRW');
      } else if (endpoint === 'candles') {
        const symbol = url.searchParams.get('symbol') ?? '';
        const count = Number(url.searchParams.get('count') ?? 90);
        if (!/^[A-Za-z0-9.-]+$/.test(symbol) || !Number.isInteger(count) || count < 1 || count > 200) throw new Error('종목 또는 조회 개수가 올바르지 않습니다.');
        params.set('symbol', symbol); params.set('count', String(count)); params.set('interval', '1d'); params.set('adjusted', 'true');
        const before = url.searchParams.get('before');
        if (before) {
          if (!Number.isFinite(Date.parse(before))) throw new Error('조회 시각이 올바르지 않습니다.');
          params.set('before', before);
        }
      } else {
        const symbols = url.searchParams.get('symbols') ?? '';
        if (!/^[A-Za-z0-9.-]+(,[A-Za-z0-9.-]+)*$/.test(symbols) || symbols.split(',').length > 200) throw new Error('종목은 1~200개 입력해주세요.');
        params.set('symbols', symbols);
      }
      const request = async () => fetch(`${BASE}/api/v1/${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(15_000),
      });
      let response = await request();
      if (response.status === 401) { token = undefined; response = await request(); }
      if (!response.ok) {
        res.statusCode = response.status;
        res.end(JSON.stringify({ message: `토스 조회 실패 (${response.status}). 종목 코드, API 권한 및 호출 한도를 확인해주세요.` })); return;
      }
      res.end(JSON.stringify(await response.json()));
    } catch (error) {
      res.statusCode = 502;
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : '토스 API 연결에 실패했습니다.' }));
    }
  };
  return { name: 'toss-market-data', configureServer(server) { server.middlewares.use(middleware); } };
}
