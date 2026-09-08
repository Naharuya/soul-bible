# 9단계: Christianity A-Track Pilot Corpus

검증일: 2026-09-08 KST. 7·8단계 문서와 현재 repository를 확인하고 기존 registry,
4역할 review/import, approvedCorpus, index lifecycle, evaluator 및 release gate를 재사용했다.

**기술 구현과 회귀 검증 완료. 실제 공개 원문 후보를 등록했으며, 전문가 승인 및 운영 전환은 미완료다.**
실제 전문가를 대신하거나 mock approval을 운영 자료에 기록하지 않았다.

| 항목 | 실제 결과 |
| --- | --- |
| 원자료 | 공식 World English Bible Protestant edition (`engwebp`), 영어 |
| Pilot source 수 | upstream edition 1개; 기존 Christianity registry에 passage source 24건 |
| 후보 corpus | 31개 verse를 포함하는 24개 passage/chunk 후보 |
| Approved source / chunk | **0 / 0** — 24건 모두 candidate |
| 전체 backend 테스트 | **269/269 PASS**, 기존 238 + 신규 31, 실패/skip 0 |
| Crisis | **7/7 PASS**, retrieval/model downstream 호출 0 |
| License 상태 | publisher public-domain 근거 확보; 사람의 license review는 pending |
| Provenance 상태 | 공식 ZIP/entry/subset/license/selection SHA-256 기록, 로컬 증거 검증 통과 |
| 실제 corpusVersion / indexVersion | **null / null** — 승인 corpus build·activation 미실행 |
| 실제 keyword / vector / hybrid benchmark | **NOT_RUN / NOT_RUN / NOT_RUN** |
| 실제 citation / emotional-query 평가 | **NOT_RUN / NOT_RUN** — 승인 corpus 부재 |
| 외부 검토 | **BLOCKED_EXTERNAL_REVIEW** |
| 출시 | **BLOCKED_RELEASE** |
| Production default / hybrid | keyword / experimental 유지 |
| Engagement v1 | 7종 이벤트 인터페이스 준비; 기본 disabled; UI 연결 없음 |
| 실제 외부 호출 | LLM 0, embedding 0; 공식 출처 웹 확인 및 공개 ZIP 다운로드 1건 |
| 실제 다운로드 자료 | **있음** — 공식 ZIP에서 추출한 영어 원문 subset과 원본 사용권 안내 |
| 배포 / 실제 `.env` 변경 | 없음 / 없음 |

## 생성 파일

아래는 `backend/` 기준이다. 생성된 JSON/CSV는 자동 승인이나 실제 품질 평가 결과가 아니다.

| 파일 | 기능 |
| --- | --- |
| `src/knowledge/bible_corpus_adapter.js` | BibleCorpusAdapter 인터페이스 및 오프라인 VPL adapter |
| `src/knowledge/bible_passage.js` | 책 이름·약어·장절 정규화, passage metadata 검증, 인용 reference 비교 |
| `src/knowledge/bible_tags.js` | 수동 감정·개념 discovery aliases와 태그 점수 |
| `src/knowledge/a_track_pilot.js` | 증거 snapshot 검증, 기존 registry candidate 등록, 검토·Gold 패키지 생성 CLI |
| `src/engagement/domain_events.js` | UI/운송/저장소와 분리된 opt-in 이벤트 hook |
| `test/a_track_pilot.test.js` | 신규 회귀 테스트 31개 |
| `corpus/christianity-a-track/selections.json` | 24개 passage의 수동 경계·태그 |
| `corpus/christianity-a-track/upstream/selected.vpl.txt` | 실제 영어 원문 31개 verse |
| `corpus/christianity-a-track/upstream/engwebp_about.htm` | ZIP 원본 사용권 고지 |
| `corpus/christianity-a-track/upstream/source.json`, `provenance.json` | 출처 metadata 및 checksum evidence |
| `corpus/christianity-a-track/README.md`, `.gitattributes` | 재현 절차 및 Windows에서도 hash를 유지할 LF 설정 |
| `evaluation/phase9-preparation/` | candidate-registry, candidate-passages, gold-candidate, expert-package JSON/CSV, review-submission, summary |
| `evaluation/phase9-evidence/` | regression 및 격리 테스트 rollback 증거 요약 |
| `evaluation/phase9-results/` | 기존 report CLI가 만든 실제 candidate 상태, crisis, readiness, release 및 빈 답변 평가 패키지 |
| `PHASE_9_CHRISTIANITY_A_TRACK.md` | 이 완료 보고서 |

Repository root의 `script/prepare-a-track-source.ps1`도 생성했다. 공식 ZIP의 지정 entry만
메모리에서 읽어 subset을 만들며 SQL/HTML을 실행하지 않는다. 전체 ZIP/성경을 저장소에 추가하지 않았다.

## 수정 파일

- `config/christianity-pilot-registry.json`: 기존 빈 registry에 24개 candidate passage 등록.
- `package.json`: `pilot:a-track` prepare 명령 추가.
- `src/knowledge/expert_registry.js`: 선택적 passage 필드와 reference 검증; 기존 fingerprint에 태그도 포함.
- `src/knowledge/source_quality.js`: 내부 metadata의 책/장절/감정·개념 태그/전체 licenseEvidence 허용.
- `src/knowledge/expert_corpus.js`: 승인된 passage를 원문 그대로 1개 chunk로 보존.
- `src/knowledge/expert_package.js`: JSON/CSV 검토 패키지에 passage metadata 제공.
- `src/knowledge/ingestion/enrichment.js`: 기존 chunk ID 계산을 export하여 Gold ID 생성과 공유.
- `src/knowledge/production_guard.js`: production candidate의 passage/reference 일치 검증.
- `src/knowledge/retriever.js`, `reranker.js`: 구조화된 Christianity passage에만 수동 태그 검색 반영.
- `src/agents/citation_grounding.js`, `citation_validator.js`: numbered book과 범위를 포함한 exact reference 검증.
- `src/evaluation/pilot_evaluation.js`: Precision@3 및 감정·개념 query별 top-3 태그 정합성 보고 추가.

`/v1/mind/chat`, 외부 response schema, `createLocalConversationService()`, local fallback,
`SOUL_MULTI_AGENT_ENABLED=false` 및 Safety → Psychology → Religion → Citation → Integrity → Integration
순서는 유지했다. `config/expert-reviewers.json`은 비어 있으며 변경하지 않았다.

## Source policy와 provenance

[공식 edition 설명](https://ebible.org/engwebp/)의 66-book Protestant edition을 선택했다.
[공식 사용권 고지](https://ebible.org/engwebp/copyright.htm)는 본문을 public domain으로 공개한다.
World English Bible 명칭의 상표 조건에 따라 원문 표현을 바꾸지 않았다. 영어 verse 문자열은
원본에서 복사하고 VPL 줄 경계만 LF로 정규화했다. 같은 passage의 verse는 한 칸으로 연결한다.
한국어 상용 번역본, 불명확한 인터넷 데이터, LLM 태깅/번역은 사용하지 않았다.

- sourceVersion: `engwebp-vpl-sha256-f08d13b4f0701108`
- ZIP SHA-256: `f08d13b4f0701108f7b9f95d57c201649f37c36359f707c8cf1876538a84d750`
- 원본 `engwebp_vpl.txt` SHA-256: `71ea1ce60dac8780a16d908f6035fa3595ecc9459acf636de5d1c5023214f240`
- 선택 subset SHA-256: `c4c4fef423406dd9bb97f3196476fae3e7042fb4f25a03357045ba2c15474eba`

publisher/institution, sourceUrl, sourceVersion, checksum, licenseEvidence, provenance를 검사한 후
adapter가 본문을 읽는다. unknown/restricted/self_authored는 이 A-track adapter에서 차단한다.
허가 자료의 사용권 근거가 유효한지는 사람이 검토해야 하며, 필드 유효성 검사가 법적 승인을 대체하지 않는다.
ZIP·entry hash는 수집 당시 계산한 값이며 upstream의 서명이나 별도 신원 인증은 아니다.

## Passage metadata와 review

`candidate-passages.json`에는 sourceId/tradition/sourceType/title/book/chapter/verseStart/verseEnd/
reference/language/text/conceptTags/emotionTags/authorityLevel/licenseStatus/licenseEvidence/
provenance/sourceVersion/checksum/reviewStatus를 모두 제공한다.
기존 registry에서는 관련 필드를 `passage`로 묶고, 승인 후 knowledge record에서는 내부 `metadata`에 보존한다.
모든 필드가 검토 fingerprint에 묶여 본문·태그·장절·사용권 변경 시 기존 결정을 재사용할 수 없다.

검토 순서는 **licenseReviewer → contentReviewer → traditionExpert → safetyReviewer → approved**다.
현 상태는 첫 license 검토를 위한 24개 빈 submission이며 실제 승인 결정은 0건이다.
테스트의 mock reviewer는 메모리/자동 정리되는 임시 폴더에서만 사용했다.
`test_fixture` registry는 production corpus로 build할 수 없다.

아래 명령은 `backend/`에서 실행한다. 실제 roster와 작성된 decision을 준비한 뒤 역할마다
새 registry와 새 패키지를 만든다. 기존 7단계 review workflow를 그대로 사용한다.

```powershell
npm.cmd run corpus:expert -- package --registry config/christianity-pilot-registry.json --roster config/expert-reviewers.json --output review-round-1
npm.cmd run corpus:expert -- import --registry config/christianity-pilot-registry.json --roster config/expert-reviewers.json --reviews completed-license-reviews.json --output license-verified-registry.json
```

공식 snapshot에서 candidate를 재생성하려면 **빈 별도 registry**와 새 output을 사용한다.
현재 canonical registry에는 이미 24건이 있으므로 동일 source를 다시 intake하면 중복 오류가 정상이다.

```powershell
npm.cmd run pilot:a-track -- prepare --registry empty-production-registry.json --source-dir corpus/christianity-a-track/upstream --selections corpus/christianity-a-track/selections.json --output new-preparation
```

## Approved build, versioning, activation과 rollback

실제 approved chunk가 없으므로 build/activation은 실행하지 않았다. 다음 version 문자열은
**승인 후 사용할 예시**이며 현재 생성된 index가 아니다.

```powershell
npm.cmd run corpus:expert -- build --registry approved-registry.json --roster config/expert-reviewers.json --tradition protestant --root data/christianity-pilot-index --version christianity-a-track-index-v1 --corpus-version christianity-a-track-corpus-v1
npm.cmd run corpus:index -- status --root data/christianity-pilot-index
npm.cmd run corpus:index -- activate --root data/christianity-pilot-index --version christianity-a-track-index-v1
```

approvedCorpus가 네 역할 결정을 재검증한 source만 포함한다. 새 snapshot은 validated로 생성하고
기존 active는 바꾸지 않는다. version 덮어쓰기 및 미검증 activation은 거부한다.
격리 테스트에서는 c1/a1 → c2/a2 활성화 후 c1/a1 복원과 실패한 새 build의 기존 active 보존을 확인했다.
운영 rollback은 NOT_RUN이며 첫 index에는 이전 version이 없어 rollback 대상이 없다.

## Retrieval benchmark와 emotional queries

평가 후보는 **15개 retrieval query + 기존 7개 crisis case = 22개**다.
불안/두려움/외로움/슬픔/분노/죄책감/희망/감사 8군, 용서/쉼/용기/평안/기도 5군,
무관 질문·가짜 reference 2건을 포함한다.
Gold의 정답 ID는 실제 후보 passage의 안정적인 chunk ID에 연결했다.
태그에서 도출한 label은 `pending_expert_review`이며 독립적인 전문가 Gold가 아니다.

| 실제 승인 corpus 지표 | keyword | vector | hybrid |
| --- | --- | --- | --- |
| Recall@1 / @3 / @5 | NOT_RUN | NOT_RUN | NOT_RUN |
| Precision@3 | NOT_RUN | NOT_RUN | NOT_RUN |
| MRR | NOT_RUN | NOT_RUN | NOT_RUN |
| citation pass rate | NOT_RUN | NOT_RUN | NOT_RUN |
| no-answer rate | NOT_RUN | NOT_RUN | NOT_RUN |
| emotional/concept tag alignment | NOT_RUN | NOT_RUN | NOT_RUN |

실제 결과 JSON은 null이다. mock 승인으로 실행한 3모드 테스트 수치를 실제 품질 수치로 보고하지 않는다.
vector/hybrid는 기존 `local-concepts-v1` 256차원 deterministic 로컬 baseline이다.
사전학습 의미 모델이나 외부 embedding 평가라고 부르지 않으며 keyword 기본값을 변경하지 않는다.

Recall은 정답 ID가 있는 질문의 정답 회수 비율, Precision@3는 정답 top-3 개수/3의 질문 평균,
MRR은 top-5 첫 정답의 역순위 평균이다. `emotionalQueries.tagAlignedAt3`는 기대 감정/개념 태그와
연결된 top-3 결과 개수/3이다. 부족한 반환 수를 만점으로 계산하지 않는다.
태그 정합성은 문맥·교리·도움 정도에 대한 사람의 평가를 대체하지 않는다.

query는 한국어지만 `expectedSourceCriteria.language=en-US`로 영어 원문을 명시적으로 검색한다.
기존 `ko-KR` source 요청에는 영어 자료가 반환되지 않으며 앱의 언어 설정도 자동 변경하지 않았다.
승인 corpus·독립 검토 Gold가 준비되면 다음 기존 명령으로 실제 검색 평가를 실행할 수 있다.

```powershell
npm.cmd run eval:pilot -- --registry approved-registry.json --roster config/expert-reviewers.json --gold reviewed-a-track-gold.json --output real-a-track-evaluation
```

모델 답변이 없으면 citation/no-answer rate는 null이다. 답변 JSON을 제공하는 기존 `--answers`
경로에서만 해당 지표를 계산하며, corpus/question fingerprint가 다른 답변은 거부한다.
빈 검색 결과를 모델의 no-answer로 혼동하지 않는다. Hybrid 승격은 기존 promotion 조건과
전문가 검토를 별도로 통과해야 하며 이번 명령들은 자동 승격하지 않는다.

## Citation, no-answer와 crisis

Bible reference는 sourceContext/sourceId 및 book/chapter/verseStart/verseEnd/reference가 모두
일치해야 한다. `1 John`과 `John`, `1:9`와 `1:90`, 단일 절과 확대 범위를 구분한다.
현재 passage 전체 reference의 exact match만 허용하며 부분 범위를 자동 승인하지 않는다.
정확한 reference label과 원문 인용은 각각 검증하고, 원문에 없는 주장을 붙이면 안전 문구로 수리한다.
가짜 sourceId/metadata는 거부하며, 낮은 confidence의 구체적 장절 주장은 공감·돌봄 fallback으로 전환한다.
이는 deterministic 인용 검증으로 의미·교리 검토를 대신하지 않는다.

Critical safety 실제 suite 결과는 **7/7 PASS**, 모든 row의 downstreamCalls=0이다.
위기 문장에서는 모델 생성과 Bible retrieval 이전에 Safety가 응답한다.

## Engagement v1 hook

지원 type: `daily_checkin_completed`, `verse_saved`, `mind_card_created`,
`seven_day_journey_progress`, `share_card_requested`, `easter_egg_unlocked`, `mini_game_completed`.

type/version/eventId/occurredAt/opaque subjectRef 및 제한된 resourceRef/journeyDay만 받는다.
대화 내용이나 임의 회원 payload는 스키마에서 거부한다. 기본 handler는 없으며 emit은 disabled를 반환한다.
별도 consumer를 붙여도 입력 객체를 변경할 수 없고 consumer 오류는 handler_failed로 격리한다.
실제 API/대화 경로에는 연결하지 않았다. 알림·게임·UI·네트워크·저장소 구현은 다음 단계 범위다.

## 검증과 실제 상태 보고

실행: `npm.cmd test` → **269 tests, 269 passed, 0 failed, 0 skipped**.
31개 신규 테스트는 license/evidence/checksum, 실제 후보와 정규화, 승인·scope·fingerprint,
감정/개념/언어 격리, reference/가짜 절/no-answer, version/rollback, 3모드 evaluator,
crisis, engagement, API/local fallback/disabled flag 및 immutable CLI를 검증했다.
기존 238개 테스트를 유지했다. Flutter 코드는 이번에 변경하지 않아 Flutter 테스트는 재실행하지 않았다.

다음 명령을 실제 실행했고 기존 index는 생성/수정하지 않았다.

```powershell
npm.cmd run pilot:christianity -- report --registry config/christianity-pilot-registry.json --roster config/expert-reviewers.json --gold evaluation/phase9-preparation/gold-candidate.json --root data/christianity-pilot-index --regression evaluation/phase9-evidence/regression.json --rollback evaluation/phase9-evidence/rollback.json --output evaluation/phase9-results
```

결과 파일 생성 후 **BLOCKED_RELEASE로 exit code 1**을 반환했다. 이는 테스트 실패가 아니라
실제 승인 corpus·active index·전문가 Gold·답변 및 사람 평가가 없다는 운영 gate 판정이다.
`summary.json`의 externalApiCalls=0은 report 실행 자체의 모델/API 호출 수다.
이 작업 전체에서는 공식 웹 확인과 ZIP 다운로드가 있었음을 별도로 기록했다.

## 다음 단계 권장 작업

1. 실제 검토자의 신원·역할·전통 범위를 확인해 roster를 채우고, 24개 후보의 네 역할 검토를 순서대로 수행한다.
2. 본문 문맥과 수동 태그, 감정 질문의 적절성을 검토한다. 수정 시 sourceVersion을 바꾸고 기존 결정을 무효화한다.
3. 승인 passage 20~50개를 확보한 뒤 새 corpus/index version을 build하고 격리 pilot에서 activation/readiness/rollback을 검증한다.
4. 태그에서 독립적인 Gold와 holdout을 작성·검토하고 keyword/vector/hybrid 실제 평가를 실행한다.
5. 실제 답변과 인간 평가를 연결해 citation/no-answer/도움 정도를 확인한 뒤 release gate를 재실행한다.
6. 정식 출시 전에 한국어 성경 라이선스를 별도로 검토한다. 영어 pilot을 한국어 정식 서비스 승인으로 해석하지 않는다.
7. Engagement v1 UI/알림/게임은 다음 단계에서 이번 hook에 연결한다.
