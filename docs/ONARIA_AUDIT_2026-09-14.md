# ONARIA 문제 점검 및 1차 수정 — 2026-09-14

## 프로젝트 확인

- 사용자가 지정한 익스플로러 폴더: `soul-bible`.
- 실제 점검·수정 경로: `C:/Users/SJ/AndroidStudioProjects/soul-bible`.
- 루트 AGENTS.md의 PROJECT=ONARIA, Flutter 패키지 `onaria`, Node 패키지 `onaria-backend`, remote `Naharuya/soul-bible`를 확인했다.
- 기준 HEAD: `d73acfed15d10c25f0241d55112f3012b62aa584`, 브랜치 `main`.
- fetch한 origin/main: `e58a0a8c42a570a8c4feae00e79f9cfafcc28bce`; 로컬 HEAD가 18커밋 뒤다. 기존 미커밋·미추적 작업을 보존했으며 merge/reset/stash하지 않았다.
- `.env`, 서명키, 개인 상담 기록은 읽지 않았다. RAMI/K-Stock은 수정하지 않았다.

## 확인한 문제와 해결 순서

| 항목 | 우선순위 | 현재 근거 | 상태 및 다음 행동 |
| --- | --- | --- | --- |
| 운영 피드백 API 누락 | P1 API | 운영 `/health` 200, `/v1/feedback`에 빈 JSON 요청 404. 유효한 의견을 제출하거나 데이터를 저장하지 않음 | 미해결. 기존 PR #5의 변경을 통합·검증한 다음 승인된 CI artifact 배포 필요 |
| 배포 후보와 Git 기준 불일치 | P1 배포 | 로컬 HEAD 18커밋 뒤, 다수 미커밋 앱/백엔드 변경. 기존 PR #5는 open/draft, 미병합 | 미해결. 별도 통합 작업에서 기존 변경을 분리·보존하고 정확한 통합 SHA를 검증 |
| JSON 입력 오류를 AI 장애로 오분류 | P1 API | 16KB 초과, 지원하지 않는 charset/content-encoding에서 모델 호출 0인데 HTTP 502와 AI 실패 안내 반환 | **로컬 수정 완료**. 각각 413/415와 고정된 요청 오류 안내 반환. 운영에는 미반영 |
| 현황 문서와 최신 검증 근거 불일치 | P3 문서 | STATUS의 과거 AI 미연결·CI/iOS 미확인 기록과 이후 REAL 보고서·현재 PR CI 근거가 다름 | 이 보고서에 현재 확인 범위를 기록. 과거 보고서를 최신 완료 판정으로 재사용하지 않음 |

아래는 이번에 새로 재현한 결함이 아니라, 기존 보고서상 아직 완료 근거가 없는 검증 과제다.

- **Safety 운영 관측:** 로컬의 위기 응답·모델 및 전문 에이전트 호출 0 회귀는 통과. 운영의 실제 downstream 호출 0을 입증하는 관측 자료는 이번에 수집하지 않았다.
- **종교 인용/운영 RAG:** 승인 corpus·라이선스·전문가 검토와 운영 검색 품질 gate는 기존 보고서상 미완료. 이전 실제 AI 테스트 성공은 이 승인을 대신하지 않는다. 이번에 자료를 승인하거나 경전 본문을 변경하지 않았다.
- **실기기 검증:** 기존 RC1 기기 보고서의 범위를 넘어 음성 청취 품질, 네트워크 중단/재시도, 알림 수신·권한 변경·재부팅 검증은 이번에 실행하지 않았다.
- **회원/사업 기능:** 실제 로그인 발급·결제 연결, 베타 참여·D7 유지율·교회 PoC는 기존 현황상 완료 근거가 없다. 코드 테스트와 실제 사용자 성과를 구분한다.
- **운영 복구:** 백업 복원·롤백·비용 청구 대조 자료는 이번에 확인하지 않았다.

관련 기존 근거: [RC1 검증](release-candidates/RC1_REVIEW.md), [기기 검증](release-candidates/RC1_DEVICE_REVIEW.md), [Phase 10](PHASE10_LOCAL_REPORT.md), [AI 실제 검증](AI_COST_ROUTER_V1_REAL_2026-09-12.md), [현황](../ONARIA_STATUS.md).

## 이번 수정

`backend/src/app.js`의 기존 오류 처리기에 파서 오류의 제한된 분기 8줄을 추가했다. 기존 피드백·가입·관리자 관련 미커밋 수정은 그대로 보존했다.

- 요청 크기 초과: `entity.too.large` → 413.
- 지원하지 않는 문자셋/압축 인코딩: `charset.unsupported`, `encoding.unsupported` → 415.
- 요청/헤더/파서 원문은 응답에 반영하지 않고, AI 장애로 기록하지 않는다.
- 기존 인증 오류, 잘못된 JSON의 400, 제공자 오류의 처리와 `no-store` 정책은 유지한다.
- 실제 HTTP 테스트는 대화·가입·피드백 경로에서 상태코드, 원문 비노출, 모델 호출 0, 회원 저장 0 및 health 유지까지 검증한다.

## 이번 실행 결과

- 변경 전 backend: 397 passed, 0 skipped.
- 새 회귀 테스트의 변경 전 실행: 3 failed. 실제 502와 기대 413/415 차이를 확인했다.
- 변경 후 요청 파서/개인정보/Safety 집중 테스트: 16 passed.
- 변경 후 backend 전체: 400 passed, 0 skipped. 외부 AI 비활성화.
- Flutter 전체: 150 passed, 1 conditional skip. `conversation_lifecycle_test.dart`의 API 미설정 경로는 현재 API 기본값이 있으므로 제외된다. 앱 소스 수정은 없다.
- `flutter analyze lib test example --no-fatal-infos --no-pub`: exit 0. 기존 example/main.dart의 avoid_print 정보 4개.
- Web/Admin: Chrome 기반 로컬 브라우저 테스트 17 passed (1.1분). 외부 리소스 및 실제 AI 호출 없음.
- 이번 변경의 Android/iOS 빌드 및 휴대폰 설치: NOT RUN. Node HTTP 오류 처리 변경이며 앱 소스 변화 없음.
- 실제 AI 호출 및 운영 변경/재시작: NOT RUN. 현재 운영 동작을 이 로컬 수정의 결과로 표시하지 않는다.

## 기존 피드백 PR의 최신 CI

[PR #5](https://github.com/Naharuya/soul-bible/pull/5): open, draft, 미병합. head `0eff67641dd8cfb95d7d8a7ceb1c1b0055fecff2`.

- [App QA run 34754493352](https://github.com/Naharuya/soul-bible/actions/runs/34754493352): backend, Flutter 검증, Android APK/AAB 빌드, iOS simulator compile 모두 success. PR 조건에 따라 APK/AAB artifact 업로드는 skipped.
- [Web/Admin run 34754493332](https://github.com/Naharuya/soul-bible/actions/runs/34754493332): success.
- 이 결과는 해당 PR 커밋에만 해당한다. 현재 미커밋 ONARIA 앱이나 이번 파서 수정의 CI/배포 성공을 뜻하지 않는다. 기존 보고서의 CI 진행 중 상태는 이 조회 시점에는 완료로 바뀌었다.

## 작업 전체 보고

- 현재 Gate: 파서 오류 수정 CODE/TEST 완료, REAL/USER 미확인.
- 완료된 항목: 프로젝트 식별, 현행 로컬 검증, 운영 API 누락 재확인, 기존 PR CI 조회, 오류 처리 수정 및 회귀 검증.
- 미완료 항목: 피드백 API 운영 반영, 소스 통합 및 정확한 통합 SHA 검증, 위 운영·기기 수용 과제.
- 가장 큰 리스크: 휴대폰 후보의 기능과 운영 서버의 API가 불일치하며, 현재 로컬 앱의 변경 묶음이 검증된 Git 커밋으로 확정되지 않음.
- 다음 3개 작업: (1) 기존 PR 및 로컬 변경을 보존하는 통합 후보 정리 (2) 통합 SHA의 QA와 CI 배포 artifact 준비 (3) 명시적 운영 배포 승인 후 feedback 계약·앱 왕복 재검증.
- 생성/수정 파일: backend/src/app.js, backend/test/request_parser_errors.test.js, 본 보고서.
- 기존 테스트 영향: 위 실행 결과 참조. 기존 미커밋 변경을 섞어 commit/push하지 않았다.
