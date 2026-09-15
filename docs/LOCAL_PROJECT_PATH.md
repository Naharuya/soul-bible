# ONARIA 로컬 경로 변경

Windows 프로젝트 루트는 `C:\Users\SJ\AndroidStudioProjects\ONARIA`입니다.
Android Studio에서 이 폴더를 다시 엽니다. 이전 위치에서 실행한 터미널·개발 서버는 종료 후 새 위치에서 다시 시작합니다.

## 파일과 연결 설정

- `.idea/ONARIA.iml`: 이전 `soul-bible.iml`을 변경하고 `modules.xml` 및 실행 구성의 모듈 참조를 함께 수정했습니다. `.idea`는 Git에서 제외되는 로컬 설정입니다.
- `script/onaria-backend.service`: 로컬 서비스 템플릿 이름입니다. `script/deploy-backend.ps1`의 업로드 원본 참조도 변경했습니다. 원격 대상은 기존 `soul-bible-backend.service`를 유지합니다.
- `script/onaria-http.conf`: 이전 `soul-bible-http.conf`의 새 이름입니다. 과거 보고서의 이전 파일명과 경로는 당시 이력입니다.
- `backend`, `android`, `ios`, `lib` 등 내부 구조는 유지합니다. Flutter의 `source = "../.."` 및 프로젝트 위치를 계산하는 PowerShell 스크립트는 새 루트를 그대로 사용합니다.
- Flutter 패키지 `onaria`, Node 패키지 `onaria-backend`는 이미 변경되어 있습니다.
- 기존 Git worktree 3개(`integrated-20260914`, `rc1-feedback`, `request-errors-20260914`)는 `git worktree repair`로 새 루트의 `build/worktrees` 경로에 다시 연결했습니다. 브랜치와 커밋은 유지합니다.

## 캐시와 빌드

이동 전 절대 경로가 남는 `.dart_tool/flutter_build`, `android/.gradle`, `android/app/.cxx`, iOS 생성 파일은 재생성합니다. 프로젝트 루트에서 `flutter pub get`으로 패키지 설정을 복원합니다. CMake 경로 오류가 남으면 IDE와 빌드를 종료하고 이 프로젝트의 `android/app/.cxx` 캐시를 정리합니다.

현재 `build` 폴더에는 보고서·백업·worktree도 있으므로 전체 폴더를 지우는 `flutter clean`은 사용하지 않습니다. 이번 이동 작업 중 전체 정리를 시작했다가 이 구조를 확인하여 중단했습니다. 중단 전 `build/rollback-backups`와 일부 보관 보고서 및 빌드 산출물이 삭제되었습니다. Git 추적 대상이 아니므로 Git으로 복원할 수 없으며 복구 완료 상태가 아닙니다. 남아 있는 `build/worktrees`와 보관 자료는 유지합니다. `dist`의 기존 Release 파일과 `docs/release-candidates` 기록은 존재하지만 삭제된 자료와 동일한 복사본인지는 확인되지 않았습니다. 향후 보관 자료를 별도 위치로 분리한 뒤 전체 캐시 정리 여부를 판단합니다.

검증 명령:

```powershell
flutter pub get --offline
flutter analyze lib test example --no-fatal-infos
flutter test
flutter build apk --debug
flutter build apk --release
node --test scripts/android-release.test.mjs backend/test/production_deployment.test.js
```

`--offline`은 의존성이 이미 로컬 캐시에 있을 때 사용합니다. iOS 컴파일은 macOS 또는 CI에서 확인합니다. Debug 빌드는 컴파일 검증용이며 정식 실기기 업데이트에는 사용하지 않습니다. 실기기 업데이트는 `scripts/install-onaria-release.ps1`을 사용합니다.

## 보존되는 운영 연결과 데이터

`android/soul-bible-release.jks`, 앱 식별자, 저장 키, 네이티브 채널, 기존 환경 변수 호환성은 유지합니다. `.env`의 비밀값은 변경하지 않습니다.

Git remote, SSH 별칭 `soul-bible-server`, 서버 `/opt/soul-bible` 경로, systemd 서비스, Docker 볼륨은 로컬 폴더명과 별개입니다. 로컬 템플릿 이름 변경은 운영 서버에 적용되지 않습니다. 운영 배포는 CI artifact 절차와 별도 승인 경계를 따릅니다. 기존 `script/deploy-backend.ps1`은 이전 배포 스크립트이며 이번 작업에서 실행하지 않습니다.

## 2026-09-15 로컬 검증

- Flutter 의존성 복원 성공, 분석 오류 없음(예제 `print` 안내 4건).
- Flutter 테스트 150개 통과, API 설정에 따른 기존 조건부 테스트 1개 건너뜀.
- Node 서명 설치·production deployment 테스트 36개 통과.
- Android Debug 및 기존 키를 사용한 Release APK 빌드 성공. Kotlin 플러그인·SDK 관련 기존 경고가 남아 있습니다.
- IDE XML, PowerShell 문법, 템플릿 내용 보존, Git worktree 3개 연결 및 변경 파일 secret 패턴 검사 통과.
- iOS 컴파일은 Windows 환경으로 미실행. 실기기 설치·운영 배포·CI·commit/push는 이번 로컬 경로 수정 범위에서 실행하지 않았습니다.
- 위 빌드 성공은 삭제된 보관 자료 복구를 의미하지 않습니다. 삭제 영향과 복구 미완료 상태는 위 캐시 항목을 참고합니다.
