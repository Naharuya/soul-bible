# SoulBible Server Agent Automation v0.1

## 목적
SoulBible의 개발·리스크 검증·테스트·빌드·업무보고를 서버에서 자동 실행한다. 에이전트가 임의 배포하는 구조가 아니라, Main Manager가 작업을 통제하고 지니가 중요한 결정을 승인하는 Human-in-the-loop 구조를 기본으로 한다.

핵심 원칙:

> 에이전트는 실행하고, Main Manager는 통제하고, 지니는 중요한 결정을 승인한다.

---

## 1. 최종 자동화 흐름

```text
Scheduler
  -> Main Manager
  -> Current Risk Gate 확인
  -> Risk Analysis Agent
  -> Coding Agent
  -> risk-gate/* 별도 브랜치에서 수정
  -> Test Agent
  -> Review Agent
  -> PASS / FAIL / HUMAN_REVIEW
  -> PASS 시 Test APK 생성
  -> 업무보고 작성
  -> 지니 Galaxy S24 실사용 테스트
  -> 지니 승인
  -> main merge
  -> AAB 생성
  -> 앱마켓 등록은 지니가 최종 결정
```

자동화 서버는 `main`에 직접 코드를 쓰지 않는다. 모든 자동 수정은 별도 브랜치에서만 수행한다.

---

## 2. 역할 정의

### Main Manager
- 현재 Risk Gate 판정
- 오늘 처리할 작업 우선순위 결정
- 전문 Agent 배정
- 테스트 및 리뷰 결과 취합
- `PASS / FAIL / HUMAN_REVIEW` 결정
- 승인 필요 작업을 지니에게 에스컬레이션
- 일일 업무보고 생성

### Risk Analysis Agent
- 현재 Gate 기준으로 미해결 리스크 추출
- Git diff / test failure / regression 분석
- 수정 범위를 좁게 정의
- acceptance criteria 작성

### Coding Agent
- 지정된 브랜치에서만 수정
- scope 밖 리팩터링 금지
- 테스트 실패를 숨기거나 skip으로 바꾸는 행위 금지
- 안전/개인정보/라이선스 정책을 임의 변경하지 않음

### Test Agent
- backend unit/integration test
- Safety regression
- Bible/RAG validation
- Flutter test
- build validation
- 결과를 기계 판독 가능한 JSON으로 저장

### Review Agent
- Coding Agent와 독립적으로 diff 검토
- Safety, privacy, data-loss, secret, license, API-cost 회귀 확인
- 테스트 통과만으로 PASS하지 않고 정책 위반 여부 추가 확인

### Build Agent
- 모든 필수 Gate가 PASS인 경우에만 debug APK 생성
- RELEASE APPROVED가 없는 상태에서는 AAB / store publish 금지

### Analytics / Cost Agent
- AI 호출량, token, estimated cost, fallback, latency 집계
- 비용 급증 또는 quota 이상 감지 시 Main Manager에 보고

---

## 3. Risk Gate 순서

### G1 Safety / 위기대응
목표: 고위험 입력에서 일반 Psychology/Religion/LLM 흐름보다 Safety가 항상 우선한다.

필수 조건:
- 승인된 crisis fixture 100% 통과
- HIGH_RISK / CRISIS에서 일반 종교 조언 생성 0건
- Safety 응답 중 외부 LLM 신규 호출 0건이 필요한 경로는 0건 유지
- 109 / 112 / 119 등 한국 대응 문구 검증
- raw exception, API key, prompt leakage 0건
- 실환경 smoke 결과 별도 기록

G1이 FAIL이면 G2 이후 자동 확장 금지.

### G2 Bible RAG / 라이선스
- 존재하지 않는 장절 생성 금지
- citation validation PASS
- production corpus는 승인된 자료만 사용
- 라이선스 상태: APPROVED / REVIEW / BLOCKED 명시

### G3 Psychology 품질
- 상투적 반복 응답 감소
- 감정/상황/Need 반영
- 진단/치료 단정 금지
- 신앙적 죄책감 유발 금지

### G4 7화면 MVP + Anonymous Analytics
핵심 경험:
`마음 -> AI 대화 -> 말씀 -> 작은 행동 -> 기록`

필수 이벤트:
- first_open
- emotion_selected
- conversation_started
- conversation_completed
- scripture_viewed
- heart_card_saved
- return_7d

### G5 50명 Closed Beta + D7
- 50명 테스트
- activation / completion / D1 / D7 측정
- D7 미달 시 기능 확장·광고 확대 금지

### G6 100명 교회 PoC
- 5개 교회 x 20명 목표
- 개인 대화 원문을 기관에 제공하지 않음

### G7 Premium / AI 원가
- Premium 지불의향
- 세션당 AI 원가
- 무료/유료 quota
- 모델 라우팅 정책

### G8 CAC/LTV / 사업성
- CAC-to-D7
- 예상 LTV
- 광고 확대 여부
- GO / MODIFY / STOP

---

## 4. 절대 자동화 금지 작업

아래 작업은 지니의 명시적 승인 없이는 실행하지 않는다.

- main 최종 merge
- production deploy
- 앱마켓 업로드/등록/출시
- 개인정보 정책 변경
- Safety 정책의 의미 있는 완화
- 성경/외부 콘텐츠 라이선스 상태 변경
- 가격/결제 정책 변경
- 사용자 데이터 삭제/마이그레이션
- 대규모 광고 집행
- secrets 또는 production credential 변경

---

## 5. 서버 구성 권장안

초기 v0.1은 단일 호스트에서 동작하는 보수적 구조로 구현한다.

```text
server/
  agent-automation/
    src/
      scheduler/
      main-manager/
      gates/
      agents/
      github/
      runner/
      reports/
      approvals/
    config/
      risk-gates.yaml
      policies.yaml
    state/
      jobs.sqlite
    logs/
    reports/
```

권장 구성:
- Node.js 20+
- SQLite job/state store
- GitHub CLI 또는 GitHub API
- child_process 기반 명령 실행은 allowlist 명령만 허용
- 각 job에 timeout
- 각 Agent 단계별 immutable audit log
- structured JSON result

외부 AI Coding Agent 호출 방식은 adapter로 추상화한다.

```text
CodingProvider
  - codex
  - manual
  - future_provider
```

provider가 실패하면 자동으로 main을 건드리지 말고 job을 `HUMAN_REVIEW`로 종료한다.

---

## 6. 스케줄

초기 기준:
- 평일 05:00 Main Manager Daily Run
- 금요일 Risk Gate Weekly Review
- 긴급 실패는 즉시 보고

Daily Run:
1. GitHub 최신 main 확인
2. 현재 Gate 상태 로드
3. 최근 CI/test/result 확인
4. 미해결 항목 3~5개 도출
5. 자동 처리 가능 범위 선택
6. 별도 브랜치 생성/재사용
7. Coding -> Test -> Review
8. PASS 시 APK 후보 생성
9. 업무보고 생성
10. 승인 필요사항 대기

---

## 7. 작업 상태 머신

```text
QUEUED
 -> ANALYZING
 -> READY_TO_CODE
 -> CODING
 -> TESTING
 -> REVIEWING
 -> PASS | FAIL | HUMAN_REVIEW
 -> BUILDING
 -> READY_FOR_USER_TEST
 -> USER_APPROVED | USER_REJECTED
 -> READY_TO_MERGE
```

`USER_APPROVED` 없이는 `READY_TO_MERGE`로 갈 수 없다.

---

## 8. 출력 파일

각 실행마다 최소 다음 파일을 생성한다.

```text
reports/YYYY-MM-DD/<job-id>/
  summary.md
  risk-analysis.json
  changes.md
  test-results.json
  review.json
  build.json
  approval-required.json
```

업무보고 형식:
- 오늘의 상태
- 완료 업무
- 테스트 결과
- 발견된 문제/리스크
- 다음 작업
- 지니 결정 필요사항

---

## 9. v0.1 구현 범위

이번 버전은 G1 Safety만 자동화한다.

### 구현해야 할 것
1. `server/agent-automation` 기본 프로젝트 생성
2. Scheduler
3. Main Manager state machine
4. GitHub branch/worktree adapter
5. command runner allowlist
6. G1 Safety Gate runner
7. backend test runner
8. Flutter test runner
9. review result schema
10. Android debug APK build trigger / artifact tracking
11. report generator
12. approval state 저장

### 이번 버전에서 하지 않을 것
- main 자동 merge
- production deploy
- Play Console publish
- live user data access
- pricing/payment 변경
- 대규모 refactor
- G2~G8 자동 수정

---

## 10. G1 Safety v0.1 테스트 파이프라인

반드시 아래 순서대로 수행한다.

```text
npm install / npm ci
npm test
Safety-specific regression suite
RAG smoke (read-only)
flutter pub get
flutter test
flutter analyze
flutter build apk --debug
```

빌드 조건:
- backend test failed = build 금지
- Safety regression failed = build 금지
- Flutter test failed = build 금지
- Review Agent HIGH severity = build 금지

PASS 시에만 Test APK를 산출한다.

---

## 11. 보안 요구사항

- `.env` 원문 출력 금지
- API key / token / credential 로그 출력 금지
- process.env 전체 dump 금지
- shell command allowlist 사용
- branch 이름 validate
- path traversal 차단
- production DB 접근 기본 금지
- test fixture만 사용
- 외부 네트워크 호출 기본 OFF, 명시적 테스트만 허용
- Safety 테스트에 실제 취약 사용자를 사용하지 않고 synthetic fixture만 사용

---

## 12. 완료 기준

v0.1 완료는 아래 조건을 모두 만족해야 한다.

- [ ] 서버 프로세스가 평일 스케줄을 읽을 수 있음
- [ ] Main Manager가 현재 Gate를 G1로 인식
- [ ] job/state가 SQLite에 저장되고 재시작 후 복구
- [ ] 별도 risk-gate 브랜치에서만 수정
- [ ] G1 Safety 테스트 자동 실행
- [ ] backend/Flutter test 자동 실행
- [ ] 실패 시 APK 미생성
- [ ] PASS 시 debug APK artifact 생성
- [ ] summary/report 자동 생성
- [ ] 지니 승인 전 merge/publish 불가
- [ ] 모든 주요 단계 audit log 생성

---

## 13. Codex 작업 지시

Codex는 이 문서를 구현 명세로 사용한다.

### 작업 순서
1. 현재 repository 구조와 기존 `.github/workflows/build-android.yml`, backend test, Safety 코드 확인
2. 기존 기능을 깨지 않는 최소 변경 설계
3. `server/agent-automation` scaffold 작성
4. G1 Safety Gate 구현
5. 테스트 작성
6. 로컬 dry-run 모드 구현
7. GitHub Actions와 연결 가능한 CLI 제공
8. 결과 보고서 작성

### CLI 목표

```bash
node server/agent-automation/bin/soul-manager.js status
node server/agent-automation/bin/soul-manager.js run --gate G1 --dry-run
node server/agent-automation/bin/soul-manager.js run --gate G1
node server/agent-automation/bin/soul-manager.js report --latest
```

### 품질 기준
- 기존 backend test 전부 유지
- 기존 Flutter test 전부 유지
- 새 자동화 자체 test 추가
- 숨겨진 failure/skip 금지
- 구현 후 실제 실행 결과를 `SERVER_AGENT_AUTOMATION_V0_1_REPORT.md`에 기록

---

## 14. 지니 승인 포인트

Codex는 다음 상황에서 작업을 중단하고 HUMAN_REVIEW를 반환한다.

- Safety 의미 변경 필요
- 개인정보 정책 변경 필요
- 라이선스 해석 필요
- 기존 테스트를 삭제/완화해야 통과하는 경우
- production credential이 필요한 경우
- main merge 필요
- release/publish 필요

이 경우 코드로 우회하지 말고 `approval-required.json`에 이유와 선택지를 기록한다.
