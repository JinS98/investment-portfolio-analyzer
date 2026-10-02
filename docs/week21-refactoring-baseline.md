# 21주차 리팩토링 기준선

## 기준선 정보

- 측정 시각: 2026-10-01 09:49 KST
- Git commit: `508f973`
- Node.js: `v22.14.0`
- npm: `11.12.1`
- 기준 브라우저: 최신 Chromium 데스크톱·모바일 viewport
- 테스트 데이터 원칙: 개인 계정이나 운영 데이터를 사용하지 않고 guest localStorage만 사용한다.

## 자동 검사 결과

| 검사             | 명령                                                     | 결과 | 비고                                |
| ---------------- | -------------------------------------------------------- | ---- | ----------------------------------- |
| TypeScript       | `npm run typecheck`                                      | 통과 | 오류 0건                            |
| ESLint + Oxlint  | `npm run lint`                                           | 통과 | 오류 0건                            |
| 전체 단위 테스트 | `node --experimental-strip-types --test tests/*.test.ts` | 통과 | 78개 통과, 실패·skip 0개            |
| 컴포넌트 테스트  | `npm run test:component`                                 | 통과 | `SidePanel` smoke test 2개 통과     |
| Production build | `npm run build`                                          | 통과 | Vite 8.2.1, 695 modules transformed |

빌드 산출물 기준값은 다음과 같다.

- CSS: 약 96.27kB, gzip 16.86kB
- JavaScript: 약 1,327.24kB, gzip 390.00kB
- 500kB를 넘는 JavaScript chunk 경고가 존재한다. 빌드는 성공하므로 W21-01의 허용된 기존 경고로 기록하며, 페이지 단위 dynamic import와 code splitting은 구조 분리 이후 별도 최적화 대상으로 다룬다.
- Node의 Type Stripping experimental warning은 테스트 실패가 아니며 현재 테스트 실행 방식의 기존 경고다.

## 고정 viewport와 테마 조합

| 구분            | viewport   | 필수 확인                                                  |
| --------------- | ---------- | ---------------------------------------------------------- |
| Desktop         | 1440 × 900 | 전체 표, 대시보드 2열·resize, drawer                       |
| Tablet boundary | 768 × 1024 | breakpoint 경계, navigation, 표 overflow                   |
| Mobile          | 390 × 844  | 카드형 보유 종목, modal 높이, bottom action, 가로 overflow |

- 모든 핵심 시나리오는 light theme에서 확인한다.
- overlay, 데이터 표, positive/negative 색상은 dark theme에서도 Desktop과 Mobile 각각 확인한다.
- 브라우저 zoom은 100%를 기준으로 하고, 접근성 확인 시 키보드만으로 Tab·Shift+Tab·Enter·Escape를 사용한다.

## 고정 guest fixture

테스트 시작 전 Application Storage에서 다음 키를 제거하고 새로고침한다.

- `portfolio-platform-guest-ledgers-v1`
- `portfolio-platform-guest-migration-v1`
- `dashboard-panel-layout-v2`
- `dashboard-panel-order`

그 후 UI를 통해 아래 거래를 순서대로 생성한다. 이 순서를 fixture 생성 절차로 사용하며 localStorage 내부 JSON 형식에는 테스트가 직접 의존하지 않는다.

| 포트폴리오      | 구분      | 시장 | 종목                |   단가 | 수량 |      수수료 |        세금 |
| --------------- | --------- | ---- | ------------------- | -----: | ---: | ----------: | ----------: |
| 실제 포트폴리오 | 매수      | KR   | 삼성전자 (`005930`) | 70,000 |   10 | 자동 계산값 |           0 |
| 실제 포트폴리오 | 추가 매수 | KR   | 삼성전자 (`005930`) | 75,000 |    2 | 자동 계산값 |           0 |
| 실제 포트폴리오 | 매도      | KR   | 삼성전자 (`005930`) | 80,000 |    3 | 자동 계산값 | 자동 계산값 |
| 실제 포트폴리오 | 매수      | US   | Apple (`AAPL`)      |    200 |    2 | 자동 계산값 |           0 |
| 가상 포트폴리오 | 매수      | US   | Microsoft (`MSFT`)  |    400 |    3 | 자동 계산값 |           0 |

- 거래일은 실행 당일을 사용한다.
- 외부 종목 검색 또는 과거 환율 API가 실패하면 UI 결함으로 단정하지 않고 API 응답과 함께 기록한다.
- 시세는 변동 데이터이므로 절대 평가금액을 screenshot 기준으로 삼지 않는다. 보유 수량, 평균 단가, 통화, 행 개수와 손익 방향을 비교한다.

## 수동 smoke 시나리오

실행 상태: **시나리오 고정 완료 / 화면 실행 미수행**

- 2026-10-01 기준 로컬 Vite 서버는 `http://127.0.0.1:5173/`에서 정상 기동했다.
- 현재 작업 세션에 연결 가능한 브라우저가 없어 아래 시나리오의 시각·상호작용 결과는 통과로 기록하지 않았다.
- W21-02에서 컴포넌트 테스트 환경을 추가한 뒤 자동화 가능한 흐름부터 전환하고, 나머지는 브라우저 연결이 가능한 환경에서 실행 결과를 별도로 기록한다.

### S01. Guest 초기 진입과 navigation

1. storage를 초기화하고 `#dashboard`로 진입한다.
2. 로그인하지 않은 상태에서 실제·가상 guest 포트폴리오가 준비되는지 확인한다.
3. `#analysis`, `#transactions`, `#market`, `#virtual`을 차례로 이동한다.
4. 새로고침 후 같은 hash 화면이 유지되는지 확인한다.

기대 결과: 페이지별 제목이 맞고 로딩이 종료되며 치명적 오류와 가로 overflow가 없다.

### S02. Guest 실제 포트폴리오 매수·추가 매수·매도

1. `#dashboard`에서 거래 추가를 열고 fixture의 삼성전자 최초 매수를 저장한다.
2. 같은 종목을 추가 매수한다.
3. 보유 수량 12와 이동평균 단가가 표시되는지 확인한다.
4. 수량 3을 매도하고 잔여 수량 9와 거래 내역 3건을 확인한다.
5. 거래 dialog를 Escape와 닫기 버튼으로 각각 닫아 본다.

기대 결과: 저장 후 표·요약·거래 내역이 함께 갱신되고, 매도 후 평균 단가는 유지되며 실현손익이 표시된다.

### S03. 미국 종목과 표시 통화

1. 실제 포트폴리오에 Apple을 매수한다.
2. KRW/USD 표시 통화를 전환한다.
3. 국내 금액과 미국 금액의 통화 표기 및 환산 요약을 확인한다.
4. 새로고침 후 선택한 표시 통화가 유지되는지 확인한다.

기대 결과: NaN이나 잘못된 통화 기호가 없고 KR/US 정책이 기존 계산 규칙과 일치한다.

### S04. 가상 포트폴리오 독립성

1. `#virtual`에서 Microsoft를 매수한다.
2. 실제 포트폴리오로 돌아가 Microsoft가 실제 보유 종목에 추가되지 않았는지 확인한다.
3. 다시 가상 포트폴리오로 이동해 Microsoft 보유 내역이 유지되는지 확인한다.

기대 결과: REAL과 VIRTUAL ledger가 섞이지 않고 각각 독립적으로 저장된다.

### S05. 시장 탐색과 거래 연결

1. `#market`에서 KR/US filter를 전환한다.
2. `AAPL`을 검색하고 결과에서 종목 상세 drawer를 연다.
3. 현재가, 최근 차트, 재무 지표, 뉴스의 loading/error/empty 상태를 확인한다.
4. 상세 화면의 매수 action으로 거래 dialog를 열어 종목 preset을 확인한다.
5. drawer와 dialog를 Escape, backdrop, close button으로 닫는다.

기대 결과: 검색 결과와 선택 종목이 일치하고, stale 결과가 뒤늦게 다른 종목 상세를 덮어쓰지 않으며 거래 preset이 유지된다.

### S06. 거래 내역 필터

1. `#transactions`에서 실제 포트폴리오를 선택한다.
2. 전체/매수/매도와 수동/자동 filter, 날짜 범위, 정렬을 차례로 변경한다.
3. fixture의 3개 삼성전자 거래와 Apple 거래가 조건에 맞게 필터링되는지 확인한다.
4. 새로고침 후 원본 거래 데이터가 유지되는지 확인한다.

기대 결과: 필터는 원본 ledger를 변경하지 않으며 빈 결과 상태와 초기화 action이 정상 동작한다.

### S07. 대시보드 레이아웃 저장·복원

1. Desktop에서 패널 하나를 다른 패널의 좌우 또는 상하로 이동한다.
2. 한 행에 두 패널을 배치하고 divider로 폭을 조정한다.
3. 새로고침 후 순서와 분할 비율이 복원되는지 확인한다.
4. Mobile로 변경해 패널이 읽을 수 있는 단일 흐름으로 표시되는지 확인한다.
5. 잘못된 `dashboard-panel-layout-v2` 값을 주입하고 새로고침해 기본 배치 fallback을 확인한다.

기대 결과: 유효한 layout은 복원되고 유효하지 않은 값은 화면을 깨뜨리지 않으며 기본 layout으로 복구된다.

### S08. 테마와 접근성 기본 동작

1. light/dark theme을 전환하고 새로고침한다.
2. positive/negative 금액, 카드, input, table, modal을 확인한다.
3. 키보드만으로 navigation과 주요 action에 접근한다.
4. modal을 열고 Tab 순환, Escape 닫기, 닫은 뒤 trigger 포커스 복귀를 확인한다.

기대 결과: 텍스트 대비와 금융 등락 색상 의미가 유지되고 포커스를 잃지 않는다. 현재 구현이 기대 결과를 충족하지 못하면 W21-06 이전의 기존 접근성 부채로 기록한다.

## 비교 및 이슈 기록 규칙

- 각 리팩토링 PR은 영향받는 시나리오 ID를 PR 설명에 적는다.
- 기능 차이는 `재현 단계 / 기대 결과 / 실제 결과 / viewport / theme / API 상태` 형식으로 기록한다.
- 외부 API 응답값 변화, 네트워크 실패, 현재 시세 변화는 구조 리팩토링 회귀와 분리한다.
- 의도적인 UX 변경은 기준선을 조용히 갱신하지 않고 별도 결정과 테스트 변경을 동반한다.
