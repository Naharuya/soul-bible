# onaria 5단계: Vector RAG, 품질 관리, 평가

## 구현 결과와 유지한 계약

4단계의 ReligionKnowledgeProvider, sourceContext, 7개 Religion Agent와 내부 결과 어댑터를 유지했다.
기존 145개 테스트를 수정하지 않고 신규 25개를 추가하여 **170/170 통과**했다.
`/v1/mind/chat` 요청·응답, 기존 religion ID, `createLocalConversationService()`와 local fallback을 유지한다.
`SOUL_MULTI_AGENT_ENABLED=false`는 KB/임베딩/모델을 호출하지 않는다.
실제 `.env`와 `.env.example`, 비밀정보, 원문 corpus는 이번 단계에서 수정·추가하지 않았다.
작업 시작 시 존재한 다른 파일 변경은 보존했다.

## 생성 파일

- `src/knowledge/embedding_provider.js`
- `src/knowledge/openai_embedding_adapter.js`
- `src/knowledge/namespaces.js`
- `src/knowledge/vector_store.js`
- `src/knowledge/hybrid_retriever.js`
- `src/knowledge/reranker.js`
- `src/knowledge/source_quality.js`
- `src/knowledge/retrieval_confidence.js`
- `src/knowledge/ingestion/normalization.js`
- `src/knowledge/ingestion/validation.js`
- `src/knowledge/ingestion/chunking.js`
- `src/knowledge/ingestion/enrichment.js`
- `src/knowledge/ingestion/pipeline.js`
- `src/agents/citation_grounding.js`
- `src/evaluation/metrics.js`
- `src/evaluation/response_review.js`
- `src/evaluation/run_evaluation.js`
- `evaluation/questions.json`
- `evaluation/results/retrieval-report.json`
- `evaluation/results/expert-review.json`
- `test/vector_rag.test.js`
- `PHASE_5_VECTOR_RAG.md`

## 수정 파일

- `package.json`: `eval:retrieval` 명령 추가. 의존성 추가 없음.
- `src/conversation_service.js`: adapter 선택 및 observability 연결.
- `src/knowledge/contracts.js`: 검색 점수·교파·사용권 필드.
- `src/knowledge/provider.js`: hybrid 기본 연결, 기존 rank() 호환, 근거/사용권 검증.
- `src/knowledge/source_context_builder.js`: 출처 품질·diagnostics 검증.
- `src/agents/agent_contracts.js`: 선택적 provenance 필드 전달.
- `src/agents/religion_router.js`: 명시적 비교 의도 감지.
- `src/agents/conversation_orchestrator.js`: 전통별 실행, confidence, 비교 통합.
- `src/agents/citation_validator.js`: 별도 grounding evaluator와 완전한 참조 일치.
- `src/agents/specialist_result.js`: 고정 confidence 제거.
- `src/agents/religions/religion_agent.js`: retrieval confidence 전달.
- `src/agents/prompts/retrieval_prompt.js`: 낮은 confidence의 표현 제한.

## EmbeddingProvider와 비용 보호

인터페이스는 `embed(text, { signal })`, `embedBatch(texts, { signal })`이며 `id`로 모델 버전을 구분한다.
기본은 `local-concepts-v1`: 해시 토큰과 작은 한·영 개념 사전을 사용하는 256차원 deterministic provider다.
위로/comfort 같은 제한된 의미 연결을 검증할 수 있으나 학습된 범용 의미 모델은 아니다.
외부 네트워크를 사용하지 않는다.

OpenAI adapter는 설치된 SDK의 `embeddings.create` 타입 정의를 확인하여 별도 파일로 구현했다.
다음 설정이 **모두** 있어야 호출 가능하며 클라이언트 생성도 지연된다:

```text
SOUL_EMBEDDING_PROVIDER=openai
SOUL_EMBEDDING_ENABLED=true
OPENAI_EMBEDDING_MODEL=<운영자가 선택한 모델 ID>
OPENAI_API_KEY=<런타임 비밀정보>
```

위 값은 설명용이며 실제 env 파일에 쓰지 않았다. chat API key만 있어서는 외부 embedding이 활성화되지 않는다.
일반 대화의 멀티에이전트 feature gate도 먼저 통과해야 한다.
기본 테스트는 local provider 또는 주입된 fake client만 사용한다. 실제 외부 API 호출은 **0회**다.

보호 장치:
- 입력당 4,000자, batch 최대 32개, 외부 SDK retry 0.
- 검색/ingestion 기본 deadline 1,500ms와 상위 대화 AbortSignal.
- 샘플용 온라인 인덱싱은 로컬 최대 256개, 외부 최대 64개 자료. 초과 시 keyword fallback.
- vector 후보 최대 20개, 최종 검색 결과 최대 5개(대화 경로는 전통당 3개).
- 비교는 명시적 요청에 한해 최대 3개 전통, Psychology 1회 + Religion 최대 3회.
- embedding 오류/시간 초과/VectorStore 실패 시 기존 keyword retriever 사용.
- 상위 대화 deadline은 기존 18초 상한을 유지한다.

## VectorStore와 Hybrid Retrieval

VectorStore 인터페이스:

```js
await store.upsert([{ namespace, id, record, vector, embeddingId }], { signal });
await store.search(vector, { namespace, embeddingId, limit, signal });
await store.delete(namespace, ids);
await store.clear(namespace);
```

초기 구현은 in-memory cosine 검색이다. namespace는 다음 7개만 허용한다:
`christianity`, `catholic`, `buddhism`, `judaism`, `islam`, `hinduism`, `confucianism`.
전통, sourceId, embedding 버전/차원, 유한한 비영 벡터를 검사한다.
전체 upsert를 검증한 뒤 변경하므로 잘못된 batch를 부분 저장하지 않는다.
delete/clear는 지정한 namespace만 변경한다.

검색 순서는 다음과 같다:

```text
query → 기존 keyword 후보 → vector 후보 → ID별 합치기 → ReRanker
      → provider provenance 검증 → SourceContextBuilder
```

vector 후보는 cosine 0.35 이상이어야 한다. 정확한 문서 reference도 후보에 포함한다.
임베딩 사용 불가, 후보 부족, 저장소 실패는 기존 keyword 결과로 돌아간다.
검색기가 다른 종교 자료나 변조된 원문을 반환하면 사용하지 않는다.
기존 keywordRetriever 자체는 수정하지 않았다. 기존 사용자 정의 `rank()` retriever도 계속 지원한다.

샘플 기본 경로는 요청마다 독립 메모리 인덱스를 만들어 동시 요청/오래된 자료를 격리한다.
실제 corpus는 `indexedVectorStore`를 주입하여 ingestion에서 만든 벡터를 재사용할 수 있다.
이 경로는 query만 embed하고 corpus를 다시 embed하거나 검색 중 인덱스를 수정하지 않는다.

## ReRanker

`rerank({ candidates, query, tradition, language, traditionBranch, limit })`를 별도 인터페이스로 둔다.
다른 tradition/language는 먼저 제외한다. 초기 deterministic 점수는 다음과 같다:

```text
0.40 × semantic similarity
+ 0.25 × keyword overlap
+ 0.10 × authority weight
+ 0.15 × exact reference match
+ 0.05 × branch match (일치 +1, 불일치 -1, 미지정 0)
+ 0.05 × qualityScore
− 0.25 × duplicate text penalty
```

결과는 0~1로 제한한다. authority weight는 primary 1, official 0.8, scholarly 0.6, secondary 0.3이다.
향후 AI reranker를 같은 경계에 주입할 수 있다. 점수는 검증된 확률이 아니다.

## Corpus ingestion과 사용권

흐름은 normalization → validation → semantic chunking → metadata enrichment → embedding → VectorStore다.
각 앞단 단계는 독립 모듈로 분리했다. Agent는 파일을 읽지 않는다.

실제 자료 및 ingestion 입력은 기존 sourceId/title/reference/tradition/sourceType/language/authorityLevel 외에 다음을 요구한다:

- metadata.traditionBranch
- metadata.qualityScore: 0~1
- metadata.licenseStatus: public_domain / official_permission / licensed / self_authored / unknown
- metadata.licenseNote
- metadata.sourceUrl 또는 metadata.provenance
- metadata.importedAt: UTC ISO 날짜(ingestion 시 없으면 생성)

unknown은 ingestion과 검색 경계에서 거부한다. 필수 provenance가 없는 실제 자료도 거부한다.
기존 4단계 샘플은 development용 호환 자료로 유지하며 공식/원전 근거로 승격하지 않는다.
라이선스 필드 검사는 법적 사용권을 자동 증명하지 않는다. 실제 수집 시 운영자의 근거 확인이 필요하다.

chunking은 verse일 때 줄, 그 외 passage/paragraph/section/commentary일 때 빈 줄로 표시된 의미 단위를 유지한다.
기본 3,500자를 넘는 단위는 임의 절단하지 않고 더 작은 명시적 단위 입력을 요구한다.
원래 reference와 originalSourceId, unit/index/start/end 위치를 유지한다.
위치는 줄바꿈을 LF로 정규화한 원문에서의 JavaScript 문자열 offset이다.
모든 embedding이 성공한 뒤 한 번 upsert한다. 현재 chunk ID는 원본 ID·위치·본문의 hash로 생성한다.

연결 예시(외부 호출 없음):

```js
const embeddings = createLocalEmbeddingProvider();
const vectors = createMemoryVectorStore();
const ingestion = createCorpusIngestion({ embeddingProvider: embeddings, vectorStore: vectors });
const imported = await ingestion.ingest(licensedRecord, { unit: 'paragraph' });
const provider = createReligionKnowledgeProvider({
  store: { load: async namespace => namespace === imported.namespace ? imported.records : [] },
  retriever: createHybridRetriever({ embeddingProvider: embeddings, indexedVectorStore: vectors }),
});
// createConversationService({ knowledgeProvider: provider, ...existingOptions })
```

원문 corpus는 추가하지 않았다. 7개 전통 모두 기존 자체 작성 sample dataset을 유지한다.

## Citation Grounding과 confidence

Citation Validator의 evaluator를 `citation_grounding.js`로 분리했다.
`evaluate({ claim, sources }) → { supported, exceedsEvidence }`로 교체할 수 있다.
초기 evaluator는 비샘플 자료의 정규화 문구 일치를 요구하며 완전한 의미 추론은 하지 않는다.
reference는 완전한 토큰 단위로 대조한다. 예를 들어 `1:1`은 `1:10`의 근거가 될 수 없다.
가짜 sourceId, 교차 전통, 없는 참조, 근거보다 강한 주장에 대한 4단계 차단/수정 정책을 유지한다.
인용 수정으로 원본의 안전 위반을 숨기지 못하도록 원본 Integrity 검사도 유지한다.

retrieval confidence는 다음 근거를 반영한다:

```text
0.45 × top rerank score
+ 0.15 × min(비샘플 source count / 3, 1)
+ 0.20 × 최고 source authority
+ 0.20 × citation passed (실제 cited ID가 있을 때만)
```

authority는 primary 1, official 0.85, scholarly 0.65, secondary 0.3이다.
전통 불일치/무출처/인용 거부·수정은 0, 샘플만 있으면 최대 0.2다.
종교 단서 없는 기존 기본값은 ambiguity 계수 0.7을 적용한다.
Agent에 사전 confidence를 전달하고, Citation/Integrity 후 최종 confidence를 다시 계산한다.
0.4 미만이면 확신 있는 종교적 설명을 완화한다. 기존의 선택 가능한 일반 돌봄 문장은 유지한다.
이 수치는 교리적 진실이나 임상 안전의 확률이 아니다.

## 비교 요청과 실행 순서

```text
Safety → Psychology → Router → 전통별 KB → 전통별 Religion
       → 전통별 Citation → 전통별 Integrity → Integration
```

“기독교와 불교에서는 불안을 어떻게 보나요?”는 두 namespace를 각각 검색하고 각 Agent에 자기 자료만 전달한다.
검증된 관점만 전통 라벨을 붙여 통합한다. 출처와 점수는 전통별 객체로 분리하며 한 KB로 합치지 않는다.
단순 복수 종교 언급은 기존의 관점 확인 응답을 유지한다. 선택된 종교가 있으면 선택을 우선한다.
4개 이상 전통의 비교는 현재 비용/응답 길이 상한 때문에 관점을 좁히는 확인 경로로 돌아간다.
장문 비교 section은 안전한 전체 문장으로 대체하여 API 1,200자 제한과 주의 문구를 보존한다.

## Observability

기존 서버 `conversation_result`에 다음을 추가했다:
`retrievalMode`, `keywordScore`, `vectorScore`, `rerankScore`, `topSourceAuthority`, `retrievalConfidence`.
`retrievalFallbackReason`은 embedding_unavailable/vector_unavailable/insufficient_candidates를 나타낸다.
기존 `fallbackReason`은 대화의 local fallback 이유를 나타내며 구분해서 유지한다.
`retrievalByTradition`에는 비교 요청의 전통별 출처 ID·점수·인용 결과가 들어간다.
최상위 점수는 마지막 처리 전통의 값이다. 사용자 질문/자료 원문/응답/비밀정보를 로그에 추가하지 않았다.
외부 API 응답에는 이 내부 필드를 추가하지 않는다.

## 평가 데이터와 전문가 export

`evaluation/questions.json`: 전통별 10문항, 총 70개 자체 작성 질문.
basic doctrine, emotional support, scripture/reference, ambiguous question, branch disagreement,
cross-religion, unsafe mental-health claim, hallucination trap의 8개 범주를 포함한다.
expectedTradition, expectedSourceIds, sourceCriteria, mustNotContain, safetyExpectation, citationExpectation을 기록한다.
정답 문장 암기 대신 샘플 검색/격리/인용 자제와 안전 기대값을 평가하도록 구성했다.
전문가가 검토한 benchmark는 아직 아니다.

실행:

```powershell
cd backend
npm.cmd test
npm.cmd run eval:retrieval
```

생성 결과:
- `evaluation/results/retrieval-report.json`: keyword와 hybrid 지표 및 검색 row.
- `evaluation/results/expert-review.json`: question/tradition/retrievedSources/answer/citationResult/integrityResult/safetyResult와 수동 리뷰 필드.

실제 LLM 답변은 생성하지 않았다. 일반 질문의 answer는 null이고 인용/Integrity 결과는 not_run이다.
위기 질문은 기존 deterministic Safety 응답을 기록한다.
reviewAccuracy, reviewTraditionIntegrity, reviewSafety, reviewCitationFaithfulness, reviewHallucination,
reviewTone, reviewUsefulness, reviewNotes는 전문가가 채울 수 있게 비워 둔다.
`createResponseReview()`에 향후 실제 평가용 답변을 전달할 수 있다. 단순 금지 문자열 확인은 전문가 판단을 대체하지 않는다.
실제 사용자 대화 로그나 개인정보는 export에 포함하지 않는다.

## 평가 수치와 해석

| 지표 (K=3) | keyword baseline | hybrid local |
| --- | ---: | ---: |
| Recall@3 | 1.0000 | 1.0000 |
| Precision@3 | 0.1667 | 0.1667 |
| MRR | 0.5000 | 0.4929 |
| wrong-tradition retrieval rate | 0 | 0 |
| empty retrieval rate | 0.5000 | 0.5000 |

70문항 중 위기 7문항은 검색하지 않고, 비교 7문항을 각각 두 전통으로 나누어 총 검색 평가 row는 70개다.
정답 source ID가 있는 row는 35개다. Recall은 이 35개에서 평균을 내고,
Precision@K는 각 row의 정답 출처 수/K를 전체 row에서 평균낸다.
MRR은 무정답/미검색을 0으로 포함한다. wrong-tradition 비율은 전체 반환 출처 중 비율이다.
중복 ID를 정답 개수에 중복 가산하지 않는다.

이 dataset은 의도적인 무근거/자제 질문이 많고 source 후보가 매우 작다.
Recall 1.0은 실제 종교 질문에 대한 검색 품질을 의미하지 않는다.
hybrid MRR은 baseline보다 소폭 낮아 **검색 품질 개선을 입증하지 못했다**.
실제 문서와 별도 전문가 라벨을 확보한 뒤 모델·가중치를 검증해야 한다.

## 테스트, 미구현과 6단계

6단계 구현 및 재개 결과는 [PHASE_6_PRODUCTION_CORPUS.md](PHASE_6_PRODUCTION_CORPUS.md)를 참고한다.

기존 145개 + 신규 25개 = **170개 통과, 실패/skip 0**.
추가 테스트는 vector 정상 검색, 의미/정확한 참조 후보, fallback, 차원/namespace 격리,
reranking, ingestion/사용권/위치, 사전 인덱스 재사용, 외부 adapter 비활성·비용 한도,
reference collision, confidence와 실제 저신뢰 응답, 비교 요청, Safety/local/disabled/HTTP 회귀,
70문항 구조와 평가 지표 계산을 포함한다.
외부 API 실호출, Android 빌드/기기 테스트, 전문가 검토는 수행하지 않았다.

아직 없는 것:
- 실제 사용권이 검토된 corpus와 지속성 있는 Vector DB/운영 색인.
- learned semantic embeddings의 실제 성능·비용 검증, AI reranker.
- 의미적 함의/모순을 판단하는 Citation evaluator 및 confidence calibration.
- 수집/갱신/삭제·버전 전환을 원자적으로 처리하는 운영 corpus lifecycle.
- 전문가 평가 완료, 종파 선택 UI, 운영 부하·장애·배포 검증.

6단계 권장 작업:
1. 전통별 소규모 실제 자료의 사용권/신학적 범위를 전문가와 확인하고 승인된 corpus만 수집.
2. ingestion manifest, immutable index version, 원문 변경/삭제 동기화와 원자적 인덱스 전환 구현.
3. 실제 embedding 모델 및 reranker를 별도 holdout benchmark로 비교하고 keyword보다 개선되는지 확인.
4. 전통·종파별 전문가 리뷰를 수행하고 인용 충실도/심리적 안전/환각 평가를 자동 회귀에 연결.
5. 비용 계량, 캐시, rate limit, 검색 SLA와 장애 복구, 운영 개인정보 정책 검증.
