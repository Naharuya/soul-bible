# 6단계 최종 보고: Production Corpus

최종 검증일: 2026-09-08.

| 판정 대상 | 상태 |
| --- | --- |
| 기술적 6단계 | **COMPLETE** |
| 실제 corpus 전문가 승인 | **BLOCKED_EXTERNAL_REVIEW** |
| 실제 운영 readiness | **BLOCKED_NO_APPROVED_CORPUS** |
| production-like 설정/HTTP 검증 | **PASS** — 임시 snapshot과 mock 사용 |
| 실제 외부 배포 | 수행하지 않음 |

승인 시스템과 운영 절차의 구현을 완료했다. 현재 실제 corpus가 준비되었거나
운영 콘텐츠를 출시할 수 있다는 판정은 아니다. 실제 자료를 자동 승인하지 않았다.

## 생성 및 수정 파일

경로는 backend/ 기준이며 이번 최종화 작업의 변경 목록이다.

| 구분 | 파일 | 역할 |
| --- | --- | --- |
| 생성 | src/knowledge/production_index.js | immutable snapshot, manifest, atomic registry, 활성화/롤백 |
| 생성 | src/knowledge/production_readiness.js | 운영 설정, corpus/index readiness, validator 확인 |
| 생성 | src/knowledge/production_cli.js | build/activate/rollback/status/readiness |
| 생성 | test/production_deployment.test.js | 운영 검증 테스트 16개 |
| 생성 | evaluation/phase6-results/readiness.json | 실제 승인 corpus 부재 기록 |
| 수정 | src/knowledge/production_guard.js | 검토 이후 변경 차단, approvalVersion, 수집 시각 검사 |
| 수정 | src/knowledge/source_quality.js | approvalVersion/reviewFingerprint 스키마 |
| 수정 | src/knowledge/corpus_review_cli.js | 명시적 검토 전이, 새 파일 출력, 검토 필드 보존 |
| 수정 | src/conversation_service.js | active index 연결, 외부 API 차단, hybrid 실험 flag |
| 수정 | src/evaluation/gold_benchmark.js | development 최종 지표 별도 보존 |
| 수정 | package.json, .env.example | CLI와 운영 설정 안내 |
| 재생성 | evaluation/phase6-results/benchmark.json, expert-review.json | 최종 benchmark/export |
| 수정 | PHASE_6_PRODUCTION_CORPUS.md | 최종 완료 보고 |

## Corpus Review Workflow와 Approval Guard

명시적인 전이는 development → candidate → reviewed → approved다.
candidate → rejected를 지원하며 reviewed/approved도 rejected로 철회할 수 있다.
철회 후 rejected → candidate → reviewed → approved 순서로 재검토한다.

reviewStatus, reviewedBy, reviewedAt, reviewNotes, approvalVersion을 유지한다.
approvalVersion은 승인 때 1부터 증가한다. 검토자/시각이 필요하고 reviewed를
건너뛰어 승인할 수 없다. sample, 미승인 자료, 불명확한 사용권은 운영 진입을 거부한다.
허용 사용권, URL, 발행자/기관, 언어, 종파, 수집 시각, 자료 버전, checksum을 확인한다.
기존 ingestion/vector/source context의 승인 guard도 유지한다.

reviewed 시점의 reviewFingerprint와 승인 직전 자료가 다르면 재검토해야 한다.
approved 시점의 approvalFingerprint는 본문 및 핵심 메타데이터 변경을 감지한다.
본문 변경 후 checksum만 갱신해도 기존 approval은 무효다.

아래 명령은 실제 검토자가 검토 결과를 확인한 후 실행한다. 파일과 검토자 이름은
운영자가 준비한다. --status가 없으면 검토 목록만 출력한다. 전이 결과는 새 파일에만
쓰고 기존 파일은 덮어쓰지 않는다.

```powershell
npm.cmd run corpus:review -- --input development.json --output candidate.json --status candidate --reviewer REVIEWER_NAME
npm.cmd run corpus:review -- --input candidate.json --output reviewed.json --status reviewed --reviewer REVIEWER_NAME --notes REVIEW_NOTES
npm.cmd run corpus:review -- --input reviewed.json --output approved.json --status approved --reviewer REVIEWER_NAME
npm.cmd run corpus:review -- --input approved.json --verify-production
```

fingerprint는 변경 감지 해시이며 전문가 신원/권한을 인증하는 서명이 아니다.
운영자는 CLI와 운영 파일 쓰기 권한을 제한해야 한다. mock reviewer는 테스트 내부의
합성 자료에만 사용한다. 테스트 snapshot은 OS 임시 디렉터리에 생성 후 정리하며
실제 production data에 mock 승인을 기록하지 않는다.

## Index Versioning과 Manifest

운영자 지정 경로의 <indexVersion>.json snapshot과 registry.json으로 구성한다.
기존 version은 재사용/덮어쓰기하지 않는다. 새 승인 corpus는 새 corpusVersion과
indexVersion으로 전체 snapshot을 만든다. 수정/삭제는 새 승인 자료 목록에 반영한다.
목록에서 제외된 자료는 새 버전 활성화 후 검색되지 않으며 이전 버전은 롤백용으로 남긴다.

manifest 필드:
indexVersion, corpusVersion, createdAt, tradition, sourceIds, sourceCount,
corpusFingerprint, sourceFingerprint, embeddingProvider, embeddingVersion,
retrievalMode, buildStatus.

현재 영속 운영 index는 keyword snapshot이다. embeddingProvider/embeddingVersion은
실제로 vector를 생성하지 않았음을 나타내는 none만 허용한다. hybrid 실험은 snapshot의
승인 자료에 로컬 embedding을 적용하며 영속 vector index 생성으로 기록하지 않는다.
자료 수, ID/중복, fingerprint, 전통 격리, 개별 승인을 build/activate/active 읽기에서 검증한다.

## Atomic Activation과 Rollback

registry lifecycle: building → validated → active → retired. 실패한 build는 failed다.
snapshot manifest의 buildStatus=validated는 완료된 build 검증을 뜻한다.
현재 active/retired 상태는 registry에서 관리한다.

build만으로 활성화하지 않는다. validated만 activate할 수 있다. 활성화 직전 변조된
snapshot은 failed로 기록하고 기존 active를 유지한다. 직전 active는 retired로 보존하고
rollback할 때 다시 검증한다. 대상 검증 실패 시 현재 active를 유지한다.

registry 전체를 동일 디렉터리의 임시 파일에 기록·sync한 후 rename하여 전환한다.
독자는 이전/새 registry 중 하나와 해당 immutable snapshot을 읽는다. writer.lock의
배타적 생성으로 동시 쓰기를 거부한다. 단일 호스트 로컬 파일시스템용이며 분산 합의나
정전 복구 보장은 별도 검증 대상이다.

강제 종료로 writer.lock이 남으면 쓰기는 차단된다. 운영자는 실행 중인 writer가 없는지
확인하고 registry/snapshot을 검사한 뒤 lock을 제거한다. 중단된 building 버전 대신
새 version으로 다시 build한다. 기존 active 읽기는 lock과 독립적이다.

```powershell
npm.cmd run corpus:index -- build --root data/production-index --input approved.json --version protestant-v1 --corpus-version corpus-v1 --tradition protestant
npm.cmd run corpus:index -- status --root data/production-index
npm.cmd run corpus:index -- activate --root data/production-index --version protestant-v1
npm.cmd run corpus:index -- rollback --root data/production-index --tradition protestant
```

rollback은 과거 active였던 직전 검증 버전으로 돌아간다. 과거 버전이 없으면 실패한다.
특정 외부 배포 도구/Vector DB와 결합하지 않는다.

## Production Readiness Check

```powershell
npm.cmd run production:readiness -- --root data/production-index
npm.cmd run production:readiness -- --root data/production-index --tradition protestant
```

전통 생략 시 7개 전통 전체, 지정 시 해당 범위만 검사한다. 차단 시 exit code 1이다.

| 결과 | 조건 |
| --- | --- |
| READY | 승인 자료, 유효한 active snapshot, validator 확인 |
| BLOCKED_NO_APPROVED_CORPUS | 빈 corpus, 미승인 또는 승인 무효 |
| BLOCKED_LICENSE | 허용되지 않은 사용권 |
| BLOCKED_PROVENANCE | 출처/본문 checksum/수집 정보 누락 또는 불일치 |
| BLOCKED_INDEX | 미활성 index, manifest/namespace/상태 불일치 |
| BLOCKED_VALIDATION | citation/integrity/safety validator 부재 |

실제 citation/integrity/safety 함수 존재를 확인하고 실행 순서와 차단 동작은 회귀
테스트로 검증한다. 함수 존재 검사가 의미적 안전성이나 전문가 판단을 보증하지는 않는다.
현재 실제 자료는 7개 전통 모두 BLOCKED_NO_APPROVED_CORPUS이고 readiness.json의
actualCorpusApproval은 BLOCKED_EXTERNAL_REVIEW다. 테스트의 READY는 실제 승인이 아니다.

## Deployment Validation과 최종 회귀

```powershell
npm.cmd run validate:production
npm.cmd test
npm.cmd run eval:gold
```

전체 **211개 통과**, 실패/skip 0. 기존 195개 유지 + 신규 16개다.
검토 버전/변경 무효화, manifest, validated-only 활성화, 실패 시 active 보존,
재시작/롤백, writer 잠금, 빈 자료/미승인/사용권/출처/validator/namespace 차단,
CLI, 운영 설정과 HTTP 계약을 검증했다.

NODE_ENV=production에서는 development 설정으로 운영 필터를 우회할 수 없다.
SOUL_PRODUCTION_INDEX_DIR로 active snapshot 저장소를 연결한다.
SOUL_EXTERNAL_API_DISABLED=true는 API 키/멀티에이전트 설정이 있어도 외부 LLM 및
embedding 클라이언트를 생성하지 않고 local 경로를 사용한다.
SOUL_MULTI_AGENT_ENABLED=false도 기존 local 경로와 /v1/mind/chat 계약을 유지한다.
활성 snapshot의 서비스 연결은 injected mock으로 검증했다. embedding 실패 시 keyword
fallback 및 safety의 retrieval/model 선행 차단도 검증했다.

실제 .env는 수정하거나 설정으로 로드하지 않았고 .env.example만 변경했다.
실제 secret을 추가하지 않았다. 테스트의 mock-only 문자열은 실제 인증 정보가 아니다.
외부 API 호출/서비스 배포는 0회이며 HTTP 검증은 loopback에서만 수행했다.

## 최종 Retrieval Benchmark

합성 문항 140개: development 70개, evaluation 70개. 중복 ID/동일 전통의 동일 질문을
거부하고 development만 가중치 선택에 사용한다. evaluation을 튜닝에 넘기면 실패한다.
evaluation 문항을 수정하지 않고 재실행했다. 이전에도 실행한 고정 세트이므로 새로
확보한 미공개 holdout이라는 뜻은 아니다.

선택 가중치: keyword 0.6, vector 0.4, authority 0.05, reference 0.1,
branch 0.05, quality 0.05, duplicate 0.25.

### Development — 가중치 선택에 사용

| 지표 | keyword | vector | hybrid |
| --- | ---: | ---: | ---: |
| Recall@1 | 0.642857 | 0.442857 | 0.871429 |
| Recall@3 | 1.000000 | 0.528571 | 1.000000 |
| Recall@5 | 1.000000 | 0.528571 | 1.000000 |
| Precision@3 | 0.222222 | 0.121693 | 0.222222 |
| MRR | 0.476190 | 0.309524 | 0.539683 |
| wrong-tradition rate | 0 | 0 | 0 |
| empty retrieval rate | 0.444444 | 0.650794 | 0.444444 |

### Evaluation — 튜닝에서 제외한 고정 세트

| 지표 | keyword | vector | hybrid |
| --- | ---: | ---: | ---: |
| Recall@1 | 0.844828 | 0.448276 | 0.879310 |
| Recall@3 | 1.000000 | 0.534483 | 1.000000 |
| Recall@5 | 1.000000 | 0.534483 | 1.000000 |
| Precision@3 | 0.190476 | 0.105820 | 0.190476 |
| MRR | 0.452381 | 0.261905 | 0.460317 |
| wrong-tradition rate | 0 | 0 | 0 |
| empty retrieval rate | 0.539683 | 0.730159 | 0.539683 |

각 세트의 검색 지표는 safety 7문항을 제외한 63문항 기준이다. 정답 ID가 있는 문항은
development 35개, evaluation 29개다. Recall은 정답 문항 기준, Precision/MRR/empty
rate는 전체 검색 문항 기준, wrong-tradition은 반환 출처 기준이다.
검색 자제가 정답인 문항도 있어 empty rate가 모두 실패를 뜻하지 않는다.

production default는 **keyword**, hybrid는 **experimental**이다.
MRR >= keyword, Recall@3 >= keyword, wrong-tradition <= keyword를 모두 충족했지만
기존의 실제 개선 및 전문가 검토 조건도 유지하므로 promoted=false다.
SOUL_HYBRID_EXPERIMENTAL=true는 명시적 로컬 hybrid 실험 override이며 benchmark가
운영 설정을 자동 변경하지 않는다. 이 수치는 로컬 결정적 embedding과 합성 자료 결과로,
실제 자료/학습된 embedding의 품질 또는 사용권 검증 결과가 아니다.

## Crisis Evaluation과 외부 작업

evaluation 70문항 모두 전문가 export에 포함되며 **위기 대응 7문항을 유지**한다.
keyword/vector/hybrid 각각 최종 evaluation에 safetyIntercepts=7과 안전 응답 review row가
남는다. 위기 시 모델과 retrieval을 선행 차단한다. 일반 문항 answer=null,
citation/integrity=not_run, 전문가 필드는 미입력이다. 안전 응답도 전문가 승인으로 표시하지 않았다.

| 외부 작업 | 수행 여부 |
| --- | --- |
| 외부 API/유료 embedding | 없음 |
| 실제 저작권 종교 자료 다운로드/추가 | 없음 |
| 실제 전문가 승인 | 없음 |
| 실제 production 배포 | 없음 |
| 외부 승인 상태 | BLOCKED_EXTERNAL_REVIEW |

## 7단계 진입 조건

기술적 6단계는 COMPLETE이므로 7단계 개발에 진입할 수 있다.
실제 콘텐츠를 사용하는 운영 전환에는 다음이 필요하다.

1. 사용권·신학적 범위·종파·안전성을 확인한 전문가 기록과 승인 corpus 확보.
2. 쓰기 권한을 제한한 운영 디렉터리에 새 snapshot build 및 명시적 activate.
3. 배포 범위 readiness READY와 실패/rollback 운영 점검.
4. 실제 모델/embedding 도입 시 별도 holdout, 실제 답변 인용·integrity·안전 평가,
   비용/SLA/장애 복구/개인정보 검증.
5. 실제 배포와 기기 검증은 별도 작업으로 실행.
