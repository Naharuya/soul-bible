# 7단계: 전문가 검토 기반 Pilot Corpus

검증일: 2026-09-08. 6단계 인덱스/활성화/롤백/readiness를 재사용했다.

| 구분 | 최종 상태 |
| --- | --- |
| 7단계 기술 workflow 구현 | COMPLETE |
| 회귀 테스트 | **231/231 PASS** — 기존 211개 + 신규 20개, 실패/skip 0 |
| Critical safety suite | **7/7 PASS**, retrieval/model 호출 0 |
| 실제 승인 자료/전문가 | **0건 / 0명** |
| 실제 corpus 평가 | **BLOCKED_EXTERNAL_REVIEW** |
| 운영 readiness | BLOCKED_NO_APPROVED_CORPUS |
| Release candidate | **BLOCKED_RELEASE** |
| Production retrieval | keyword 기본값, hybrid experimental 유지 |

시스템의 구현과 검증을 완료했지만 실제 자료·전문가가 없어 실제 RAG 품질 평가는
수행하지 않았다. 합성 자료 평가를 실제 corpus 성능으로 보고하지 않는다.

## 1. 생성 파일

경로는 `backend/` 기준이다.

| 파일 | 기능 |
| --- | --- |
| `src/knowledge/expert_roles.js` | 역할 순서와 필수 checklist |
| `src/knowledge/expert_registry.js` | source/roster 스키마, 등록·수정·역할별 검토 import, 전통별 상태 |
| `src/knowledge/expert_package.js` | 전문가 패키지 JSON/CSV 생성 |
| `src/knowledge/expert_corpus.js` | 승인 자료 chunk build, phase 6 index 연결, 내부 citation payload |
| `src/knowledge/expert_cli.js` | intake/revise/package/import/build/evaluate/release 명령 |
| `src/evaluation/pilot_evaluation.js` | 실제 승인 자료 평가 인터페이스, 답변 export, release gate |
| `src/evaluation/critical_safety.js` | 별도 critical safety suite |
| `config/expert-source-registry.json` | 빈 production source registry |
| `config/expert-reviewers.json` | 빈 production reviewer roster |
| `test/expert_corpus.test.js` | 신규 회귀 테스트 20개 |
| `evaluation/phase7-expert-package/` | sources.json, sources.csv, templates.json, submission.json, README.md |
| `evaluation/phase7-results/` | pilot-evaluation, human-response-review/template, critical-safety, readiness, regression, rollback, release-gate JSON |
| `PHASE_7_EXPERT_CORPUS.md` | 완료 보고 및 운영 절차 |

## 2. 수정 파일과 호환성

- `src/knowledge/source_quality.js`: 역할별 expertReview 메타데이터 스키마 추가.
- `src/knowledge/production_guard.js`: expertReview가 있는 자료의 네 역할 승인·checklist·scope 검사.
- `src/knowledge/production_readiness.js`: 실제 활성 manifest를 결과에 포함하여 평가 corpus와 대조.
- `package.json`: `corpus:expert`, `eval:pilot` 명령 추가.

`/v1/mind/chat`와 외부 response schema, `createLocalConversationService()`, local fallback,
disabled flag, 대화 orchestration은 이번 단계에서 변경하지 않았다.
Safety → Psychology → Religion → Citation → Integrity → Integration 순서를 유지한다.
내부 citation payload를 외부 API에 추가하지 않았다. 실제 `.env`와 비밀정보도 변경하지 않았다.

## 3. Source Registry와 License Workflow

source registry는 schemaVersion/environment/sources 배열이다. 각 source는 다음을 보존한다.

`sourceId`, `tradition`, `traditionBranch`, `title`, `publisher`, `institution`, `sourceType`,
`sourceUrl`, `language`, `originalLanguage`, `licenseStatus`, `licenseEvidence`, `provenance`,
`reviewStatus`, `reviewedBy`, `reviewedAt`, `reviewNotes`, `sourceVersion`, `checksum`.

추가로 text/reference/authorityLevel/expectedUsage/keywords/qualityScore 및 네 역할의
reviews 배열을 기록한다. 신규 intake 입력은 review 필드를 받지 않고 candidate로 등록한다.
본문은 줄바꿈을 정규화하고 checksum을 확인한다. 본문은 최대 100,000자이며
빈 줄로 구분한 의미 단위가 chunk 상한 3,500자를 넘으면 더 작게 분할해 제출해야 한다.

사용권 상태는 public_domain, official_permission, licensed, self_authored, restricted, unknown이다.
앞의 네 상태만 승인 가능하며 **restricted/unknown 또는 licenseEvidence 부재는 차단**한다.
사용권 상태를 문자열로 선언하는 것만으로 통과하지 않고 licenseReviewer의 허용 사용 범위,
증거, 출처 신원 checklist 승인이 필요하다. 코드가 법적 권리를 자동 판단하지는 않는다.

## 4. Expert Review Workflow와 전통별 Template

순서와 registry 상태:

1. candidate → licenseReviewer 승인 → license_verified
2. contentReviewer 승인 → content_reviewed
3. traditionExpert 승인 → tradition_reviewed
4. safetyReviewer 승인 → approved

현재 차례에서 rejected를 제출하면 terminal rejected가 된다. 부분 검토나 rejected 자료는
production build에 들어가지 않는다. 재검토는 새 sourceVersion으로 revise하여 candidate부터 시작한다.
이전 registry 파일은 덮어쓰지 않고 기록으로 보존한다.

각 결정은 sourceId/sourceFingerprint/role/reviewer/reviewedAt/decision/notes/checklist를
가진다. 하나의 전문가가 여러 역할을 맡을 수 있지만 네 개의 별도 결정이 필요하다.
허용된 roster의 역할/전통과 일치해야 하며 미래 시각, 순서 역전, 누락 checklist는 거부한다.

`templates.json`에는 개신교·가톨릭·불교·유대교·이슬람·힌두교·유교 template가 있다.
공통 checklist는 교리 정확성, 전통 일치성, 종파 편향 공개, 타 종교 해석 혼입 방지,
과도한 절대화, 심리적 안전, 치료 대체 방지, 출처 정확성, 문맥/분할, 사용권이다.
각 전통별 focus는 지정 교단·전승·학파·문헌 권위 등의 범위를 검토하도록 안내한다.
template 자체가 신학적 검토 완료를 의미하지 않는다.

roster의 identityEvidence는 운영자가 확인한 전문가 신원 근거를 기록하는 필드다.
실제 신원 확인/서명 검증 서비스는 아니므로 roster와 registry의 쓰기 권한을 제한해야 한다.
현재 roster는 비어 있으며 전문가를 임의로 등록하지 않았다.

## 5. 전문가 패키지와 승인 결과 Import

패키지에는 source metadata/text/chunks, license evidence, tradition/branch, expected usage,
checklist, 완료된 역할 결정 및 다음 역할의 빈 submission을 담는다. CSV는 인용부호/줄바꿈을
escape하고 수식으로 해석될 수 있는 셀을 보호한다. 사용자 대화/회원정보 입력 경로는 없다.

현재 sources는 0건이므로 sources.json의 rows와 submission의 decisions는 비어 있다.
이는 실제 검토 대상이 있는 완성 패키지로 가장하지 않은, 전문가 전달용 구조다.

`backend/`에서 실행한다. 아래 경로는 운영자가 준비할 파일의 예시다.

```powershell
npm.cmd run corpus:expert -- intake --registry config/expert-source-registry.json --source source.json --output candidate-registry.json
npm.cmd run corpus:expert -- package --registry candidate-registry.json --roster config/expert-reviewers.json --output review-round-1
npm.cmd run corpus:expert -- import --registry candidate-registry.json --roster config/expert-reviewers.json --reviews review-round-1/submission.json --output license-verified-registry.json
```

검토자는 submission.json의 reviewer/reviewedAt/decision/notes/checklist를 작성한다.
sourceFingerprint와 registryFingerprint를 변경하면 안 된다. 역할마다 새 registry로 다음
package를 export하고 import한다. 이 방식으로 소스 코드 수정 없이 검토 결과를 반영한다.
import는 전체 결정을 메모리에서 검증한 뒤 새 파일에만 쓰며 중간 승인 상태를 저장하지 않는다.
기존 출력 파일이 있으면 실패하므로 각 검토 round는 새 경로를 사용한다.

revise 예시:

```powershell
npm.cmd run corpus:expert -- revise --registry approved-registry.json --source revised-source.json --output revised-registry.json
```

본문 checksum, 출처, license evidence, 종파 등 내용이 달라지면 fingerprint가 바뀐다.
이전 검토를 replay하거나 checksum만 갱신해 승인 상태를 유지할 수 없다.
test_fixture scope registry는 production roster와 섞거나 production corpus로 build할 수 없다.
production 형태의 성공 테스트는 명시적인 합성 fixture와 mock reviewer만 임시 디렉터리에서 사용한다.

## 6. Approved Corpus Build / Index Rebuild

네 역할의 검토를 재검증한 approved source만 선택한다. 정규화가 승인된 본문을 바꾸면
재-intake를 요구한다. 기존 chunkSource/enrichChunks를 재사용하여 위치와 originalSourceId를
보존하고, chunk checksum/fingerprint에 원자료의 역할별 검토 증거를 함께 묶는다.
phase 6 승인 메타데이터는 완료된 실제 import 결정을 반영하는 것이며 새 사람의 승인을 만들지 않는다.

전통당 목표는 20~50 chunks다. 20은 권장 규모이고, 빈 corpus 또는 50 초과는 build를 거부한다.
적은 자료를 임의로 채우거나 자동 수집하지 않는다.

```powershell
npm.cmd run corpus:expert -- build --registry approved-registry.json --roster config/expert-reviewers.json --tradition protestant --root data/production-index --version protestant-v2 --corpus-version corpus-v2
```

새 version은 phase 6의 validated snapshot으로만 생성하며 active를 즉시 바꾸지 않는다.
운영 index는 keyword/embedding=none이다. vector/hybrid는 로컬 실험 평가이고 실제 유료
embedding이나 영속 vector build를 수행했다고 표시하지 않는다.
기존 phase 6 자료 포맷과 API 호환성을 유지하지만 7단계 release는 expert corpus의
fingerprint와 실제 활성 index의 corpusFingerprint까지 일치해야 한다.

현재 실제 index는 **생성/활성화하지 않았다**. 검토·평가·release 조건 확인 후 운영자가
phase 6 activate/rollback 명령을 사용한다. release gate는 CI/관리 절차의 차단 판정이며
기존 운영자용 activate 명령을 대체하는 배포 서비스는 아니다.

## 7. Pilot Corpus 상태

| 전통 | 실제 승인 source | 실제 승인 chunk | 상태 |
| --- | ---: | ---: | --- |
| 개신교 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 가톨릭 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 불교 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 유대교 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 이슬람 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 힌두교 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |
| 유교 | 0 | 0 | BLOCKED_EXTERNAL_REVIEW |

실제 다운로드/저작권 자료 추가/실제 전문가 승인 모두 **없음**이다.

## 8. 내부 Citation Payload

`citationPayload()`는 현재 검색된 승인 records와 sourceIds에서 sourceId/title/reference/
institution/authorityLevel만 만든다. institution이 없으면 publisher를 사용한다.
위조 ID, 중복 ID, 다른 전통, 수정된 미승인 메타데이터를 거부한다.
평가 export에서 사용하며 현재 앱 API 응답에는 추가하지 않았다.

## 9. Real Corpus Retrieval Benchmark

```powershell
npm.cmd run eval:pilot -- --registry approved-registry.json --roster config/expert-reviewers.json --gold approved-gold.json --output pilot-run-1
```

development/evaluation split은 기존 검증을 재사용한다. 이 evaluator는 evaluation만 측정하고
가중치를 튜닝하지 않는다. 실제 source/chunk ID에 맞춘 Gold labels가 필요하며 기존 샘플
ID를 실제 corpus 정답으로 쓰면 **BLOCKED_GOLD_LABELS**다. labelStatus가 전문가 승인 전이면
탐색 평가는 가능하지만 release는 차단된다.

현재 실제 승인 corpus 부재로 모든 전통에서 다음 값은 null/미실행이다.

| 지표 | keyword | vector | hybrid |
| --- | --- | --- | --- |
| Recall@1 / Recall@3 / Recall@5 | 미실행 | 미실행 | 미실행 |
| MRR | 미실행 | 미실행 | 미실행 |
| wrong-tradition rate | 미실행 | 미실행 | 미실행 |
| citation pass rate | 미실행 | 미실행 | 미실행 |
| no-answer rate | 미실행 | 미실행 | 미실행 |

Recall은 정답 source가 있는 질문 기준, MRR은 전체 검색 질문 기준,
wrong-tradition은 반환 출처 기준이다. citation pass rate는 인용을 시도한 답변 중
validator passed 비율이다. no-answer rate는 모델 답변에 명시적으로 표시한 noAnswer 비율로,
검색 결과가 비었다는 이유만으로 모델의 무응답을 추정하지 않는다.
답변 미제공이면 citation/no-answer를 0 또는 1로 만들지 않고 null로 둔다.

세 검색 모드 비교와 인용 위조/누락 처리는 합성 테스트로 검증했으며 실제 성능 수치로
내보내지 않았다. production 기본값은 keyword이며 자동 승격하지 않는다.

## 10. Human Response Evaluation

외부에서 별도 승인 절차로 생성한 평가 답변을 `--answers answers.json`으로 입력할 수 있다.
이 명령 자체는 모델 API를 호출하지 않는다. 답변 배열의 각 원소는 questionId/strategy/
corpusFingerprint/questionFingerprint/model/generatedAt/output/noAnswer를 갖는다.
output은 기존 내부 religionOutputSchema이며 다른 corpus/질문에 대한 답변, 중복 또는
미평가 질문의 답변을 거부한다. 현재 검색 근거에 대해 Citation → Integrity를 실행한다.

human-response-review.json은 질문·근거·실제 답변·모델/시각·인용 결과와 다음 항목을 보존한다.

religiousAccuracy, traditionIntegrity, citationFaithfulness, psychologicalSafety, tone,
usefulness, hallucination 각각 `{score, reviewerNotes}` 및 reviewer/reviewedAt.

1~5점이며 5가 가장 좋다. hallucination도 5=환각 없음, 1=심각한 환각이다.
실제 답변은 0건이므로 현재 review 배열은 비어 있고 별도 human-response-template.json에
필드/척도를 제공한다. 점수나 전문가 의견을 임의로 채우지 않았다.

## 11. Critical Safety Suite

기존 Gold evaluation의 safety conflict 7문항을 독립 suite로 실행했다.
7개 ID/전통 보존, crisis 응답 계약, 위험 수준, 말씀 제안 차단, 대화 종료와
retrieval/model 호출 0을 확인했다. **7/7 PASS**이며 결과는 critical-safety.json에 있다.
각 문항의 질문·응답·호출 수·pass를 남겨 누락을 성공으로 오인하지 않는다.
RAG 지표가 좋아도 critical suite가 하나라도 실패하면 release는 차단된다.

## 12. Release Gate

기본 배포 대상은 keyword다. gate는 다음을 모두 요구한다.

- 회귀 증거의 existingBaseline=211, additionalTests>=20, total=211+additionalTests,
  전체 통과, 실패/skip 0. 이번에는 기존 211개를 유지한 231개 통과.
- 대상 전통 readiness READY, approved corpus 존재, expert Gold 검토 완료.
- 평가 corpus와 활성 index fingerprint 일치: 승인·사용권·provenance 검증된 snapshot 사용.
- critical safety 7/7 PASS, rollback 검증 성공.
- keyword wrong-tradition rate=0, 인용 시도 1건 이상, citation pass rate=1.
- 전체 질문의 답변 제공 및 integrity pass rate=1, citation compliance rate=1.
- 각 keyword 답변의 7개 인간 평가 항목 >=4점 및 reviewer notes/신원/시각 존재.

인용하지 않은 답변을 성공으로 세지 않으며 명시적인 안전한 noAnswer만 자제로 인정한다.
인간 평가도 corpus/질문/답변/모델/생성 시각에 묶어 오래된 평가를 재사용하지 못하게 한다.
회귀/rollback/인간 검토 파일은 운영자가 통제하는 검증 증거다. JSON 자체가 테스트 실행이나
전문가 신원을 암호학적으로 증명하지 않으므로 CI와 접근 권한 관리가 필요하다.

```powershell
npm.cmd run corpus:expert -- release --pilot pilot-run-1/pilot-evaluation.json --regression regression.json --rollback rollback.json --human-reviews completed-human-reviews.json --gold approved-gold.json --root data/production-index --traditions protestant --output release-decision.json
```

release 명령은 실제 readiness와 critical safety를 다시 검사하고 BLOCKED_RELEASE이면
exit code 1을 반환한다. 실제 결과는 **BLOCKED_RELEASE**다. 회귀/safety/rollback 테스트는
통과했지만 corpus/readiness/실제 retrieval·citation/인간 검토 증거가 없다.

## 13. 테스트, Rollback 및 외부 API

`npm.cmd test`: **231 tests, 231 pass, 0 fail, 0 skipped**.
신규 20개는 license/역할/안전 gate, partial/rejected 차단, import/replay/수정 무효화,
test scope 분리, 전문가 패키지, 승인 chunk build, rebuild/rollback, citation payload,
pilot 평가/Gold 불일치/답변 부재, critical safety release 차단, CLI, 크기 상한, 위조 인용을 검증한다.
기존 HTTP API/local fallback/disabled flag 회귀도 모두 유지하여 통과했다.

Rollback은 임시 production index에서 새 version 활성화 후 이전 검증 version 복원을 확인했다.
실제 운영 corpus가 없으므로 운영 환경에서의 rollback 실행은 NOT_RUN이다.
실제 외부 API 호출·embedding 비용·자료 다운로드·배포는 **0회**다.

## 14. 8단계 권장 작업

1. 전통별 실제 전문가를 확보하고 신원·역할·전통 범위를 확인하여 roster 등록.
2. 사용권 근거가 있는 소규모 원자료를 수동 intake하고 네 역할 검토를 순서대로 import.
3. 전통당 20~50 chunk pilot을 목표로 corpus/index build하고 실제 chunk에 맞춘 Gold 작성·검토.
4. 실제 모델 평가 호출 범위/비용을 정한 뒤 답변을 생성하여 import하고 인간 평가 수행.
5. 검증된 staging index의 activation/readiness/rollback과 release gate를 통과한 범위만 운영 전환.
6. 이후 별도 holdout, 의미적 citation 평가, 비용/SLA/개인정보/기기 검증을 확장.
