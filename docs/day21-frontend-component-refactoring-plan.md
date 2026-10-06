# 21일차: 프론트엔드 컴포넌트 아키텍처 리팩토링 계획

## 목표

화면 단위로 커진 컴포넌트를 역할별로 분리하고, 실제로 반복되는 UI와 동작만 공통 컴포넌트로 승격한다. 이번 작업은 디자인 변경이 아니라 기존 기능과 사용자 경험을 유지하면서 다음 변경 비용을 낮추는 구조 개선이다.

## 현재 구조 진단

### 우선순위가 높은 파일

| 대상                     |  현재 규모 | 주요 책임                                                                                     | 문제                                                           |
| ------------------------ | ---------: | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `PortfolioManager.tsx`   | 약 1,072줄 | 포트폴리오 선택, 요약, 국내·미국 주식 표, 컬럼 설정, 가격 갱신, 거래 모달, 자동매수 규칙·실행 | 화면, 서버 작업, 파생 데이터, 모달 제어가 한 컴포넌트에 결합됨 |
| `MarketExplorePage.tsx`  |   약 948줄 | 지수 조회, 종목 검색, 목록, 상세 패널, 차트, 매수 연결                                        | 페이지 오케스트레이션과 세부 표현 컴포넌트가 섞임              |
| `TransactionModal.tsx`   |   약 572줄 | 검색, 매수·매도 폼, 비용 계산, 검증, 제출, 모달 동작                                          | 폼 상태와 검색·모달 인프라가 결합됨                            |
| `Dashboard.tsx`          |   약 517줄 | 데이터 조회, 자동 갱신, 패널 렌더링, 드래그·드롭, 리사이즈, 레이아웃 저장                     | 대시보드 기능보다 레이아웃 엔진 코드 비중이 큼                 |
| `MarketDataPanel.tsx`    |   약 482줄 | 시장 데이터 검색·표현·거래 연결                                                               | 검색과 결과 표현을 독립적으로 재사용하기 어려움                |
| `TransactionHistory.tsx` |   약 363줄 | 필터, 정렬, 목록, 자동매수 연결                                                               | 필터 상태와 표 렌더링이 결합됨                                 |

스타일도 같은 경향이 있다. `PortfolioManager.module.scss`는 약 1,007줄, `MarketExplorePage.module.scss`는 약 974줄이며 카드, 버튼, 탭, 입력, 모달, 빈 상태, 오류 상태가 여러 CSS Module에 반복된다.

### 확인된 중복과 결합

- 종목 로고 이미지 오류 시 첫 글자를 보여주는 `StockAvatar`가 `PortfolioManager`와 `MarketExplorePage`에 각각 존재한다.
- 시장별 금액 출력 함수 `money`와 시장 판별 로직이 여러 컴포넌트에 흩어져 있다. 이미 존재하는 `utils/displayCurrency.ts`로 포맷 정책을 모을 수 있다.
- `AuthDialog`, `TransactionModal`, `RecurringInvestmentModal`, `RecurringExecutionConfirmModal`, 시장 지수 다이얼로그가 backdrop, ESC 닫기, body scroll lock, 제목·닫기 버튼, footer action을 각자 구현한다.
- 카드, 탭, 버튼, 입력 필드, `loading/error/empty` 상태 표현이 화면별 SCSS에 중복되어 있다.
- 다크 모드가 `global.scss`의 `[class*='...']` 선택자에 의존한다. 클래스 이름이 우연히 일치하는 컴포넌트까지 영향을 받을 수 있어 변경 안전성이 낮다.
- 여러 화면이 Zustand selector를 다수 직접 호출하고 서비스 함수까지 직접 실행한다. 표현 컴포넌트를 단독 테스트하거나 Storybook 같은 도구로 격리하기 어렵다.
- `Dashboard`의 패널 식별자와 렌더링이 분리되지 않아 새 패널 추가 시 타입, 기본 순서, 가시성 조건, JSX를 함께 수정해야 한다.
- 일부 공통화가 이미 시작되어 있다. `SidePanel`은 scroll lock과 ESC 닫기를 제공하므로 새 모달 기반 구조의 기준으로 활용할 수 있다.

## 리팩토링 원칙

1. **공통 UI와 도메인 UI를 구분한다.** 버튼·입력·다이얼로그는 `shared/ui`, 포트폴리오 표·자동매수 규칙은 `features`에 둔다.
2. **페이지는 조립만 한다.** 페이지는 라우팅 입력, 기능 단위 섹션 배치, 페이지 수준 오류 경계만 담당한다.
3. **상태와 표현을 분리한다.** 서비스 호출과 Zustand 조합은 feature hook/container에 두고 leaf component는 props로 데이터를 받는다.
4. **두 번 이상 반복되고 API가 안정된 것만 공통화한다.** 한 화면에서만 쓰는 컴포넌트를 범용화하거나 거대한 `Table`, `Chart` 추상화를 먼저 만들지 않는다.
5. **도메인 용어를 유지한다.** `PortfolioHoldingsTable`, `RecurringRuleList`처럼 목적이 드러나는 이름을 사용한다.
6. **기존 동작을 보존한 뒤 개선한다.** 폴더 이동, UI primitive 추출, 상태 분리를 서로 다른 PR로 나눠 회귀 범위를 제한한다.
7. **배럴 파일은 feature 공개 API에만 사용한다.** 전역 `index.ts` 남용과 순환 의존을 피한다.

## 목표 폴더 구조

```text
src/
├─ app/
│  ├─ App.tsx
│  ├─ navigation.ts
│  └─ providers/
├─ pages/
│  ├─ dashboard/
│  │  ├─ DashboardPage.tsx
│  │  └─ DashboardPage.module.scss
│  ├─ market-explore/
│  ├─ transaction-history/
│  └─ virtual-portfolio/
├─ widgets/
│  ├─ app-header/
│  ├─ dashboard-grid/
│  ├─ portfolio-overview/
│  └─ market-overview/
├─ features/
│  ├─ auth/
│  │  ├─ ui/AuthDialog.tsx
│  │  └─ model/useAuthForm.ts
│  ├─ transaction/
│  │  ├─ ui/TransactionDialog.tsx
│  │  ├─ ui/TransactionForm.tsx
│  │  ├─ model/useTransactionForm.ts
│  │  └─ lib/transactionCosts.ts
│  ├─ portfolio-management/
│  │  ├─ ui/PortfolioSummary.tsx
│  │  ├─ ui/HoldingsSection.tsx
│  │  ├─ ui/HoldingsTable.tsx
│  │  ├─ ui/HoldingsCardList.tsx
│  │  ├─ ui/ColumnVisibilityMenu.tsx
│  │  └─ model/usePortfolioManager.ts
│  ├─ recurring-investment/
│  │  ├─ ui/RecurringRuleList.tsx
│  │  ├─ ui/RecurringRuleCard.tsx
│  │  ├─ ui/RecurringInvestmentDialog.tsx
│  │  └─ model/useRecurringRules.ts
│  ├─ market-search/
│  │  ├─ ui/StockSearchField.tsx
│  │  ├─ ui/StockSearchResults.tsx
│  │  └─ model/useStockSearch.ts
│  └─ dashboard-layout/
│     ├─ ui/DashboardGrid.tsx
│     ├─ ui/DashboardPanel.tsx
│     ├─ model/useDashboardLayout.ts
│     └─ lib/layoutPolicy.ts
├─ entities/
│  ├─ portfolio/
│  │  ├─ model/selectors.ts
│  │  └─ ui/PortfolioTypeBadge.tsx
│  ├─ holding/
│  │  └─ ui/HoldingRow.tsx
│  └─ stock/
│     ├─ ui/StockAvatar.tsx
│     ├─ ui/StockIdentity.tsx
│     └─ lib/market.ts
├─ shared/
│  ├─ ui/
│  │  ├─ button/Button.tsx
│  │  ├─ dialog/Dialog.tsx
│  │  ├─ drawer/Drawer.tsx
│  │  ├─ field/Field.tsx
│  │  ├─ segmented-control/SegmentedControl.tsx
│  │  ├─ status/AsyncState.tsx
│  │  ├─ card/Card.tsx
│  │  └─ spinner/Spinner.tsx
│  ├─ hooks/
│  │  ├─ useBodyScrollLock.ts
│  │  ├─ useEscapeKey.ts
│  │  └─ useDebouncedValue.ts
│  ├─ lib/
│  │  ├─ currency.ts
│  │  ├─ date.ts
│  │  └─ storage.ts
│  └─ styles/
│     ├─ _tokens.scss
│     ├─ _mixins.scss
│     └─ global.scss
├─ services/
├─ store/
└─ types/
```

`shared → entities → features → widgets → pages → app` 방향으로만 의존한다. 하위 계층이 상위 계층을 import하지 않도록 ESLint의 restricted imports 또는 별칭 규칙을 후속 적용한다.

## 재사용 컴포넌트 후보

### 1. 바로 추출할 공통 UI

| 컴포넌트           | 최소 API                                                | 적용 대상                                        |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| `Button`           | `variant`, `size`, `loading`, 표준 button props         | 모든 주요 action, icon button                    |
| `Dialog`           | `open`, `titleId`, `onClose`, `closeDisabled`, children | 인증, 거래, 자동매수, 체결 확인, 지수 상세       |
| `Drawer`           | `open`, `titleId`, `onClose`, children                  | 기존 `SidePanel`, 종목 상세                      |
| `Field`            | `label`, `hint`, `error`, `required`, children          | 거래·인증·자동매수 폼                            |
| `SegmentedControl` | options, value, onChange                                | 매수/매도, 로그인/가입 또는 주기 선택, 시장 필터 |
| `AsyncState`       | `status`, `message`, `action`                           | 로딩, 오류, 빈 결과                              |
| `Card`             | `as`, `padding`, children                               | 분석 패널과 시장 섹션의 공통 surface             |

`Dialog`와 `Drawer`는 시각 스타일뿐 아니라 다음 접근성 동작을 포함해야 한다.

- ESC 닫기와 backdrop 닫기
- body scroll lock
- 열릴 때 첫 포커스 이동, 닫힐 때 trigger로 포커스 복귀
- Tab 포커스가 dialog 밖으로 나가지 않는 focus trap
- `aria-modal`, `aria-labelledby`, close button label

### 2. 엔티티 수준 재사용

- `StockAvatar`: ticker/symbol, name, market을 받고 이미지 실패 fallback을 단일 구현한다.
- `StockIdentity`: 아바타, 종목명, ticker, 시장 badge의 반복 조합을 담당한다.
- `Money`: 통화 표시가 단순 text인 경우 컴포넌트보다 `formatMoney` 함수가 우선이다. 색상과 부호까지 포함해야 할 때만 `MoneyText`를 둔다.
- `ChangeRate`: 한국 시장의 상승=빨강, 하락=파랑 정책과 접근 가능한 부호 텍스트를 통일한다.

### 3. 공통화하지 않고 feature 내부에서 분리할 것

- `HoldingsTable`과 거래 내역 표는 데이터 구조와 반응형 요구가 다르므로 하나의 범용 `DataTable`로 합치지 않는다.
- `MiniLineChart`, `IndicatorSparkline`, `PortfolioPerformanceChart`는 데이터 의미와 축 정책이 달라 공통 계산 유틸만 공유한다.
- 자동매수 규칙 카드와 포트폴리오 보유 종목 카드는 외형이 비슷해도 action과 상태가 달라 각각 유지한다.
- `DashboardPanel`은 대시보드 레이아웃 feature에 한정하고 모든 카드의 범용 wrapper로 확장하지 않는다.

## 대형 컴포넌트 분해안

### `PortfolioManager`

```text
PortfolioManager (container)
├─ PortfolioHeader
├─ PortfolioSummary
├─ HoldingsSection[market=KR]
│  ├─ ColumnVisibilityMenu
│  ├─ HoldingsTable (desktop)
│  └─ HoldingsCardList (mobile)
├─ HoldingsSection[market=US]
└─ RecurringInvestmentSection
   ├─ RecurringRuleList
   └─ RecurringExecutionList
```

- 포트폴리오 선택자와 파생 데이터는 `usePortfolioManager`로 이동한다.
- 자동매수 조회·실행·재시도는 `useRecurringRules`로 이동한다.
- 컬럼 저장 정책은 `usePersistentColumns` 또는 `columnVisibility.ts`로 이동한다.
- JSX 컴포넌트는 서비스와 store를 직접 import하지 않고 callback과 view model을 받는다.

### `MarketExplorePage`

```text
MarketExplorePage
├─ MarketIndicatorSection
│  ├─ MarketIndicatorCard
│  └─ MarketIndicatorDialog
├─ MarketSearchSection
│  ├─ StockSearchField
│  └─ MarketStockList
└─ StockDetailDrawer
   ├─ StockQuoteSummary
   ├─ StockFundamentals
   ├─ StockPriceChart
   └─ StockNewsList
```

- overview, indicator, stock detail 요청을 각각 전용 hook으로 나눈다.
- request id, abort, cache 정책은 UI가 아니라 hook 내부에 둔다.
- `StockDetailDrawer`는 표시 전용으로 만들고 매수 action만 callback으로 주입한다.

### `Dashboard`

- 패널 메타데이터를 `PANEL_REGISTRY`로 선언한다. `id`, 표시 view, render 함수, 최소 너비를 한곳에서 관리한다.
- drag/drop, split resize, localStorage 직렬화는 `useDashboardLayout`로 이동한다.
- 레이아웃 검증과 이동 알고리즘은 DOM 없는 순수 함수로 분리해 단위 테스트한다.
- 페이지는 데이터 준비와 registry 조립만 담당한다.

### `TransactionModal`

- `Dialog` shell과 `TransactionForm`을 분리한다.
- 검색 동작은 `StockSearchField`와 `useStockSearch`를 재사용한다.
- draft 변경, 자동 수수료·세금, 검증, submit payload 변환은 `useTransactionForm`으로 이동한다.
- `estimateCosts`, `marketOf`, 초기 draft 생성은 순수 함수로 옮겨 테스트한다.

## 상태 및 데이터 경계

- 페이지와 feature container만 Zustand를 구독한다. 표현 컴포넌트는 primitive/view model props를 받는다.
- store selector는 `entities/portfolio/model/selectors.ts`에 모아 `realPortfolio`, `holdingsByPortfolio`, `activeLedger` 계산을 중복하지 않는다.
- `usePortfolio`는 가격 갱신, 과거 데이터, 종목 CRUD를 모두 제공하고 있다. `usePortfolioPrices`, `usePortfolioRisk`, 기존 종목 CRUD 호환 계층으로 나누되 호출부 이전이 끝날 때까지 facade를 유지한다.
- 원격 요청은 `loading/error/data` 상태 구조를 통일하고 `AbortController` 또는 request sequence로 stale response를 차단한다.
- 서버 상태를 Zustand에 영구 복제할지, 화면 지역 상태로 둘지 데이터별 owner를 문서화한다. 동일 데이터에 두 owner를 두지 않는다.
- `localStorage` key와 parse/validation은 `shared/lib/storage`의 versioned adapter로 이동한다.

## 스타일 시스템 개선

1. 기존 SCSS 변수에 surface, text, border, interactive, semantic 상태의 light/dark token을 추가하고 CSS custom property로 노출한다.
2. `[class*='positive']`, `[class*='page']`, `[class*='actions']` 같은 전역 부분 일치 selector를 제거한다.
3. dark theme은 컴포넌트 이름 추론이 아니라 `var(--color-surface)` 같은 semantic token으로 처리한다.
4. 공통 radius, shadow, control height, focus ring을 token으로 고정한다.
5. 반응형 breakpoint와 card mixin은 유지하되 feature SCSS는 해당 feature 레이아웃만 담당하게 줄인다.
6. CSS Module 파일은 대응하는 컴포넌트 옆에 두고, 한 파일이 약 300줄을 넘으면 하위 컴포넌트 분리 신호로 본다.

## 단계별 실행 계획

### 0단계: 안전망 확보

- 핵심 사용자 흐름 체크리스트 작성: 로그인, 포트폴리오 전환, 매수·매도, 자동매수 생성·실행, 시장 검색, 대시보드 재배치.
- 현재 `typecheck`, lint, 전체 테스트, production build를 기준선으로 기록한다.
- React Testing Library를 도입해 `Dialog`, 거래 폼, 포트폴리오 표의 상호작용 테스트 기반을 만든다.
- 가능하면 Playwright로 위 핵심 흐름 중 로그인 없이 가능한 guest 흐름부터 smoke test를 추가한다.

### 1단계: 무동작 구조 정리

- `App.tsx`를 `app/`으로 이동하고 기존 import path를 정리한다.
- 이름 casing을 `DashboardPage`, `MarketExplorePage`처럼 통일한다.
- 기존 컴포넌트를 `pages/widgets/features/entities/shared`로 이동하되 JSX와 동작은 바꾸지 않는다.
- TypeScript path alias를 추가하고 feature 공개 API를 정리한다.

완료 조건: UI snapshot 또는 smoke test 차이 없음, typecheck/lint/build 통과.

### 2단계: 공통 기반 추출

- theme token을 먼저 도입한 뒤 `Button`, `Field`, `AsyncState`, `Card`를 작은 범위부터 적용한다.
- `Dialog`와 `Drawer`를 구현하고 기존 모달을 한 개씩 이전한다.
- `StockAvatar`, 시장 판별, 금액·날짜 formatter를 통합한다.
- 공통 hook으로 ESC, scroll lock, debounce 동작을 정리한다.

완료 조건: 중복 모달 side effect 제거, 키보드 접근성 테스트 통과, 전역 부분 일치 selector 제거.

### 3단계: 핵심 feature 분해

- `PortfolioManager`를 summary, holdings, recurring 영역으로 나눈다.
- `TransactionModal`을 dialog/form/search/model로 나눈다.
- `MarketExplorePage`를 indicator, search/list, detail drawer로 나눈다.
- `TransactionHistory`의 filter bar와 list/table을 분리한다.

완료 조건: 페이지 파일 약 250줄 이하, leaf UI에서 service import 없음, 주요 form과 list 단위 테스트 추가.

### 4단계: 대시보드 레이아웃 분리

- registry 기반 패널 선언으로 변경한다.
- layout reducer와 persistence adapter를 분리한다.
- drag/drop과 resize 계산을 순수 함수로 바꾸고 테스트한다.

완료 조건: 새 패널 추가 시 registry 한 곳과 패널 컴포넌트만 수정, 기존 저장 레이아웃 마이그레이션 유지.

### 5단계: store와 서비스 정리

- 반복 selector와 view model을 entity model로 이동한다.
- `usePortfolio`의 책임을 가격, 위험, CRUD 단위로 나눈다.
- store의 modal 상태가 여러 페이지를 결합하는지 검토하고, 전역이어야 하는 transaction intent만 남긴다.
- 네트워크 오류 타입과 사용자 메시지 변환 계층을 통일한다.

완료 조건: 동일 파생 계산 중복 제거, store 전체 구독 제거, 비동기 stale update 테스트 통과.

## 작업 단위별 실행 순서

아래 번호를 티켓과 PR의 기본 단위로 사용한다. 원칙적으로 한 작업이 검증을 통과한 뒤 다음 작업을 시작하며, 같은 묶음 안에서 선행 작업이 없는 항목만 병렬로 진행한다.

남은 작업은 [22~31일차 UI·기능 수정과 회귀 검증](./day22-31-ui-feature-roadmap.md), [32~41일차 배포 준비·설정·출시 검증](./day32-41-deployment-roadmap.md)에 나눠 정리한다. 아래 D21 완료 조건과 체크 상태는 실제 검증 결과에 따라 갱신한다.

### 진행 현황

- [x] D21-01 현재 동작 기준선 고정
- [x] D21-02 테스트 도구와 공통 render 환경 추가
- [x] D21-03 경로 alias와 계층 규칙 준비
- [ ] D21-04 디자인 token 정리
- [ ] D21-05 기본 UI primitive 추가
- [ ] D21-06 overlay 공통 동작 구현
- [ ] D21-07 엔티티 공통 표현 통합
- [ ] D21-08 종목 검색 feature 추출
- [ ] D21-09 거래 폼 모델 분리
- [ ] D21-10 거래 모달 UI 분해
- [ ] D21-11 포트폴리오 selector와 view model 추출
- [ ] D21-12 보유 종목 영역 분해
- [ ] D21-13 자동매수 영역 분리
- [ ] D21-14 시장 탐색 화면 분해
- [ ] D21-15 거래 내역 화면 분해
- [ ] D21-16 대시보드 layout engine 분리
- [x] D21-17 `usePortfolio` 책임 분리
- [ ] D21-18 폴더 이동과 공개 API 정리
- [ ] D21-19 전역 스타일 부채 제거
- [ ] D21-20 최종 회귀 검증과 문서 정리

D21-01~03은 완료로 확정했다. D21-04~16은 아래 완료 조건 중 시각 회귀와 guest smoke 검증이 남아 있어 체크를 보류한다.

2026-10-02에는 D21-04~16의 일부 구현을 반영했다. 디자인 token, 기본 UI, 공통 Dialog/Drawer, 종목 표현·검색, 거래 폼 모델·UI, 포트폴리오 selector·보유 종목·자동매수 영역을 추가했다. 거래 UI는 `features/transaction/ui`로 옮기고 기존 import 경로는 호환 wrapper로 유지한다. `PortfolioManager`의 비활성화된 중복 JSX를 제거하고 제목·요약·보유 종목 표시를 분리했다. 시장별 컬럼 설정 저장과 현재가 갱신을 hook으로 옮기고 `useRecurringRules`를 실제 화면에 연결했다. 자동매수 설정·체결 확인 모달도 공통 Dialog를 사용한다.

시장 탐색 화면은 지수·검색·상세 요청 hook과 표현 컴포넌트로, 거래 내역 화면은 필터 hook과 데스크톱 표·모바일 목록으로 나눴다. 대시보드 배치는 패널 registry, 순수 reducer, 위치·분할 계산 함수, 저장·이전 adapter로 분리했다. `Dashboard`의 패널 콘텐츠 JSX는 아직 기존 위치에 있다.

2026-10-02 당시 구현 검증은 typecheck, lint, 단위 테스트 87개, 컴포넌트 테스트 36개, production build가 통과했다. 시각 회귀와 guest smoke 시나리오는 아직 실행 결과를 기록하지 않아 D21-04~16의 완료 체크를 보류한다.

2026-10-06에는 D21-17의 가격 갱신·과거 시세/위험·종목 CRUD를 전용 hook으로 분리하고 기존 `usePortfolio` API를 facade로 유지했다. 현재가 일부 실패, 이력 저장 실패, 일봉 일부 실패 테스트를 추가해 통과했다. 단위 테스트 88개, 컴포넌트 테스트 40개, lint, build가 통과했다. D21-18~20과 D21-04~16의 화면 검증은 남아 있다.

### 묶음 A: 회귀 방지 기반

#### D21-01. 현재 동작 기준선 고정

상태: **완료** — 자동 검사 기준선과 smoke 시나리오는 [`day21-refactoring-baseline.md`](./day21-refactoring-baseline.md)에 기록한다. 연결 가능한 브라우저가 없어 수동 시나리오 실행 결과는 미수행으로 명시했다.

- 기존 typecheck, lint, test, production build 결과를 기록한다.
- 로그인 없이 확인 가능한 포트폴리오 거래, 시장 탐색, 대시보드 레이아웃 복원 smoke 시나리오를 작성한다.
- 리팩토링 전후 화면 비교에 사용할 주요 viewport와 fixture를 고정한다.

완료 조건: 실패 중인 기존 검사가 있다면 원인과 허용 여부가 문서화되고, 이후 작업에서 새 실패를 구분할 수 있다.

#### D21-02. 테스트 도구와 공통 render 환경 추가

상태: **완료** — Vitest, React Testing Library, user-event, jest-dom, jsdom을 추가하고 `tests/setup.ts`에서 브라우저 API와 Zustand store를 초기화한다. `SidePanel` smoke test 2건으로 환경을 검증했다.

- React Testing Library와 사용자 이벤트 테스트 환경을 추가한다.
- Zustand 상태와 브라우저 API를 초기화하는 공통 test setup을 만든다.
- 최소 한 개의 기존 컴포넌트 smoke test로 환경을 검증한다.

선행 작업: D21-01

완료 조건: 컴포넌트 테스트가 로컬과 CI에서 동일하게 실행된다.

#### D21-03. 경로 alias와 계층 규칙 준비

상태: **완료** — TypeScript, Vite, Vitest에 `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` alias를 동일하게 구성했다. ESLint는 `shared → entities → features → widgets → pages → app` 순서에서 하위 계층의 상위 계층 import를 차단한다. 기존 파일은 대량 이동하지 않았으며 신규·이전 파일부터 적용한다.

- `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` alias를 설정한다.
- 아직 파일은 대량 이동하지 않고 신규 파일부터 alias를 사용한다.
- 상위 계층을 역참조하지 못하도록 import 제한 규칙을 준비한다.

선행 작업: D21-01

완료 조건: typecheck, lint, build 통과. 기존 경로를 한 번에 변경하지 않는다.

### 묶음 B: 공통 기반

#### D21-04. 디자인 token 정리

- 기존 SCSS 변수를 semantic CSS custom property로 연결한다.
- light/dark surface, text, border, interactive, positive, negative token을 정의한다.
- 기존 컴포넌트 외형은 유지하고 token 도입만 수행한다.

선행 작업: D21-03

완료 조건: 두 테마의 시각 회귀가 없고 신규 공통 UI가 클래스명 추론 없이 테마를 사용할 수 있다.

#### D21-05. 기본 UI primitive 추가

- `Button`, `IconButton`, `Field`, `Card`, `AsyncState`를 `shared/ui`에 추가한다.
- 먼저 신규 또는 단순 컴포넌트 한 곳에만 적용해 API를 검증한다.
- 모든 기존 버튼을 한 PR에서 일괄 치환하지 않는다.

선행 작업: D21-02, D21-04

완료 조건: variant, disabled, loading, error 연결에 대한 컴포넌트 테스트 통과.

#### D21-06. overlay 공통 동작 구현

- `useBodyScrollLock`, `useEscapeKey`, focus return/focus trap을 구현한다.
- 이를 사용하는 `Dialog`와 `Drawer` shell을 추가한다.
- 기존 `SidePanel`은 `Drawer`의 호환 wrapper로 전환하거나 사용처를 직접 이전한다.

선행 작업: D21-02, D21-04

완료 조건: ESC, backdrop, Tab 이동, 닫힌 뒤 trigger 포커스 복귀 테스트 통과.

#### D21-07. 엔티티 공통 표현 통합

- `StockAvatar`, `StockIdentity`, 시장 판별 함수를 `entities/stock`으로 이동한다.
- 금액·등락률·날짜 formatter를 `shared/lib`에 모은다.
- `PortfolioManager`와 `MarketExplorePage`의 중복 구현을 교체한다.

선행 작업: D21-03, D21-04

완료 조건: 종목 이미지 fallback과 KR/US 금액 표시 테스트 통과, 중복 함수 제거.

### 묶음 C: 거래 기능 분리

#### D21-08. 종목 검색 feature 추출

- `useStockSearch`, `StockSearchField`, `StockSearchResults`를 분리한다.
- debounce, abort, 최근 검색 저장과 stale response 차단을 hook 내부로 옮긴다.
- 먼저 `TransactionModal`에서 사용한 뒤 시장 탐색 적용 가능성을 검증한다.

선행 작업: D21-05, D21-07

완료 조건: 검색 성공·빈 결과·오류·빠른 연속 입력 테스트 통과.

#### D21-09. 거래 폼 모델 분리

- 초기 draft, 시장 변환, 수수료·세금 계산, validation payload 변환을 순수 함수로 옮긴다.
- `useTransactionForm`이 입력 상태와 submit 상태를 담당하게 한다.
- 현재 매수·매도 계산 결과를 그대로 유지한다.

선행 작업: D21-08

완료 조건: 기존 calculator 테스트와 신규 form model 테스트 통과.

#### D21-10. 거래 모달 UI 분해

- `TransactionModal`을 `TransactionDialog`, `TransactionForm`, 검색 영역으로 분해한다.
- D21-06의 `Dialog`와 D21-05의 form primitive를 적용한다.
- 기존 공개 props를 호환 wrapper로 유지해 호출부를 한 번에 바꾸지 않는다.

선행 작업: D21-06, D21-09

완료 조건: 매수·매도·preset·submit·닫기 흐름 테스트 통과, 기존 호출부 기능 유지.

### 묶음 D: 포트폴리오 관리 분리

#### D21-11. 포트폴리오 selector와 view model 추출

- real/virtual/active portfolio 및 ledger 선택 로직을 selector로 모은다.
- 요약 금액, 시장별 보유 종목, 환율 성과를 `usePortfolioManager`의 view model로 만든다.
- UI 이동 전에 계산 결과를 characterization test로 고정한다.

선행 작업: D21-07

완료 조건: 로그인·guest·REAL·VIRTUAL 조합의 selector 테스트 통과.

#### D21-12. 보유 종목 영역 분해

- `PortfolioHeader`, `PortfolioSummary`, `HoldingsSection`, `HoldingsTable`, `HoldingsCardList`, `ColumnVisibilityMenu`로 나눈다.
- 하위 UI는 store와 service를 직접 import하지 않는다.
- 국내·미국 시장의 공통 JSX는 `HoldingsSection` props로 통합하되 표 자체는 도메인 컴포넌트로 유지한다.

선행 작업: D21-05, D21-10, D21-11

완료 조건: 가격 갱신, 컬럼 저장, 모바일 카드, 거래 열기 흐름 유지.

#### D21-13. 자동매수 영역 분리

- 규칙 조회·실행·재시도·상태 변경을 `useRecurringRules`로 이동한다.
- `RecurringInvestmentSection`, `RecurringRuleList`, `RecurringRuleCard`, `RecurringExecutionList`로 나눈다.
- 자동매수 modal과 체결 확인 modal을 공통 `Dialog`로 이전한다.

선행 작업: D21-06, D21-12

완료 조건: 규칙 생성·수정·중지·재개·실행·실패 재시도 흐름 유지.

### 묶음 E: 나머지 대형 화면 분리

#### D21-14. 시장 탐색 화면 분해

- 지수, 검색/목록, 종목 상세 요청을 각각 hook으로 분리한다.
- `MarketIndicatorSection`, `MarketStockList`, `StockDetailDrawer`와 상세 하위 섹션을 추출한다.
- `StockDetailDrawer`는 데이터와 callback만 받는 표현 컴포넌트로 만든다.

선행 작업: D21-06, D21-07, D21-08

완료 조건: 지수 상세, 종목 검색, 상세 조회, 매수 연결, 요청 취소 흐름 테스트 통과.

#### D21-15. 거래 내역 화면 분해

- filter state를 hook으로 옮기고 `TransactionFilterBar`, `TransactionTable`, 모바일 목록을 분리한다.
- 공통 `Field`, `Button`, `AsyncState`를 적용한다.
- 자동매수 규칙 필터 deep link 동작을 유지한다.

선행 작업: D21-05, D21-13

완료 조건: 타입·출처·기간·정렬·규칙 필터와 수정 action 테스트 통과.

#### D21-16. 대시보드 layout engine 분리

- `PANEL_REGISTRY`, layout reducer, validation, persistence adapter를 만든다.
- drag/drop과 split resize 계산을 DOM 없는 순수 함수로 이동한다.
- 기존 localStorage layout version의 읽기와 마이그레이션을 보존한다.

선행 작업: D21-12, D21-13, D21-14

완료 조건: 패널 이동·쌍 구성·분할 크기·저장 복원 테스트 통과, 새 패널은 registry 한 곳에서 등록 가능.

### 묶음 F: 상태와 구조 마무리

#### D21-17. `usePortfolio` 책임 분리

- 가격 갱신, 과거 시세·위험 계산, 종목 CRUD를 전용 hook으로 나눈다.
- 기존 `usePortfolio`는 이전 기간 동안 facade로 유지한다.
- 전체 store 구독을 필요한 selector 구독으로 바꾼다.

선행 작업: D21-11, D21-16

완료 조건: 가격 일부 실패, snapshot 저장 실패, 과거 시세 일부 실패 동작이 기존과 동일하다.

#### D21-18. 폴더 이동과 공개 API 정리

- 안정화된 컴포넌트를 목표 폴더로 이동한다.
- feature별 공개 `index.ts`만 남기고 내부 파일 직접 import를 제거한다.
- 임시 re-export와 기존 빈 폴더를 제거한다.

선행 작업: D21-10부터 D21-17까지 완료

완료 조건: 순환 의존 없음, restricted import 규칙 활성화, typecheck/lint/build 통과.

#### D21-19. 전역 스타일 부채 제거

- `[class*='...']` 기반 dark theme selector를 제거한다.
- 남은 중복 버튼, 입력, 상태 스타일을 token 또는 공통 UI로 전환한다.
- feature SCSS가 각 feature의 배치와 특화 표현만 담당하도록 정리한다.

선행 작업: D21-18

완료 조건: light/dark 및 mobile/desktop 시각 회귀 확인, 전역 부분 일치 selector 0개.

#### D21-20. 최종 회귀 검증과 문서 정리

- 전체 단위·컴포넌트·smoke 테스트와 production build를 실행한다.
- D21-01 기준선과 핵심 화면을 비교한다.
- 새 컴포넌트 위치, 계층 의존 규칙, 신규 feature 추가 방법을 README 또는 architecture 문서에 반영한다.

선행 작업: D21-19

완료 조건: 아래 완료 기준을 모두 충족하고 임시 호환 계층 제거 여부를 확인한다.

### 병렬 진행 가능 범위

- D21-02와 D21-03은 D21-01 이후 병렬 가능하다.
- D21-05, D21-06, D21-07은 token과 명명 규칙이 합의된 뒤 서로 다른 파일에서 병렬 가능하다.
- D21-14와 D21-15는 공통 기반과 자동매수 의존 작업이 끝난 뒤 병렬 가능하다.
- D21-16 이후 작업은 상태 및 폴더 경계를 확정하므로 순차 진행을 권장한다.

각 작업은 파일 이동과 동작 변경을 가능한 한 섞지 않는다. 예상 diff가 너무 크면 UI 하위 컴포넌트 단위로 PR을 더 나누되 작업 번호는 유지한다.

## 테스트 전략

- **순수 함수:** 금액 포맷, 거래 비용, market mapping, dashboard layout 이동·검증, selector.
- **컴포넌트:** Dialog 키보드 동작, Field 오류 연결, SegmentedControl 선택, StockAvatar fallback.
- **feature 통합:** 거래 입력·검증·submit, 종목 검색 debounce와 stale response, 컬럼 표시 저장, 자동매수 상태 변경.
- **페이지 smoke:** guest 포트폴리오 거래, 시장 탐색에서 상세 열기와 매수 연결, 대시보드 레이아웃 복원.
- **회귀 확인:** `npm run typecheck`, `npm run lint`, 전체 `node --test tests/*.test.ts`, `npm run build`.

## 완료 기준

- 페이지는 feature/widget 조립 역할만 하며 서비스 함수를 직접 호출하지 않는다.
- 500줄을 넘는 React 컴포넌트가 없고, 300줄 초과 파일은 책임과 분리 이유를 설명할 수 있다.
- 공통 모달은 동일한 focus, ESC, scroll lock 동작을 제공한다.
- 금액, 날짜, 등락 색상, 종목 avatar 정책이 한 곳에서 관리된다.
- 다크 모드가 CSS 클래스 이름 패턴에 의존하지 않는다.
- feature UI를 store와 Firebase 없이 fixture props로 렌더링할 수 있다.
- 기존 단위 테스트, 신규 상호작용 테스트, lint, typecheck, production build가 모두 통과한다.
- 폴더 이동만을 위한 호환 re-export는 마이그레이션 종료 후 제거한다.

## 이번 범위에서 하지 않을 것

- 모든 표를 하나의 범용 테이블 컴포넌트로 통합
- 모든 차트를 하나의 추상 차트 API로 통합
- 디자인 전면 개편 또는 상태 관리 라이브러리 교체
- 폴더 이동과 비즈니스 로직 재작성의 동시 진행
- 사용처가 하나뿐인 작은 JSX를 형식적으로 전부 파일 분리
