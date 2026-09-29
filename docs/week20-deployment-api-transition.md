# 20주차: 배포용 API 전환

## 목표

Vite 개발 서버 전용 시장 데이터 API를 Firebase 배포 환경에서도 같은 경로로 제공한다.

## 완료 범위

- Firebase Hosting의 `/api/toss/**`를 `asia-northeast3`의 `tossApi` Cloud Function으로 재작성
- 토스·종목 검색·환율·지수·외부 정보 호출을 Functions 런타임으로 분리
- Functions 전용 환경 변수 예시와 빌드 설정 추가
- 엔드포인트별 캐시 헤더와 인스턴스별 요청 제한, 오류 응답 유지

## 배포 전 확인

- Firebase 프로젝트 연결과 Functions 환경 변수 설정
- **Blaze 요금제 전환**: Cloud Functions 2세대 배포에는 Cloud Build와 Artifact Registry가 필요하므로 Spark 요금제에서는 배포할 수 없다.
- Firebase 또는 Google Cloud Billing에서 월 예산 알림을 1,000원 또는 5,000원으로 설정한다. Blaze는 월정액이 아니라 사용량 과금이며, 현재 함수 구성은 유휴 인스턴스를 유지하지 않는다.
- 토스 Open API 허용 IP 및 배포 도메인에서의 시세·환율·시장 탐색 호출 확인
- Hosting 재작성, Firestore 규칙, Functions 배포 후 실제 응답·오류·호출량 점검

## 배포 후 상태 확인

- `GET /api/toss/health`가 `status: "ok"`와 토스 환경 변수 설정 상태를 반환하는지 확인한다.
- 상태 확인은 API 키 값 자체를 반환하지 않으며, Hosting 재작성과 Function 실행 여부만 검증한다.
- 상태 확인 뒤 `exchange-rate`, `search`, `rankings` 순으로 실제 외부 API 응답을 점검한다.

## 기준

- 토스 Client Secret과 외부 정보 API 키는 `VITE_` 변수로 노출하지 않는다.
- 개발·배포 모두 프론트엔드는 `/api/toss/*`만 호출한다.
