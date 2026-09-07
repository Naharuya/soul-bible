# 3단계: 종교별 전문 Agent 고도화

## 변경 파일

신규:
- `src/agents/religions/religion_profiles.js`: 7개 전통의 공통 정책 명세.
- `src/agents/specialist_result.js`: 공통 내부 결과 스키마와 기존 결과 어댑터.
- `test/religion_specialization.test.js`: 16개 추가 테스트.
- `PHASE_3_SPECIALIZATION.md`: 구현과 검증 기록.

수정:
- `src/agents/religions/religion_agent.js`: 정책을 Agent와 프롬프트에 적용, `generateResult()` 추가.
- `src/agents/religion_router.js`: 질문 기반 `resolveReligion()` 추가.
- `src/agents/conversation_orchestrator.js`: Safety 이후 라우팅, 공통 결과 검증, 복수 전통 확인 응답.
- `src/agents/religious_integrity_agent.js`: 공통 결과의 identity/tradition 및 모든 본문 필드 검증.
- `src/agents/prompts/religious_integrity_prompt.js`: 직접 계시, 신의 뜻 단정, 절대적 치유, 치료 중단 검사 추가.
- `src/agents/response_integrator.js`: 공통 결과를 기존 외부 응답으로 변환.
- `src/conversation_service.js`: 활성 모드의 실패 시 질문에서 감지한 전통도 fallback에 반영.

기존 작업 트리에는 다수의 수정·미추적 파일이 있었다. 관련 없는 변경은 되돌리거나 수정하지 않았다.

## Agent 구조

모든 기존 종교 Agent는 `createReligionAgent()`를 통해 다음 필드를 제공한다:
`identity`, `supportedTradition`, `doctrineBoundaries`, `allowedSources`,
`forbiddenClaims`, `pastoralStyle`, `responseRules`, `safetyRules`.
정책 객체와 배열은 동결되며 기존 전통별 프롬프트에 함께 주입된다.

| identity | 기존 내부/API ID | 전문 범위 |
| --- | --- | --- |
| Christianity Agent | protestant | 개신교 성경 중심 신앙 질문, 기도문, 묵상, 위로 |
| Catholic Agent | catholic | 성경·교회 전통·교리·성사를 구분하고 기도·묵상 지원 |
| Buddhism Agent | buddhist | 고통·집착·자비·마음챙김·연기·중도, 종파 차이 인정 |
| Judaism Agent | jewish | 토라·타나크·유대교 전통, 기독교 해석 혼합 금지 |
| Islam Agent | islamic | 꾸란·이슬람 전통, 논쟁적 법학·신학 해석의 다양성 |
| Hinduism Agent | hindu | 업·다르마·요가·명상, 다양한 전통 인정 |
| Confucianism Agent | confucian | 관계·효·인·예·자기수양·공동체, 철학·윤리 해석 인정 |

모두 직접 계시 대변, 고통의 죄·업보·믿음 부족 귀인, 의료 지원 대체를 금지한다.
allowedSources는 허용 자료의 종류를 나타내는 정책이며 실제 검색 결과나 인용 증거가 아니다.

## Router와 실행 순서

기존 `routeReligion(id)`와 기본값을 보존했다. 활성 멀티에이전트 경로에서만
`resolveReligion({ religion, userMessage })`를 사용한다.

1. Safety가 위험 요청을 먼저 반환한다. 이 경우 라우팅과 모델 호출이 없다.
2. 선택된 religion이 있으면 우선한다. 없으면 질문의 한글·영문 전통 키워드를 검사한다.
3. 가톨릭 질문의 성경·예수 언급만으로 개신교를 중복 감지하지 않는다.
4. 복수 전통이면 Psychology 결과와 일반적 돌봄을 반환하며 원하는 전통을 묻는다. 종교 모델과 성경 제안은 생략한다.
5. 단서가 없는 요청은 기존 클라이언트 호환성을 위해 `legacy_default: protestant`를 유지한다. 사용자 신앙을 추론한 결과가 아니다.
6. Psychology → Religion → Integrity → Integration 순서로 수행한다. 심리 관찰과 avoid를 종교 Agent에 전달하며 통합 시 심리적 지지를 먼저 표시한다.

## 내부 출력 계약과 호환성

전문 Agent의 `generateResult()`는 다음 8개 필드만 반환한다:

```js
{
  agent: 'Christianity Agent',
  tradition: 'protestant',
  confidence: 0.5,
  emotionalSupport: '심리 Agent의 정서 관찰',
  religiousInsight: '종교적 관점',
  suggestedPractice: { guidance: '선택 가능한 실천', reflectionQuestion: '성찰 질문' },
  caution: [],
  sourceHints: []
}
```

confidence는 현재 보수적인 고정값이며 교리적 진실의 확률이나 보정된 모델 신뢰도가 아니다.
sourceHints는 서버 제공 자료 ID 배열이다. 기존 `generate()`와 모델의 기존 구조화 출력 계약은
어댑터 뒤에 보존했다. Psychology의 기존 관찰 계약도 유지한다.
`/v1/mind/chat` 요청·응답 필드 및 religion ID는 변경하지 않았다.
`createLocalConversationService()`와 feature gate, timeout, 오류 fallback은 유지한다.
`SOUL_MULTI_AGENT_ENABLED=false`에서는 새 질문 라우팅을 실행하지 않는다.
실제 `.env`, API key, 대규모 경전 원문은 추가하거나 수정하지 않았다.

## Religious Integrity Validator

기존 검증기를 확장했다. 검증 대상은 관점·실천·질문·주의·정서 지원, Agent identity와 tradition,
sourceHints 및 서버 자료의 종교·ID·인용문 일치 여부이다.
기존 종교 혼합·강요·비난·진단·종파 일반화 검사에 직접 계시, 상황을 신의 뜻으로 단정,
무조건적 치유, 약·치료 중단 및 종교 실천만으로 대체하는 표현을 추가했다.
실패하면 `RELIGIOUS_INTEGRITY`를 발생시키고 서비스가 기존 local fallback을 반환한다.
활성 모드에서 질문으로 감지한 비기독교/복수 전통은 실패 시에도 성경 제안을 억제한다.
부정 표현을 고려하지만 정규식 기반이므로 모든 우회 표현이나 교리적 오류를 판정하지 못한다.
출처가 존재한다는 사실만으로 주장의 신학적 타당성까지 증명하지는 않는다.

## 검증 및 4단계

변경 전 `npm.cmd test`: 108/108 통과.
변경 후: 124/124 통과(기존 테스트 수정 없이 16개 추가).
추가 검증은 7개 질문 라우팅·공통 계약, 불명확/복수 종교, 선택 우선,
자해 우선 처리, 정신건강과 종교, 새 금지 표현, flag=false 회귀, 추론된 전통의 오류 fallback을 포함한다.
기존 HTTP 계약·인증·timeout·fallback 테스트도 통과했다.
실제 모델/API 호출, Android 빌드 및 임상·종교 전문가 검토는 수행하지 않았다.

4단계 연결 경계는 기존 서버 전용 `sourceContextSchema`의
`{ id, religion, reference, text }[]`와 `sourceHints`다. 현재 Orchestrator는 빈 배열을 공급하며
공개 요청의 자료를 신뢰하지 않는다. Agent는 자기 전통의 자료만 필터링한다.

4단계에서 구현할 작업:
- 출처 사용권과 전통·종파 메타데이터를 갖춘 Knowledge Base, 검색·재순위화 및 서버 전용 retrieval 주입.
- 자료 버전·번역·참조 위치·인용 정확성 검증과 검색 실패/교차 전통 격리 테스트.
- 검증된 근거에 따른 confidence 산정과 실제 모델 평가.
- 종교·임상 전문가가 검토한 의미 기반 무결성 평가 및 다국어 우회 표현 평가.
- 종교 선택 UI, 명시적 무종교 컨텍스트, 불명확 요청의 기본값 전환에 대한 API 정책 결정.
