# Week 8 — 거래 원장 저장·복원

## 저장 구조

```text
users/{userId}/portfolios/{portfolioId}
├── type: REAL | VIRTUAL
├── name
├── createdAt / updatedAt
├── holdings/{market}_{ticker}
├── holdingHistories/{historyId}
├── summary/current
└── migrations/legacy-stock-v1
```

`holdingHistories`가 원본이며, `holdings`와 `summary/current`은 이력을 다시 계산한 결과다. 거래 추가·삭제는 이력, 보유 상태, 요약, 포트폴리오 수정 시각을 하나의 Firestore Batch로 기록한다.

## 기본 포트폴리오와 이관

- 로그인 시 `real`, `virtual` 기본 포트폴리오를 생성한다.
- 기존 `portfolios/{userId}/stocks` 문서는 삭제하지 않는다.
- 기존 종목은 `legacy-{stockId}`의 BUY 이력으로 REAL 포트폴리오에 한 번만 이관한다.
- 이관 이력에는 `source: LEGACY_IMPORT`, 기존 종목 ID, 기존 추가 시각, 이관 시각을 기록한다.
- `migrations/legacy-stock-v1` 문서가 생성된 뒤에는 같은 이관을 다시 실행하지 않는다.

## 로드 및 상태 갱신

1. 로그인 시 기본 포트폴리오 확인 및 기존 보유 이관
2. 거래 이력을 읽고 `recalculatePortfolio()`로 보유 상태와 요약 재생성
3. Zustand에는 선택된 포트폴리오의 `holdings`, `holdingHistories`, `portfolioSummary`와 전체 `portfolioLedgers`를 저장
4. 거래 추가·삭제 후 Firestore 저장이 성공한 경우에만 Zustand를 갱신

계정 전환 중에는 이전 사용자의 비동기 로드 결과를 무시한다.

## 운영 전 준비

[firestore.rules](../firestore.rules)를 Firebase Console에 Publish해야 새 `users/{userId}/portfolios/{portfolioId}` 경로가 허용된다. 현재 UI는 기존 직접 입력형 보유 화면을 유지한다. 거래 입력·이력 UI는 Week 9에서 새 원장 액션과 연결한다.
