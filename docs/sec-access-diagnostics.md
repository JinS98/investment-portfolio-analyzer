# SEC 접근 차단 진단

2026-10-17 실제 SEC 응답에서 확인한 결과입니다. 키 발급 오류가 아니라 SEC의 자동 요청 차단 응답입니다. 이 결과만으로 이 앱이 요청 한도를 초과했다고 단정할 수 없습니다.

| 요청                                             | HTTP | SEC 응답 유형                   | 참조번호                         |
| ------------------------------------------------ | ---- | ------------------------------- | -------------------------------- |
| 기업목록 `/files/company_tickers.json`           | 403  | Request Rate Threshold Exceeded | `0.37bc4117.1792212166.cc797fa8` |
| Apple 공시목록 `/submissions/CIK0000320193.json` | 403  | Undeclared Automated Tool       | `0.1ead2c17.1792212166.2d3ef423` |
| Apple Company Facts                              | 403  | Undeclared Automated Tool       | 서버 로그에서 최신 참조번호 확인 |

## 적용한 처리

- 기존의 운영자 이름·연락 이메일을 포함한 User-Agent와 서버 요청 간격을 유지합니다.
- SEC가 403/429를 반환하면 해당 인스턴스의 SEC 외부 요청을 10분간 중단합니다.
- 서버 로그에는 경로·상태·차단 유형·참조번호·재시도 가능 시각만 기록합니다. HTML 원문과 연락 이메일은 기록하거나 브라우저에 반환하지 않습니다.
- 해외 뉴스는 독립적으로 유지합니다. 종목 상세의 15분 캐시가 있으므로 화면에 오류가 잠시 남을 수 있습니다.

## 남은 외부 조치

1. 모든 실행 인스턴스의 SEC 요청을 중단하고 최소 10분간 기다립니다. 서버 재시작 자체가 SEC 차단을 해제하지는 않습니다.
2. 이후 한 번 확인해 차단이 지속되면, SEC에 실제 요청 공인 IP·시각·오류 유형·참조번호로 접근 제한을 문의합니다.
3. SEC 공식 문의처는 `webmaster@sec.gov`입니다. 이 작업에서 이메일을 발송하지 않았습니다.

문의 초안:

```text
Subject: SEC EDGAR automated access denied with declared User-Agent

Our portfolio application includes an operator name and contact email in its
User-Agent. Requests are serialized and spaced at least 250 milliseconds apart.
We received HTTP 403 responses for company_tickers.json and data.sec.gov APIs.

Public request IP: [실제 서버 공인 IP]
Request time and timezone: [요청 시각]
Response: Request Rate Threshold Exceeded / Undeclared Automated Tool
Reference IDs: [최신 서버 로그의 reference 값]

Could you help identify the cause and advise how to restore compliant access?
```

공식 안내: https://www.sec.gov/about/webmaster-frequently-asked-questions
