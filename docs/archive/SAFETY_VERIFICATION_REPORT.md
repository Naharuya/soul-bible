# onaria Safety 검증 — 2026-09-10

> 과거 작업 기록입니다. 테스트 수·버전·실기기 상태는 작성 당시의 결과이며, 현재 상태는 [ONARIA_STATUS](../../ONARIA_STATUS.md)를 확인하세요.

Safety 로그 추가 검증: HTTP 입력 검증 직후 `safety_assessment` 이벤트에 `riskLevel`(기존 숫자 0~3), `crisisTriggered`, `category`, UTC ISO `timestamp`만 기록한다. 사용자 원문·식별자·모델 원문은 포함하지 않는다. 추가 감지로 응답이 위기로 전환되면 `response_crisis` 이벤트가 별도로 기록되므로 이벤트 수는 요청 수와 같지 않다. customEmotion 및 세션 위기에서 category가 safe로 남던 문제를 수정했다. 동기/비동기 로거 실패에도 위기 응답이 유지된다. 서버 로그 출력이며 별도 DB 저장은 추가하지 않았다. backend 전체 327개 통과(`build/safety-events.log`), 기존 모델 호출 0회 검증 포함. Flutter는 이번 서버 변경에서 재실행하지 않았으며 운영 로그 수집 및 실제 사용자 검증은 미완료다.

최신 추가 검증: `safety_invariants.test.js`에서 Psychology 호출·Religion 호출·OpenAI 클라이언트 생성을 별도로 계수했다. cold 서비스에서 모두 0회, 일반 입력으로 세 계수가 실제 증가하는 양성 대조 후 warm 서비스에서도 위험 요청에 따른 증가량이 모두 0임을 확인했다. backend 전체 325개 통과(`build/safety-zero-calls.log`). 이번 추가 작업은 테스트·문서만 변경했으며 Flutter는 재실행하지 않았다. 운영 telemetry 검증은 미완료다.

기능명: Safety / 위기대응

우선순위: R0 — 생성·종교 응답보다 먼저 적용하는 안전 경로.

CODE: 완료(이번 보강 범위). 입력 검증 직후 판정, 세션 위기 상태 유지, 로컬 fallback 및 기존 직접 OpenAI 호출 경로의 위기 우회, 서버·Flutter 위기 응답의 고정 안내 전환을 적용했다. 전체 표현의 탐지를 보장하는 분류기는 아니다.

TEST: backend 324개 통과, Flutter 40개 통과·기존 조건부 skip 1개. 정적 분석 error/warning 0·info 8. 새 UI 테스트에서 발견한 작은 화면 overflow를 수정한 뒤 다시 통과했다. 배포 smoke를 별도 Node 프로세스(NODE_ENV=production)에서 실제 로컬 HTTP 서버로 실행해 13건 일치와 생성 호출 0회를 확인했다.

REAL: 부분 완료 — 실제 localhost HTTP 서버의 입력 검증·위기 선차단·고정 응답 테스트 통과. 외부 모델은 stub이며 운영 검증을 대체하지 않는다. 운영 `/health` 재확인은 약 10초 후 curl 28·HTTP 000 연결 시간 초과였다. 이번 변경 APK의 설치와 운영 배포는 미실행.

USER: 미확인 — 전문가·실제 사용자 검증은 아직 없다.

근거 파일/테스트: [서버 불변조건 테스트](../../backend/test/safety_invariants.test.js), [공유 표현 집합](../../backend_contract/safety_cases.json), [Flutter 판정·통신 오류 테스트](../../test/safety_parity_test.dart), [위기 UI 테스트](../../test/conversation_lifecycle_test.dart), [API 응답 비밀 차단 테스트](../../backend/test/openai_service.test.js). 실행 로그는 `build/safety-backend.log`, `build/safety-flutter.log`, `build/safety-analysis.log`에 있다.

남은 리스크: 규칙 밖 표현의 누락/오탐·부정/인용 문맥, 운영 배포 차이, 전문가 검수 미완료. 모델 정상 응답의 모든 종류의 부적절한 내용이나 임의의 비밀 정보까지 완전 차단한다는 의미는 아니다. 서버의 설정 API key echo, raw 오류/출력·stack의 실패 경로 노출을 막는 범위다. 공통 앱 인증·요청 크기/형식·rate limit은 Safety 이전 HTTP 경계에 남아 있다.

다음 행동: 운영 연결 복구 → 동일 배포 버전의 smoke와 호출 로그 검증 → 실제 단말·사용자 검증.

## 사용자 지정 7조건

후속 위기 응답 원칙 반영: 서버·Flutter 고정 안내에서 현재 안전 여부를 먼저 묻고, 주변 사람·전문가 도움과 급박한 상황의 지역 응급 서비스 연결을 안내한다. 일반 종교 상담 차단은 유지한다. 한국 연락처와 해외 이용 시 현지 번호 안내를 구분했다. 안전 질문 표시만으로 실제 안전 확인이나 도움 연결 성공을 주장하지 않는다.

이 변경 후 backend 324개·Flutter 40개 통과, 기존 Flutter skip 1개. 로그는 `build/safety-response-backend.log`, `build/safety-response-flutter.log`다. 실제 전화 발신·운영 배포·새 APK 설치는 수행하지 않았다. 연락처 근거: [109 공식 안내](https://www.129.go.kr/109), [112·119 정부 안내](https://www.korea.kr/news/policyNewsView.do?newsId=148915282).

| 조건 | 구현·증거 | 남은 검증 |
| --- | --- | --- |
| 입력 검증 직후 Safety | HTTP 및 서비스 진입점에서 요청 schema 검증 다음에 실행. 서비스의 agent 선택도 뒤로 이동 | 운영 설정에서 동일 순서 확인 |
| Psychology/Religion/OpenAI보다 먼저 | 7전통과 공유 위험 예제에서 downstream 0회. 기존 직접 OpenAI callable에도 선차단 추가 | 운영 모델/검색 호출 기록 대조 |
| high/critical의 일반 종교 응답 차단 | level 2/3을 포함한 모든 level > 0 고정 위기 반환 | 새로운 표현·문맥의 오탐/누락 평가 |
| Local fallback의 위기 덮어쓰기 방지 | userMessage·customEmotion·기존 riskLevel/currentStage를 보수적으로 병합. local 자체 선차단과 반환값 위기 보존 | 실제 서버 장애 경로 확인 |
| 비밀·내부 오류·모델 원문 비노출 | 기존 schema 검증 유지, provider API key echo 차단, 오류 logger 실패 격리. Flutter의 서버 오류 body·잘못된 JSON을 고정 오류로 전환. 위기 표시 전에 고정 UI로 분기 | 운영 오류/사용자 표시 결과 확인 |
| Flutter/backend 판정 차이 최소화 | backend의 누락된 임박성 표현 두 개 추가, 공백·구두점 정규화 일치. 같은 43개 JSON 예제를 양쪽에서 실행 | 범위를 넓힌 전문가 검토 예제 필요 |
| 실제 서버 동일 응답 구조 | 운영과 테스트가 같은 createApp/판정/고정 응답 함수를 사용. 배포 검증용 smoke 추가 | 실제 운영 실행과 호출 없음 증거는 미확인 |

## 배포 환경 검증 명령

서버에 같은 버전의 코드와 `backend_contract/safety_cases.json`을 함께 배치한다. 필요한 공통 앱 토큰은 서버의 비밀 환경변수 `APP_BEARER_TOKEN`을 사용하며 명령줄에 적지 않는다.

```powershell
cd C:\Users\SJ\AndroidStudioProjects\soul-bible\backend
$env:SAFETY_SMOKE_BASE_URL = 'https://api.onaria.ai.kr'
npm.cmd run safety:smoke
```

이 명령은 실행 방법이며 운영 통과 기록이 아니다. 합성 위기 입력 13건의 HTTP 응답을 고정 응답과 비교하고 원문·토큰·서버 오류 body를 출력하지 않는다. 응답 일치만으로 실제 OpenAI 호출 0회를 증명할 수 없으므로 서버/provider telemetry를 함께 확인한다. 일반 모델 오류 fallback은 격리된 환경에서 별도로 검증한다.
