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

- 프런트엔드: Node.js 22.12 이상, 배포용 Functions: Node.js 20, Firestore 에뮬레이터 검사: Java 21
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

`VITE_` 접두사가 붙은 값은 브라우저 번들에 노출될 수 있습니다. 토스·외부 정보 API 키에는 절대 `VITE_` 접두사를 붙이지 마세요. 배포 시 서버 키는 `functions/.env.example`을 기준으로 Functions 환경에 별도로 설정합니다. 로컬 `.env.local` 값만으로 배포된 Function의 키가 설정되지는 않습니다.

## 데이터 흐름

```text
Browser (React)
  ├─ Firebase Auth / Firestore: 사용자, 포트폴리오, 거래 원장
  └─ /api/toss/*
       ├─ 개발: Vite 개발 서버 미들웨어 → Toss Securities Open API
       └─ 배포: Firebase Hosting → tossApi Cloud Function (asia-northeast3) → Toss Securities Open API
```

거래 이력(`holdingHistories`)이 원본 데이터이며, 보유 상태(`holdings`)와 요약(`summary/current`)은 이력을 기준으로 다시 계산한 결과입니다. Firestore 규칙은 `users/{userId}/portfolios/**` 경로에서 본인 데이터만 읽고 쓰도록 배포해야 합니다.

### 기존 보유 데이터 이관 범위

기존 직접 입력형 보유 종목은 실제 포트폴리오의 초기 매수 기록(`LEGACY_IMPORT`)으로 한 번 이관합니다. 이관 전의 개별 매수·매도 내역, 수수료·세금, 실현손익은 원본 보유 데이터만으로 복원할 수 없어 **이번 출시의 복원 범위에 포함하지 않습니다**. 이관 기록은 현재 보유 상태를 계산하기 위한 시작점이며 실제 과거 체결 내역의 증빙이 아닙니다. 과거 거래 전체를 다시 입력·복원하는 기능은 후속 작업입니다. 자세한 기준은 [35일차 배포 문서](docs/day35-release-documentation.md)를 참고하세요.

## 프런트엔드 컴포넌트 구조

| 위치           | 역할과 예시                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`      | 앱 내비게이션과 헤더 등 화면 공통 진입점                                                                                        |
| `src/pages`    | 대시보드·시장 탐색 등 페이지 조합. 대시보드 패널의 ID·화면·크기·렌더링은 `src/pages/Dashboard/panelRegistry.tsx`에 등록         |
| `src/widgets`  | 여러 기능을 조합한 대시보드 패널. 구현은 `src/widgets/dashboard-panels/ui`, 외부 공개는 `src/widgets/dashboard-panels/index.ts` |
| `src/features` | 거래, 포트폴리오 관리, 자동매수, 거래 내역처럼 사용자 동작 단위의 `model`·`ui`와 공개 `index.ts`                                |
| `src/entities` | 종목·포트폴리오의 공통 모델과 표현                                                                                              |
| `src/shared`   | `Button`, `Dialog`, `Drawer`, `Collapse` 같은 공통 UI와 범용 함수·스타일                                                        |

새 기능은 해당 `features/<기능>`의 `model`·`ui`에 구현하고 `index.ts`에서 필요한 항목만 공개합니다. 다른 기능이나 페이지에서는 `@features/<기능>`처럼 공개 API를 가져오고, 같은 기능 내부에서는 상대 경로를 사용합니다. 대시보드 패널을 추가할 때는 widget 공개 API에 내보낸 뒤 `PANEL_REGISTRY`에 화면, 제목, 크기와 렌더링을 등록합니다. `shared → entities → features → widgets → pages → app` 방향으로 상위 계층을 조합하며, 역방향 import·공개 API 우회·런타임 순환은 `npm run lint:architecture`로 검사합니다.

## 검증 명령

프런트엔드는 Node.js 22, Functions 빌드는 Node.js 20을 사용합니다. [GitHub Actions CI](.github/workflows/ci.yml)는 `main` push와 pull request에서 아래 명령을 실행합니다.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check

# Node.js 20에서 Functions 빌드·API 테스트
npm ci --prefix functions
npm run build --prefix functions
npm test --prefix functions

# Java 21이 설치된 환경에서 Auth·Firestore 에뮬레이터 검증
npm run test:rules
npm run test:day34
```

`test:rules`와 `test:day34`는 운영 프로젝트 대신 `demo-*` 에뮬레이터 프로젝트를 사용합니다. 화면 조작이 필요한 guest 시나리오 S01~S08과 고정 viewport·테마 조합은 [21일차 기준선](docs/day21-refactoring-baseline.md)에 정리되어 있습니다. 자동 테스트 통과와 화면 검증 완료는 별도로 판정합니다.

## 일차별 개발 문서

| 일차      | 주제                            | 문서                                                                                                        |
| --------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1일차     | 프로젝트 기반 구성              | [문서](docs/day1-project-foundation.md)                                                                     |
| 2일차     | 시장 데이터 조회 기반           | [문서](docs/day2-market-data-foundation.md)                                                                 |
| 3일차     | 토스 API와 종목 검색 연결       | [문서](docs/day3-toss-api-and-stock-search.md)                                                              |
| 4일차     | Firebase 포트폴리오 연동        | [문서](docs/day4-firebase-integration.md)                                                                   |
| 5일차     | 포트폴리오 시각화와 리스크 분석 | [문서](docs/day5-risk-and-visualization.md)                                                                 |
| 6일차     | 이력 분석·인증·대시보드 고도화  | [문서](docs/day6-history-auth-dashboard.md)                                                                 |
| 7일차     | 거래 원장 계산 정책             | [문서](docs/day7-calculation-policy.md)                                                                     |
| 8일차     | 거래 원장 저장·복원             | [문서](docs/day8-ledger-storage.md)                                                                         |
| 9일차     | 거래 기록 UI와 가상 포트폴리오  | [문서](docs/day9-transaction-ui.md)                                                                         |
| 10일차    | 포트폴리오 표시 설정과 시세 UX  | [문서](docs/day10-portfolio-display-and-quote-ux.md)                                                        |
| 11일차    | 테마와 대시보드 UX 개선         | [문서](docs/day11-theme-and-dashboard-ux.md)                                                                |
| 12일차    | 거래 원장과 대시보드 정교화     | [문서](docs/day12-ledger-and-dashboard-refinement.md)                                                       |
| 13일차    | 거래일 환율 기반 손익           | [문서](docs/day13-transaction-date-exchange-rate.md)                                                        |
| 14일차    | 시장 탐색과 외부 정보           | [문서](docs/day14-market-exploration.md), [API·검색 상세](docs/stock-search.md)                             |
| 15일차    | 시장 차트와 포트폴리오 UX 개선  | [문서](docs/day15-market-charts-and-portfolio-ux.md)                                                        |
| 16일차    | 적립식 투자 자동 반영           | [문서](docs/day16-recurring-investment-automation.md)                                                       |
| 17일차    | 적립식 투자 운영과 거래 이력    | [문서](docs/day17-recurring-operations.md)                                                                  |
| 18일차    | 투자 분석과 운영 안정화         | [문서](docs/day18-analysis-and-stability.md)                                                                |
| 19일차    | 자동 매수 관리와 알림           | [문서](docs/day19-automatic-purchase-management.md)                                                         |
| 20일차    | 배포용 API 전환                 | [문서](docs/day20-deployment-api-transition.md)                                                             |
| 21일차    | 프런트엔드 컴포넌트 리팩토링    | [계획](docs/day21-frontend-component-refactoring-plan.md), [기준선](docs/day21-refactoring-baseline.md)     |
| 22~31일차 | UI·기능 수정과 회귀 검증        | [작업 계획](docs/day22-31-ui-feature-roadmap.md), [31일차 검증 기록](docs/day31-regression-verification.md) |
| 32~41일차 | 배포 준비·설정·출시 검증        | [배포 계획](docs/day32-41-deployment-roadmap.md)                                                            |

35·36일차의 배포 문서 정리와 출시 후보 판정은 각각 [35일차](docs/day35-release-documentation.md), [36일차](docs/day36-release-candidate.md)에 기록합니다.

## 배포 구성

개발 환경에서는 Vite 미들웨어가 `/api/toss/*`를 처리합니다. 배포 환경에서는 Firebase Hosting이 같은 경로를 `tossApi` Cloud Function으로 전달하므로, 브라우저 코드는 개발과 배포에서 같은 API 경로를 사용합니다.

외부 API 키는 [`functions/.env.example`](functions/.env.example)를 복사해 `functions/.env` 또는 배포 환경 변수로 설정합니다. `TOSS_CLIENT_SECRET`을 비롯한 키에는 `VITE_` 접두사를 사용하지 마세요. 이 값은 함수 런타임에서만 읽히며 브라우저 번들에 포함되지 않습니다.

```sh
npm run build
npm run build --prefix functions
npx firebase deploy --project YOUR_PROJECT_ID --only functions,hosting,firestore:rules
```

배포 대상 프로젝트와 함수 환경 변수를 확인한 뒤 명령을 실행합니다. 현재 저장소의 `.firebaserc` 기본 프로젝트를 확인 없이 운영 배포 대상으로 사용하지 마세요. 토스 허용 IP를 위한 VPC·Cloud NAT·Function 연결은 [20일차 배포 절차](docs/day20-deployment-api-transition.md)에, 검증·운영 환경 순서는 [배포 로드맵](docs/day32-41-deployment-roadmap.md)에 정리되어 있습니다. `tossApi`는 엔드포인트별 공유 캐시 헤더와 인스턴스별 요청 제한을 적용합니다.
