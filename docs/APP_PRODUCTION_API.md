# Flutter 공식 API 설정

기본 API는 `https://api.onaria.ai.kr`입니다. 단일 설정 소스는 `lib/app/api_config.dart`의 `productionBaseUrl`이며 Android/iOS와 회원가입·마음대화 클라이언트가 재사용합니다. 홈페이지 도메인과 API 도메인은 별개입니다.

기존 기본값도 공식 도메인이었지만 `script/test-wireless.ps1`이 구 HTTP 주소를 기본 override로 전달했습니다. 스크립트는 이제 사용자가 `-ApiBaseUrl`을 지정할 때에만 override를 전달합니다.

설정 우선순위는 `ONARIA_API_BASE_URL` → `SOUL_BIBLE_API_BASE_URL` → 공식 기본값입니다. 빈 값을 명시하면 연결을 비활성화합니다. Debug도 기본은 공식 API이며 개발 주소를 자동 선택하지 않습니다.

```bash
flutter run --dart-define=SOUL_BIBLE_API_BASE_URL=http://127.0.0.1:8787
flutter build apk --debug
flutter build appbundle --release
flutter build ios --release
```

Debug HTTP는 localhost/127.0.0.1/IPv6 loopback/Android emulator 10.0.2.2에 한해 명시적으로 허용합니다. Release/profile에서는 HTTP, IP, localhost, 구 Cafe24 도메인, URL 내 사용자 인증정보를 차단합니다. 다른 HTTPS DNS 이름을 쓰는 명시적 staging override는 유지합니다. 잘못된 release 설정을 HTTP나 구주소로 되돌리지 않습니다.

CI의 override 테스트는 테스트 프로세스에만 define을 전달합니다. APK/debug AAB/iOS simulator 빌드 명령에는 override가 없으므로 공식 기본값을 사용합니다. Debug AAB는 스토어 배포용이 아닙니다. Release AAB에는 기존 private signing 설정, iOS 배포에는 서명이 별도로 필요하며 키·비밀번호를 Git에 추가하지 않습니다.

`flutter analyze lib test example --no-fatal-infos`로 분석합니다. 기존 example의 avoid_print 정보 메시지는 허용하되 오류와 warning은 실패시킵니다. 실제 Android/iOS 기기의 회원가입·마음대화 네트워크 검증은 APK/시뮬레이터 컴파일과 별도로 진행해야 합니다.

2026-09-13 공식 `/health` 실요청: HTTP 200, `{"status":"ok"}`, TLS 인증서 검증 성공, redirect 0. 실제 OpenAI 유료 호출이나 개인정보 전송은 하지 않았습니다.

구도메인은 보안 차단 규칙·부정 테스트·archive 이력에만 유지할 수 있습니다. 이번 범위 밖의 `backend/ADMIN_PWA.md`, `script/setup-admin-https.sh`, `script/soul-bible-http.conf`는 수정하지 않았으며 기존 서버 설정 이력으로 취급합니다. 앱 빌드나 API 주소 결정에 사용하지 않습니다.
