# ONARIA Android 데이터 보존 업데이트

정식 package는 `com.example.bible_mind_core`, API는 `https://api.onaria.ai.kr`이다. 기존 `android/soul-bible-release.jks`와 로컬 `android/key.properties`를 계속 사용한다. 키와 비밀번호를 Git 또는 CI artifact에 넣지 않는다.

## 단일 업데이트 경로

Windows에서 Node, Flutter, Android SDK build-tools 36.0.0, JDK를 준비한다. SDK는 환경변수 또는 `android/local.properties`에서 찾는다. JAVA_HOME이 없으면 기본 설치 위치의 Android Studio JBR을 탐색한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-onaria-release.ps1
powershell -ExecutionPolicy Bypass -File scripts/install-onaria-release.ps1 -Device DEVICE_SERIAL
```

무선 연결은 기존 `script/test-wireless.ps1`의 페어링·접속 옵션을 사용한다. 연결 후 같은 Release 설치기로 위임한다. `-Release`는 생략해도 되며, `-ApiBaseUrl`은 공식 주소만 허용한다. 개발용 dart-define 자체는 앱에서 유지하지만 이 정식 업데이트 경로에서는 받지 않는다.

설치기는 현재 작업 폴더를 빌드한다. 미커밋 수정까지 포함되므로 배포 담당자는 검증한 소스와 버전을 먼저 확인해야 한다. main의 버전이 휴대폰보다 낮으면 자동 다운그레이드하지 않는다.

1. 기기를 선택하고 device 상태 확인. unauthorized/offline/다중 기기 모호성은 중단한다.
2. 기존 APK 코드만 읽어 인증서와 versionCode 확인. 앱 데이터는 읽지 않는다.
3. 기존 release 키/설정 존재 확인 후 pub get, release APK 빌드.
4. 공식 API define을 명시하고 새 APK의 인증서·패키지·non-debuggable·버전을 검증.
5. 직접 `adb install -r` 한 번만 실행. 실패하면 중단한다.
6. 성공한 경우에만 MainActivity 실행.

도구 전체 로그는 출력하지 않는다. 빌드 오류에 비밀 설정이 섞일 수 있기 때문이다. 인증서 확인용 APK 복사본은 OS 임시 폴더에 남으며 사용자 기록은 포함하지 않는다.

## 혼재 원인과 비교

모든 기존 경로는 suffix 없이 같은 package를 사용했다. USB/무선 자체는 서명을 결정하지 않는다.

| 경로 | buildType | 서명 | 출력 | 설치 |
| --- | --- | --- | --- | --- |
| flutter run / Android Studio 기본 Run | Debug | PC debug | app-debug.apk | Flutter 내부 설치 |
| 이전 wireless 기본 | Debug | PC debug | app-debug.apk | flutter run |
| 현재 USB/wireless 설치기 | Release | 기존 release | app-release.apk | 직접 adb install -r |
| CI APK | Debug | runner debug | onaria-debug-apk / app-debug.apk | artifact만 생성 |
| CI AAB | Debug | runner debug | onaria-debug-aab / app-debug.aab | 직접 설치 불가 |
| flutter build apk --release | Release | 기존 release | app-release.apk | 빌드만 수행 |

APK 경로는 `build/app/outputs/flutter-apk/`, AAB는 `build/app/outputs/bundle/debug/`다. CI 테스트 artifact는 정식 앱 업데이트용이 아니다. CI에는 Release 개인키를 추가하지 않았다. 실제 버전과 달랐던 고정 이름 `onaria-v0.4.0-test-apk`는 `onaria-debug-apk`로 변경했다.

검증된 공개 인증서 SHA-256:

- Release: `692eabafe55986612f5aa3d475cea16e0e5e7db20ce2e09219a2f536f7e8f6bb`
- 현재 PC Debug: `79b4e37bb38e5f61f826c4ae6374c30a889604465e6b37148d38ff2f63441ab3`
- main 0622e4f CI Debug APK/AAB: `94d263d17c4207fc360e9e3a7649cf49e845a837fbc1088ba9cdf899add8daa6` (runner 실행별 변경 가능)

Flutter 3.47.2의 android_device.dart는 설치 실패 후 기존 앱을 삭제하고 재설치를 시도한다. 정식 데이터가 있는 기기에서는 flutter run, flutter install, 기본 Android Studio Run을 업데이트 수단으로 쓰지 않는다. 이번 설치기는 해당 경로를 호출하지 않는다.

## Debug 분리 영향 — 미적용

`.debug` applicationIdSuffix를 적용하면 별도 앱으로 병행 설치할 수 있다. 로그인·로컬 기록·알림 권한도 별개다. 앱 이름/아이콘, App Links와 onaria scheme, 공유 provider authority, 테스트의 package 가정, CI와 Android Studio 실행 대상을 함께 검토해야 한다. Flutter profile도 debug 설정을 상속한다.

production applicationId 변경은 기존 업데이트 연속성을 깨뜨린다. applicationId와 키 교체는 별도 승인 전에는 수행하지 않는다. Play 배포 도입 시 업로드 키와 최종 배포 서명 인증서를 구분해 검토한다.

## 검증

`node --test scripts/android-release.test.mjs`는 실제 기기/키 없이 가짜 도구 응답으로 정상 업데이트, 미인증/미연결/다중 기기, 두 인증서 불일치, 알 수 없는 APK, 잘못된 package, Debug APK, downgrade, 설치 실패 시 무삭제·무재시도를 검사한다. CI에서도 실행한다.

실제 설치는 연결된 기기의 인증서·버전 조건이 맞을 때만 수행한다. 단위 테스트가 실기기 설치 성공을 대신하지 않는다.
