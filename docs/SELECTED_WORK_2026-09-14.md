# ONARIA 선택 작업 진행 기록 — 2026-09-14

사용자 지정: 지금 2·3·4·7, 런칭 의사 표명 시 1·5·6·8을 알리고 재개.
실제 대상은 soul-bible/ONARIA이며 세션 기본 경로인 k-stock-ai는 수정하지 않았다.

## 2. 로컬/원격 통합 후보

- 원본 main: d73acfed15d10c25f0241d55112f3012b62aa584. 비교한 origin/main: e58a0a8c42a570a8c4feae00e79f9cfafcc28bce.
- 원본 변경 74개를 build/integration-20260914/files, manifest.json, local.patch에 보관했다. 원본 작업 트리를 강제 초기화하지 않았다.
- build/worktrees/integrated-20260914의 integration/onaria-20260914 브랜치에 원격 변경과 로컬 변경을 통합하고 5개 충돌을 해결했다. 기본 main으로 아직 전환하지 않았다.
- 응답 예시는 원격의 질문별 선택을 보존하고 로컬 음성·재시도·중단·반응형 화면을 유지했다. 게임은 원격의 현재 별만 터치하는 규칙을 유지했다.
- 화면 흐름 질문에 답이 없어 현재 로컬의 카드 확인 → 게임 → 감정 선택 복귀를 기준으로 통합했다. 명시적인 사용자 선택으로 간주하지 않는다.
- 기존 피드백/종교 자료 코드는 통합 후보에 보존했으나 공개 배포나 자료 승인 완료를 의미하지 않는다.
- Flutter: 167 PASS, 조건부 1 SKIP. analyze: 종료 0, 기존 example avoid_print 정보 4건.
- Backend: 406 PASS. Android 설치 스크립트 mock 테스트: 20 PASS.
- Web: 설치된 Chrome 채널로 17 PASS. 기본 Playwright 전용 브라우저 미설치 문제를 기존 WEB_BROWSER_CHANNEL 옵션으로 해소했다.
- Android Debug APK 빌드 PASS (컴파일 확인만, 설치하지 않음). Release/iOS 빌드는 NOT RUN: 서명·macOS/정상 CI 검증이 추가로 필요하다. 플러그인 KGP 및 SDK 도구 버전 경고가 남아 있다.
- 원본 스냅샷 74개 파일 해시 재검사: 전부 동일.

## 3. 파서 오류 수정

- 본문 초과를 413, 지원하지 않는 문자셋/인코딩을 415로 반환한다. AI 장애 502로 잘못 표시하던 오류를 수정했다.
- 피드백 기능을 포함하지 않는 별도 브랜치 fix/request-errors-20260914: 743819c89de634b7ac6c2618664978704752c8cb.
- Draft PR: https://github.com/Naharuya/soul-bible/pull/11. 이 커밋의 로컬 backend 401 PASS, web 16 PASS.
- CI App QA 34819415428, Web 34819415516: GitHub annotation에 계정 billing issue로 job이 시작되지 않았다고 명시됨. Android/iOS 작업 SKIPPED. 코드 테스트 실패 결과가 아니다.
- 운영 반영 NOT RUN: CI 검증된 main artifact와 서버 접근이 필요하다. PR 미병합, 운영 서비스 미변경.

## 4. 운영 Safety

- 2026-09-14T07:43:18.112Z, https://api.onaria.ai.kr 대상 기존 safety:smoke의 합성 위기 입력 13/13 고정 응답 일치 PASS.
- 로컬 회귀에서는 모델/클라이언트 생성/전문 에이전트 호출 차단을 검증했다.
- 운영 downstream 호출 0회 확인은 NOT RUN. HTTP 응답만으로는 호출 0회를 증명할 수 없으며 배포 소스와 운영/provider 기록이 필요하다.

## 7. 복구와 비용

- 새 backup_restore.test.js 2 PASS: 임시 회원 SQLite 일관된 백업 복원, 이후 원본 기록 보존, 중복 회원 제약, 비용 원장의 알려진/미상 비용과 익명화 식별자 보존.
- 기존 SQLite/비용/개인정보 관련 테스트 21 PASS; 배포 셸 bash -n PASS.
- 전체 배포 rollback 테스트 NOT RUN: 로컬 Python 실행 환경 부재. CI도 billing 문제로 실행 불가.
- 운영 백업 복원 및 실제 AI 청구 대조 NOT RUN: 서버 접근과 제공자 사용/청구 근거 필요. 테스트 가격은 합성 fixture이며 실제 비용이 아니다.

## 런칭 일정 및 남은 입력

- AGENTS.md 및 docs/LAUNCH_CHECKLIST.md에 1·5·6·8 재개 트리거를 저장했다. 날짜 미지정으로 외부 캘린더/푸시 알람은 생성하지 않았다.
- 필요한 입력: 서버 SSH 별칭 또는 user@host, GitHub 결제 문제 해결. 비밀번호·키를 채팅에 보내지 않는다.
- 1 피드백 운영 배포, 5 종교 사용권/검토, 6 실기기 검증, 8 실제 로그인/결제/권한은 런칭 요청까지 대기한다.

## 보관 커밋

통합 후보 로컬 커밋: 5031a81a221a6c89dab06769229d030fe27b0b0e (integration/onaria-20260914, 작업 트리 clean). 통합 후보는 push하지 않았다. 파서 수정은 743819c89de634b7ac6c2618664978704752c8cb로 push했고 PR #11은 draft 상태다.
