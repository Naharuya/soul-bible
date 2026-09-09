# onaria 4단계 RAG 구현 보고

## 범위와 호환성

3단계의 7개 Religion Agent, 역할 명세, `generateResult()` 및 기존 출력 어댑터를 재사용했다.
공개 `/v1/mind/chat` 요청·응답 스키마와 종교 ID는 변경하지 않았다.
`createLocalConversationService()`, local fallback, 인증, 기존 deadline과 feature gate를 유지했다.
`SOUL_MULTI_AGENT_ENABLED=false`에서는 KB 검색도 모델 생성도 실행하지 않는다.
실제 `.env` 및 `.env.example`은 이번 작업에서 수정하지 않았다. API key나 비밀정보를 추가하지 않았다.
기존 작업 트리의 다른 변경은 유지했다.

## 생성 파일

- `src/knowledge/contracts.js`: 검색 요청·결과·자료 스키마와 authorityLevel.
- `src/knowledge/provider.js`: ReligionKnowledgeProvider, 교체 가능한 JSON 저장소.
- `src/knowledge/retriever.js`: 교체 가능한 keyword ranking.
- `src/knowledge/source_context_builder.js`: 조회 결과 검증 및 서버 sourceContext 변환.
- `src/knowledge/christianity/samples.json`
- `src/knowledge/catholic/samples.json`
- `src/knowledge/buddhism/samples.json`
- `src/knowledge/judaism/samples.json`
- `src/knowledge/islam/samples.json`
- `src/knowledge/hinduism/samples.json`
- `src/knowledge/confucianism/samples.json`
- `src/agents/citation_validator.js`: 인용 검증과 일반 표현으로의 수정.
- `src/agents/prompts/retrieval_prompt.js`: 검색 근거와 환각 방지 지침.
- `test/knowledge_rag.test.js`: 21개 RAG 테스트.
- `PHASE_4_RAG.md`: 이 보고서.

## 수정 파일

- `src/agents/agent_contracts.js`: 기존 sourceContext에 선택적 출처 metadata 필드 추가. 기존 4필드 자료도 유효하다.
- `src/agents/conversation_orchestrator.js`: Psychology 이후 라우팅과 검색, Citation → Integrity → Integration 연결.
- `src/agents/religions/religion_agent.js`: 기존 공통/종교별 프롬프트에 retrieval 지침 추가.
- `src/conversation_service.js`: provider 주입, retrieval 실패 fallback 사유, 요청별 observability 연결.

## Knowledge Base와 namespace

| Agent | 기존 tradition ID | 독립 namespace | 현재 샘플 주제 |
| --- | --- | --- | --- |
| Christianity | protestant | christianity | 기도, 묵상, 위로 |
| Catholic | catholic | catholic | 성사, 묵주, 교리 |
| Buddhism | buddhist | buddhism | 연기, 자비, 중도 |
| Judaism | jewish | judaism | 토라, 공동체, 성찰 |
| Islam | islamic | islam | 꾸란, 기도, 자비 |
| Hinduism | hindu | hinduism | 다르마, 요가, 명상 |
| Confucianism | confucian | confucianism | 효, 자기수양, 관계 |

각 namespace에 직접 작성한 짧은 샘플 3개, 총 21개가 있다.
모두 `sourceType: authored_sample`, `authorityLevel: secondary`, `metadata.sample: true`이다.
경전 번역문이나 공식 교리를 복제하지 않았으며 샘플에도 경전/공식 교리 설명이 아니라는 문장을 넣었다.
`license`는 프로젝트 자체 작성 자료임을 기록한다. 제3자 경전·문헌 전문은 포함하지 않았다.
이 샘플들은 검색/격리 검증용이며 실제 종교 지식의 신뢰도를 보증하는 자료가 아니다.

자료 계약은 `sourceId, tradition, sourceType, title, reference, text, language, authorityLevel, metadata`다.
`sourceType`은 향후 Bible, reference metadata, Protestant theology, pastoral material,
Scripture, Catechism, Vatican documents, sacramental references, Torah/Tanakh/rabbinic commentary,
Quran/Hadith/commentary, Analects/Mencius/classical/scholarly 자료로 확장할 수 있다.
`metadata.traditionBranch`, `sect`, `school`은 문자열로 전통 차이를 보존한다.
예를 들어 불교의 Theravada/Mahayana/Zen/Tibetan, 힌두교의 Vedanta/Vaishnavism/Shaivism/Shaktism/Yoga를 표현할 수 있다.
현재 샘플은 general이며 이슬람의 sect/school은 unspecified다. 아직 교파별 자동 필터는 없다.

## 검색 인터페이스와 흐름

```js
const provider = createReligionKnowledgeProvider({ store, retriever });
await provider.search({ tradition: 'buddhist', query: '불교 연기', language: 'ko-KR', limit: 3 }, { signal });
// => { tradition, query, results: KnowledgeRecord[] }
```

기본 provider는 JSON을 사용한다. `store.load(namespace, { signal })`는 SQLite 등으로,
`retriever.rank({ records, tradition, query, language, limit }, { signal })`는 embedding/re-ranking으로 교체 가능하다.
대규모 서버 검색에서는 `knowledgeProvider.search()` 자체를 대체할 수도 있다.
Agent는 파일을 읽거나 collection을 선택하지 않는다.

실행 순서:

```text
Safety → Psychology → Religion Router → 해당 namespace 검색
       → SourceContextBuilder → Religion Agent
       → Citation Validator → Religious Integrity Validator → Integration
```

Safety 위기 요청은 모델/KB 호출 전에 반환한다. 복수 종교 요청은 Psychology 후 관점을 묻고 검색을 생략한다.
선택 종교 우선 원칙과 불명확 요청의 기존 protestant 기본값은 유지한다.
한국어·영문 정규화 및 토큰/키워드 겹침으로 관련성을 확인한다. 관련성이 0이면 제외한다.
관련 결과 중 primary → official → scholarly → secondary 순위, 같은 권위에서는 겹침 점수와 ID 순으로 정렬한다.
기본 limit는 3, 최대 5다. 언어는 정확히 일치해야 한다. 다른 언어/종교 collection으로 자동 확장하지 않는다.

Provider는 단일 namespace의 자료 전체를 검증하고 다른 전통, 중복 ID, retriever가 변조/추가한 자료를 거부한다.
Builder는 주입된 provider의 응답도 다시 검사하여 tradition/query/language/limit/중복 ID를 검증한다.
검색 오류나 잘못된 결과는 `knowledge_retrieval` 사유로 기존 local fallback을 사용한다.
검색은 기존 전체 deadline과 AbortSignal을 따른다. 늦게 끝난 검색은 후속 Agent와 로그를 갱신하지 못한다.

## sourceContext 연결

Builder가 sourceId → id, tradition → religion으로 매핑하고 sourceType/title/reference/text/language/
authorityLevel/metadata를 유지한다. 기존 sourceContextSchema와 Agent의 자기 전통 필터를 재사용한다.
공개 요청의 sourceContext나 allowedVerseIds를 근거로 받아들이지 않는다.
모델의 sourceRefs 허용값은 실제 검색된 ID로 한정되며, 빈 결과는 빈 배열만 허용한다.
내부 결과의 sourceHints는 같은 ID 배열이고 외부 응답에 sourceContext 전체나 metadata를 붙이지 않는다.

## Citation Validator와 Integrity의 관계

Citation Validator는 존재하지 않는 ID, 중복 ID, 다른 종교 자료, 근거 없는 인용,
숫자 장·절 참조와 강한 종교 주장에 대한 출처 연결을 검사한다.
초기 구현은 보수적인 정규식/정규화 문구 대조다. 강한 주장에는 실제 비샘플 자료의 정확한 문구 일치를 요구한다.
샘플은 교리/경전의 증거로 승격할 수 없다.

근거 없는 강한 주장이나 잘못된 참조는 종교적 주장 묶음을 안전한 일반 표현으로 교체한다.
이때 sourceRefs/sourceHints를 비우고 내부 confidence를 0으로 낮춘다.
검증 불가능한 가짜 ID나 교차 전통 증거는 신뢰 가능한 수정을 할 수 없으므로 즉시 기존 local fallback 경로로 넘긴다.
오류 코드는 기존 `RELIGIOUS_INTEGRITY`를 유지하고 `validationStage: citation`으로 구별한다.

이후 기존 Integrity가 종교 혼합, 직접 계시, 죄/업보 비난, 의료 지원 대체, 강요와 실제 인용문 일치를 검사한다.
수정된 경우 원본도 Integrity 검사하여 안전 위반이 인용 수정으로 지워져 우회되지 않게 한다.
원본 또는 수정본이 실패하면 local fallback이다. 추가 모델 호출은 없다.

## Observability

기존 `conversation_result` 서버 로그에 다음 요청별 필드를 추가했다:

- `routedTradition`: 선택/감지된 내부 전통 ID, 미실행/복수는 null.
- `knowledgeSearchCount`: 실제 검색 시도 횟수(현재 0 또는 1).
- `selectedSourceIds`: 검증 완료한 검색 결과 ID.
- `citationValidationResult`: not_run / no_sources / passed / repaired / rejected.
- `fallbackReason`: 기존 필드에 knowledge_retrieval 사유 추가.

질문, 응답, 자료 원문, 원본 예외 메시지는 새 로그에 남기지 않는다.
자료 ID는 길이 제한과 안전한 문자 형식 검증을 거친다. 동시 요청은 상태를 공유하지 않는다.
이 필드는 API 응답이 아니라 기존 서버 logger에서 확인한다. sourceId 자체도 운영 시 공개 식별자로 관리해야 한다.

## 테스트 결과

변경 전 `npm.cmd test`: 기존 124/124 통과.
변경 후 `npm.cmd test`: **145/145 통과**, 실패/skip 0. 기존 테스트는 수정하지 않았다.

추가 21개 테스트:
- 7개 전통별 단일 namespace 조회와 sourceContext metadata 전달.
- 검색 결과 없음/지원되지 않는 언어.
- 저장소/검색기/Builder의 다른 종교·중복·변조 차단.
- 권위 우선순위, 관련성, limit, 취소.
- 가짜 ID, 교차 전통 인용, 출처 없는 인용.
- 존재하지 않는 장·절 및 강한 주장 수정 후 Integrity 연결.
- 정확한 근거 허용과 샘플의 교리 승격 금지.
- 복수·불명확 종교와 자해 우선 처리.
- 정신건강 → 검색 → 종교 지원 순서.
- 검색 실패 fallback, 민감 대화 없는 로그, flag=false 회귀.
- 실제 로컬 HTTP `/v1/mind/chat` 계약 및 내부 자료 비노출.
- 인용 수정으로 안전 위반을 숨기지 못함.
- 수정본 통합과 가짜 인용 fallback 상태.
- 전체 deadline과 늦은 검색 응답 격리.
- 동시 요청의 출처/로그 격리.

기존 HTTP·인증·클라이언트 fixture·local fallback 테스트도 포함된다.
실제 외부 LLM 호출, Android 빌드/기기 테스트, 전문가의 종교/임상 검토는 수행하지 않았다.

## 미구현 및 5단계 권장 작업

현재는 RAG 파이프라인과 격리 검증용 샘플이다. 실제 경전 corpus, 공식 자료 수집, SQLite/Vector DB,
embedding, 의미 검색, reranking, 교파 필터 UI는 아직 없다.
Citation 검증은 의미적 함의/모순을 증명하지 못하며 표현 변화에 따른 누락·과잉 차단 가능성이 있다.
일반 confidence는 3단계의 고정값을 유지하며 근거 신뢰도로 보정되지 않았다.

5단계 권장 순서:
1. 사용권과 출처를 확인한 소규모 실제 자료를 도입하고 번역·문서 버전·교파·출처 URL 메타데이터 확장.
2. 신뢰된 수집/검토 파이프라인, chunk 단위 provenance와 자료 변경 이력 구축.
3. 동일 provider/builder 경계에 embedding → vector retrieval → reranking을 연결하고 언어·전통 격리를 유지.
4. 종교별 전문가 검토 데이터로 인용 함의/모순/우회 표현과 검색 품질을 평가하고 confidence 보정.
5. 권한·삭제·보존·로그 최소화, 검색 성능/캐싱 및 실제 모델 통합 평가.
6. 종교·교파 선택 UI와 명시적 무종교/불명확 컨텍스트 정책을 별도로 결정.
