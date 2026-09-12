# AI API 제외 앱 개발 — 2026-09-11

> 과거 작업 기록입니다. 테스트 수·버전·실기기 상태는 작성 당시의 결과이며, 현재 상태는 [ONARIA_STATUS](../../ONARIA_STATUS.md)를 확인하세요.

현재 Gate: R2 앱 기능 CODE·TEST, R6 CI 설정 CODE. 아래 범위의 기능 개발을 진행했으며, 전체 로드맵이나 운영·사용자 검증의 완료를 뜻하지 않는다. AI API 구현·호출·키 변경은 이번 작업에서 제외했다.

## 완료된 항목

- **7일 마음의 여정**: 메인 메뉴 및 말씀 기록 화면에서 시작, 하루 한 번 마음·한 줄 기록, 날짜가 바뀌거나 며칠 쉬어도 이어가기, 이전 기록 열람, 완료 카드 미리보기, 확인 후 전체 여정 삭제. 화면 복귀와 자정에 날짜 조건을 갱신한다. 저장 실패 시 입력을 보존하고 재시도할 수 있다.
- **여정 영속성과 보상**: 기록과 성취·완료 횟수를 함께 저장하고 실패 시 함께 복구한다. 같은 날짜의 중복 요청을 직렬 처리하며 완료 이벤트 재전달로 완료 횟수를 늘리지 않는다. 여정 삭제는 개인 기록을 지우고 기존 말씀 저장·성취 기록은 유지한다는 점을 확인창에 설명한다.
- **이미지 파일 저장**: 공유 미리보기의 PNG를 Android/iOS 네이티브 저장창에 전달한다. 사용자가 파일 저장 위치를 선택하며 성공·취소·실패를 구분한다. 저장 실패 후 재시도 가능하며 저장을 공유 완료 통계로 세지 않는다. 렌더링 도중 화면을 닫으면 저장창을 열지 않는다.
- **저장 카드 관리**: 스와이프 삭제 후 목록·빈 상태를 갱신한다. 삭제 버튼, 취소, 읽기 오류 재시도, 삭제 실패 시 카드 유지와 안내를 추가했다. 작은 화면에서 날짜·에이전트 이름이 넘치지 않도록 조정했다.
- **알림 복구**: 초기화 실패 후 다시 확인할 수 있다. 권한은 설정에서 사용자가 켤 때 요청한다. 위기 중지는 초기화 실패·복구·재시작에도 유지하고, 이전에 시작한 설정 요청으로 중지를 해제하지 않는다.
- **자동 검증 설정**: main 대상 PR, main push, 수동 실행에서 외부 AI 호출을 끈 backend 테스트를 실행한다. 통과 후 Flutter 테스트·정적 분석·Android debug 빌드 및 macOS의 iOS simulator 컴파일을 수행하도록 구성했다. Flutter 3.47.2를 고정하고 기존 플랫폼 파일을 재생성하던 단계를 제거했다. PR에서는 APK를 업로드하지 않는다. 워크플로는 로컬에서 작성했으며 GitHub 실행은 아직 확인하지 않았다.

## 미완료 항목

Android 실제 저장창·외부 공유앱·알림 수신·재부팅 검증, iOS 컴파일·기기 검증, GitHub Actions 실제 실행, 사용자 피드백 검증은 남아 있다. 이번 ADB 조회의 연결 기기는 0개다. 이미지 저장은 사진 보관함 자동 추가가 아니라 파일 저장창을 사용한다. Windows/Web의 직접 저장은 아직 제공하지 않으며 해당 버튼을 숨긴다.

로드맵의 서버 Analytics transport·D7 집계, 본인인증/결제 제공자 연결, 자료 사용 승인, 베타·교회 PoC·사업 측정 등은 이번 범위에서 완료 처리하지 않는다. 7일 여정의 완료 횟수는 D7 retention을 뜻하지 않는다.

## 가장 큰 리스크

네이티브 저장·알림·공유 동작은 OS와 대상 앱에 의존한다. Windows에서는 iOS Swift를 컴파일하지 못했으므로 iOS는 구현 근거만 있으며 성공으로 판정하지 않는다. Android 빌드 성공은 저장창의 실기기 동작 확인을 대신하지 않는다. 기존 성경 자료 승인 상태도 변경하지 않았다.

## 다음 3개 작업

1. Android 기기에서 이번 APK로 여정 기록·이미지 저장·공유·알림을 확인하고 실패·취소까지 기록한다.
2. GitHub에서 추가한 PR 검증과 macOS iOS 컴파일을 실행한 뒤 iOS 기기 저장·알림 흐름을 검증한다.
3. 베타에 필요한 수집 동의·이벤트·코호트/D7 정의를 확정하고 측정 경로를 구현한다.

## 생성/수정한 파일

- [여정 화면](../../lib/engagement/journey/journey_page.dart), [여정·보상 저장](../../lib/engagement/engagement_controller.dart), [메뉴](../../lib/features/check_in_page.dart), [말씀 기록 화면](../../lib/engagement/engagement_page.dart)
- [Android 저장](../../android/app/src/main/kotlin/com/example/bible_mind_core/MainActivity.kt), [iOS 저장](../../ios/Runner/AppDelegate.swift), [Dart 저장 연결](../../lib/engagement/sharing/native_share.dart), [공유/저장 화면](../../lib/engagement/sharing/share_preview_page.dart)
- [저장 카드 관리](../../lib/features/saved_cards_page.dart), [알림 컨트롤러](../../lib/engagement/notifications/reminder_controller.dart), [알림 설정](../../lib/engagement/notifications/notification_settings_page.dart)
- [CI](../../.github/workflows/build-android.yml), [현황](../../ONARIA_STATUS.md), [로드맵](../../ONARIA_ROADMAP.md)
- [여정 도메인 테스트](../../test/journey_test.dart), [여정 화면 테스트](../../test/journey_page_test.dart), [이미지 저장 테스트](../../test/image_export_test.dart), [카드 관리 테스트](../../test/saved_cards_page_test.dart), [알림 복구 테스트](../../test/reminder_recovery_test.dart), [테스트 대역](../../test/support/engagement_fakes.dart)

## 기존 테스트 영향

검증 환경: Windows, Flutter 3.47.2 / Dart 3.13.2. 여정·저장·삭제·알림의 테스트는 저장 실패와 네이티브 gateway 대역을 포함한다. 이미지 테스트는 실제 PNG 렌더링 결과와 전달 바이트를 비교한다. 기존 AI 관련 테스트는 mock/로컬 fixture이며 실제 제공자를 호출하지 않는다.

- `flutter test --no-pub`: **60개 통과**, 기존 조건부 skip 1개, 실패 0. 신규 13개 테스트를 포함한다.
- `flutter analyze --no-pub --no-fatal-infos`: error/warning 0, 기존 info 6개, 종료 코드 0.
- backend `npm test`: `SOUL_EXTERNAL_API_DISABLED=true`, `SOUL_AI_MODE=local`, API 키 미설정으로 **333개 통과**, 실패·skip 0. backend 제품 코드는 변경하지 않았다.
- `flutter build apk --debug --no-pub`: 최종 코드로 Android debug APK 생성 성공(종료 코드 0). 경로: [테스트 APK](../../build/app/outputs/flutter-apk/app-debug.apk). KGP·SDK XML 호환 안내가 있었으며 실행 가능성을 실기기에서 확인한 것은 아니다.
- 테스트 로그는 로컬 `build/flutter-non-ai-tests.log`, `build/backend-non-ai-tests.log`, `build/android-non-ai-build.log`에 보관한다. 비밀 값·사용자 대화 원문을 기록하지 않는다.

## 플랫폼 구현 근거

Android는 `ACTION_CREATE_DOCUMENT`와 선택된 URI의 출력 스트림으로 저장한다. [Android 문서 파일 접근 안내](https://developer.android.com/training/data-storage/shared/documents-files)를 따랐다. iOS는 문서 선택기의 복사 내보내기를 사용한다. [Apple 문서 선택기 API](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller/init%28forexporting%3Aascopy%3A%29)를 참고했다. iOS Flutter 채널은 implicit engine 초기화 콜백에 등록했다. [Flutter 플랫폼 채널 문서](https://docs.flutter.dev/platform-integration/platform-channels)에 해당 수명주기 지침이 있다.
