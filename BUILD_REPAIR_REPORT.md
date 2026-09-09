# SoulBible 빌드 복구 보고서

## 2026-09-08 개인정보·보안 후속 점검

아래 과거 빌드 기록 이후 HTTPS only, redirect 차단, 로그 최소화, 관리자 개인정보 마스킹 및 배포 예시의 평문 차단을 적용했다. 상세 내용과 미해결 출시 차단 항목은 [SECURITY_PRIVACY_REVIEW.md](SECURITY_PRIVACY_REVIEW.md)를 따른다. 운영 HTTPS 연결은 timeout으로 검증하지 못했으며, 빌드 성공은 출시 보안 승인을 뜻하지 않는다.

- 최종 분석: error 0, warning 0, 기존 info 15 (`flutter analyze --no-fatal-infos`, 종료 코드 0).
- 최종 Flutter 테스트: 28개 통과. Backend 회귀 테스트: 271개 통과. 실제 SQLite native binding은 이 환경에서 누락되어 운영 DB 동작 검증은 별도 필요.
- 보안 수정 반영 Release APK 빌드 성공 및 실물 확인: `C:\Users\SJ\AndroidStudioProjects\soul-bible\build\app\outputs\flutter-apk\app-release.apk`, 52,410,846 bytes, 2026-09-08 14:20:11 (Asia/Seoul).
- 보안 수정 반영 Release AAB 빌드 성공 및 실물 확인: `C:\Users\SJ\AndroidStudioProjects\soul-bible\build\app\outputs\bundle\release\app-release.aab`, 51,620,063 bytes, 2026-09-08 14:20:55 (Asia/Seoul).
- 기존 서명 설정 유지. 운영 배포·secret 변경·커밋은 하지 않았다. 이전 Debug APK는 이번 보안 수정 반영 대상으로 재빌드하지 않았다.

이하 APK 크기·생성 시각·테스트 수는 이전 빌드 복구 단계의 기록이다. 현재 산출물은 위 후속 점검 값을 사용한다.

점검일: 2026-09-08 (Asia/Seoul)

최종 목표: Release APK 및 추가 Release AAB. 두 빌드 모두 종료 코드 0으로 완료했으며 실제 파일 존재를 확인했다.

## 수정 파일과 이유

| 파일 | 수정 내용 및 이유 |
| --- | --- |
| `lib/engagement/mini_games/cross_light/cross_light_page.dart` | 47행에서 누락된 `Semantics` 닫는 괄호 하나 추가. 다음 행의 문법 오류 3개 해결. |
| `android/app/build.gradle.kts` | Core library desugaring 활성화 및 `com.android.tools:desugar_jdk_libs:2.1.4` 추가. Debug 복구 때 추가했던 앱 단독 출력 경로 지정은 Release R8 경로 불일치를 해결하기 위해 제거. 기존 release signingConfig 연결 유지. |
| `android/build.gradle.kts` | 주석 처리되어 있던 Flutter 기본 root/subproject 출력 경로 설정 복원. Android 앱 플러그인 적용 전에 경로를 설정하여 ProGuard 기본 파일과 APK/AAB 출력 위치를 일치시킴. |
| `android/app/src/main/res/drawable/ic_notification.xml` | 알림 코드에서 사용하는 `ic_notification` 리소스를 흰색 단색 종 모양 vector drawable로 추가. |
| `android/app/src/main/AndroidManifest.xml` | `RECEIVE_BOOT_COMPLETED`, `ScheduledNotificationReceiver`, `ScheduledNotificationBootReceiver` 추가. Boot receiver에 `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `QUICKBOOT_POWERON`, `com.htc.intent.action.QUICKBOOT_POWERON` action 등록. 두 receiver는 `exported=false`. |
| `.gitignore` | iOS 생성 설정 파일 2개 및 `ios/Flutter/ephemeral/` 제외 규칙 추가. 해당 생성 파일 5개는 로컬에 유지하고 Git 추적만 제거. |
| `BUILD_REPAIR_REPORT.md` | 복구 내용, 검증 결과 및 후속 작업 기록. |

Git 추적 제거 대상:

- `ios/Flutter/Generated.xcconfig`
- `ios/Flutter/flutter_export_environment.sh`
- `ios/Flutter/ephemeral/flutter_lldb_helper.py`
- `ios/Flutter/ephemeral/flutter_lldbinit`
- `ios/Flutter/ephemeral/flutter_native_integration.env`

실제 Xcode 프로젝트 소스는 삭제하지 않았다. Java 17 및 compileSdk/targetSdk/minSdk 설정을 유지했다. 현재 Flutter 기본 minSdk는 24이므로 multiDexEnabled는 추가하지 않았다. 예약 알림은 `AndroidScheduleMode.inexactAllowWhileIdle`을 유지하며 exact alarm 권한은 추가하지 않았다. Phase 1~9, Engagement 동작, backend 및 multi-agent 구조를 변경하지 않았고 자동 refactor/import 정리를 수행하지 않았다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `flutter analyze` | error 0, warning 0, info 15. 기본 명령은 info로 종료 코드 1. 최종 경로 수정 후 `flutter analyze --no-fatal-infos`로 같은 결과 및 종료 코드 0 확인. 기존 info는 수정하지 않음. |
| `flutter test` | 24개 통과, 종료 코드 0. |
| Backend `npm.cmd test` (`backend/`) | 기존 `node --test` 회귀 테스트 269개 통과, 실패/취소/건너뜀 0, 종료 코드 0. PowerShell의 npm.ps1 실행 정책 제한은 npm.cmd로 해결. |
| `flutter build apk --debug` | 최종 빌드 성공, 종료 코드 0. 최초 시도는 APK 출력 위치 불일치로 실패했으며 앱 출력 경로 수정 후 성공. |
| APK 실물 확인 | 아래 경로에 파일 존재 확인. 크기 162,967,077 bytes, 수정 시각 2026-09-08 13:58:00 (Asia/Seoul). |
| `flutter build apk --release` | 최종 성공, 종료 코드 0. 최초 R8 실행은 기존 출력 경로의 ProGuard 파일을 찾지 못해 실패. 루트 Gradle 경로 설정 복원 후 분석·Flutter 테스트·backend 테스트를 재검증하고 재빌드 성공. |
| `flutter build appbundle --release` | 성공, 종료 코드 0. |

Release 빌드 전 재검증에서도 Flutter 테스트 24개, backend 회귀 테스트 269개가 모두 통과했다.

## Release 생성 파일 및 signing 상태

| 산출물 | 실제 경로 | 크기 | 수정 시각 (Asia/Seoul) |
| --- | --- | --- | --- |
| Release APK | `C:\Users\SJ\AndroidStudioProjects\soul-bible\build\app\outputs\flutter-apk\app-release.apk` | 52,410,926 bytes | 2026-09-08 14:07:04 |
| Release AAB | `C:\Users\SJ\AndroidStudioProjects\soul-bible\build\app\outputs\bundle\release\app-release.aab` | 51,623,146 bytes | 2026-09-08 14:07:40 |

- `android/key.properties`: 존재. `storeFile`, `storePassword`, `keyAlias`, `keyPassword` 항목 설정 확인.
- 설정에서 지정한 keystore 파일: 존재 및 Git ignore 적용 확인. `key.properties`도 Git 비추적 및 ignore 적용 확인.
- `buildTypes.release.signingConfig`가 `signingConfigs.getByName("release")`에 연결되어 있으며, 두 Release 빌드에서 기존 서명을 사용했다.
- 임의의 키/비밀번호를 만들지 않았고 secret 값이나 keystore 내용을 출력하거나 커밋하지 않았다.
- APK: Android SDK `apksigner verify` 종료 코드 0으로 서명 검증 통과.
- AAB: JDK `jarsigner -verify`에서 `jar verified` 확인. 자체 서명 인증서/인증서 체인, 타임스탬프 없음, POSIX 속성 및 JarFile/JarInputStream 읽기 방식 간 일관성 경고가 함께 출력됨. Play Console 업로드 검증은 수행하지 않았으며 출시 전에 추가 확인한다.

## 이전 Debug 빌드 기록

APK 상대 경로: `build\app\outputs\flutter-apk\app-debug.apk`

APK 실제 절대 경로: `C:\Users\SJ\AndroidStudioProjects\soul-bible\build\app\outputs\flutter-apk\app-debug.apk`

빌드 중 필요한 CMake 3.22.1이 Android SDK에 자동 설치되었다. 일부 플러그인의 향후 Built-in Kotlin 호환성 경고와 Java native access 경고는 남아 있다. Debug 및 Release 산출물 빌드와 자동 테스트를 확인했으며 실기기 알림 전달/재부팅 복원은 검증하지 않았다.

## 남아 있는 info/lint

요청에 따라 아래 15개 info를 수정하지 않았다.

- `avoid_print`: `example/main.dart` 23, 42, 43, 44행 — 4개.
- `unnecessary_library_name`: `lib/bible_mind_core.dart` 1행 — 1개.
- `unnecessary_import`: `lib/engagement/sharing/native_share.dart` 1, 3행 — 2개.
- `depend_on_referenced_packages`: `shared_preferences_platform_interface` 관련 테스트 import — 8개 (`test/conversation_examples_test.dart` 8, 9행; `test/daily_usage_store_test.dart` 3, 4행; `test/theme_selection_test.dart` 7, 8행; `test/widget_test.dart` 9, 10행).

## 이후 해야 할 작업

1. 실기기에서 알림 권한 요청, small icon 표시, 예약 알림, 재부팅 및 앱 업데이트 후 예약 복원을 확인한다.
2. Play Store 정식 등록 전에 `applicationId`와 `namespace`를 정식 앱 식별자로 변경하는 별도 작업을 수행한다. 현재 둘 다 `com.example.bible_mind_core`임을 확인했으며 이번에는 변경하지 않았다.
3. Release 실기기 설치/실행 및 Play Console 내부 테스트 업로드를 통해 AAB 수락 여부와 기존 키의 업로드 키 적합성을 확인한다. AAB 서명 검증 경고도 확인한다. 키의 보관·백업은 별도 관리한다.
4. 남은 info 15개 및 플러그인의 Built-in Kotlin 호환성 경고는 별도 유지보수 작업으로 처리한다.
5. 이번 Git 추적 제거와 코드 변경을 검토 후 커밋한다. 이번 작업에서는 커밋하지 않았다.
