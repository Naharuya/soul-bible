# ONARIA Cost Router v1 안정화 2차

기존 네 결함의 수정 정책을 유지하고, 누락됐던 **전체 자동 preflight와 Sol 단계별 실행 순서**를 REAL 명령에 연결했다. 홈페이지, Admin, Flutter UI, 게임, 회원가입, RAMI와 운영 모델 정책은 수정하지 않았다.

## 실행 및 자동 차단

`backend`에서 `npm.cmd run cost:v1:real`을 실행하면 다음 순서로 진행한다.

1. Provider 설정과 모델별 가격표 확인. 실제 키는 출력하지 않는다.
2. 공통 Safety corpus 전체 검증 및 V1 fixed crisis response 비교. client·specialist·모델 호출 0 확인.
3. 전체 backend 테스트: Safety, timeout, schema, incomplete, citation/integrity, prefix 안정성 포함.
4. Flutter Safety/parity 테스트.
5. Sol 최소 요청 → structured output → Psychology Luna+Sol → 실제 세션 benchmark.

Preflight 실패 시 `REAL TEST ABORTED`, `paidCalls: 0`을 출력한다. Backend/Flutter 단계별 실패 주입, 설정 오류, 후속 단계 중단을 자동 테스트했다. 테스트 자식 프로세스에는 실제 provider credential 환경변수를 전달하지 않는다. 테스트 로그의 키·토큰 값도 제거한다. Sol 진단 명령을 단독 실행해도 같은 preflight를 거친다.

Sol 단계가 실패하면 다음 유료 단계로 넘어가지 않는다. 이번 2차에서 timeout 자동 확대나 자동 재시도는 추가하지 않았다. 이전 REAL에서 6초 SDK timeout과 7.692초 정상 완료를 확인한 근거에 따라 기존 Sol 12초 / 다른 요청 6초 / 전체 대화 18초를 유지했다.

## 네 항목 결과

- Safety: 공유 corpus 50건, 기존 누락 표현은 riskLevel 3. client 생성, Psychology, Religion, modelCalls 모두 0이며 기존 고정 crisis 응답과 전체 객체가 일치한다. 일반 불안·슬픔·비유·노래/인용·종교적 죄책감 회귀 사례 유지.
- Timeout: SDK timeout/abort, AbortError, request/overall timeout 및 실제 deadline에 의한 AbortSignal 취소 테스트 통과. 429=`rate_limit`, 401/403=`provider_auth`, 5xx=`provider_5xx`, JSON 파싱=`malformed_json`, Zod schema=`schema_validation`, 미분류 내부 오류=`agent_exception`.
- RAG: 일반 Luna 220, 종교 RAG Luna 320 유지. 실제 출력 198/186/162 tokens 모두 completed. 잘림은 `incomplete_output`, 수신 usage는 그대로 비용 계산에 사용한다.
- Sol: 단계별 provider 성공 및 usage 수신. 아래 표 참고.

## 실제 Sol 단계

모든 행의 provider status는 completed, cached tokens는 0이다. USD는 actual usage에 가격표를 적용한 추정치다.

| 단계 | 모델 | input | output | latencyMs | estimatedCostUsd |
|---|---|---:|---:|---:|---:|
| STEP1 최소 요청 | Sol | 11 | 5 | 2575 | 0.000144 |
| STEP2 structured | Sol | 102 | 94 | 2714 | 0.002288 |
| STEP3 Psychology | Luna | 593 | 146 | 3193 | 0.0002938 |
| STEP3 Religion | Sol | 758 | 230 | 4300 | 0.007632 |
| STEP4 첫 메시지 Psychology | Luna | 593 | 130 | 2588 | 0.0002746 |
| STEP4 첫 메시지 Religion | Sol | 742 | 228 | 4293 | 0.007528 |

STEP4 첫 메시지 전체 지연은 6894ms이며, 다음 두 메시지를 포함한 세션 비용은 $0.0082774다. STEP3은 두 provider 호출 지연 합계 7493ms이며 단계 전체 wall-clock과는 구분한다.

## 최종 세션 비용

각 세션은 비민감 합성 메시지 3개다. 운영 사용자의 완결 세션 비용이나 신학 전문가의 품질 인증을 뜻하지 않는다.

| 세션 | modelCalls | inputTokens | cachedTokens | outputTokens | estimatedCostUsd |
|---|---:|---:|---:|---:|---:|
| Simple | 3 | 1418 | 0 | 227 | 0.0005560 |
| Complex | 3 | 1477 | 0 | 275 | 0.0062540 |
| RAG | 3 | 2539 | 0 | 546 | 0.0011630 |
| Sol | 4 | 2467 | 0 | 565 | 0.0082774 |

- 평균: **$0.0040626/session**, 목표 $0.007 이하 통과.
- 비용 P50 / P90: **$0.0011630 / $0.0082774** (4개 세션, nearest rank).
- 지연 P50 / P90: **2153ms / 3166ms** (본 시나리오 요청 12개).
- 본 시나리오 fallback: **0/12**. 단순 대화는 메시지당 1회.
- 기존 cold-start Sol quota 대조군은 `quality_floor`로 0회 호출 후 local 처리. 이 대조군 및 warmup을 포함한 benchmark 전체 fallback은 **1/24=4.17%**.
- 본 benchmark 모델 호출은 23회: 본 시나리오 13회와 기존 Sol quota를 충족하기 위한 실제 warmup 10회. benchmark 비용 $0.0179300.
- 단계별 진단까지 포함한 이번 전체 유료 호출은 **27회**, 실제 usage **27회 수신**, 추정 **$0.0282878**. 미수신 usage는 없었다. 이전 timeout의 unknown 비용을 이번 성공 usage로 대체하지 않았다.

## Cache와 품질

고정 prefix는 Common policy → Safety policy → Religion role → Citation/integrity → Output schema 순서를 유지한다. session ID는 모델 입력에서 제거하고 Memory/RAG/user는 고정 정책 뒤에 둔다. 반복 system/schema가 요청마다 같다는 테스트를 유지했다.

이전 cache hit은 2646/9480=27.91%, 이번에는 **0/7901=0%**다. 캐시 적중률 개선은 없었다. 앞선 수정으로 RAG 고정 prefix가 1251→446 tokens로 짧아졌고, 실제 RAG input도 4969→2539로 감소했다. 기존 $0.00126767 대비 이번 RAG 비용은 $0.0011630이다. 캐시 적중을 만들기 위한 불필요한 padding은 하지 않았다. system 구간 수치는 로컬 tokenizer 추정이며 provider의 실제 input attribution과 구분한다.

RAG 세 건 및 Sol 질문은 confidence 0~0.2로 제한 안내를 반환했다. citation 결과는 RAG `passed/passed/no_sources`, Sol `no_sources`였고 거짓 인용은 없었다. 충분한 합성 근거에서는 정상 RAG 응답을 보존하는 자동 테스트가 통과했다. 종교 corpus는 확장하지 않았다.

Sol 개별 세션은 $0.007을 넘는다. 해당 Sol 요청 비용 $0.007528 중 input은 $0.002968, output은 $0.004560으로 출력 비용이 더 크다. Memory/RAG는 이 호출에서 0이다. 600은 상한이며 실제 출력은 228이므로 상한을 줄여도 비용 절감 없이 잘릴 수 있다. 모델 등급은 변경하지 않았다.

## 테스트와 변경 파일

Backend: **394 passed**. Flutter Safety/parity: **8 passed**. REAL CLI: **exit 0**. 실제 deadline 취소와 schema 오류 분류 테스트를 추가했으며, 기존 false-positive 및 religious integrity 검사를 유지했다.

이번 변경은 다음 검증 코드에 한정했다.

- `backend/scripts/cost_real_preflight.js`: 전체 자동 gate, 설정 검증, 자식 프로세스 credential 제거.
- `backend/scripts/cost_router_v1.js`: gate 후 Sol STEP1~4 순차 실행, 실패 시 중단.
- `backend/scripts/cost_sol_diagnostic.js`, `backend/scripts/cost_sol_chain.js`: 재사용 가능한 단계 함수, 단독 실행 gate, provider status/usage 기록.
- `backend/scripts/cost_safety_preflight.js`: fixed crisis response 전체 비교 추가.
- `backend/test/cost_preflight.test.js`, `backend/test/cost_real_fixes.test.js`: 실패 차단·순서·schema·deadline 회귀 테스트.
- 이 문서.

검증 자료는 이전 실행과 분리해 보존했다.

- [요청별 usage/토큰 구간/세션 합산](../build/cost-round2/cost-v1-real-report.json)
- [Sol STEP1/2](../build/cost-round2/cost-sol-diagnostic.json)
- [Sol STEP3](../build/cost-round2/cost-sol-chain-diagnostic.json)
- [자동 backend gate 로그](../build/cost-round2/cost-v1-preflight-backend_tests.log)
- [자동 Flutter parity 로그](../build/cost-round2/cost-v1-preflight-flutter_safety_parity.log)
- [전체 실행 순서와 결과](../build/cost-round2/cost-v1-round2-real.log)

남은 위험은 Sol 개별 비용 초과, cache hit 0, 합성 4개 세션의 작은 표본, 규칙 기반 Safety의 미지 표현/인용 문맥 한계다. 다음 단계는 운영 세션 분포와 승인된 실제 근거를 사용한 품질 평가다. 이번에는 운영 배포나 corpus 확장을 진행하지 않았다.
