/**
 * 토스증권 오픈API — 시세·종목·계좌 서비스
 * 기본 URL: https://openapi.tossinvest.com
 *
 * 제공 기능:
 *  - 현재가 조회 (국내 KRX + 미국 주식 통합)
 *  - 캔들(일봉) 조회 — 리스크 계산·월별 스냅샷용
 *  - 계좌 보유 주식 조회 (Week 4 계좌 연동 시 활성화)
 */

import { getTossAccessToken, TOSS_BASE_URL } from './tossAuth';
import type { PriceMap, TossCandleItem, TossHolding } from '../types';

// ────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────
const isTossConfigured = (): boolean =>
  !!(import.meta.env.VITE_TOSS_CLIENT_ID && import.meta.env.VITE_TOSS_CLIENT_SECRET);

/** 인증 헤더 생성 */
const authHeaders = async (): Promise<HeadersInit> => ({
  Authorization: `Bearer ${await getTossAccessToken()}`,
  'Content-Type': 'application/json',
});

// ────────────────────────────────────────────
// Mock 데이터 (토스 API 미설정 시 사용)
// ────────────────────────────────────────────
const MOCK_PRICES: PriceMap = {
  // 미국 주식
  AAPL: 182.52,
  TSM: 110.34,
  AMZN: 178.25,
  MSFT: 415.6,
  NVDA: 875.4,
  // 국내 주식 (KRX 코드)
  '005930': 72000,  // 삼성전자
  '035720': 54000,  // 카카오
  '000660': 132000, // SK하이닉스
};

const MOCK_CANDLES: TossCandleItem[] = Array.from({ length: 30 }, (_, i) => {
  const base = 100;
  const noise = (Math.random() - 0.5) * 10;
  const close = +(base + noise + i * 0.3).toFixed(2);
  return {
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    openPrice: +(close - Math.random() * 3).toFixed(2),
    highPrice: +(close + Math.random() * 3).toFixed(2),
    lowPrice: +(close - Math.random() * 3).toFixed(2),
    closePrice: close,
    volume: Math.floor(Math.random() * 1_000_000),
  };
});

// ────────────────────────────────────────────
// 현재가 조회
// ────────────────────────────────────────────
/**
 * 복수 종목 현재가 조회
 * 토스 API: GET /api/v1/prices?code={code1}&code={code2}...
 *
 * @param tickers - 국내: KRX 코드('005930'), 미국: 티커('AAPL')
 */
export const fetchCurrentPrices = async (tickers: string[]): Promise<PriceMap> => {
  if (!tickers.length) return {};

  if (!isTossConfigured()) {
    console.warn('[tossApi] 환경변수 미설정 — Mock 데이터를 사용합니다.');
    const result: PriceMap = {};
    tickers.forEach((t) => {
      if (MOCK_PRICES[t] !== undefined) result[t] = MOCK_PRICES[t];
    });
    return result;
  }

  try {
    const params = new URLSearchParams();
    tickers.forEach((t) => params.append('code', t));

    const res = await fetch(`${TOSS_BASE_URL}/api/v1/prices?${params}`, {
      headers: await authHeaders(),
    });

    if (!res.ok) throw new Error(`현재가 조회 실패: ${res.status}`);

    const data = await res.json();
    // 응답 구조: { items: [{ code, price, ... }] }
    const result: PriceMap = {};
    (data.items ?? []).forEach((item: { code: string; price: number }) => {
      result[item.code] = item.price;
    });
    return result;
  } catch (err) {
    console.error('[tossApi] fetchCurrentPrices error:', err);
    throw err;
  }
};

// ────────────────────────────────────────────
// 캔들(일봉) 조회
// ────────────────────────────────────────────
/**
 * 일봉 캔들 조회 — 리스크 계산(변동성·MDD) 및 월별 종가 스냅샷용
 * 토스 API: GET /api/v1/candles?code={code}&interval=day&count={count}
 *
 * @param ticker - 종목 코드 또는 티커
 * @param count  - 조회 일수 (기본 90일)
 */
export const fetchCandles = async (
  ticker: string,
  count = 90,
): Promise<TossCandleItem[]> => {
  if (!isTossConfigured()) {
    console.warn('[tossApi] 환경변수 미설정 — Mock 캔들 데이터를 사용합니다.');
    return MOCK_CANDLES.slice(-count);
  }

  try {
    const params = new URLSearchParams({
      code: ticker,
      interval: 'day',
      count: String(count),
    });

    const res = await fetch(`${TOSS_BASE_URL}/api/v1/candles?${params}`, {
      headers: await authHeaders(),
    });

    if (!res.ok) throw new Error(`캔들 조회 실패: ${res.status}`);

    const data = await res.json();
    // 응답 구조: { candles: [...] }
    return data.candles ?? [];
  } catch (err) {
    console.error('[tossApi] fetchCandles error:', err);
    throw err;
  }
};

/**
 * 특정 날짜의 종가 조회 (월별 스냅샷용)
 * 전달 마지막 거래일 종가를 가져올 때 사용
 */
export const fetchClosePriceAt = async (
  ticker: string,
  targetDate: string, // YYYY-MM-DD
): Promise<number | null> => {
  try {
    const candles = await fetchCandles(ticker, 30);
    const found = candles.find((c) => c.date <= targetDate);
    return found?.closePrice ?? null;
  } catch {
    return null;
  }
};

// ────────────────────────────────────────────
// 계좌 보유 주식 조회 (Week 4에서 활성화)
// ────────────────────────────────────────────
/**
 * 내 계좌 보유 주식 조회
 * 토스 API: GET /api/v1/accounts/holdings
 * 헤더: X-Tossinvest-Account: {account_id}
 *
 * @param accountId - 토스증권 계좌 번호
 */
export const fetchAccountHoldings = async (
  accountId: string,
): Promise<TossHolding[]> => {
  if (!isTossConfigured()) {
    console.warn('[tossApi] 환경변수 미설정 — 계좌 조회를 건너뜁니다.');
    return [];
  }

  try {
    const res = await fetch(`${TOSS_BASE_URL}/api/v1/accounts/holdings`, {
      headers: {
        ...(await authHeaders()),
        'X-Tossinvest-Account': accountId,
      },
    });

    if (!res.ok) throw new Error(`보유 주식 조회 실패: ${res.status}`);

    const data = await res.json();
    return data.holdings ?? [];
  } catch (err) {
    console.error('[tossApi] fetchAccountHoldings error:', err);
    throw err;
  }
};

/** 토스 API 설정 여부 확인 */
export { isTossConfigured };
