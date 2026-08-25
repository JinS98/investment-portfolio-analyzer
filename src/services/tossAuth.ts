/**
 * 토스증권 OAuth 2.0 토큰 관리
 *
 * ⚠️  client_secret은 절대 프론트엔드 번들에 노출하면 안 됩니다.
 *     현재는 로컬 개발 환경 전용으로 .env.local에 보관합니다.
 *     Week 4 이후 Firebase Functions를 통해 토큰 발급을 서버 사이드로 이동 예정.
 *
 * 공식 문서: https://developers.tossinvest.com/docs
 */

const TOSS_BASE_URL = 'https://openapi.tossinvest.com';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

let tokenCache: TokenCache | null = null;

/**
 * 액세스 토큰 발급 (만료 시 자동 재발급)
 */
export const getTossAccessToken = async (): Promise<string> => {
  const now = Date.now();

  // 유효한 캐시가 있으면 재사용 (만료 60초 전에 갱신)
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.accessToken;
  }

  const clientId = import.meta.env.VITE_TOSS_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_TOSS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[tossAuth] VITE_TOSS_CLIENT_ID / VITE_TOSS_CLIENT_SECRET 환경변수가 설정되지 않았습니다.\n' +
        '.env.local 파일을 확인해주세요.',
    );
  }

  const res = await fetch(`${TOSS_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[tossAuth] 토큰 발급 실패: ${res.status} ${err}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
};

/** 토큰 캐시 강제 초기화 (로그아웃 등) */
export const clearTossToken = () => {
  tokenCache = null;
};

/** 토스 API 기본 URL */
export { TOSS_BASE_URL };
