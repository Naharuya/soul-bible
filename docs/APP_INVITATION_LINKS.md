# 앱 공유 초대 링크

> 일정: **런칭 이후 진행** — 2026-09-11 사용자 결정. 아래 내용은 후속 작업 재개를 위한 구현 초안·배포 메모다. 런칭 전에는 서버 배포 및 `ONARIA_SHARE_APP_URL` 활성화를 진행하지 않는다. 정확한 실행 날짜는 미정이며 [로드맵](../ONARIA_ROADMAP.md#런칭-이후-예약-작업)에 후속 일정으로 저장했다.

마음카드 이미지를 공유할 때 공개 초대 링크를 텍스트로 함께 전달한다. 개인 카드나 대화 데이터를 URL에 넣지 않는다. 공유를 선택할 때 기기에 카드를 저장하는 기존 흐름은 그대로 유지된다.

## 공개 배포 전 필요한 값

서버 환경 변수:

```dotenv
ONARIA_ANDROID_INSTALL_URL=
ONARIA_IOS_INSTALL_URL=
ONARIA_ANDROID_SHA256=
ONARIA_APPLE_APP_ID=
```

- 설치 URL은 실제 HTTPS Play 스토어 / App Store / APK 배포 주소를 사용한다. 값이 없으면 설치 준비 중 안내만 표시한다.
- Android SHA-256 인증서 지문은 콜론으로 구분한 32바이트 문자열이며, 여러 지문은 쉼표로 구분한다. Play App Signing을 사용하면 Play의 앱 서명 인증서 지문을 포함해야 한다.
- Apple 앱 ID는 실제 App ID prefix와 번들 ID를 합친 값(`실제PREFIX.com.example.bibleMindCore`)이다. Xcode에서 Associated Domains가 활성화된 프로비저닝 프로파일로 서명해야 한다.

서버 코드를 배포하고 HTTPS로 다음 경로를 로그인이나 리다이렉트 없이 공개한다. 리버스 프록시가 `/v1`만 전달한다면 이 경로도 추가해야 한다.

- `https://api.onaria.ai.kr/app/open`
- `https://api.onaria.ai.kr/app/style.css`
- `https://api.onaria.ai.kr/.well-known/assetlinks.json`
- `https://api.onaria.ai.kr/.well-known/apple-app-site-association`

공개 페이지, 설치 주소, 인증 파일을 확인한 뒤 초대 링크를 포함한 앱을 빌드한다:

```powershell
flutter build apk --release --dart-define=ONARIA_SHARE_APP_URL=https://api.onaria.ai.kr/app/open
```

설정 없이 빌드하면 아직 공개되지 않은 링크를 공유하지 않는다. iOS 빌드에도 같은 dart-define을 전달한다.

## 동작과 확인

설치되고 도메인 인증이 완료된 앱은 HTTPS 링크에서 실행된다. 앱이 없으면 설치 안내 페이지가 열린다. 웹 페이지에는 설치된 앱 열기 버튼도 있다. 앱 설치는 사용자가 스토어나 Android 설치 화면에서 완료한다.

앱 실행 중 링크를 열면 진행 중인 대화를 유지하며, 종료 상태에서는 시작 화면으로 진입한다. 예전 버전에는 링크 등록이 없으므로 먼저 업데이트해야 한다.

공유 대상 앱에 따라 이미지와 텍스트를 함께 전달하지 않을 수 있다. 카카오톡, 문자 등 실제 배포 대상에서 수신 링크를 확인해야 한다. 인앱 브라우저와 사용자 링크 열기 설정에 따라 웹 페이지가 우선 열릴 수 있다.

배포 후 Android `adb shell pm verify-app-links --re-verify com.example.bible_mind_core` 및 `adb shell pm get-app-links com.example.bible_mind_core`로 인증 상태를 확인한다. 설치/미설치 기기와 앱 실행/종료 상태 각각에서 외부 앱의 공유 링크를 눌러 검증한다. iOS는 서명된 실기기 빌드로 확인한다.

공식 문서: [Android App Links 인증](https://developer.android.com/training/app-links/verify-applinks), [Apple Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
