# ONARIA / MindBible

PROJECT=ONARIA
TYPE=Flutter + Node.js + AI + Web/Admin

## 프로젝트 우선순위
1. Safety
2. Religion integrity
3. API reliability
4. AI cost
5. Android/iOS
6. Web/Admin

PRODUCTION_API=https://api.onaria.ai.kr
WEBSITE=https://onaria.ai.kr
ADMIN=https://onaria.ai.kr/admin

## 프로젝트 규칙
- release signing은 기존 android/soul-bible-release.jks를 재사용한다.
- 정식 실기기 업데이트는 Release 계열로 통일한다. USB/무선 설치는 scripts/install-onaria-release.ps1 경로를 재사용하고 인증서·package·버전 검증 후 adb install -r만 실행한다.
- debug/release 설치를 혼용하지 않는다. Flutter run/IDE Run과 CI Debug APK를 정식 앱 업데이트에 사용하지 않는다.
- .debug suffix는 데이터·로그인·딥링크·알림·provider authority 영향 분석과 사용자 승인 후에만 적용한다.
- production API에서 http/localhost/127.0.0.1/raw IP/기존 Cafe24 도메인을 금지한다. 기존 Debug override는 보존한다.
- RAMI/K-Stock은 수정하지 않는다. 별도 프로젝트 지침 작성처럼 사용자가 명시한 범위만 예외로 한다.
- crisis input은 modelCalls=0, OpenAI client 생성=0, Psychology/Religion 호출=0 및 고정 local crisis 응답을 보장한다. Safety parity와 false-positive 회귀를 유지한다.
- RAG 근거 없는 경전·교리를 생성하지 않는다. 종교 인용 무결성을 비용보다 우선한다.
- Cafe24 배포는 CI artifact 방식이며 승인 없이 운영 서버를 변경하지 않는다.
- Web/Admin 인증·CSRF·민감 데이터 cache 정책과 기존 API contract를 보존한다.
- 코드 영향에 따라 backend tests, Flutter tests, flutter analyze lib test example --no-fatal-infos, Android debug/release build, web/browser/security tests를 실행한다. iOS simulator compile은 가능한 macOS 환경 또는 CI에서 확인한다.
- 실기기 NFC 등 다른 프로젝트 검증을 ONARIA 검증으로 대체하지 않는다.

## 공통 자동 작업 규칙

사용자가 "다음 단계 진행해"라고 요청하면 이 파일을 먼저 읽고 다음 순서를 따른다.
이 파일은 요청받은 작업의 실행 지침이며, 무인 상시 실행이나 별도 스케줄러를 만들지 않는다.

1. 현재 경로와 적용되는 AGENTS.md, package/pubspec/project 파일, git remote, 폴더명 순서로 프로젝트를 식별한다.
2. git status, git branch --show-current, git rev-parse HEAD, git remote -v를 확인한다. remote에 인증정보가 포함되면 값을 숨겨서 보고한다.
3. 기본 브랜치는 main이다. origin/main을 fetch하여 비교하고 기존 작업을 보존한다. dirty 상태에서 강제 reset/checkout/stash를 하지 않는다. 필요하면 별도 작업 트리를 사용한다.
4. 최근 CI 실패, 테스트, 코드와 미완료 문서를 근거로 문제를 수집한다. 과거 대화의 성공 보고를 현재 검증 결과로 간주하지 않는다.
5. P0 보안/Safety/데이터 손실, P0 실행/빌드 불가, P1 API/네트워크/인증, P1 서명/배포, P1 핵심 기능, P2 성능/비용, P2 UI/UX, P3 문서/정리 순서로 우선순위를 정한다. 같은 위험도 안에서는 아래 프로젝트 우선순위를 따른다.
6. 가장 높은 우선순위의 구체적인 작업 하나를 선택하고 분석 → 계획 → 구현 → 테스트 → 리뷰 → 수정 → 재테스트를 진행한다. 문제를 찾지 못하면 불필요한 변경을 만들지 않는다.
7. 변경 전 관련 테스트를 실행하고 변경 후 관련 테스트와 변경 영향에 맞는 회귀 테스트를 실행한다. 기존 CI 명령을 우선 재사용한다. 문서만 변경하면 경로·내용·차이·secret 검사를 수행하고 불필요한 전체 빌드는 피한다.
8. 테스트 실패를 수정하고 재실행한다. 미검증·실패 상태를 PASS로 표시하지 않는다. 실패 상태에서는 push하지 않는다.
9. 수용 기준 통과 후 git status, git diff 및 커밋 대상 전체 secret 검사를 확인한다. 이번 작업 파일/변경만 선택하여 짧고 목적에 맞는 메시지로 commit/push한다. 다른 기존 변경을 섞지 않고 force push하지 않는다.
10. 정확한 커밋 SHA의 GitHub Actions를 확인한다. 경로 필터로 실행되지 않은 작업은 미실행으로 표시한다. 로컬 검증·CI·실서버·실기기 결과를 구분해 보고한다.
11. Git 저장소나 remote가 없거나 접근이 차단되면 생성/교체를 추측하지 말고 가능한 로컬 작업을 완료한 뒤 제한을 보고한다.

## 안전 및 승인 경계

- .env, API key, password, token, keystore password, private key를 출력하거나 Git에 넣지 않는다. 예시에는 실제 값 대신 placeholder만 사용한다.
- 기존 미커밋 변경과 사용자 데이터를 보존한다. 다른 프로젝트 폴더는 명시적으로 허용된 작업 이외에 수정하지 않는다.
- adb uninstall, pm clear, 운영 DB 삭제/초기화는 금지한다.
- production server를 자동 변경하거나 재시작하지 않는다.
- production DB migration, keystore 변경/교체, applicationId/package name 변경, 운영 서버 재시작, 실거래, 유료 외부 API 대량 호출, 데이터 삭제 가능 작업은 사용자 승인 전에 실행하지 않는다.
- 승인 판단이 필요한 작업과 독립적인 안전한 분석·테스트는 계속 진행한다. 비밀값을 채팅으로 요청하지 않는다.
- 기기가 unauthorized이면 설치를 중단하고 휴대폰에서 USB 디버깅 허용을 안내한다. 서명 불일치나 버전 다운그레이드를 강제로 우회하지 않는다.

## 완료 보고

다음 YAML 항목으로 결과를 보고한다. 실행하지 못한 항목은 이유와 함께 NOT RUN으로 표시한다.

PROJECT:
CURRENT COMMIT:
ISSUE FOUND:
PRIORITY:
ROOT CAUSE:
IMPLEMENTED:
CHANGED FILES:
TEST:
BUILD:
DEVICE:
API:
CI:
COMMIT:
PUSH:
REMAINING RISKS:
NEXT ACTION:
