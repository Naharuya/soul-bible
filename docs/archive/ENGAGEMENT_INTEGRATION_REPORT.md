# 참여 기능 앱 연결 — 2026-09-10

> 과거 작업 기록입니다. 테스트 수·버전·실기기 상태는 작성 당시의 결과이며, 현재 상태는 [ONARIA_STATUS](../../ONARIA_STATUS.md)를 확인하세요.

후속 기록: 2026-09-11의 여정 UI·이미지 파일 저장·삭제/알림 복구 구현과 최신 테스트 결과는 [AI API 제외 개발 보고서](NON_AI_DEVELOPMENT_REPORT.md)를 참고한다. 아래는 최초 연결 당시 기록이다.

현재 Gate: R2의 앱 연결 CODE·TEST 완료(아래 범위). REAL·USER 미확인.

완료된 항목:
- 앱 루트에 EngagementScope와 컨트롤러 수명주기 연결. 시작·복귀 시 알림 상태 갱신, 초기화에서는 권한을 요청하지 않는다.
- 메인 메뉴에서 말씀과 작은 기록, 십자가 미니게임, 알림 설정으로 이동하고 뒤로 돌아올 수 있다.
- 오늘의 말씀, 말씀 저장·해제, 저장한 말씀 목록, 획득한 성취·이스터에그 표시 연결.
- 말씀 및 저장된 마음 카드에서 공유 미리보기 진입. 개인 대화·감정·메모리와 저장 카드의 임의 본문은 공유 콘텐츠에 복사하지 않는다.
- 마음 카드 저장 완료 이벤트 연결. 위기 지원 UI를 즉시 표시하면서 알림 중지를 비동기로 요청한다. 중지된 상태에서 알림 탭은 다른 화면을 열지 않는다.
- 말씀 알림은 말씀 화면, 저장한 말씀 알림은 저장 목록을 연다. 체크인·안부 알림으로 복귀할 때 이미 열린 화면이나 대화를 닫지 않는다.

미완료 항목: 실제 알림 수신·권한·재부팅·시간대·공유시트 검증, 이미지 직접 저장, 7일 여정 UI, 서버 Analytics transport·D7 측정, 사용자 수용 검증. 이미지 직접 저장은 플랫폼 핸들러가 없어 버튼을 노출하지 않는다. 기존 share_plus 시스템 공유 경로를 사용한다.

가장 큰 리스크: 테스트의 알림·공유 gateway는 fake다. 실제 기기의 OS 권한·절전 정책·외부 앱 동작은 검증하지 않았다. 기존 성경 자료 승인·라이선스 상태 역시 이번 UI 연결로 변경되지 않는다.

다음 3개 작업:
1. 대상 Android 기기에서 이번 코드로 빌드하여 알림 허용·거절·수신·탭 복귀·취소를 확인한다.
2. 말씀·마음 카드의 실제 공유 결과와 취소를 확인하고 플랫폼별 이미지 저장을 구현한다.
3. 7일 여정 UI와 측정 정의를 연결한 뒤 베타 사용자 검증을 준비한다.

생성/수정한 파일:
- [앱 루트](../../lib/app/onaria_app.dart), [메인 메뉴](../../lib/features/check_in_page.dart)
- [말씀·기록 화면](../../lib/engagement/engagement_page.dart)
- [알림 초기화](../../lib/engagement/notifications/reminder_controller.dart), [설정 UI](../../lib/engagement/notifications/notification_settings_page.dart)
- [저장 카드](../../lib/features/saved_cards_page.dart), [공유 화면](../../lib/engagement/sharing/share_preview_page.dart)
- [대화 이벤트·알림 중지](../../lib/features/conversation_page.dart)
- [기능 연결 테스트](../../test/engagement_integration_test.dart), [현황](../../ONARIA_STATUS.md), 본 보고서

기존 테스트 영향: Windows에서 `flutter test --no-pub` 실행, 47개 통과·기존 조건부 skip 1개. 신규 7개 테스트는 메뉴 왕복, 알림 거절·탭 라우팅, 말씀 저장·재생성 복원·삭제, 위기 알림 중지, 공유 민감 필드 제외, 게임 완료, 실제 PNG 렌더링과 fake 공유 성공·취소를 검증한다. `flutter analyze --no-pub`는 error/warning 0, 기존 info 8개로 종료 코드 1. backend 코드는 변경하지 않았으며 backend 테스트는 재실행하지 않았다. APK 생성·설치·운영 배포는 수행하지 않았다.
