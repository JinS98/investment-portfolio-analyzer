# 투자 포트폴리오 분석기

국내·미국 주식 포트폴리오의 보유 현황, 거래 이력, 적립식 투자와 성과·리스크를 한곳에서 관리하는 웹 애플리케이션입니다. 토스증권 Open API로 시세와 시장 데이터를 조회하고, Firebase에 사용자별 포트폴리오 원장을 저장합니다.

> 이 서비스의 계산과 시장 데이터는 정보 제공 및 개인 포트폴리오 기록을 위한 것입니다. 투자 판단, 세무 또는 증권사 정산 자료로 사용하면 안 됩니다.

## 주요 기능

### 포트폴리오와 거래 원장

- 실제·가상 포트폴리오를 분리해 관리
- 매수·매도 이력 기반으로 보유 수량, 이동평균 평단가, 실현손익을 재계산
- 수수료·세금 입력, 거래 내역 검색·기간·유형 필터, 삭제 후 원장 재계산
- USD 보유분을 USD/KRW 환율로 환산하고 표시 통화를 전환

### 적립식 투자와 분석

- 종목별 적립식 자동매수 규칙과 예정일 기반 소급 반영
- 실제 포트폴리오 자동매수 건의 체결 단가·수량·비용 확인
- 시간가중수익률 기준의 포트폴리오 성과 및 코스피·S&P 500 비교
- 최근 90일 일봉 기반 변동성·최대 낙폭(MDD), 종목 집중도 리스크 진단

### 시장 탐색

- 국내·미국 시장의 실시간 거래대금 상위 종목 조회
- USD 거래대금을 원화로 환산한 국내·해외 통합 순위 및 시장별 순위
- 종목명·티커 검색, 현재가·전일 대비 등락률, 종목 상세 차트
- 코스피·코스닥·나스닥·S&P 500 지수 카드와 차트
- 선택 환경 변수 설정 시 종목 지표(PER, PBR, ROE, 배당수익률)와 뉴스 제공

### 사용성과 안정성

- 이메일/비밀번호 및 Google 로그인
- 밝은/어두운 테마와 반응형 레이아웃
- 시세·환율·검색·지수 차트 요청 캐시 및 중복 요청 공유
- 일부 시세 또는 지수 조회 실패 시, 성공한 데이터는 유지하고 실패 항목을 구분

## 기술 스택

- Frontend: React 19, TypeScript, Vite, Sass, Recharts
- State: Zustand
- Backend services: Firebase Authentication, Cloud Firestore
- Market data: 토스증권 Open API
- Optional data: EODHD, Naver Search API, Marketaux
- Quality: ESLint, Oxc linter, Prettier, Node.js test runner

## 시작하기

### 요구 사항

- Node.js 22.12 이상 권장
- 토스증권 Open API Client ID/Secret
- Firebase 프로젝트 (로그인·데이터 저장 기능 사용 시)

### 설치와 실행

```zsh
git clone https://github.com/JinS98/investment-portfolio-analyzer.git
cd investment-portfolio-analyzer
npm install
cp .env.local.example .env.local
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다.

## 환경 변수

`.env.local.example`을 복사해 `.env.local`을 만들고 값을 채웁니다. `.env.local`은 Git에 포함하지 않습니다.

| 변수                                     | 필수                     | 용도                            |
| ---------------------------------------- | ------------------------ | ------------------------------- |
| `TOSS_CLIENT_ID`                         | 시세·시장 데이터 사용 시 | 토스증권 Open API Client ID     |
| `TOSS_CLIENT_SECRET`                     | 시세·시장 데이터 사용 시 | 토스증권 Open API Client Secret |
| `VITE_FIREBASE_*`                        | 로그인·저장 사용 시      | Firebase 웹 앱 설정값           |
| `EODHD_API_TOKEN`                        | 선택                     | 종목 지표 조회                  |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 선택                     | 국내 종목 뉴스 조회             |
| `MARKETAUX_API_TOKEN`                    | 선택                     | 미국 종목 뉴스 조회             |

토스증권 WTS의 **설정 → Open API → 허용 IP 관리**에서 현재 네트워크의 공인 IP를 등록해야 합니다. 등록되지 않은 IP에서는 토큰 발급이 403으로 차단됩니다.

`VITE_` 접두사가 붙은 값은 브라우저 번들에 노출될 수 있습니다. 토스·외부 정보 API 키에는 절대 `VITE_` 접두사를 붙이지 마세요.

## 데이터 흐름

```text
Browser (React)
  ├─ Firebase Auth / Firestore: 사용자, 포트폴리오, 거래 원장
  └─ /api/toss/*
       ├─ 개발: Vite 개발 서버 미들웨어 → Toss Securities Open API
       └─ 배포: Firebase Hosting → tossApi Cloud Function (asia-northeast3) → Toss Securities Open API
```

거래 이력(`holdingHistories`)이 원본 데이터이며, 보유 상태(`holdings`)와 요약(`summary/current`)은 이력을 기준으로 다시 계산한 결과입니다. Firestore 규칙은 `users/{userId}/portfolios/**` 경로에서 본인 데이터만 읽고 쓰도록 배포해야 합니다.

## 검증 명령

```zsh
npm run typecheck
npm run lint
npm run build
node --experimental-strip-types --test tests/*.test.ts
```

## 주차별 개발 문서

| 주차 | 주제 | 문서 |
| --- | --- | --- |
| 1주차 | 프로젝트 기반 구성 | [문서](docs/week1-project-foundation.md) |
| 2주차 | 시장 데이터 조회 기반 | [문서](docs/week2-market-data-foundation.md) |
| 3주차 | 토스 API와 종목 검색 연결 | [문서](docs/week3-toss-api-and-stock-search.md) |
| 4주차 | Firebase 포트폴리오 연동 | [문서](docs/week4-firebase-integration.md) |
| 5주차 | 포트폴리오 시각화와 리스크 분석 | [문서](docs/week5-risk-and-visualization.md) |
| 6주차 | 이력 분석·인증·대시보드 고도화 | [문서](docs/week6-history-auth-dashboard.md) |
| 7주차 | 거래 원장 계산 정책 | [문서](docs/week7-calculation-policy.md) |
| 8주차 | 거래 원장 저장·복원 | [문서](docs/week8-ledger-storage.md) |
| 9주차 | 거래 기록 UI와 가상 포트폴리오 | [문서](docs/week9-transaction-ui.md) |
| 10주차 | 포트폴리오 표시 설정과 시세 UX | [문서](docs/week10-portfolio-display-and-quote-ux.md) |
| 11주차 | 테마와 대시보드 UX 개선 | [문서](docs/week11-theme-and-dashboard-ux.md) |
| 12주차 | 거래 원장과 대시보드 정교화 | [문서](docs/week12-ledger-and-dashboard-refinement.md) |
| 13주차 | 거래일 환율 기반 손익 | [문서](docs/week13-transaction-date-exchange-rate.md) |
| 14주차 | 시장 탐색과 외부 정보 | [문서](docs/week14-market-exploration.md), [API·검색 상세](docs/stock-search.md) |
| 15주차 | 시장 차트와 포트폴리오 UX 개선 | [문서](docs/week15-market-charts-and-portfolio-ux.md) |
| 16주차 | 적립식 투자 자동 반영 | [문서](docs/week16-recurring-investment-automation.md) |
| 17주차 | 적립식 투자 운영과 거래 이력 | [문서](docs/week17-recurring-operations.md) |
| 18주차 | 투자 분석과 운영 안정화 | [문서](docs/week18-analysis-and-stability.md) |
| 19주차 | 자동 매수 관리와 알림 | [문서](docs/week19-automatic-purchase-management.md) |
| 20주차 | 배포용 API 전환 | [문서](docs/week20-deployment-api-transition.md) |

## 배포 구성

개발 환경에서는 Vite 미들웨어가 `/api/toss/*`를 처리합니다. 배포 환경에서는 Firebase Hosting이 같은 경로를 `tossApi` Cloud Function으로 전달하므로, 브라우저 코드는 개발과 배포에서 같은 API 경로를 사용합니다.

외부 API 키는 [`functions/.env.example`](functions/.env.example)를 복사해 `functions/.env` 또는 배포 환경 변수로 설정합니다. `TOSS_CLIENT_SECRET`을 비롯한 키에는 `VITE_` 접두사를 사용하지 마세요. 이 값은 함수 런타임에서만 읽히며 브라우저 번들에 포함되지 않습니다.

```zsh
npm run build
cd functions && npm run build
firebase deploy --only functions,hosting,firestore:rules
```

`tossApi`는 엔드포인트별 공유 캐시 헤더와 인스턴스별 요청 제한을 적용합니다. 배포 전 Firebase 프로젝트 연결과 함수 환경 변수 설정을 완료해야 합니다.
