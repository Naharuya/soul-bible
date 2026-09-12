# AI Cost Router v1 REAL 결함 수정 결과

최종 코드의 backend 388개 테스트, Flutter Safety 8개 테스트 및 유료 REAL 검증을 통과했다. 모델 등급·기본 모델·quota 정책과 운영 환경변수는 변경하지 않았다. Sol 요청 timeout만 실제 실패 진단 후 6초에서 12초로 조정했으며 전체 대화 deadline은 18초를 유지한다.

## 수정과 근거

- Safety: REAL에서 누락된 합성 표현 및 유사 의도·계획 표현을 backend/Flutter 양쪽 규칙에 추가했다. 같은 `backend_contract/safety_cases.json`에 위험 사례 5개와 예방 관련 비위험 사례 2개를 추가했다. 기존 false-positive 회귀 사례를 유지했다. 해당 REAL 표현은 riskLevel 3, local crisis response, OpenAI client 생성 0, 모델 0, Psychology/Religion 0으로 검증했다.
- REAL preflight: 전체 공통 corpus의 riskLevel 및 위험 입력의 V1 서비스 우회 동작을 확인하고, 실패하면 실제 client 생성 전에 중단한다. 배포 smoke의 기존 15건 한도는 유지하며 추가 사례는 전체 자동 테스트에서 검사한다.
- Timeout: SDK의 `APIConnectionTimeoutError`는 `name`이 `Error`일 수 있어 기존 문자열 비교가 실패했다. 실제 클래스, SDK abort, AbortError, request/overall timeout code, HTTP 408을 `timeout`으로 분류한다. 5xx/429/401·403/JSON 오류는 각각 `provider_5xx`/`rate_limit`/`provider_auth`/`malformed_json`이다.
- RAG 출력: 일반 Luna 220을 유지하고 종교 specialist Luna만 320을 적용했다. 최종 실제 출력은 179/201/129 tokens로 모두 completed였다. `incomplete`는 `incomplete_output`으로 기록하고 수신한 usage는 유지한다.
- RAG prefix: common policy → safety → religion role → citation/integrity → output schema 순서를 고정했다. Memory → RAG passages → 현재 메시지는 뒤쪽 데이터에 배치한다. 날짜나 session ID가 prefix에 들어가지 않는다. API schema는 기존 strict structured schema를 사용한다.
- 근거 경계: 내용 검토 과정에서 Sol이 출처 없이 신학적 설명을 덧붙이는 사례를 발견했다. V1은 검증 후 confidence < 0.4이면 직접 인용 여부와 무관하게 기존 제한 안내를 적용한다. 충분한 합성 fixture 근거에서는 정상 응답을 보존하는 회귀 테스트를 추가했다. 종교 corpus는 추가하지 않았다.

## Sol 단계별 진단

| 단계 | 결과 | 실제 input/output | 시간 | 추정 USD |
|---|---|---:|---:|---:|
| 최소 요청, SDK 6초 | completed | 11 / 5 | 2.010초 | 0.000144 |
| 최소 structured, SDK 6초 | completed | 102 / 100 | 3.655초 | 0.002408 |
| 본 benchmark의 Sol, SDK 6초 | APIConnectionTimeoutError | unknown | 6.010초 | unknown |
| Psychology→Sol 별도 재현, Sol SDK 6초 | completed | 739 / 274 | Sol 5.687초 | Sol 0.008436 |
| SDK 12초 적용 후 중간 검증 | completed | 744 / 301 | Sol 7.692초 | Sol 0.008996 |
| 최종 근거 경계 적용 | completed | 750 / 248 | Sol 5.288초 | Sol 0.007960 |

접근 권한과 structured output 지원은 정상이다. 통합 요청의 응답 시간이 6초 부근에서 변동하며 SDK timeout에 걸렸다. 중간 검증의 7.692초 완료로 6초 초과 응답도 확인했다. 최종 Psychology+Sol 요청 전체는 7.906초였다. timeout 요청의 미수신 usage를 성공한 재시도 usage로 대체하지 않았다.

## 최종 세션 측정

각 세션은 비민감 합성 메시지 3회로 정의했다. 실제 운영 사용자의 완결 세션 평균을 의미하지 않는다. 비용은 provider usage와 설정된 가격표로 계산한 추정치이며 청구서 대사가 아니다.

| 세션 | modelCalls | inputTokens | cachedInputTokens | outputTokens | estimatedCostUsd |
|---|---:|---:|---:|---:|---:|
| Simple | 3 | 1419 | 0 | 220 | 0.0005478 |
| Complex | 3 | 1478 | 0 | 265 | 0.0061360 |
| RAG | 3 | 2539 | 0 | 509 | 0.0011186 |
| Sol | 4 | 2475 | 0 | 593 | 0.0087190 |

- 평균: **$0.00413035/session < $0.007**.
- 세션 비용 P50/P90: $0.0011186 / $0.0087190 (4개 표본, nearest rank).
- 요청 latency P50/P90: 2.126초 / 3.951초 (12개 요청).
- 본 시나리오 fallback: 0/12. 본 시나리오 모델 호출: 13/12, 단순 대화는 메시지당 1회.
- Safety control: riskLevel 3, 호출 0, 위험 표현은 유료 모델에 전송하지 않았다.
- Cold Sol gate: 기존 quota에 따른 `quality_floor`, 모델 0. 별도 정책 대조군이므로 본 시나리오 fallback 비율에 포함하지 않았다. 이를 포함한 최종 전체 요청은 24개이고 fallback은 1/24이다.
- 기존 Sol 비율 제한 충족을 위한 실제 warmup 10회는 평균에서 제외하고 총 실행 비용에 포함했다. quota를 조작하거나 가짜 ledger 기록을 만들지 않았다.
- 최종 실행 전체: 실제 모델 23회, 추정 $0.0181998. 최종 실행은 모든 usage를 받았다.
- 이번 수정 중 진단·실패·재검증 전체: 73회 시도, 수신 usage 72회분 추정 $0.059083 + timeout 1회 비용 unknown. 이전 작업에서 발생한 호출은 이 합계에 포함하지 않았다.

## 토큰 구간과 캐시

system/schema/memory/RAG/user는 로컬 o200k_base 추정이다. 실제 provider는 이 구간별 attribution을 제공하지 않으므로 구간 합계가 실제 input과 정확히 같지는 않다. 실제 usage 전체는 JSON에 보존했다.

| 요청군 | system | schema | memory | RAG | user | 실제 output | 실제 cached |
|---|---:|---:|---:|---:|---:|---:|---:|
| Simple 1/2/3 | 183 각각 | 111 각각 | 0/50/80 | 0 | 5/8/4 | 67/81/72 | 0 |
| Complex 1/2/3 | 183 각각 | 111 각각 | 0/76/96 | 0 | 11/10/13 | 95/86/84 | 0 |
| RAG 1/2/3 | 446 각각 | 113 각각 | 0/63/68 | 162/324/0 | 9/14/14 | 179/201/129 | 0 |
| Sol의 Psychology | 420 | 95 | 0 | 0 | 38 | 138 | 0 |
| Sol specialist | 446 | 113 | 0 | 0 | 38 | 248 | 0 |
| Sol 후속 2/3 | 183 각각 | 111 각각 | 122/139 | 0 | 12/11 | 105/102 | 0 |

RAG system prefix는 이전 1251에서 446으로 감소했다. RAG 세션의 실제 input은 4969→2539, 비용은 $0.00126767→$0.0011186으로 감소했다. 고정 prefix와 cache read/write usage 수집은 유지했으나 짧아진 prefix는 캐시 최소 길이보다 작아서 최종 cache hit은 0%다. 캐시를 채우기 위한 불필요한 prompt padding은 하지 않았다.

RAG truncation의 직접 원인은 220 output 한도였으며, 5개 필수 JSON 필드와 긴 답변 허용 폭이 영향을 주었다. system/schema/RAG는 입력 비용이고, integrator는 로컬 처리이므로 추가 모델 호출이나 출력 토큰 비용을 만들지 않는다. 실제 출력이 짧아졌더라도 단일 표본에 맞춰 한도를 낮추지 않고 RAG 전용 320을 유지했다.

Sol 세션은 목표보다 약 25% 높다. Sol 단일 응답 $0.007960 중 output 248 tokens가 $0.004960, input 750 tokens가 $0.003000이다. 해당 요청의 memory/RAG는 0이므로 초과의 주원인은 Sol 생성 비용이며 Psychology 추가 호출은 $0.0002842다. 600은 상한이고 실제 출력은 248이므로 상한만 줄이면 비용 절감 대신 잘림이 발생할 수 있다. 모델 등급은 낮추지 않았다.

## 검증과 파일

`npm.cmd test`: 388 passed. `flutter test test/safety_parity_test.dart test/crisis_detector_test.dart`: 8 passed. timeout, incomplete usage, stable prefix/schema, shared Safety preflight, 근거 충분/부족 경계를 포함한다. `npm.cmd run cost:v1:real`: 최종 exit 0. 최종 합성 응답을 확인했으며 RAG/Sol의 근거 부족 응답은 제한 안내로 처리됐다. 전문가의 신학·임상 품질 인증을 뜻하지 않는다.

이번 변경 파일:

- `backend/src/crisis.js`, `lib/src/safety/crisis_detector.dart`, `backend_contract/safety_cases.json`
- `backend/src/conversation_service.js`, `backend/src/openai_service.js`
- `backend/src/agents/religions/religion_agent.js`, `backend/src/agents/conversation_orchestrator.js`
- `backend/src/cost/prompt_context.js`, `backend/src/knowledge/retrieval_confidence.js`
- `backend/scripts/cost_router_real.js`, `backend/scripts/cost_safety_preflight.js`
- `backend/scripts/cost_sol_diagnostic.js`, `backend/scripts/cost_sol_chain.js`
- `backend/test/cost_real_fixes.test.js`, `backend/test/ai_cost_router_v1.test.js`, `backend/test/phase2_service.test.js`
- 이 문서 및 `docs/AI_COST_ROUTER_V1_REAL_2026-09-12.md`의 과거 측정 파일 링크

자료:

- [최종 요청별 실제 usage와 세션 합산](../build/cost-v1-real-report.json)
- [Sol 최소/structured 진단](../build/cost-sol-diagnostic.json)
- [Sol 통합 진단](../build/cost-sol-chain-diagnostic.json)
- [6초 timeout 보존 기록](../build/cost-v1-real-six-second-timeout.json)
- [근거 경계 보완 전 기록](../build/cost-v1-real-before-integrity-boundary.json)
- [Backend 테스트 로그](../build/cost-fixes-tests.log)
- [Flutter Safety 로그](../build/cost-fixes-flutter-safety-verified.log)
- [최종 REAL 로그](../build/cost-fixes-real-verified.log)

## 남은 범위

평균 목표는 이 4개 합성 세션에서 통과했다. Sol 개별 세션은 초과했고, 캐시 적중과 실제 운영 세션 평균·장기 지연 분포는 검증되지 않았다. Development 모드에서는 부족한 근거의 specialist 호출 후 제한 안내를 적용하므로 향후 호출 전 evidence gate 재사용을 검토할 수 있다. 기존 production 모드는 이미 근거 부족 시 호출을 생략한다. 이번 작업에서는 corpus·기본 모델·quota를 변경하지 않았다. 규칙 기반 Safety의 미지의 표현 및 문맥 판별 한계는 남아 있다.
