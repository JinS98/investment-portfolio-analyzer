# 33일차: Firestore 규칙과 공개 API 검증

## 재실행 방법

- Functions: `npm ci --prefix functions`, `npm run build --prefix functions`, `npm test --prefix functions`
- Firestore 규칙: Node.js 22와 Java 21을 준비하고 루트에서 `npm ci`, `npm run test:rules`를 실행한다. 이 명령은 `demo-portfolio-rules` 프로젝트 ID로 Firestore 에뮬레이터를 실행하며 운영 데이터에 연결하지 않는다.
- GitHub Actions의 `functions`와 `firestore-rules` 작업에서 두 검사를 다시 실행한다. Firestore 규칙 테스트에는 실제 Firebase 계정이나 API 키가 필요하지 않다.

## 검증 범위

| 대상                                                                       | 허용되어야 하는 요청                             | 거부되어야 하는 요청                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 기존 `/portfolios/{uid}/stocks`, `/history`                                | 본인의 읽기·생성·수정·삭제, 목록 조회            | 타인 및 비로그인 사용자의 읽기·쓰기·목록 조회                                                   |
| `/users/{uid}/portfolios/{id}`와 거래 원장·요약·적립식 규칙·실행·이관 기록 | 본인의 읽기·생성·수정·삭제, 포트폴리오 목록 조회 | 타인 및 비로그인 사용자의 읽기·쓰기·목록 조회                                                   |
| 그 밖의 Firestore 경로                                                     | 없음                                             | 인증된 사용자도 접근 차단                                                                       |
| `/api/toss/*`                                                              | 정상 응답은 JSON과 엔드포인트별 공유 캐시 헤더   | 잘못된 입력 400, 타 출처 403, 없는 경로 404, 키 누락 503, 연결 실패 502, 상위 API 제한 응답 429 |

Functions 테스트는 외부 `fetch`를 가짜 응답으로 대체한다. 토큰 발급과 시세 조회, 상위 API 실패, 키 누락, 요청 제한을 실제 토스 키 없이 검증한다. `health`는 설정 여부만 반환하며 키 값은 반환하지 않는다. 성공 응답만 공유 캐시를 허용하고 오류 응답은 `no-store`다.

## 공개 API 운영 기준

`/api/toss/*`는 Firebase Hosting을 통한 공개 GET API다. `Origin` 검사와 인스턴스 메모리의 IP별 90회/60초 제한은 비용·남용에 대한 **보조 장치**다. Origin 헤더가 없는 클라이언트도 호출할 수 있고, IP 제한은 Function 인스턴스 간에 공유되지 않는다. 현재 `maxInstances: 5`이므로 90회/분을 서비스 전체의 고정 상한으로 해석해서는 안 된다. `x-forwarded-for` 원문을 신뢰해 제한 키로 사용하지 않고 Functions가 제공하는 `request.ip`를 사용한다. 최대 10,000개의 IP 창을 인스턴스에 보관하고, 만료된 창을 정리해도 가득 차 있으면 새 IP는 429로 거부한다. 인스턴스 재시작 시 제한 상태는 초기화된다.

종목 검색 색인이 인스턴스마다 만들어지고 첫 검색에는 여러 시장의 `STOCK_ALL` 요청이 순차적으로 발생한다. 토스 시세·랭킹·검색 외에 Frankfurter, Yahoo, EODHD, 네이버, Marketaux 요청도 이 공개 경로를 통과한다. 외부 API의 자체 호출 한도와 과금 조건을 별도로 확인해야 한다. 과거 환율 캐시는 1,024개, 종목 외부 정보 캐시는 500개 항목으로 제한한다. 캐시 헤더는 CDN의 실제 적중률을 보장하지 않으며 인스턴스별 토큰·검색·외부 정보 캐시도 서로 공유되지 않는다.

운영 공개 전에는 다음을 충족한다.

1. Firebase/Google Cloud 예산 알림과 Functions 요청 수·실행 시간·오류율, 토스 및 선택적 외부 API 호출량을 관찰한다. 예상치를 넘으면 Function을 비활성화하거나 공개 경로를 제한한다. 예산 알림 자체는 과금을 자동 차단하지 않는다.
2. 검증 환경에서 Hosting 재작성, 실제 토스 토큰·시세·검색·랭킹, 429 및 5xx 응답, 캐시 적중률을 확인한다. 이 단계는 39~40일차 작업이며 로컬 가짜 응답 테스트를 대체하지 않는다.
3. 공개 트래픽이 증가하거나 비용 제한을 보장해야 한다면 공유 저장소 기반 제한 또는 앞단의 게이트웨이·보호 계층에 전역 할당량을 적용하고 재검증한다. 현재 인스턴스 메모리 제한만으로 전역 비용 상한을 보장한다고 표시하지 않는다.

## 현재 검증 결과

- Functions 빌드와 API/제한 테스트 9개가 로컬에서 통과했다.
- 기본 PC 환경에는 Java가 없어서 공식 Adoptium Java 21 JRE를 임시 폴더에 받아 `npm run test:rules`를 실행했다. Firestore 에뮬레이터에서 본인 허용, 타인·비로그인 차단, 미등록 경로 차단 검증이 통과했다. 임시 Java 파일은 검증 후 삭제했다. CI의 `firestore-rules` 작업도 추가했으며 CI 실행 결과는 커밋·푸시 후 확인해야 한다.
- 실제 Firebase 규칙 배포, 토스 외부 API 통신 및 비용 관측은 아직 수행하지 않았다. 39~40일차 검증 환경에서 확인한다.

참고: [Firebase 보안 규칙 단위 테스트](https://firebase.google.com/docs/rules/unit-tests), [Firebase 에뮬레이터 설정](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Functions 인스턴스와 동시성](https://firebase.google.com/docs/functions/manage-functions).
