# 8단계: Christianity Pilot 운영 절차

검증일: 2026-09-08. 7단계 source review/import/build/evaluation/release 로직과
6단계 index lifecycle을 재사용했다. Christianity 전용 intake와 통합 보고 명령만 추가했다.

## 최종 상태

| 항목 | 결과 |
| --- | --- |
| 운영 절차 구현 | COMPLETE |
| 전체 회귀 테스트 | **238/238 PASS** — 기존 231개 유지 + 신규 7개 |
| 실패 / skip | 0 / 0 |
| Crisis | **7/7 PASS**, retrieval/model 호출 0 |
| Pilot tradition | Christianity: 내부 `protestant`, namespace `christianity` |
| 등록 source 수 | **0** |
| Approved source 수 | **0** |
| Blocked source 수 | **0** — 등록된 행 자체가 없음 |
| Placeholder | 메타데이터 양식 1개, source로 집계하지 않음 |
| Review 상태 | 실제 검토 없음, 네 역할 입력 구조 준비 |
| Corpus version | null — 실제 build 전 |
| Index version | null — 실제 build/activation 전 |
| 실제 retrieval / citation 평가 | NOT_RUN |
| Actual corpus approval | **BLOCKED_EXTERNAL_REVIEW** |
| Release candidate | **BLOCKED_RELEASE** |
| Production retrieval | keyword 기본값, hybrid experimental |
| 외부 API / 자료 다운로드 / 배포 | 모두 0회 |

기술적 운영 절차를 준비한 상태이며 실제 pilot corpus 도입이나 RC가 완료된 것은 아니다.
source 행이 0개라 blocked source 수는 0이지만, corpus 부재로 전체 pilot과 release는 차단된다.
기존 프로젝트에서 가톨릭은 별도 tradition이므로 이번 Christianity pilot에 섞지 않았다.

## 파일

경로는 `backend/` 기준이다.

- 생성: `src/knowledge/christianity_pilot.js` — 로컬 본문 intake 및 통합 운영 보고.
- 생성: `config/christianity-pilot-registry.json` — 빈 production registry.
- 생성: `config/christianity-source-metadata.template.json` — 본문 없는 메타데이터 양식.
- 생성: `test/christianity_pilot.test.js` — 신규 테스트 7개.
- 생성: `evaluation/phase8-evidence/regression.json`, `rollback.json` — 검증 증거 요약.
- 생성: `evaluation/phase8-results/` — 아래 실행으로 생성한 결과 snapshot.
- 수정: `package.json` — `pilot:christianity` 명령 추가.
- 생성: 이 완료 보고서.

7단계 검토/승인 코드, 대화 API, `createLocalConversationService()`, local fallback,
`SOUL_MULTI_AGENT_ENABLED=false`, Safety 우선순위는 변경하지 않았다.
실제 `.env`를 수정하거나 로드하지 않았고 비밀정보를 추가하지 않았다.

## 1. 운영자 제공 자료 Intake

메타데이터 양식을 복사해 실제 값으로 채운다. 양식의 null은 미입력 표시이며
검증을 통과하는 실제 후보가 아니다. 본문이나 가상의 출처/허가를 채우지 않았다.

licenseEvidence와 provenance는 비어 있으면 intake 단계부터 실패한다.
`reviewStatus`는 candidate만 허용하고 생략해도 candidate가 된다.
다른 tradition이나 approved 상태의 입력은 거부한다. 알려지지 않거나 제한된 사용권은
기존 license review gate에서도 production 승인을 차단한다.

운영자가 사용권 근거와 함께 실제 로컬 UTF-8 본문을 제공한 후 실행한다.
텍스트 입력 없이 메타데이터만으로 ingestion할 수 없다. URL에서 본문을 가져오지 않는다.

```powershell
# backend 디렉터리에서 실행. source-metadata.json과 operator-source.txt는 운영자가 제공한다.
npm.cmd run pilot:christianity -- intake --registry config/christianity-pilot-registry.json --metadata source-metadata.json --text operator-source.txt --output candidate-registry.json
```

intake는 줄바꿈 및 바깥 공백을 정규화한 본문의 checksum을 계산한 뒤 7단계 registerSource를
호출한다. 기존 registry/출력 파일을 덮어쓰지 않는다. 본문 제공은 전문가 승인으로 간주하지 않는다.

## 2. 전문가 검토 Package와 Import

실제 후보를 intake한 뒤 기존 7단계 명령을 그대로 사용한다.

```powershell
npm.cmd run corpus:expert -- package --registry candidate-registry.json --roster config/expert-reviewers.json --output christianity-review-round-1
npm.cmd run corpus:expert -- import --registry candidate-registry.json --roster config/expert-reviewers.json --reviews christianity-review-round-1/submission.json --output license-verified-registry.json
```

검토자 roster는 현재 비어 있다. 운영자가 실제 신원·역할·전통 범위를 확인한 전문가를
등록해야 한다. 이름을 임의로 채우거나 mock reviewer를 production roster에 추가하지 않았다.

순서는 **licenseReviewer → contentReviewer → traditionExpert → safetyReviewer**다.
각 역할의 reviewer/시각/decision/notes/checklist가 별도로 필요하다.
각 import 후 생성한 새 registry로 다음 package를 export하여 다음 역할 검토를 받는다.
한 사람이 여러 역할을 맡을 수 있지만 역할별 기록을 생략할 수 없다.

현재 `phase8-results/review-template.json`에는 네 역할 checklist가 있고,
`expert-package.json`, `expert-package.csv`, `review-submission.json`은 등록 자료가 없어
행/decisions가 비어 있다. 빈 submission은 승인 import할 수 없다.
JSON submission으로 검토 결과를 import하며 CSV는 열람용이다.

partial approval, rejected, 누락 checklist, 잘못된 역할/전통, stale fingerprint를 차단한다.
모든 네 역할이 통과해야 approved가 된다. 본문/핵심 metadata 변경 시 기존 approval은
무효이며 새 sourceVersion으로 revise하고 네 역할 검토를 다시 받아야 한다.

## 3. Approved Corpus와 Pilot Index

승인 완료 후 7단계 build를 사용한다. 승인된 Christianity source만 chunk를 만들고
checksum/fingerprint와 네 역할 evidence를 재검증한다. 목표는 전통당 20~50 chunks다.
빈 corpus 또는 50 chunks 초과는 차단한다. 부족한 수를 임의 자료로 채우지 않는다.

```powershell
npm.cmd run corpus:expert -- build --registry approved-registry.json --roster config/expert-reviewers.json --tradition protestant --root data/christianity-pilot-index --version christianity-index-v1 --corpus-version christianity-corpus-v1
npm.cmd run corpus:index -- status --root data/christianity-pilot-index
```

위 version은 **명령 예시이며 실제 생성된 version이 아니다**. 새 승인 corpus를 추가할 때
새 corpusVersion/indexVersion을 지정한다. 기존 version은 덮어쓰지 않는다.
build 결과는 validated이고 활성화는 별도 명령이다. 실패하면 기존 active가 유지된다.

```powershell
# 승인/검증 후 격리된 pilot index에서만 실행한다.
npm.cmd run corpus:index -- activate --root data/christianity-pilot-index --version christianity-index-v1
npm.cmd run production:readiness -- --root data/christianity-pilot-index --tradition protestant
npm.cmd run corpus:index -- rollback --root data/christianity-pilot-index --tradition protestant
```

release gate는 이 pilot의 실제 active manifest와 평가 corpus fingerprint 일치를 확인한다.
pilot 경로를 운영 앱에 연결하는 `.env` 변경이나 외부 배포는 이번 단계에 포함하지 않았다.
첫 활성화에는 직전 version이 없어 실제 rollback이 불가능하다. 새 검증 version을 만든 뒤
이전 active 복원 절차를 검증한다. 현재는 임시 디렉터리의 테스트만 통과했고 실제 pilot
build/activation/rollback 실행은 NOT_RUN이다.

## 4. 실제 RAG 평가와 인간 평가 Export

승인 source가 있어야 실제 검색 평가를 수행한다. 이번에는 승인 source가 없으므로
기존 evaluatePilot은 검색/embedding을 실행하지 않고 BLOCKED_EXTERNAL_REVIEW를 반환했다.
실제 chunk ID에 맞춘 Gold 평가 파일도 전문가가 준비해야 한다. 기존 development sample ID를
그대로 사용하면 BLOCKED_GOLD_LABELS로 차단된다.

승인 자료와 Gold가 준비되면 keyword/vector/hybrid를 로컬 방식으로 비교한다.
외부 API 호출은 금지되어 있으며 평가 명령에 외부 모델을 호출하는 경로를 추가하지 않았다.
모델 답변 평가는 운영자가 제공한 기존 답변 JSON을 `--answers`로 입력할 때만 수행한다.

| 지표 | keyword | vector | hybrid |
| --- | --- | --- | --- |
| Recall@1 | NOT_RUN | NOT_RUN | NOT_RUN |
| Recall@3 | NOT_RUN | NOT_RUN | NOT_RUN |
| Recall@5 | NOT_RUN | NOT_RUN | NOT_RUN |
| MRR | NOT_RUN | NOT_RUN | NOT_RUN |
| wrong-tradition rate | NOT_RUN | NOT_RUN | NOT_RUN |
| citation pass rate | NOT_RUN | NOT_RUN | NOT_RUN |
| no-answer rate | NOT_RUN | NOT_RUN | NOT_RUN |

미실행 값을 성공 수치나 0으로 바꾸지 않고 JSON에서는 null로 기록했다.
citation 결과도 NOT_RUN이다. 기존 평가의 의미/분모는 7단계 문서와 같다.

`human-response-review.json`은 실제 평가 대상이 없어 빈 배열이다.
`human-response-template.json`에는 religiousAccuracy, traditionIntegrity,
citationFaithfulness, psychologicalSafety, tone, usefulness, hallucination의
점수와 reviewerNotes 구조가 있다. 점수나 전문가 의견을 자동 입력하지 않았다.

## 5. 통합 운영 보고 명령

이번 실제 실행:

```powershell
npm.cmd run pilot:christianity -- report --registry config/christianity-pilot-registry.json --roster config/expert-reviewers.json --gold evaluation/gold-candidate-v1.json --root data/christianity-pilot-index --regression evaluation/phase8-evidence/regression.json --rollback evaluation/phase8-evidence/rollback.json --output evaluation/phase8-results
```

정상적으로 결과를 생성한 뒤 **BLOCKED_RELEASE이므로 exit code 1**을 반환했다.
실제 운영 시에는 검토된 registry, 실제 chunk에 맞춘 Gold, 최신 회귀/rollback 증거로
경로를 교체한다. `--answers`, `--human-reviews`는 운영자가 제공한 실제 답변/평가 파일의
선택 입력이다. 누락하면 해당 평가/검토 gate는 통과하지 못한다.

보고서는 새 디렉터리에만 생성한다. 다음 실행에는 다른 `--output` 경로를 사용하여
이전 검토·평가 결과와 섞이지 않게 한다. source registry나 index를 자동 변경하지 않는다.

생성 결과: summary.json, pilot-evaluation.json, critical-safety.json, readiness.json,
release-gate.json, expert-package.json/CSV, review-template.json, review-submission.json,
human-response-review.json, human-response-template.json.

## 6. Release Gate와 검증 결과

7단계 gate의 corpus 승인/사용권/provenance, expert Gold, validated active index,
평가 fingerprint 일치, citation/integrity 검증, wrong-tradition=0, 인간 평가,
critical safety 7/7, rollback 및 전체 회귀 통과 조건을 유지한다.
8단계 보고에서는 phase8Baseline=231, phase8AddedTests>=7, total=231+추가 테스트 수를
추가 확인하여 이전 7단계 회귀 보고서만으로 통과하지 못하게 한다.

현재 회귀 및 위기·임시 rollback 검증은 통과했다. 실제 corpus/readiness/답변·인용/인간
평가가 없어 **BLOCKED_EXTERNAL_REVIEW / BLOCKED_RELEASE**를 유지한다.
강제 승인/강제 release 옵션은 추가하지 않았다. 검증 증거 파일은 운영자가 신뢰할 수 있는
CI/검토 절차에서 생성해야 하며 단순 JSON이 신원이나 실행 이력을 인증하는 것은 아니다.

`npm.cmd test`: **238 passed, 0 failed, 0 skipped**.
신규 7개는 placeholder, 필수 evidence/provenance, preapproval 차단, partial/reject,
승인 index/실패 보존/rollback, 빈 pilot 차단, 역할별 패키지와 보고 CLI를 검증했다.
기존 231개 API/local fallback/disabled flag/평가 회귀를 모두 유지했다.

## 다음 운영 작업

1. 운영자가 사용권 근거와 provenance가 있는 실제 Christianity 본문 및 metadata를 제공한다.
2. 실제 전문가를 roster에 등록하고 네 역할 검토를 순서대로 export/import한다.
3. approved corpus만 새 version으로 격리된 pilot index에 build하고 검증·활성화한다.
4. 실제 chunk ID에 맞춘 Gold로 로컬 RAG 평가를 수행하고 제공된 답변에 대한 인간 평가를 받는다.
5. 최신 전체 회귀·crisis·readiness·rollback 증거와 함께 보고 명령을 재실행한다.
6. 모든 RC 조건을 충족한 후 별도 운영 전환을 검토한다. 현재 단계에서는 외부 API와 배포를 수행하지 않는다.
