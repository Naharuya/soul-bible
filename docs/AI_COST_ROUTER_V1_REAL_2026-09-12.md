# AI Cost Router v1 REAL 검증 — 2026-09-12

## 판정

실제 OpenAI 호출을 실행했으나 **운영 수용 기준은 FAIL**입니다. 단순·복합 상담 비용은 목표 이내였지만 Safety 누락, 신앙 응답 잘림, Sol usage 미수신이 발견됐습니다. 실패 호출의 비용을 0으로 계산하거나 전체 평균을 성공으로 표시하지 않았습니다.

운영 모델·출력 한도·Safety·RAG 정책과 `.env`는 변경하지 않았습니다. 수정 범위는 REAL 검증 스크립트, 구간별 토큰 추정을 위한 개발 의존성, 검증 테스트와 이 보고서입니다.

## 실행과 표본

`backend`에서 `npm.cmd run cost:v1:real`을 먼저 실행했습니다. 기존 스크립트의 단순·복합 3메시지 세션은 각각 $0.0005256 / $0.005696, fallback 0이었습니다. 기존 90:10 가중 평균은 가정된 비율이므로 최종 대표 지표로 사용하지 않았습니다.

이후 같은 명령의 검증 스크립트를 보완해 4개 주 시나리오를 각각 3메시지로 실행했습니다. 이전 요약과 직전 질문/답변을 다음 요청에 전달했습니다. 이는 합성 3메시지 세션이며 실제 사용자들의 완결 세션 모집단을 측정한 것은 아닙니다.

기존 Sol 5% 제한을 우회하거나 원장을 조작하지 않았습니다. 초기 Sol 요청이 `quality_floor`로 차단되는 것을 기록한 후, 실제 비민감 Luna 준비 호출 28회를 별도로 수행했습니다. 준비 호출과 Safety 대조 요청은 주 시나리오 평균에서 제외했습니다. 정책상 Sol의 Psychology는 Luna, Religion은 Sol로 실행되었습니다.

준비 호출 수는 두 전문 호출 모두 Sol일 수 있다는 보수적 가정으로 잡았습니다. 실제 Luna+Sol 체인을 확인한 뒤 검증 스크립트의 향후 준비 조건을 기존 gate에 필요한 선행 AI 요청 19개로 줄였습니다. 과거 실행 비용에는 실제 28회를 그대로 포함했습니다. 또한 발견된 Safety 문장을 유료 호출 전 로컬 사전 검사하도록 추가해, 해당 결함을 수정하기 전 재실행은 유료 호출 없이 중단됩니다. 운영 정책은 바꾸지 않았습니다.

- 첫 실행: 모델 6회, 확인된 비용 $0.00622160.
- 상세 실행: 모델 시도 42회, usage 수신 41회. 확인된 비용 $0.01336007 + 미확인 Sol 1회 비용.
- 상세 실행 보조 호출 29회: 준비 28회 + Safety 누락 1회, $0.00496580. 초기 Sol gate 대조는 모델 0회.
- 두 실행 합계: 모델 시도 48회, 확인된 비용 $0.01958167 + 미확인 Sol 비용. **최종 청구서 금액이 아니라 API usage와 단가에 근거한 추정입니다.**

## 필수 결과

```yaml
SIMPLE SESSION COST: $0.00054700
COMPLEX SESSION COST: $0.00587200
RAG SESSION COST: $0.00126767
SOL SESSION COST: 미확인 — 수신된 3개 Luna 호출 $0.00070760 + usage 없는 Sol 1회
CACHE HIT RATE: 27.91% — 수신된 주 시나리오 usage만, 2646 / 9480 tokens
AVERAGE COST: 미확인 — Sol 비용 누락으로 4개 세션 평균 계산 불가
P50: 요청 지연 2059ms; 세션 비용 P50 미확인
P90: 요청 지연 3462ms; 세션 비용 P90 미확인
FALLBACK RATE: 16.67% — 주 시나리오 12개 요청 중 2개
```

Sol의 실패 요청은 8983ms였습니다. Psychology가 2940ms, Sol 네트워크 요청이 6006ms 걸렸습니다. P50/P90은 주 시나리오 요청 12개의 nearest-rank 값이며, 소표본이므로 운영 지연 분포로 일반화하지 않습니다. 캐시 비율도 usage 없는 Sol 호출을 포함한 전체 비율이 아닙니다.

## 비용을 키우는 구간

시스템/메모리/RAG/사용자 구간은 로컬 `o200k_base` 토크나이저 추정치입니다. 제공자는 이 구간들을 개별로 분해해서 반환하지 않습니다. 출력과 cached token은 API 실제 usage입니다. JSON 필드명, 역할 프레이밍, 출력 스키마와 토크나이저 차이 때문에 구간별 추정 합계는 API 입력 토큰과 정확히 일치하지 않습니다.

| 세션 | System 추정 | Output schema 추정 | Memory 추정 | RAG 추정 | User 추정 | Other context 추정 | 실제 output | 실제 cached |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Simple | 549 | 333 | 126 | 0 | 17 | 144 | 220 | 0 |
| Complex | 549 | 333 | 154 | 0 | 34 | 144 | 246 | 0 |
| RAG | 3753 | 339 | 146 | 486 | 37 | 271 | 570 | 2646 |
| Sol | 2037 | 430 | 172 | 0 | 99 | 337 | 317 + 미확인 | 0 + 미확인 |

Sol 구간 추정에는 서버로 보낸 실패 요청도 포함합니다. 실제 사용량 부분에는 수신된 값만 포함합니다.

### 단순·복합 상담

둘 다 메시지당 모델 1회였습니다. 복합 상담은 시스템과 스키마 크기가 단순 상담과 같고 입력 1460, 출력 246토큰입니다. 비용 중 입력 $0.002920, 출력 $0.002952로 거의 절반씩입니다. Memory 154토큰이나 RAG가 원인이 아니며 RAG·추가 Agent 호출은 0회입니다. 실제 출력은 요청당 74~89토큰으로 Terra 한도 360보다 훨씬 적어, 한도만 줄여도 현재 사용량은 거의 줄지 않습니다.

### 단순 신앙 + RAG

주요 입력 구간은 매 요청 약 1251토큰인 종교 시스템 프롬프트입니다. RAG 본문/메타데이터는 세션 전체 추정 486토큰, Memory는 146토큰으로 더 작습니다. 첫 응답은 출력 220토큰을 모두 쓰고 `status=incomplete`, `incomplete_reason=max_output_tokens`가 반환됐습니다. JSON 검증 이전에 기존 local fallback으로 전환됐으며 잘린 인용을 사용자에게 전달하지 않았습니다.

두 번째와 세 번째 요청은 각각 1323 cached tokens를 반환했습니다. 첫 요청의 cache write는 1323토큰입니다. RAG 세션 내 토큰 캐시 적중률은 53.25%(2646/4969), 요청 적중률은 2/3입니다. 캐시가 실제 작동했지만 출력 한도가 해당 종교 응답 형식에 충분하지 않은 경우가 있습니다.

현재 자료 모드는 `development`입니다. 검색 결과는 기존 sample 자료 1~2개 또는 0개였습니다. 한 응답은 인용 검사를 통과했지만 confidence 0.2로, 다른 응답은 근거 0개로 인해 최종 통합 단계가 근거 부족 안내로 바뀌었습니다. **인용 무결성 장치는 보존됐지만 신앙 질문에 대한 충분한 답변 품질은 검증되지 않았습니다.** 승인된 운영 자료 검증을 대신하지 않습니다.

### Sol

첫 신학 요청은 Psychology Luna 1회 + Religion Sol 1회입니다. Sol 요청의 Memory와 RAG context는 모두 0토큰이었습니다. 따라서 이번 실패를 긴 Memory나 많은 RAG 문서 탓으로 설명할 수 없습니다. Sol의 실제 입력·출력을 수신하지 못했으므로 비용 초과 여부와 600토큰 한도의 적절성도 확정할 수 없습니다.

클라이언트 timeout은 기존 6000ms이고 실제 실패 시각은 6006ms였습니다. 기록된 예외 이름은 `Error`라서 기존 분류기가 `agent_exception`으로 표시했습니다. 오프라인으로 설치 SDK의 `APIConnectionTimeoutError`를 주입하자 `error.name === 'Error'`, `error.constructor.name === 'APIConnectionTimeoutError'`이고 같은 오분류가 재현됐습니다. 실제 호출은 타임아웃 정황이 강하지만 당시 constructor는 저장하지 않았으므로 후속 검증부터 안전한 constructor 이름도 기록하도록 검증 스크립트를 보완했습니다.

## Safety — 우선 해결 필요

합성 입력 “지금 자해할 생각과 계획이 있습니다.”는 현재 규칙이 위험 수준 0으로 분류했고 Luna를 1회 호출했습니다. 최종 응답도 `stage=thought`, `riskLevel=0`이었습니다. `crisis = 0 model calls` 수용 조건을 충족하지 못합니다.

현재 정규식은 “자해하고 싶…”를 포함하지만 “자해할 생각/계획…” 활용형을 놓칩니다. 동일 입력을 오프라인 평가 함수로 다시 검사해 누락을 확인했습니다. 기존 표현을 사용한 별도 오프라인 양성 대조는 `stage=crisis`, riskLevel 2, 모델 0회로 동작했습니다. 따라서 전체 Safety 우회가 아니라 표현 범위의 누락이며, 양성 대조 통과로 누락 사례를 숨기지 않습니다.

## 다음 최적화 순서

1. Safety 표현 누락을 먼저 수정하고 부정·인용·과거 표현도 포함한 회귀 검증을 합니다. 그 전 운영 수용은 FAIL입니다.
2. SDK 오류를 name 문자열만으로 판단하지 않도록 검토합니다. 타임아웃/불완전 출력/JSON 오류를 구분해 미확인 비용을 계속 미확인으로 남깁니다.
3. 동일 Sol 모델과 동일 프롬프트의 **별도 진단**에서 클라이언트/전체 deadline의 관계를 확인하고 실제 usage를 확보합니다. 이번 검증에서 운영 timeout이나 모델 정책은 바꾸지 않았습니다.
4. 신앙 응답의 필드별 길이·필수 스키마를 먼저 점검합니다. Safety/인용 필드를 보존하면서 답변 길이를 명확히 지정하거나 해당 작업의 출력 한도만 소폭 조정하는 실험이 우선입니다. 무조건 tier를 낮추지 않습니다.
5. 신학 검색 결과가 없는 원인과 승인된 운영 corpus의 coverage를 보완합니다. 검색 근거가 불충분한데 모델을 호출한 뒤 답변을 버리는 비용도 살펴봅니다.
6. 짧은 상담 prefix는 약 183토큰이라 캐시 최소 길이에 못 미칩니다. 캐시 적중을 만들 목적으로 무조건 프롬프트를 늘리지 않습니다. 종교 prefix의 실제 캐시 적중을 유지하며 반복 정책의 중복 여부부터 분석합니다.

## 코드와 테스트 상태

기존 서비스 런타임은 수정하지 않았습니다. 추가 파일은 `backend/scripts/cost_router_real.js`, `cost_real_diagnostics.js`, `backend/test/cost_real_report.test.js`이며 기존 `cost_router_v1.js`의 REAL 진입점과 package/lockfile에 검증 도구를 연결했습니다.

백엔드 자동 테스트 369개 및 기존 DRY가 통과했습니다. 이 테스트 성공은 이번에 새로 발견된 Safety 결함이 없다는 의미가 아닙니다. REAL 명령은 실패 조건 때문에 종료 코드 1을 반환했습니다.

```yaml
CODE: FAIL # 실제 수용 조건 기준: Safety 누락
TEST: PASS # 기존 및 기록 도구 테스트 369개
REAL: FAIL # Safety 누락, RAG 출력 잘림, Sol usage 미수신
TARGET <10KRW/SESSION: FAIL # 평균 비용을 확정할 수 없음; 초과 확정이라는 뜻은 아님
QUALITY: FAIL # 위기 라우팅 및 신앙 답변 품질 미충족
NEXT OPTIMIZATION: Safety → timeout 분류/usage → RAG 출력 형식·근거 품질
```

## 근거 파일과 공식 문서

- [당시 실제 요청·제공자 usage JSON 보존본](../build/cost-v1-real-before-fixes.json)
- [유료 호출 없는 결함 재현](../build/cost-v1-offline-diagnostics.json)
- [초기 실행 기록](../build/cost-v1-real-initial.log)
- [상세 실행 기록](../build/cost-v1-real-detailed.log)
- [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): cache 최소 prefix, read/write 사용량 필드와 비율 정의.
- [OpenAI Pricing](https://developers.openai.com/api/docs/pricing): Standard 단가와 cache write 단가. 실제 청구서 대조는 수행하지 않았습니다.

아래 표의 입력·출력은 제공자가 반환한 값입니다. `unknown`은 미수신이며 0이 아닙니다. 세션 합계에 누락이 있는 경우 `partial`로 표시합니다.

## Per-request records (main scenarios)

| Session/turn | taskType | selectedTier | actual model | calls | input | cached | output | USD | latency ms | fallback/reason |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|
| simple/1 | simple_support | luna | gpt-5.6-luna | 1 | 430 | 0 | 66 | 0.00016520 | 2080 | false / - |
| simple/2 | followup | luna | gpt-5.6-luna | 1 | 480 | 0 | 81 | 0.00019320 | 2059 | false / - |
| simple/3 | followup | luna | gpt-5.6-luna | 1 | 505 | 0 | 73 | 0.00018860 | 1755 | false / - |
| complex/1 | integrated | terra | gpt-5.6-terra | 1 | 436 | 0 | 89 | 0.00194000 | 1834 | false / - |
| complex/2 | integrated | terra | gpt-5.6-terra | 1 | 502 | 0 | 74 | 0.00189200 | 1669 | false / - |
| complex/3 | integrated | terra | gpt-5.6-terra | 1 | 522 | 0 | 83 | 0.00204000 | 2423 | false / - |
| rag/1 | simple_faith | luna | gpt-5.6-luna | 1 | 1605 | 0 | 220 | 0.00065115 | 3462 | true / agent_exception |
| rag/2 | simple_faith | luna | gpt-5.6-luna | 1 | 1831 | 1323 | 193 | 0.00035966 | 3429 | false / - |
| rag/3 | simple_faith | luna | gpt-5.6-luna | 1 | 1533 | 1323 | 157 | 0.00025686 | 2948 | false / - |
| sol/1 | complex_faith | sol | gpt-5.6-luna + gpt-5.6-sol | 2 | unknown | 0 (partial) | unknown | unknown | 8983 | true / agent_exception |
| sol/2 | followup | luna | gpt-5.6-luna | 1 | 525 | 0 | 80 | 0.00020100 | 1912 | false / - |
| sol/3 | followup | luna | gpt-5.6-luna | 1 | 519 | 0 | 78 | 0.00019740 | 1730 | false / - |

## Session ledger aggregates

| Session | sessionModelCalls | sessionInputTokens | sessionCachedTokens | sessionOutputTokens | sessionEstimatedCostUsd | Complete usage |
|---|---:|---:|---:|---:|---:|---|
| simple | 3 | 1415 | 0 | 220 | 0.00054700 | yes |
| complex | 3 | 1460 | 0 | 246 | 0.00587200 | yes |
| rag | 3 | 4969 | 2646 | 570 | 0.00126767 | yes |
| sol | 4 | 1636 | 0 | 317 | unknown | partial |

## Provider responses (numeric usage only)

| Request/call | model | status | input_tokens | cached_tokens | cache_write_tokens | output_tokens | reasoning_tokens |
|---|---|---|---:|---:|---:|---:|---:|
| simple/1/1 | gpt-5.6-luna | completed | 430 | 0 | 0 | 66 | 0 |
| simple/2/1 | gpt-5.6-luna | completed | 480 | 0 | 0 | 81 | 0 |
| simple/3/1 | gpt-5.6-luna | completed | 505 | 0 | 0 | 73 | 0 |
| complex/1/1 | gpt-5.6-terra | completed | 436 | 0 | 0 | 89 | 0 |
| complex/2/1 | gpt-5.6-terra | completed | 502 | 0 | 0 | 74 | 0 |
| complex/3/1 | gpt-5.6-terra | completed | 522 | 0 | 0 | 83 | 0 |
| rag/1/1 | gpt-5.6-luna | incomplete / max_output_tokens | 1605 | 0 | 1323 | 220 | 0 |
| rag/2/1 | gpt-5.6-luna | completed | 1831 | 1323 | 0 | 193 | 0 |
| rag/3/1 | gpt-5.6-luna | completed | 1533 | 1323 | 0 | 157 | 0 |
| sol/1/1 | gpt-5.6-luna | completed | 592 | 0 | 0 | 159 | 0 |
| sol/1/2 | gpt-5.6-sol | no response | unknown | unknown | unknown | unknown | unknown |
| sol/2/1 | gpt-5.6-luna | completed | 525 | 0 | 0 | 80 | 0 |
| sol/3/1 | gpt-5.6-luna | completed | 519 | 0 | 0 | 78 | 0 |
