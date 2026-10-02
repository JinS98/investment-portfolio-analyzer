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
- 토스 Open API 허용 IP에 개발 환경의 공인 IP와 운영 Cloud NAT 고정 IP를 등록한다.
- Hosting 재작성, Firestore 규칙, Functions 배포 후 실제 응답·오류·호출량 점검

## 토스 OpenAPI 운영 고정 IP

토스 OpenAPI의 허용 IP는 Firebase Hosting의 접속 IP가 아니라 `tossApi` Function이 토스 서버로 요청을 보낼 때 사용하는 outbound IP다. Cloud Functions 2세대는 기본 상태에서 외부 요청에 동적 IP 풀을 사용하므로 현재 Function 설정만 배포하면 IP 변경으로 토스 요청이 실패할 수 있다.

운영 환경은 다음 경로로 구성한다.

```text
사용자
  → Firebase Hosting /api/toss/*
  → tossApi Cloud Function
  → Direct VPC egress
  → Cloud NAT
  → 예약된 고정 외부 IP
  → 토스 OpenAPI
```

Google Cloud 공식 구성 기준은 다음 문서를 따른다.

- [Cloud Run 고정 outbound IP 구성](https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip)
- [Cloud Run functions 2세대 Direct VPC egress](https://docs.cloud.google.com/functions/docs/running/direct-vpc)
- [Cloud NAT 개요](https://docs.cloud.google.com/nat/docs/overview)

### 인프라 생성

모든 regional resource는 Function과 동일한 `asia-northeast3`에 생성한다. 아래 이름과 CIDR은 프로젝트 상황에 맞게 바꿀 수 있다.

```bash
gcloud compute networks create portfolio-vpc \
  --subnet-mode=custom

gcloud compute networks subnets create toss-egress-subnet \
  --network=portfolio-vpc \
  --region=asia-northeast3 \
  --range=10.10.0.0/28

gcloud compute addresses create toss-egress-ip \
  --region=asia-northeast3

gcloud compute routers create toss-egress-router \
  --network=portfolio-vpc \
  --region=asia-northeast3

gcloud compute routers nats create toss-egress-nat \
  --router=toss-egress-router \
  --region=asia-northeast3 \
  --nat-external-ip-pool=toss-egress-ip \
  --nat-custom-subnet-ip-ranges=toss-egress-subnet
```

예약된 운영 IP는 다음 명령으로 확인한다.

```bash
gcloud compute addresses describe toss-egress-ip \
  --region=asia-northeast3 \
  --format="value(address)"
```

확인한 주소를 Function 배포 전에 토스 OpenAPI 허용 IP에 등록한다. 토스가 복수 IP 등록을 지원하는 경우 로컬 개발용 공인 IP와 운영 IP를 함께 등록한다. CI runner가 토스 API를 직접 호출한다면 runner의 outbound IP도 별도로 고정·등록해야 한다.

### Function 연결

`functions/src/index.ts`의 `tossApi` runtime option에 Direct VPC egress를 설정한다.

```ts
export const tossApi = onRequest(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 5,
    networkInterface: {
      network: 'portfolio-vpc',
      subnetwork: 'toss-egress-subnet',
    },
    vpcEgress: 'ALL_TRAFFIC',
  },
  async (request, response) => {
    // 기존 handler 유지
  },
);
```

토스 OpenAPI는 외부 인터넷 주소이므로 `ALL_TRAFFIC`이 필요하다. `PRIVATE_RANGES_ONLY`를 사용하면 외부 토스 요청이 Cloud NAT를 통과하지 않아 예약 IP가 적용되지 않는다. `networkInterface`와 Serverless VPC Access의 `vpcConnector`는 동시에 설정하지 않는다.

### 적용 순서

1. Google Cloud 프로젝트에서 VPC, subnet, 고정 IP, Router, Cloud NAT를 생성한다.
2. 예약된 고정 IP를 확인해 토스 OpenAPI 허용 IP에 먼저 등록한다.
3. Function에 `networkInterface`와 `vpcEgress: 'ALL_TRAFFIC'`를 적용한다.
4. Functions와 Hosting을 배포한다.
5. Function의 실제 outbound IP가 예약 IP와 같은지 확인한다.
6. `/api/toss/health` 확인 후 토큰 발급, `exchange-rate`, `search`, `rankings` 순으로 실제 요청을 점검한다.
7. Cloud Logging에서 토스 API의 IP 거부, timeout, 인증 오류가 없는지 확인한다.

고정 IP만 예약하고 Function을 VPC에 연결하지 않거나, Cloud NAT만 만들고 모든 outbound 트래픽을 VPC로 보내지 않으면 토스 요청에는 고정 IP가 적용되지 않는다.

### 비용과 운영 주의사항

- Cloud NAT, Cloud Router 트래픽, 고정 외부 IP에는 Google Cloud 사용 요금이 발생할 수 있다.
- 고정 IP는 실수로 해제하지 않도록 운영 resource로 관리한다. 삭제 후 같은 주소가 다시 할당된다는 보장은 없다.
- `maxInstances` 증가 시 NAT 포트 사용량과 토스 API 호출 제한을 함께 점검한다.
- IP 확인을 위한 임시 endpoint를 공개 상태로 장기간 유지하지 않는다. 검증 후 제거하거나 관리자만 호출할 수 있게 제한한다.
- Secret 값은 클라이언트 `VITE_` 환경 변수나 health 응답에 노출하지 않는다.

## 배포 후 상태 확인

- `GET /api/toss/health`가 `status: "ok"`와 토스 환경 변수 설정 상태를 반환하는지 확인한다.
- 상태 확인은 API 키 값 자체를 반환하지 않으며, Hosting 재작성과 Function 실행 여부만 검증한다.
- `health` 성공만으로 토스 허용 IP가 정상이라는 뜻은 아니다. 실제 토큰 또는 시세 요청까지 성공해야 outbound IP 구성이 검증된다.
- 상태 확인 뒤 `exchange-rate`, `search`, `rankings` 순으로 실제 외부 API 응답을 점검한다.

## 기준

- 토스 Client Secret과 외부 정보 API 키는 `VITE_` 변수로 노출하지 않는다.
- 개발·배포 모두 프론트엔드는 `/api/toss/*`만 호출한다.
