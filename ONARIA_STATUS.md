# onaria 기능·사업 검증 현황

문서 연결: **현재 상태** · [진행 순서](ONARIA_ROADMAP.md) · [완료 판정 기준](ONARIA_GATES.md).

확인일: 2026-09-10. 기준 커밋 `3dbe708` 이후 Safety 보강 작업을 반영했다(미커밋). 25개 항목의 최초 점검 이후 Safety 코드 수정과 전체 회귀 테스트·운영 health 재점검을 수행했다. 외부 운영/사용자 자료가 없는 항목은 미확인으로 기록하며 구현 파일만으로 완료를 판정하지 않는다.

## 판정 기준

작업 전체 상태 보고에는 [7개 항목 공통 양식](ONARIA_GATES.md#작업-전체-보고-양식)을 사용한다. 기능별 상세와 작업 전체 보고를 구분하고, 상태는 해당 근거가 있는 범위에 한정한다.

- CODE: 명시한 범위의 코드 구현. 부분은 앱 연결·저장·운영 경로 등 필수 부분이 남은 상태다.
- TEST: 해당 구현의 자동 검증. mock 통과는 실제 OpenAI·서버 연결 성공을 뜻하지 않는다.
- REAL: 실제 대상 서버/기기/환경 검증. 로컬 SQLite 검증이나 앱 실행만으로 운영 전체를 완료 처리하지 않는다.
- USER: 실제 사용자 검증 결과. 개발자의 설치·실행 확인이나 합성 데이터 평가로 대체하지 않는다.
- 미확인: 완료 증거 없음. 미구현이라고 단정하지 않는다. 사업 항목의 CODE/TEST는 직접 해당하지 않아 `해당 없음`으로 표시한다.

최근 실행 근거: Safety 보강 후 Flutter 40개 통과·1개 조건부 skip, backend 324개 통과. 정적 분석 error/warning 0·info 8. 운영 HTTPS는 재확인해도 연결 시간 초과다. 기존 APK 설치 성공은 Safety 수정 이전 버전이며 이번 변경의 실기기 검증을 뜻하지 않는다. 상세: [Safety 검증 보고서](SAFETY_VERIFICATION_REPORT.md).

## 25개 항목

아래 표는 전체 현황 요약이다. 개별 기능의 후속 보고·상세 갱신에는 [GATES의 기능별 보고 양식](ONARIA_GATES.md#기능별-보고-양식)을 사용한다: `기능명 / 우선순위 / CODE / TEST / REAL / USER / 근거 파일/테스트 / 남은 리스크 / 다음 행동`. 우선순위는 [ROADMAP](ONARIA_ROADMAP.md)의 단계와 이유를 연결한다.

| 항목 | CODE | TEST | REAL | USER | 근거와 남은 조건 |
| --- | --- | --- | --- | --- | --- |
| Safety / 위기대응 | 핵심 구현 | 핵심 통과 | 미확인 | 미확인 | 앱·서버 위기 감지, 일반 생성 우회와 고정 응답. 실제 단말 위기 흐름·전문가 검토 필요 |
| OpenAI 실제 연결 | 어댑터 구현 | mock 통과 | 미완료 | 미확인 | 실제 제공자 응답·usage 근거 없음. 운영 HTTPS 실패 기록. local fallback을 AI 연결로 인정하지 않음 |
| Psychology Agent | 구현 | 계약·통합 통과 | 미확인 | 미확인 | 구조화된 감정·욕구·말투 계약. 실제 모델 출력과 사용자 품질 검증 필요 |
| Bible RAG | 부분 | 엔진·gate 통과 | 미완료 | 미확인 | 영어 후보 24개 passage, 승인 corpus 0. 활성 index와 실제 검색 평가 없음 |
| 성경 라이선스 | 검토 절차 구현 | gate 통과 | 미완료 | 미확인 | 영어 원자료 사용권 근거 파일 존재, 사람 검토 pending. 한국어 정식 본문 사용 범위 확인 필요 |
| Response Integrator | 구현 | 계약·통합 통과 | 미확인 | 미확인 | 전문 결과 통합·응답 schema 검증. 실제 모델부터 단말 출력까지 E2E 필요 |
| 7화면 MVP | 부분 | 주요 흐름 통과 | 부분 | 미확인 | 감정·대화·말씀·실천·카드·저장 카드·가입 관련 구현. 사용자가 뜻한 정확한 7화면 명세는 미확정. 설치·실행만 실기기 확인 |
| Persistent Memory | 부분 | 영속 대화 복원 미확인 | 미확인 | 미확인 | 서버 요약은 Map 메모리. 마음 카드 기기 저장과 회원/비용 SQLite는 영속 대화 메모리와 별개 |
| 익명 Analytics | 부분 | 수집·집계 E2E 미확인 | 미확인 | 미확인 | 로컬 이벤트·집계 카운터 존재. 사용자 코호트 수집 transport와 운영 대시보드 연결 근거 없음 |
| 재방문 알림 | 부분 | 전용 기능 검증 미확인 | 미확인 | 미확인 | 예약·권한·설정 UI 존재. 앱 루트/설정 진입 연결, 백그라운드 수신·탭 복귀 검증 필요 |
| 십자가 미니게임 | 부분 | 전용 기능 검증 미확인 | 미확인 | 미확인 | 게임 로직·화면 존재, 주요 앱 메뉴 진입 연결 없음 |
| 마음카드/말씀 공유 | 부분 | 실제 공유 기능 검증 미확인 | 미확인 | 미확인 | 렌더러·공유 미리보기 존재. 화면 연결과 공유시트 검증 필요. 이미지 저장 채널의 네이티브 처리 구현 미확인 |
| 이스터에그/가벼운 게임화 | 부분 | 전용 기능 검증 미확인 | 미확인 | 미확인 | 성취·여정·이스터에그 코드 존재, EngagementScope 앱 루트 연결 없음 |
| Closed Beta 50명 | 해당 없음 | 해당 없음 | 미확인 | 미확인 | 실제 참여자·배포·동의·사용·피드백 기록 필요 |
| D7 Retention | 집계 구현 미확인 | 산식 검증 미확인 | 미확인 | 미확인 | 7일 여정과 D7 retention은 별개. 코호트·재방문 정의와 관찰기간을 갖춘 실측 필요 |
| 100명 교회 PoC | 해당 없음 | 해당 없음 | 미확인 | 미확인 | 교회 합의·실참여·운영 결과·피드백 자료 필요 |
| Premium 검증 | 부분 | 권한·quota 통과 | 미확인 | 미확인 | 서버 entitlement와 비용 등급 구현. 실제 로그인 토큰 발급 연결·결제·유료 전환 검증 없음 |
| AI Cost Controller | 핵심 구현 | 정책·영속성 통과 | 부분 | 미확인 | 실제 임시 SQLite/localhost smoke 기록, 모델과 요금은 mock. 운영 청구 대조·embedding 비용 통합 남음 |
| CAC/LTV | 산출 구현 미확인 | 산식 검증 미확인 | 미확인 | 미확인 | 채널별 획득비·유료 전환·매출·유지/이탈·원가 실측 없음 |
| 다종교 RAG | 부분 | 라우팅·검색 통과 | 미완료 | 미확인 | 7전통 namespace·샘플·검증 엔진 존재. 전통별 승인 자료와 운영 검색 평가 필요 |
| 7종교 플랫폼 | 부분 | 전문 모듈 통과 | 미확인 | 미확인 | 7전통 에이전트 구현. 앱 경험·자료 승인·전문가 검수·운영 검증은 미완료 |
| Marketing Agent 자동화 | 미확인 | 미확인 | 미확인 | 미확인 | 전용 마케팅 실행 파이프라인·성과 피드백 루프 근거 없음 |
| App Ops 자동화 | 부분 | 운영 자동화 검증 미확인 | 미확인 | 미확인 | 관리자 웹·배포 스크립트·health 존재. 자동 감지·복구·롤백 운영 근거 없음 |
| GitHub Dev/QA 자동화 | 부분 | 워크플로 실행 미확인 | 미확인 | 미확인 | push/manual Flutter test·debug APK workflow 존재. backend QA·PR 검증·개발 에이전트 자동화 미확인 |
| Chief Agent 자동화 | 미확인 | 미확인 | 미확인 | 미확인 | 대화용 orchestrator는 존재하지만 사업·개발·운영 총괄 자동화와는 별개 |

## 주요 근거

### Safety / 위기대응 상세

기능명: Safety / 위기대응

우선순위: R0 — 핵심 연결 복구와 함께 우선 검증하는 제안 순서.

CODE: 완료(이번 보강 범위) — 판정 차이·위기 세션 보존·fallback 선차단·고정 위기 UI·오류 비노출 보강. 전체 Safety의 운영/사용자 완료는 아님.

TEST: 완료(실행 범위) — Flutter 40개·backend 324개 통과, Flutter 조건부 skip 1개. 공유 표현 43개, 7전통 선차단·위기 보존·오류 비노출·고정 UI 검증. 모델은 mock이며 실제 제공자 호출을 하지 않았다.

REAL: 부분 완료 — 실제 로컬 HTTP 및 배포 smoke 13건 검증. 운영 HTTPS는 재확인 시 curl 28·HTTP 000. 운영 배포·실기기 검증은 미완료.

USER: 미확인 — 전문가·대상 사용자의 위기 안내 이해도·접근성 검증 근거 없음.

근거 파일/테스트: [앱 감지 테스트](test/crisis_detector_test.dart), [위험 단계별 호출 0회](backend/test/orchestrator.test.js), [HTTP 위기 선차단·provider 실패 fallback](backend/test/chat_integration.test.js), [오류·timeout·출력 실패](backend/test/conversation_service.test.js), [fallback 사유 검증](backend/test/phase2_service.test.js), [비용 저장 장애 시 safety 우선](backend/test/cost_integration.test.js), [서버 호출 순서](backend/src/app.js), [기존 실행 기록](BUILD_REPAIR_REPORT.md).

남은 리스크: 기존 표현 집합 밖의 누락/오탐, 운영 배포·설정 차이, 실제 장애 상황 미검증. 서버 공통 앱 인증과 요청 형식 검증은 safety보다 앞서므로 모든 잘못된 요청에 위기 응답이 반환되는 구조는 아님.

다음 행동: 운영 접속 정보를 확보해 HTTPS를 복구하고, 대상 버전에서 합성 위험 입력의 위기 응답·제공자 호출 없음과 격리된 환경의 fallback을 확인한다. 이후 전문가 및 사용자 검증 결과를 기록한다.

| 사용자 지정 조건 | 현재 판정 |
| --- | --- |
| 기존 safety test 통과 | 기존 자동 테스트 범위 통과 |
| 고위험/자해/자살 표현 테스트 통과 | 기존 표현 집합 범위 통과 |
| OpenAI 호출 전에 safety가 실행됨 | 코드 순서와 mock 제공자 호출 0회 검증 근거 있음 |
| 실제 서버 환경 검증 | 미완료 |
| fallback 검증 | 자동 테스트 통과, 실제 서버 장애 검증 미완료 |

### 전체 항목 근거

- Safety: [앱 감지](lib/src/safety/crisis_detector.dart), [서버 감지](backend/src/agents/safety_agent.js), [앱 테스트](test/crisis_detector_test.dart), [서버 통합 테스트](backend/test/chat_integration.test.js).
- AI와 통합: [서비스 활성화 조건](backend/src/conversation_service.js), [Psychology](backend/src/agents/psychology_agent.js), [Integrator](backend/src/agents/response_integrator.js), [전문 모듈 테스트](backend/test/phase3_agents.test.js), [오케스트레이션 테스트](backend/test/orchestrator.test.js).
- RAG·자료: [A-track 보고서](backend/PHASE_9_CHRISTIANITY_A_TRACK.md), [readiness](backend/evaluation/phase9-results/readiness.json), [다종교 검색 테스트](backend/test/knowledge_rag.test.js), [vector 테스트](backend/test/vector_rag.test.js). 저장된 readiness는 `BLOCKED_NO_APPROVED_CORPUS`이며 전문가 검토도 차단 상태다. 여기서는 법적 사용 가능성을 독립 판정하지 않았다.
- 메모리: [서버 Map 저장](backend/src/memory_store.js), [기기 카드 저장](lib/app/mind_card_store.dart).
- 앱 연결: [앱 루트](lib/app/onaria_app.dart), [메뉴](lib/features/check_in_page.dart), [기능별 연결 현황](PROCESS_CODE_MAP.md). 기존 안내 문서의 과거 테스트 수는 최신 검증 기록과 구분한다.
- 참여·지표: [로컬 이벤트 계약](lib/engagement/domain_events.dart), [컨트롤러](lib/engagement/engagement_controller.dart), [알림](lib/engagement/notifications/native_notifications.dart), [공유](lib/engagement/sharing/native_share.dart), [게임](lib/engagement/mini_games/cross_light/cross_light_game.dart).
- Premium·비용: [인증 통합](IDENTITY_INTEGRATION_REPORT.md), [영속 비용 원장 검증](AI_COST_GATE_PERSISTENCE_REPORT.md), [비용 테스트](backend/test/cost_integration.test.js), [SQLite 테스트](backend/test/sqlite_usage_ledger.test.js).
- 운영·QA: [GitHub workflow](.github/workflows/build-android.yml), [배포 스크립트](script/deploy-backend.ps1), [최신 테스트·단말 기록](BUILD_REPAIR_REPORT.md).

## 권장 진행 순서

진행 순서·의존성·다음 행동은 [ONARIA_ROADMAP.md](ONARIA_ROADMAP.md)에서 관리한다. 항목별 완료 조건과 증거 형식은 [ONARIA_GATES.md](ONARIA_GATES.md)를 따른다. 계획이나 완료 기준이 작성됐다는 이유로 위 현황을 완료로 변경하지 않는다.

사업·사용자 실적은 사용자에게 별도 자료가 있을 수 있다. 이 문서의 미확인을 실제 미실행으로 단정하지 않는다. 사용자의 이 목록을 전체 기능 구현·자동 마케팅 발신·운영 배포 승인으로 해석하지 않았다.
