# AI Cost Router v1

## 기존 구조와 재사용

실제 파일은 `backend/src/cost/model_router.js`, `cost_gate.js`, `usage_ledger.js`, `sqlite_usage_ledger.js`에 있다. 루트에 동명 라우터·원장을 새로 만들지 않았다.

기존 흐름은 요청 검증 → Safety → `ai_router`의 사용자 대화 방식 선택 → task classification → 회원/익명 비용 예약 → model routing → Psychology 모델 → Religion Router → 종교별 RAG → 종교 모델 → 인용·종교 무결성 검토 → 규칙 기반 integrator이다. 오류는 기존 Local fallback으로 처리한다. Integrator와 Safety는 원래 모델을 호출하지 않았다. 일반 메시지는 보통 두 번, 종교 비교는 최대 네 번 호출했다. cheap/standard/premium이 모두 `OPENAI_MODEL`로 해석될 수 있었다.

## 변경한 라우팅

기본 활성화이며 `SOUL_COST_ROUTER_V1_ENABLED=false`로 기존 경로를 복구할 수 있다. 기존 단계별 테스트는 이 롤백 경로를 명시적으로 검증하며, `ai_cost_router_v1.test.js`는 기본 활성 경로를 검증한다.

| 처리 | 기본 모델 | 출력 상한 | 호출 정책 |
|---|---|---:|---|
| Local | 없음 | 0 | 위기, 인사, 간단한 상태 전이; 카드 생성은 기존 클라이언트 템플릿 |
| RAG | 없음 | 0 | 구절/문서 검색은 기존 검증된 DB/RAG 결과 반환 |
| Luna | gpt-5.6-luna | 220 | 단순 감정·공감·후속 질문·요약을 하나의 structured call로 생성 |
| Terra | gpt-5.6-terra | 360 | 복합 상담은 통합 1회; 종교 해석은 기존 전문 Agent와 RAG 재사용 |
| Sol | gpt-5.6-sol | 600 | 고난·교리·복잡한 신학 및 논증; 기존 회원/전역 제한을 통과할 때만 |

단순 신앙 요청은 로컬 Psychology 관찰 + RAG + Luna 종교 Agent 1회이다. 복잡한 종교 요청만 Psychology 모델을 추가 호출한다. 문서 출처 검증과 종파 분리·인용 검증은 그대로 유지한다.

분류는 서버 규칙이며 클라이언트가 plan, tier, model을 지정하지 못한다. 라우팅 결과는 taskType, complexity, tier, model, reason, maxOutputTokens를 포함한다. 기존 원장의 cheap/standard/premium은 Luna/Terra/Sol에 매핑하여 기존 쿼터·관리자 통계와 호환된다.

reason은 local_template, simple_emotion, simple_followup, summary, rag_answer, integrated_support, complex_religious_question, complex_reasoning, escalation_quality로 제한한다. 피상적인 답변에 대한 사용자 피드백은 다음 요청을 Terra로 승급시킨다. 동일 메시지에 품질 평가 모델을 추가 호출하지 않는다. schema/provider/무결성 실패 또는 반복 질문은 재호출 대신 기존 fallback이다.

## 비용과 품질 조건

`SOUL_TARGET_SESSION_COST_USD=0.007`은 세션 목표이며 청구 상한이 아니다. 세션 지출과 다음 등급의 계획 비용으로 목표 초과 가능성을 확인한다. 일반적인 짧은 비교는 품질 하한인 Terra로 처리할 수 있지만, 신정론·복잡한 논증은 Sol 하한을 유지한다. 비용 게이트가 필요한 등급을 허용하지 않으면 약한 모델로 대체하지 않고 Local fallback을 사용한다.

Free/Premium의 기존 하루·월 요청량, 예산, 검증된 회원 신원 및 전역 premium 호출 비중 5% 정책을 보존한다. Free는 기본 Luna이고 Terra는 예산 내에서만 가능하다. Free의 Sol은 기본적으로 허용되지 않는다. Premium도 전역 5% 제한 때문에 초기 요청에서는 Sol이 거부될 수 있다.

명시적 `SOUL_AI_REQUEST_RESERVATION_USD`는 기존 hard limit로 존중한다. 비어 있으면 Luna $0.004, Terra $0.028, Sol $0.08을 보수적으로 예약하고 확인된 사용량으로 정산한다. 종교 비교는 전통 수만큼 예약한다. 이는 실제 청구액이나 세션 목표와 다르다. 각 실제 호출 전에는 UTF-8 바이트 길이와 schema/framing 여유, 최대 출력 및 캐시 쓰기 가격으로 비용 상한을 확인한다. 알 수 없는 가격/사용량은 null로 남기고 예약을 유지한다.

## Prompt cache와 Memory

고정 안전·무결성·응답 정책, 역할 지침과 출력 schema를 앞에 유지한다. 출처별 동적 enum은 모델 출력 schema에서 제거하되 기존 서버 출처 검증은 유지한다. GPT-5.6 요청은 developer prefix 끝에 explicit cache breakpoint를 두고 사용자별 입력을 뒤에 보낸다. `store:false`, 자동 SDK 재시도 0회를 유지한다. 작은 출력 예산이 reasoning에 소진되지 않도록 이 경로의 reasoning effort는 none이다.

사용자 데이터에는 최대 800자 Memory Summary, 이전 질문/답변 두 메시지(400/600자), 현재 메시지와 필요한 sourceContext만 포함한다. 기존 API는 최근 질문/답변 한 쌍을 제공하므로 임의의 과거 대화를 복원하거나 새 클라이언트 필드를 요구하지 않는다. 모델별 context에서 중복 memory·session ID·임의 session history를 제거한다. 원래 요청 전체를 보는 Safety는 축약보다 먼저 실행한다.

sourceContext는 최대 3개, 본문 각 1,200자로 제한한다. 모델이 만든 경전 기억을 검색 결과로 사용하지 않는다. 전문 RAG의 corpus/품질/인용 검토는 기존 코드가 담당한다.

## 가격과 사용량

2026-09-12 확인한 100만 토큰당 USD 기본값:

| 모델 | 입력 | 캐시 읽기 | 캐시 쓰기 | 출력 |
|---|---:|---:|---:|---:|
| Luna | 0.20 | 0.02 | 0.25 | 1.20 |
| Terra | 2.00 | 0.20 | 2.50 | 12.00 |
| Sol | 4.00 | 0.40 | 5.00 | 20.00 |

근거: [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching). Sol 가격은 적어도 2026-11-21까지의 프로모션 가격이므로 이후 재검토해야 한다. 캐시는 최소 1,024토큰 조건을 만족해야 하며 적중을 보장하지 않는다. 짧은 프롬프트를 캐시만을 위해 불필요하게 늘리지 않는다.

`SOUL_MODEL_PRICING_JSON`이 비어 있으면 이 기본표를 사용한다. 명시적 `{}` 또는 미등록 모델은 비용 미상으로 남긴다. 기존 배포의 가격표를 쓰면 새로운 모델 및 cacheWrite 가격도 포함해야 한다.

요청 로그는 provider/model/tier/modelCalls/inputTokens/cachedInputTokens/cacheWriteTokens/outputTokens/estimatedCostUsd/latencyMs/fallback/fallbackReason을 기록한다. 사용자 원문과 키는 넣지 않는다. 기존 메모리 원장과 SQLite 원장에 sessionSummary를 추가하여 세션 호출·입력·캐시·출력·비용·미상 호출 수를 합산한다. SQLite에는 캐시 쓰기 토큰 컬럼을 호환 방식으로 추가하고 재시작 이후 합산을 테스트한다.

## DRY / TEST / REAL

```powershell
cd backend
npm.cmd test
npm.cmd run cost:v1:dry
# 별도 REAL 단계: .env는 이 명령에서만 읽고 실제 유료 요청을 보낸다.
npm.cmd run cost:v1:real
```

DRY 결과는 실제 과금이 아니라 생성한 요청의 보수적 토큰 상한과 최대 출력으로 계산한다. 입력 전체가 캐시에 새로 쓰이고 캐시 적중은 없는 경우다. 완전 세션은 사용자 메시지 3회 이후 기존 클라이언트 말씀·실천·카드 흐름으로 정의한다.

- 단순 세션: 모델 3회, $0.0028255.
- 복합 상담 세션: 모델 3회, $0.035705.
- **단순 90% / 복합 상담 10%라는 가정**: 평균 $0.00611345/세션. 1 USD=1,400 KRW라는 계산용 가정에서 약 8.56원이다. 실제 환율이나 실사용 분포 측정값이 아니다.
- DRY의 fallback은 0회이다. 로컬 대체 응답을 정상 모델 완료로 세어 비용을 낮추지 않는다.

실제 REAL 호출은 구현 과정에서 실행하지 않는다. REAL 명령은 두 합성 세션의 유료 요청 6회를 실행하고 원문 없이 usage 합계를 출력한다. 키/플래그/모델 접근, 출력 JSON 완성도, 실제 cache read/write, latency를 확인해야 한다. REAL 스모크 6회만으로 전체 사용자 평균 목표를 입증할 수는 없다.

## 배포 및 남은 위험

이번 작업은 AI 비용 코드·설정 예시·검증만 변경한다. 운영 서버의 `.env`, 결제, UI 및 앱 설치는 변경하지 않는다. 배포 전 기존 단일 모델/예약/가격 설정을 위 정책과 대조해야 한다.

- 한국어 structured output이 토큰 상한에 잘리는지 실제 모델 검증이 필요하다. 낮은 reasoning effort의 복합 상담·신학 품질도 검토해야 한다.
- 종교 비교/Sol 세션은 목표를 초과할 수 있다. 전체 사용자 분포, 재시도·fallback 비율, 세션 완료율과 함께 평균을 측정해야 한다.
- 기존 선택형 외부 embedding 비용은 본문 모델 원장과 별도이다. 이를 활성화한 운영 환경에서는 embedding 청구도 총 AI 비용에 합산해야 한다.
- 프로세스 메모리 원장은 재시작하면 초기화된다. 운영 집계는 기존 SQLite 원장을 사용해야 하며 보존 기간 밖 기록은 합산되지 않는다. 세션 ID는 클라이언트 값이므로 신원/쿼터는 기존 회원 또는 익명 소유자 기준을 유지한다.
- 라이브 배포·모델 접근·현실 사용자 평균은 검증하지 않았으므로 **10원 목표는 시뮬레이션 통과, REAL 미검증**이다.
