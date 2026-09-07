# SoulBible 멀티에이전트 2단계 결과

## 완료한 단계

1단계 기본 Conversation Orchestrator와 원래 createLocalConversationService()를 보존하고, server.js에서 기존 기능 플래그 팩토리를 통해 OpenAI 경로를 연결했다. 3단계 작업은 수행하지 않았다.

기본 실행값은 기존 .env.example과 동일하다. 실제 .env는 읽거나 수정하지 않았다.

```env
SOUL_AI_MODE=local
SOUL_MULTI_AGENT_ENABLED=false
OPENAI_API_KEY=
```

## 변경 파일

- `src/server.js`: createConversationService() 연결.
- `src/conversation_service.js`: 플래그 검사, 안전 검사 이후 지연 클라이언트 생성, 오류별 fallback 분류, 요청별 내부 로그·사용량 집계.
- `src/agents/conversation_orchestrator.js`: 종교 라우팅 예외를 명시적으로 분류. 기본 로컬 경로 유지.
- `src/openai_service.js`: 기존 Responses API와 structured output 구현 유지, 선택적 숫자형 사용량 callback 추가.
- `test/phase2_service.test.js`: 신규 21개 테스트.
- `test/openai_service.test.js`: 신규 사용량 callback 테스트 1개 추가. 기존 테스트 유지.
- `test/local_orchestrator.test.js`: 기존 import 경계 테스트 1개의 검사 시작점을 server.js에서 기본 orchestrator로 변경. 테스트 삭제·건너뛰기 없음.
- `MULTI_AGENT_INTEGRATION.md`, `PHASE_1_INTEGRATION.md`: 과거 기록과 현재 상태 구분.
- `PHASE_2_INTEGRATION.md`: 이 보고서.

1단계의 서버 전체 OpenAI import 금지 조건은 2단계의 명시적 연결 목표와 양립할 수 없다. 따라서 기존 검증의 목적을 기본 로컬 orchestrator의 독립성으로 유지했고, 기능 플래그별 실제 호출 여부는 신규 동작 테스트로 검증했다.

## OpenAI 연결 구조

`server.js → createConversationService → requestSchema validation → Safety` 이후:

- 기본값, local, flag OFF: 기존 LocalConversationService 사용. 클라이언트 초기화 및 외부 호출 0회.
- openai + flag ON + 키 없음/공백 포함 키: 로컬 fallback, missing_api_key로 내부 기록.
- openai + flag ON + 비어 있지 않고 공백 없는 키: 기존 openai_service.js의 클라이언트를 지연 생성하고 orchestrator에 runStructured 주입.

활성 흐름은 심리 성찰 → 종교 라우터 → 해당 종교 전문 출력 → Religious Integrity → Response Integrator → 기존 Zod 응답 검증이다. 심리 성찰과 종교 전문 출력은 같은 기존 OpenAI 서비스로 각각 한 번의 논리적 호출을 수행한다. 새 SDK나 중복 API 계층은 추가하지 않았다.

모델은 기존 OPENAI_MODEL 설정을 사용하며 기본값 gpt-5.6도 유지한다. 키 문자열의 존재 확인은 서버 인증 성공을 보장하지 않는다. 실제 키·계정·모델 접근 권한은 공급자 응답으로 확인하며 401/403도 안전하게 fallback한다.

SDK 요청 timeout 6초, 최대 재시도 1회, 전체 대화 흐름 제한 18초와 AbortSignal 취소를 유지한다. 전체 제한에는 클라이언트 초기화도 포함한다. 시간 초과 후 늦게 완료된 심리 응답은 다음 종교 호출로 이어지지 않는다.

## Safety 우선 처리 결과

요청 검증 및 기존 Safety 검사가 OpenAI 클라이언트 생성보다 먼저 수행된다. critical/high뿐 아니라 기존 감지기의 모든 위험 수준을 유지했다. /v1/mind/chat의 기존 위기 응답과 메모리 처리는 수정하지 않았다.

잘못된 요청은 기존 HTTP 400으로 남고 fallback으로 바꾸지 않는다. 위기 응답 역시 fallback으로 덮지 않는다. app.js가 먼저 반환하는 위기 입력은 기존 metrics로 집계되며 생성기 호출 자체가 없다.

## Local fallback 결과

| 상황 | 내부 reason category |
|---|---|
| 전체 제한·SDK timeout·취소 | timeout |
| 연결 실패 | connection_failure |
| HTTP 429 | rate_limit |
| HTTP 5xx | provider_5xx |
| HTTP 401/403 | provider_auth |
| JSON 파싱 실패 | malformed_json |
| 응답 스키마 검증 실패 | schema_validation |
| 에이전트 등 기타 예외 | agent_exception |
| 내부 종교 라우팅 실패 | religion_routing |
| 종교 콘텐츠 검증 실패 | religious_integrity |
| 플래그 ON이지만 키 부재 | missing_api_key |

기존 religion 미지정/개신교 요청의 로컬 응답은 그대로다. 앞선 서비스에 있던 비개신교 fallback의 성경 추천 제거와 중립 안내도 유지했다. 1단계 기본 orchestrator 자체의 응답 일치 테스트 2,048개 조합은 계속 통과한다.

미지원 religion을 **요청**으로 보내는 경우는 Zod 검증 오류이고, 검증된 요청 처리 중 specialist가 없거나 라우팅이 실패하는 경우만 religion_routing fallback이다.

## Religion routing 결과

protestant, catholic, buddhist, jewish, islamic, hindu, confucian 모두 올바른 전문 모듈로 연결한다. religion 생략 시 protestant 기본값을 유지한다.

현재 서버에는 검증된 경전 코퍼스가 없으므로 sourceContext는 빈 배열이다. 종교 전문 출력은 기존 서버 허용 문구 안의 일반적 관점·안내로 제한하며 sourceRefs는 빈 배열이어야 한다. 출처 없는 경전 인용, 위조 sourceRefs, 허용 목록 밖의 종교 안내는 검증 실패 후 로컬로 전환한다. allowedVerseIds는 기존 Flutter 말씀 ID 선택에만 사용하고 검증된 경전 본문 자료로 취급하지 않는다.

자료가 없는 상태에서 임의 인용을 허용하는 기능은 추가하지 않았다. RAG나 대량 경전 적재도 없다.

## 테스트 결과

- 변경 전 기존 59/59 통과.
- 신규 테스트를 먼저 추가하고 실패를 확인한 뒤 구현.
- 최종 **기존 59 + 신규 22 = 백엔드 81/81 통과**, 삭제·건너뛰기 없음.
- **Flutter 24/24 통과**. 기존 Dart 파서와 HTTP fixture round-trip 포함.
- local/OFF/키 없음에서 클라이언트 생성 0회, ON 성공, timeout, 연결 실패, 429, 503, JSON/스키마 실패, 에이전트/라우팅 예외, 안전 우회, 7개 종교 및 기본값, 위조 인용 차단, HTTP 스키마 호환성 검증.
- 동시 4개 요청에서 클라이언트 하나를 공유하면서 토큰 수와 호출 횟수는 요청별 분리됨을 검증.
- 로그 sink 및 사용량 callback이 실패해도 성공 응답/fallback이 유지됨을 검증.
- 공급자 테스트는 더미 키와 mock/stub만 사용. 외부 OpenAI 호출 없음.

실행: backend에서 설치된 Node v24.19.0으로 `node --test`, 루트에서 기존 Flutter SDK로 `flutter test --no-pub`. 새 의존성 설치나 lockfile 변경 없음.

## 기존 Flutter/API 호환성

Flutter 앱 코드, 로컬 서비스 원본, Zod request/response, OpenAPI, app.js route, DB 구현은 변경하지 않았다. 응답 JSON에 provider/model/fallback 등의 새 필드를 넣지 않았다. 회원가입·OAuth·관리자 PWA·Docker·DB 스키마·별도 앱·운영 에이전트 외부 연동 변경도 없다.

## 로그/비용 추적 준비

conversation_result 내부 이벤트:

```json
{
  "provider": "openai",
  "model": "configured model name",
  "fallback": false,
  "fallbackReason": null,
  "latencyMs": 123,
  "modelCalls": 2,
  "inputTokens": 20,
  "outputTokens": 10
}
```

위 숫자는 형식 예시다. 실제 공급자 usage의 비음수 정수만 집계한다. 모델 실패로 로컬 응답을 반환하면 provider는 local이며, 시도한 model과 fallback reason을 함께 남긴다. 모델 호출 전 로컬/안전 경로의 model은 null이다. 초기화는 동시 요청 간 공유하지만 사용량은 공유하지 않는다.

API 키, 사용자 원문, 심리 성찰/기억, 공급자 원본 오류·응답은 일반 로그에 넣지 않는다. 모델 설정값도 로그에 허용 가능한 문자열만 기록한다. conversation_fallback 경고에는 제한된 사유만 남긴다.

modelCalls는 **논리적 SDK 호출 수**이며 SDK 내부 재시도까지 센 청구 횟수는 아니다. 토큰 수는 응답에서 확인된 usage만 합산하므로 사용량이 반환되지 않은 실패·timeout 요청의 비용을 나타내지 않는다. 정확한 금액 계산이나 청구 시스템을 추가한 것은 아니다.

## 남은 위험

- 실제 API 키/모델 권한과 실서비스 응답 품질·지연은 아직 미검증이다. .env를 건드리지 않았으며 실제 호출하지 않았다.
- 기존 SQLite 네이티브 바인딩 누락 문제는 별도 환경 작업으로 남는다. 테스트는 회원 저장소를 주입하므로 실제 DB 기반 서버 시작을 검증한 것은 아니다.
- 심리 성찰은 자유 생성 텍스트에 금지 지침을 전달하는 방식이다. 종교 전문 모듈의 허용 문구 검증이 심리 출력의 모든 의미적 안전성을 보장하지 않는다. 실제 모델 평가는 별도로 필요하다.
- 기존 Flutter의 세 번째 턴 자동 말씀 표시는 그대로다. 이번 7종교 라우팅은 서버 API 범위이며 종교 선택 UI 출시는 별도 작업이다.
- 관리자 화면의 기존 고정 local conversation 표시는 이번 제외 범위에 따라 유지했다. 실제 생성 경로는 서버 시작 로그와 conversation_result 이벤트에서 확인한다.

## 다음 권장 단계

2단계 코드·mock 검증은 완료했다. 실제 호출 확인이 필요하면 키를 채팅에 보내지 말고 서버 .env에서 설정한 다음, 검증용 환경에서 비민감 입력 한 건으로 확인한다. 대화 요청 한 건은 심리와 종교 역할 때문에 최대 두 번의 논리적 모델 호출을 수행할 수 있다. 이번 작업에서는 해당 실호출을 수행하지 않았다. 3단계는 별도 요청 이후 진행한다.

검토 자료: [OpenAI 공식 Structured Outputs 문서](https://developers.openai.com/api/docs/guides/structured-outputs), 현재 설치된 OpenAI SDK 및 기존 테스트.
