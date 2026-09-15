# Week 9 — 실제 포트폴리오 거래 기록 UI

## 구현 범위

- 기존 보유 종목의 직접 수정 방식을 거래 원장 기반 매수·매도 기록 방식으로 전환했다.
- 매수는 종목 검색 후 기록하며, 시장은 선택한 종목 정보에서 자동으로 판단한다.
- 매도는 현재 보유 종목만 선택할 수 있고 보유 수량을 초과하는 입력을 막는다.
- 거래 금액 기준 수수료 추정치(0.015%)와 국내 주식 매도세 추정치(0.2%)를 기본값으로 채우며 사용자가 수정할 수 있다.
- 저장 뒤 Firestore 원장을 재계산해 보유 수량, 이동평균 평단가, 매도 실현손익을 즉시 갱신한다.
- 거래 내역은 대시보드에서 분리한 `#transactions` 전용 페이지에서 조회한다.

## 거래 내역 페이지

- 전체·매수·매도 필터
- 종목명·티커 검색
- 시작일·종료일 기간 필터
- 최신순·오래된순 정렬
- 매도 기록의 실현손익 표시
- 삭제 확인 후 원장 재계산
- 삭제 실패 시 인라인 오류 안내

## Firestore 경로와 권한

거래 원장 데이터는 아래 경로에 저장한다.

```text
users/{userId}/portfolios/{portfolioId}
├── holdings/{market}_{ticker}
├── holdingHistories/{historyId}
└── summary/current
```

[firestore.rules](../firestore.rules)는 인증된 사용자 본인의
`users/{userId}/portfolios/**` 경로만 읽고 쓸 수 있도록 설정되어 있다.
Firebase Console 또는 Firebase CLI에서 규칙을 배포해야 운영 Firestore에 반영된다.

## 검증

- `node --experimental-strip-types --test tests/calculator.test.ts tests/portfolioLedger.test.ts`
  - 18개 테스트 통과
  - 추가 매수, 부분·전량 매도, 보유 수량 초과 차단, 이력 삭제 후 재계산, REAL/VIRTUAL 분리 검증
- `npm run typecheck` 통과
- `npm run lint` 통과
- `npm run build` 통과
