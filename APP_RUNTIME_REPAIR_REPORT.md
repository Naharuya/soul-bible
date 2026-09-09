# 앱 런타임 오류 수정 결과

점검일: 2026-09-08 (Asia/Seoul). 브랜치: `main`.

기존 미커밋 변경을 유지했다. 서버 설정, 운영 DB, .env 및 secret 값은 직접 읽거나 수정하지 않았다. Android 빌드는 기존 Gradle 서명 설정을 사용했다. 기존 보고서는 과거 기록으로 보존했다.

## 수정

- `lib/features/conversation_page.dart`: 비동기 응답·말씀 조회·오류 처리 후 화면 생존 여부를 확인하여 화면을 닫은 뒤 setState 호출을 방지했다. 잘못된 API override는 데모로 전환하지 않고 설정 오류를 표시한다. 기존 로컬 위기 감지와 대화 상태 전이 순서는 유지했다. 테스트용 클라이언트 주입을 추가했으며 외부에서 주입한 클라이언트는 화면에서 닫지 않는다.
- `lib/features/check_in_page.dart`, `signup_page.dart`: 기존 첫 화면을 유지하고 메뉴에 회원가입 진입점을 연결했다. 회원가입 화면에 뒤로 가기를 제공하고 성공 시 기존 화면으로 돌아간다. 연결 실패 시 내부 예외 문자열 대신 사용자 안내를 표시한다.
- `backend/package.json`, `package-lock.json`: better-sqlite3를 Node 20/24 지원 버전 12.11.1로 고정하여 로컬 Node 24의 네이티브 바인딩 누락을 해결했다. 실제 회원 DB를 열지 않고 임시 DB로 저장·재열기·중복 번호 거절·관리자 마스킹을 검증했다.
- `pubspec.yaml`, `pubspec.lock`: 테스트가 직접 사용하는 shared_preferences_platform_interface를 개발 의존성으로 명시했다. 기존 간접 의존성 버전을 유지했다.
- `ios/`: 누락된 Xcode 프로젝트·workspace·Swift 진입점·storyboard·기본 리소스를 Flutter 템플릿으로 복구했다. 기존 Info.plist 권한과 표시 이름을 유지하고 Scene 설정 및 CocoaPods 연결을 추가했다.
- 회귀 테스트: `test/conversation_lifecycle_test.dart`, `test/widget_test.dart`, `backend/test/member_store.test.js`.

## 검증

| 항목 | 결과 |
| --- | --- |
| flutter pub get | 성공 |
| flutter analyze | error 0, warning 0, info 7; info 때문에 기본 명령 종료 코드 1 |
| flutter test | 31개 통과, override 전용 테스트 1개는 기본 실행에서 skip |
| flutter test test/conversation_lifecycle_test.dart --dart-define=SOUL_BIBLE_API_BASE_URL=http://lightshare8.mycafe24.com | 3개 모두 통과; 기본 실행에서 skip한 설정 오류 테스트 포함 |
| Backend npm.cmd test | 272개 통과, 실패/skip 0; 실제 SQLite 회귀 테스트 포함 |
| iOS Info.plist / Android Manifest XML | UTF-8 파싱 성공 |
| flutter build apk --release | 성공 |
| APK apksigner verify | 성공 |
| flutter build appbundle --release | 성공 |

남은 info는 example의 avoid_print 4개, unnecessary_library_name 1개, 기존 native_share의 unnecessary_import 2개이다. 기존 테스트 의존성 관련 info 8개는 해소되었다.

## 새 Android 산출물

| 파일 | 크기 | 생성 시각 (Asia/Seoul) |
| --- | --- | --- |
| build/app/outputs/flutter-apk/app-release.apk | 52,591,582 bytes | 2026-09-08 23:54:01 |
| build/app/outputs/bundle/release/app-release.aab | 51,746,114 bytes | 2026-09-08 23:54:55 |

기본 주소 `https://api.onaria.ai.kr`, 경로 `/v1/mind/chat`을 사용하는 현재 소스로 재빌드했다. SOUL_BIBLE_API_BASE_URL override와 debug localhost/10.0.2.2 예외는 유지한다. 운영 HTTP는 차단하며 이전 HTTP 주소로 fallback하지 않는다.

## 남은 외부 검증 및 미구현 기능

- 서버 외부 443 연결은 별도 점검 대상이다. 운영 API 왕복 통신 및 서버 인증 설정의 적합성은 검증하지 않았다.
- iOS는 프로젝트 구조 복구까지만 완료했다. macOS/Xcode에서 의존성 설치·빌드·서명·실기기 검증이 필요하며 기본 아이콘과 com.example 식별자는 정식 배포용 확정이 필요하다.
- 네이버·카카오·Google 로그인은 기존 준비 중 상태이다. 실제 OAuth 인증과 서버 세션 구현이 필요한 별도 기능이며 이번 수정으로 로그인 완료 상태를 가장하지 않는다.
- Android 실기기 음성 입력·TTS·알림 및 Play Console 업로드 검증은 수행하지 않았다. 기존 Kotlin Gradle 플러그인 향후 호환성 및 Java native access 경고가 남아 있으나 현재 APK/AAB 빌드는 성공했다.
- 커밋, 운영 서버 배포, 스토어 업로드는 수행하지 않았다.
