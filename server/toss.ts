import type { Plugin, Connect } from 'vite';
import { createStockSearch } from './stockSearch.ts';
import type { StockSearchItem } from '../src/types/market.ts';

const BASE = 'https://openapi.tossinvest.com';
const HISTORICAL_FX_BASE = 'https://api.frankfurter.dev/v2';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const historicalFxCache = new Map<string, { resolvedDate: string; rate: number }>();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function historicalUsdKrwRate(requestedDate: string) {
  const cached = historicalFxCache.get(requestedDate);
  if (cached) return cached;

  let candidate = requestedDate;
  for (let offset = 0; offset <= 7; offset += 1) {
    const response = await fetch(
      `${HISTORICAL_FX_BASE}/rate/usd/krw?${new URLSearchParams({ date: candidate })}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (response.ok) {
      const data = (await response.json()) as { date?: unknown; rate?: unknown };
      const rate = Number(data.rate);
      const resolvedDate = typeof data.date === 'string' ? data.date : candidate;
      if (isCalendarDate(resolvedDate) && Number.isFinite(rate) && rate > 0) {
        const result = { resolvedDate, rate };
        historicalFxCache.set(requestedDate, result);
        return result;
      }
      throw new Error('과거 환율 데이터 형식이 올바르지 않습니다.');
    }
    if (response.status !== 404 && response.status !== 422) {
      throw new Error(`과거 환율 조회에 실패했습니다. (${response.status})`);
    }
    candidate = previousDate(candidate);
  }
  throw new Error('거래일 기준 7일 이내의 환율을 찾지 못했습니다.');
}

async function usIndexData(
  symbol: 'NASDAQ' | 'SP500',
  range: '1d' | '1mo' = '1mo',
  interval: '5m' | '1d' = '1d',
) {
  const yahooSymbol = symbol === 'NASDAQ' ? '^IXIC' : '^GSPC';
  const response = await fetch(
    `${YAHOO_CHART_BASE}/${encodeURIComponent(yahooSymbol)}?${new URLSearchParams({ range, interval })}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error(`미국 지수 조회에 실패했습니다. (${response.status})`);
  const payload = (await response.json()) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown; chartPreviousClose?: unknown }; timestamp?: unknown; indicators?: { quote?: Array<{ close?: unknown }> } }> };
  };
  const result = payload.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const candles = timestamps.flatMap((timestamp, index) => {
    const closePrice = Number(closes[index]);
    if (typeof timestamp !== 'number' || !Number.isFinite(closePrice)) return [];
    return [{ timestamp: new Date(timestamp * 1000).toISOString(), closePrice }];
  });
  const price = Number(result?.meta?.regularMarketPrice ?? candles.at(-1)?.closePrice);
  const basePrice = Number(result?.meta?.chartPreviousClose);
  if (!Number.isFinite(price) || !candles.length) throw new Error('미국 지수 응답이 올바르지 않습니다.');
  return {
    symbol,
    price,
    changeRate: Number.isFinite(basePrice) && basePrice > 0 ? (price - basePrice) / basePrice : null,
    candles,
  };
}

const insightCache = new Map<string, { expiresAt: number; value: unknown }>();

const asFinite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '').replaceAll('&quot;', '"').replaceAll('&amp;', '&').trim();

async function stockInsights(env: Record<string, string>, symbol: string, name: string, market: 'KR' | 'US') {
  const cacheKey = `${market}:${symbol}:${name}`;
  const cached = insightCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const externalSymbol = market === 'KR' ? `${symbol}.KO` : `${symbol}.US`;
  const eodToken = env.EODHD_API_TOKEN;
  const naverId = env.NAVER_CLIENT_ID;
  const naverSecret = env.NAVER_CLIENT_SECRET;
  const marketauxToken = env.MARKETAUX_API_TOKEN;
  const [fundamentals, news] = await Promise.all([
    eodToken
      ? fetch(`https://eodhd.com/api/fundamentals/${encodeURIComponent(externalSymbol)}?${new URLSearchParams({ api_token: eodToken, fmt: 'json' })}`, { signal: AbortSignal.timeout(15_000) })
          .then(async (response) => {
            if (!response.ok) return { data: null, message: '재무 지표 API를 사용할 수 없습니다.' };
            const data = (await response.json()) as { Highlights?: Record<string, unknown> };
            const values = data.Highlights;
            if (!values) return { data: null, message: '해당 종목의 재무 지표가 없습니다.' };
            return {
              data: {
                per: asFinite(values.PERatio),
                pbr: asFinite(values.PriceBookMRQ),
                roe: asFinite(values.ReturnOnEquityTTM),
                dividendYield: asFinite(values.DividendYield),
                marketCap: asFinite(values.MarketCapitalization),
              },
              message: null,
            };
          })
          .catch(() => ({ data: null, message: '재무 지표를 불러오지 못했습니다.' }))
      : Promise.resolve({ data: null, message: 'EODHD_API_TOKEN을 설정하면 재무 지표를 볼 수 있습니다.' }),
    market === 'KR'
      ? naverId && naverSecret
        ? fetch(`https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({ query: name, display: '3', sort: 'date' })}`, {
            headers: { 'X-Naver-Client-Id': naverId, 'X-Naver-Client-Secret': naverSecret },
            signal: AbortSignal.timeout(15_000),
          }).then(async (response) => {
            if (!response.ok) return { items: [], message: '국내 뉴스 API를 사용할 수 없습니다.' };
            const data = (await response.json()) as { items?: Array<Record<string, unknown>> };
            return {
              items: (data.items ?? []).flatMap((item) =>
                typeof item.title === 'string' && typeof item.link === 'string'
                  ? [{ title: stripHtml(item.title), url: typeof item.originallink === 'string' ? item.originallink : item.link, publishedAt: typeof item.pubDate === 'string' ? item.pubDate : null, source: '네이버 뉴스', summary: typeof item.description === 'string' ? stripHtml(item.description) : null }]
                  : [],
              ),
              message: null,
            };
          }).catch(() => ({ items: [], message: '국내 뉴스를 불러오지 못했습니다.' }))
        : Promise.resolve({ items: [], message: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정하면 국내 뉴스를 볼 수 있습니다.' })
      : marketauxToken
        ? fetch(`https://api.marketaux.com/v1/news/all?${new URLSearchParams({ symbols: symbol, filter_entities: 'true', limit: '3', api_token: marketauxToken })}`, { signal: AbortSignal.timeout(15_000) })
            .then(async (response) => {
              if (!response.ok) return { items: [], message: '해외 뉴스 API를 사용할 수 없습니다.' };
              const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
              return {
                items: (data.data ?? []).flatMap((item) =>
                  typeof item.title === 'string' && typeof item.url === 'string'
                    ? [{ title: item.title, url: item.url, publishedAt: typeof item.published_at === 'string' ? item.published_at : null, source: typeof item.source === 'string' ? item.source : 'Marketaux', summary: typeof item.description === 'string' ? item.description : null }]
                    : [],
                ),
                message: null,
              };
            }).catch(() => ({ items: [], message: '해외 뉴스를 불러오지 못했습니다.' }))
        : Promise.resolve({ items: [], message: 'MARKETAUX_API_TOKEN을 설정하면 해외 뉴스를 볼 수 있습니다.' }),
  ]);
  const value = { fundamentals: fundamentals.data, fundamentalsMessage: fundamentals.message, news: news.items, newsMessage: news.message };
  insightCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, value });
  return value;
}

export function tossPlugin(env: Record<string, string>): Plugin {
  let token: { value: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    if (pending) return pending;
    pending = (async () => {
      const clientId = env.TOSS_CLIENT_ID;
      const clientSecret = env.TOSS_CLIENT_SECRET;
      if (!clientId || !clientSecret)
        throw new Error('.env.local에 TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET을 설정해주세요.');
      const response = await fetch(`${BASE}/oauth2/token`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (!response.ok)
        throw new Error(`토스 인증 실패 (${response.status}). 키와 허용 IP를 확인해주세요.`);
      const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (
        typeof data.access_token !== 'string' ||
        typeof data.expires_in !== 'number' ||
        data.expires_in <= 0
      )
        throw new Error('토큰 응답이 올바르지 않습니다.');
      token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
      return token.value;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  }
  const searchStocks = createStockSearch(async () => {
    const items: StockSearchItem[] = [];
    const markets = ['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX', 'KR_ETC', 'US_ETC'];
    for (const [position, market] of markets.entries()) {
      // STOCK_ALL allows one request per second. Keep market requests sequential.
      if (position) await new Promise((resolve) => setTimeout(resolve, 1100));
      const request = async () =>
        fetch(`${BASE}/api/v1/stocks/all?market=${market}&status=ACTIVE`, {
          headers: { Authorization: `Bearer ${await accessToken()}` },
          signal: AbortSignal.timeout(15_000),
        });
      let response = await request();
      if (response.status === 401) {
        token = undefined;
        response = await request();
      }
      if (!response.ok)
        throw new Error(`종목 목록 조회 실패 (${response.status}). 잠시 후 다시 검색해주세요.`);
      const data = (await response.json()) as { result?: unknown };
      if (!Array.isArray(data.result)) throw new Error('잘못된 종목 목록 응답입니다.');
      for (const row of data.result) {
        if (!row || typeof row.symbol !== 'string' || typeof row.name !== 'string')
          throw new Error('종목 정보가 누락되었습니다.');
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
    if (
      req.method !== 'GET' ||
      ![
        'search',
        'stocks',
        'prices',
        'candles',
        'exchange-rate',
        'historical-exchange-rate',
        'rankings',
        'indicator-prices',
        'indicator-candles',
        'us-indices',
        'stock-insights',
      ].includes(endpoint)
    ) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        res.statusCode = 403;
        res.end('{}');
        return;
      }
      if (endpoint === 'search') {
        const query = url.searchParams.get('q')?.trim() ?? '';
        if (query.length > 80) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: '검색어는 80자 이내로 입력해주세요.' }));
          return;
        }
        res.end(JSON.stringify({ result: await searchStocks(query) }));
        return;
      }
      if (endpoint === 'historical-exchange-rate') {
        const requestedDate = url.searchParams.get('date') ?? '';
        if (!isCalendarDate(requestedDate)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: '거래일은 YYYY-MM-DD 형식으로 입력해 주세요.' }));
          return;
        }
        const rate = await historicalUsdKrwRate(requestedDate);
        res.end(
          JSON.stringify({
            result: {
              baseCurrency: 'USD',
              quoteCurrency: 'KRW',
              requestedDate,
              resolvedDate: rate.resolvedDate,
              rate: rate.rate,
              source: 'Frankfurter daily reference rate',
            },
          }),
        );
        return;
      }
      if (endpoint === 'stock-insights') {
        const symbol = url.searchParams.get('symbol') ?? '';
        const name = url.searchParams.get('name')?.trim() ?? '';
        const market = url.searchParams.get('market');
        if (!/^[A-Za-z0-9.-]+$/.test(symbol) || !name || !['KR', 'US'].includes(market ?? '')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: '종목 정보를 확인해 주세요.' }));
          return;
        }
        res.end(JSON.stringify({ result: await stockInsights(env, symbol, name, market as 'KR' | 'US') }));
        return;
      }
      if (endpoint === 'us-indices') {
        const range = url.searchParams.get('range') === '1d' ? '1d' : '1mo';
        const interval = range === '1d' ? '5m' : '1d';
        res.end(JSON.stringify({ result: await Promise.all([usIndexData('NASDAQ', range, interval), usIndexData('SP500', range, interval)]) }));
        return;
      }
      const params = new URLSearchParams();
      let upstreamEndpoint = endpoint;
      if (endpoint === 'exchange-rate') {
        params.set('baseCurrency', 'USD');
        params.set('quoteCurrency', 'KRW');
      } else if (endpoint === 'candles') {
        const symbol = url.searchParams.get('symbol') ?? '';
        const count = Number(url.searchParams.get('count') ?? 90);
        if (
          !/^[A-Za-z0-9.-]+$/.test(symbol) ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 200
        )
          throw new Error('종목 또는 조회 개수가 올바르지 않습니다.');
        params.set('symbol', symbol);
        params.set('count', String(count));
        params.set('interval', '1d');
        params.set('adjusted', 'true');
        const before = url.searchParams.get('before');
        if (before) {
          if (!Number.isFinite(Date.parse(before)))
            throw new Error('조회 시각이 올바르지 않습니다.');
          params.set('before', before);
        }
      } else if (endpoint === 'rankings') {
        const marketCountry = url.searchParams.get('marketCountry');
        const count = Number(url.searchParams.get('count') ?? 20);
        if (!['KR', 'US'].includes(marketCountry ?? '') || !Number.isInteger(count) || count < 1 || count > 100) {
          throw new Error('랭킹 시장과 조회 개수를 확인해 주세요.');
        }
        params.set('type', 'MARKET_TRADING_AMOUNT');
        params.set('marketCountry', marketCountry!);
        params.set('duration', 'realtime');
        params.set('count', String(count));
      } else if (endpoint === 'indicator-prices') {
        const symbols = url.searchParams.get('symbols') ?? '';
        if (!/^(KOSPI|KOSDAQ)(,(KOSPI|KOSDAQ))*$/.test(symbols)) {
          throw new Error('지원하는 지수 심볼을 입력해 주세요.');
        }
        params.set('symbols', symbols);
        upstreamEndpoint = 'market-indicators/prices';
      } else if (endpoint === 'indicator-candles') {
        const symbol = url.searchParams.get('symbol') ?? '';
        const count = Number(url.searchParams.get('count') ?? 30);
        const interval = url.searchParams.get('interval') === '1m' ? '1m' : '1d';
        if (!['KOSPI', 'KOSDAQ'].includes(symbol) || !Number.isInteger(count) || count < 2 || count > 200) {
          throw new Error('지원하는 지수와 조회 개수를 확인해 주세요.');
        }
        params.set('interval', interval);
        params.set('count', String(count));
        upstreamEndpoint = `market-indicators/${symbol}/candles`;
      } else {
        const symbols = url.searchParams.get('symbols') ?? '';
        if (!/^[A-Za-z0-9.-]+(,[A-Za-z0-9.-]+)*$/.test(symbols) || symbols.split(',').length > 200)
          throw new Error('종목은 1~200개 입력해주세요.');
        params.set('symbols', symbols);
      }
      const request = async () =>
        fetch(`${BASE}/api/v1/${upstreamEndpoint}?${params}`, {
          headers: { Authorization: `Bearer ${await accessToken()}` },
          signal: AbortSignal.timeout(15_000),
        });
      let response = await request();
      if (response.status === 401) {
        token = undefined;
        response = await request();
      }
      if (!response.ok) {
        res.statusCode = response.status;
        res.end(
          JSON.stringify({
            message: `토스 조회 실패 (${response.status}). 종목 코드, API 권한 및 호출 한도를 확인해주세요.`,
          }),
        );
        return;
      }
      res.end(JSON.stringify(await response.json()));
    } catch (error) {
      res.statusCode = 502;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : '토스 API 연결에 실패했습니다.',
        }),
      );
    }
  };
  return {
    name: 'toss-market-data',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
