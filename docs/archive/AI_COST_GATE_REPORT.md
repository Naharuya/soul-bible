# onaria AI Cost Gate v1 완료 보고

> 과거 작업 기록입니다. 테스트 수·버전·실기기 상태는 작성 당시의 결과이며, 현재 상태는 [ONARIA_STATUS](../../ONARIA_STATUS.md)를 확인하세요.

> 2026-09-09 후속: 런타임 기본 원장은 별도 SQLite 저장소로 확장되었다. 아래 v1의 프로세스 메모리 한계와 보관 범위 설명은 [영구 원장 후속 보고서](AI_COST_GATE_PERSISTENCE_REPORT.md)의 최신 내용을 따른다.

작업일: 2026-09-09. 로컬 구현 및 mock 검증 완료. 운영 배포나 유료 OpenAI 호출은 수행하지 않았다.

## 변경 파일

새 파일:

- `backend/src/cost/cost_gate.js`
- `backend/src/cost/model_router.js`
- `backend/src/cost/usage_ledger.js`
- `backend/src/cost/model_pricing.js`
- `backend/test/cost_gate.test.js`
- `backend/test/model_router.test.js`
- `backend/test/usage_ledger.test.js`
- `backend/test/model_pricing.test.js`
- `backend/test/cost_integration.test.js`
- `backend/test/cost_admin.test.js`
- `backend/test/fixtures/cost_fixtures.js`
- `backend/scripts/cost_smoke.js`
- `AI_COST_GATE_REPORT.md`

수정 파일:

- `backend/src/conversation_service.js`: Safety 뒤에 Cost Gate, 모델별 client, 단일 호출 CHEAP 및 검색 전용 RAG 경로, 사용량 연결.
- `backend/src/openai_service.js`: optional cached token 계측. 캐시 정보가 없으면 기존 callback 객체 형태 유지.
- `backend/src/app.js`: 기존 관리자 응답에 aiUsage 추가, 기존 HTTP Crisis 경로를 LOCAL 사용량으로 기록.
- `backend/public/admin.html`, `backend/public/admin.js`: 기존 카드 스타일을 사용하는 비용·토큰·처리율 표시.
- `backend/.env.example`: 등급 모델, 일·월 quota, 예약 예산, 가격표 설정 안내.
- `backend/package.json`: `smoke:cost` 명령.
- `BUILD_REPAIR_REPORT.md`: 후속 작업 연결.

직전 보안 작업의 stateless memory 변경(`schema.js`, `chat_integration.test.js`, 보안 보고서 등)은 유지했다. 이번 작업에서 이를 이전 Map 조회 방식으로 되돌리지 않았다.

## 구현 완료

- **AI Cost Gate:** 무료 기본 하루 AI 생성 요청 5회/$0.03, Premium 50회/$0.30. 기본 월 한도는 일 한도의 31배이며 환경변수로 변경할 수 있다. 잘못된 명시 설정은 허용량을 늘리지 않고 LOCAL로 제한한다. 한도 사용률 80% 이상은 CHEAP, 한도 초과는 LOCAL이다. 검색 전용 요청은 quota와 무관하게 RAG를 시도한다.
- **Model Router:** 에이전트 선택은 기존 ai_router를 사용한다. 심리/감정 분석은 CHEAP, 일반 종교 통합은 STANDARD, 복잡한 요청은 허용 조건에서 PREMIUM이다. Premium은 요청 비율과 실제 모델 호출 비율 모두 하루 5% 이하로 제한한다. 초기 요청 수가 적으면 STANDARD로 내려간다. 새 모델 설정이 비어 있으면 기존 OPENAI_MODEL을 사용하므로 실제 단가 차이는 운영 모델 설정에 달려 있다.
- **Usage Ledger:** timestamp, 가명 userId/sessionId, plan, agent, taskType, model, modelTier, modelCalls, tokens, estimatedCostUsd, provider, fallback 정보를 기록한다. ID는 프로세스별 임의 키로 HMAC 처리한다. prompt, 사용자 발화, memory 원문은 저장하지 않는다. 이벤트는 최신 10,000개로 제한하며 현재 기간의 quota 집계는 이벤트 제거로 초기화되지 않는다.
- **Token Tracking:** 요청 수와 실제 모델 호출 시도를 구분한다. STANDARD는 기존 orchestrator가 수행하는 여러 호출을 각각 기록하고, CHEAP는 심리 분석 1회와 기존 로컬 응답을 조합한다. 호출 실패·타임아웃도 시도 수에 포함한다. 늦게 도착한 usage도 기록하지만 종료된 대화를 재개하지 않는다. SDK 자동 재시도는 Cost Gate가 사용하는 client에서 0회로 설정하여 숨은 호출을 방지한다.
- **Cost Estimation:** SOUL_MODEL_PRICING_JSON 한 곳에서 USD/백만 토큰 단가를 읽는다. 일반 입력에서 cachedInputTokens를 빼고 캐시 단가를 별도 적용한다. 가격이나 실제 usage가 없는 호출은 null로 남기며, 집계도 미확인 비용을 0으로 표시하지 않는다. knownCostUsd와 unknownCostCalls를 별도로 제공한다.
- **Admin Metrics:** 인증된 기존 overview에 aiUsage를 추가했다. UTC 오늘의 호출·입력·캐시·출력·예상 비용, 처리 경로별 요청 수, 캐시 토큰 비율과 절감액, AI 세션당/인증 회원당 평균 비용을 표시한다. 회원 평균에는 익명 사용 비용을 포함하지 않는다. 기존 endpoint를 사용하는 구버전 응답에도 관리자 UI가 대응한다.
- **Safety bypass:** 기존 HTTP Crisis 및 서비스 Safety가 비용 검사보다 먼저 동작한다. quota, ledger 장애, capacity 부족이 위기 응답을 막지 않는다.
- **Local/RAG fallback:** 인사·간단한 규칙 응답은 LOCAL. 구절/종교 자료 검색은 기존 keyword retrieval, 출처·라이선스·전통·언어·production 검증 및 confidence를 통과한 자료만 원문과 출처로 응답한다. 불충분·불명확·실패 시 LOCAL이며 추가 LLM/외부 embedding 호출을 하지 않는다. 일반 AI 실패 시 기존 fallback 구조를 사용한다.

### 운영 설정과 계측 범위

- 사용자별 인증이 아직 없으므로 현재 HTTP 경로의 모든 익명 사용자는 **공통 무료 quota**를 사용한다. sessionId 변경이나 JSON 내부 plan/userId로 한도를 우회할 수 없다. 서버 내부의 검증된 identity 인자를 연결한 경우에만 회원별/Premium quota를 사용할 수 있다. 공통 app bearer를 회원 인증으로 취급하지 않는다.
- 생성 요청 전에 기본 $0.006을 동기적으로 예약한다. 동시 요청도 예약분을 차감한 한도로 판단한다. 알려진 단가는 요청 직전 입력 UTF-8 바이트와 여유분, 출력 상한을 사용해 예약액 초과 호출을 거부한다. 요청당 모델 호출 상한은 4회다. 실제 사용량을 알면 정산하고, 알 수 없으면 예약액을 유지한다.
- **미등록 모델 가격에서 달러 한도는 실제 청구액의 보장이 아니다.** 호출 수 제한과 보수적 예약이 적용되며 비용은 null이다. 운영자가 검증한 모델별 단가와 예약 예산을 설정해야 한다. 테스트 단가는 합성값이고 실서비스 가격표로 제공하지 않는다.
- v1 quota와 ledger는 단일 Node 프로세스 메모리에 있다. 재시작 시 초기화되고 다중 인스턴스 간 합산하지 않는다. UTC 일/월 경계로 갱신된다. 사용자별 집계 상한은 기간당 10,000이며 도달 시 추가 유료 작업을 허용하지 않는다. 관리자 세션 수 집계 상한은 일 10,000개다.
- 새 RAG 경로는 외부 embedding을 사용하지 않는다. 기존 고급 검색 경로의 별도 opt-in 외부 embedding 비용, 호스팅 및 다른 서비스 비용은 이 LLM 비용 원장에 포함되지 않는다.
- LOCAL/RAG 60~70%, CHEAP 20~30%, STANDARD 5~15%는 운영 트래픽에서 측정할 목표다. v1은 이런 비율을 맞추려고 요청을 임의 배분하지 않는다.
- cached token 경로는 설치된 SDK 정의와 [OpenAI Responses API 문서](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create)를 확인했다. 캐시 적중률은 cachedInputTokens/inputTokens이며, 캐시가 적중한 요청 수 비율과 다르다.

## 기존 기능 보존

- **기존 API:** `/v1/mind/chat`, `/v1/admin/overview`, 인증과 Express rate limit 유지. 기존 응답 필드 삭제/이름 변경 없음.
- **기존 Multi-Agent:** ai_router, conversation_orchestrator, Religion Router/Agents를 수정하지 않았다. STANDARD/PREMIUM은 기존 orchestrator 경로를 사용한다.
- **Bible/Religion RAG:** 기존 구현을 재작성하지 않고 별도 저비용 호출 경로에서 재사용한다. 기존 고급 검색과 검증 테스트도 통과했다.
- **Memory Summary:** 앱이 보내는 summary + 필요한 현재 context를 유지한다. 새로운 transcript 저장소나 DB migration은 추가하지 않았다. 별도 유료 summary 전용 호출 없이 CHEAP 심리 결과 또는 기존 integrator 결과를 사용한다.
- **Crisis/Safety:** crisis.js, safety_agent.js와 기존 안전성 응답을 유지했다.
- **Flutter compatibility:** Flutter UI/응답 schema 변경 없음. 실제 Dart parser contract와 Flutter 회귀 테스트 통과.

## 테스트

```text
Backend node --test (npm test와 동일): 296 passed, 0 failed, 0 skipped
npm run smoke:cost: exit 0 (위 backend 전체 테스트를 실제 실행한 뒤 HTTP smoke 수행)
flutter test --no-pub: 31 passed, 1 skipped, 0 failed
git diff --check: 통과
```

Flutter skip 1개는 기존 `conversation_lifecycle_test.dart`의 `ApiConfig.baseUrl != null` 조건에 따른 로컬 모드 테스트다. 최초 제한된 환경의 Flutter 실행은 무출력 대기로 중단했고 SDK 접근 권한을 확보한 재실행이 성공했다.

추가 검증: 무료 정상 호출, CHEAP downgrade, quota 초과, trusted Premium, 실제 premium model 선택, 위기 bypass, RAG 성공/실패, malformed 출처, 동시 요청, 월 경계, unknown 가격, ledger 장애, 관리자 인증/기존 필드, 민감 문자열 비노출, 캐시 누락 호환성, UI의 null 비용 처리.

## 실제 Smoke Test

실제 localhost Express HTTP 서버와 관리자 endpoint를 사용했다. 모델·usage·가격·RAG 자료는 mock이며 운영 DB/실제 API Key/유료 OpenAI 요청을 사용하지 않는다. `npm run smoke:cost`로 재현할 수 있다.

```json
{
  "ok": true,
  "costGate": true,
  "modelRouter": true,
  "usageLedger": true,
  "pricing": true,
  "adminMetrics": true,
  "existingTestsPassed": true
}
```

```text
Total requests: 9
LLM calls: 9
Local/RAG responses: 4
Cheap calls: 5
Standard calls: 4
Premium calls: 0

Input tokens: 9000
Cached input tokens: 3600
Output tokens: 900

Estimated cost: $0.0000792 (synthetic pricing)
Average cost per AI session: $0.0000792 (1 mock session)
```

요청 9개 중 AI 생성은 5개다. STANDARD 요청 4개는 각각 CHEAP 심리 + STANDARD 종교 호출을 수행하고, CHEAP 요청 1개는 1회만 호출한다. 다른 4개는 LOCAL 3개와 RAG 1개다. Premium의 실제 선택은 별도 통합 테스트에서 검증했다.

## 남은 작업

v2 항목:

- 검증된 회원 인증/plan 저장소를 quota identity에 연결.
- 재시작과 다중 인스턴스에도 유지되는 atomic shared ledger 및 예약 복구.
- 모델 단가 버전·유효 기간, 실제 청구 대조, embedding 등 별도 비용과 late usage 정산 통합.
- 실제 트래픽 기반 routing 비율·응답 품질 평가와 정책 조정, 기간별 추세/분석 화면.
