# onaria v0.4.0 테스트 안내

## 휴대폰 무선 테스트 (Windows / Android 11 이상)

PC와 휴대폰을 같은 Wi-Fi에 연결합니다. 휴대폰 설정에서 빌드 번호를 7번 눌러
개발자 옵션을 활성화한 다음, 개발자 옵션 → 무선 디버깅을 켭니다.
‘페어링 코드로 기기 페어링’을 열고 표시된 IP와 페어링 포트를 확인합니다.
무선 디버깅 기본 화면의 연결 포트는 페어링 포트와 다릅니다.

프로젝트 폴더의 PowerShell에서 아래 주소를 휴대폰에 표시된 값으로 바꿔 실행합니다.
6자리 페어링 코드는 실행 중 ADB가 요청할 때 입력합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\script\test-wireless.ps1 -PairAddress 192.168.0.10:37001 -DeviceAddress 192.168.0.10:40001
```

최초 페어링 이후, 연결된 휴대폰이 하나이면 아래 명령으로 최신 소스를 빌드하고
무선 설치·실행합니다. 개발 중에는 터미널에서 `r`로 핫 리로드할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\script\test-wireless.ps1
```

개발 완료 후 릴리스 모드로 확인하려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\script\test-wireless.ps1 -Release
```

재연결이 필요하면 현재 무선 디버깅 화면의 주소를 `-DeviceAddress IP:PORT`로
전달합니다. Wi-Fi 변경이나 재부팅 후 포트가 바뀔 수 있습니다.
`-ListDevices`로 연결 상태만 확인할 수 있습니다.
기본 백엔드는 `http://lightshare8.mycafe24.com`이며, 다른 서버는
`-ApiBaseUrl https://your-server.example`로 지정합니다.
휴대폰에서 PC의 로컬 서버에 접속할 때는 localhost 대신 PC의 LAN IP를 사용해야 합니다.

연결이 안 되면 같은 Wi-Fi인지, 게스트 네트워크의 기기 간 통신 차단 여부와
PC 방화벽의 ADB 허용 여부를 확인합니다. Android 10 이하는 이 페어링 방식을 지원하지 않습니다.

공식 안내: https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi

이 패키지는 Flutter 테스트 소스입니다. Android 휴대전화에 설치하려면 Flutter와
Android Studio가 설치된 PC에서 아래 명령을 실행해 테스트 APK를 생성합니다.

```bash
flutter create --platforms=android,ios,web .
flutter pub get
flutter test
flutter build apk --debug
```

생성 파일:

```text
build/app/outputs/flutter-apk/app-debug.apk
```

실제 AI 백엔드를 연결하지 않으면 앱은 기본 데모 대화 모드로 실행됩니다.
마이크 입력과 한국어 말씀 낭독은 에뮬레이터보다 실제 Android 기기에서 테스트하는
것을 권장합니다.

## 포함 기능

- 감정과 강도 선택
- 임상심리 면담 구조의 질문 3개
- 세 번째 답변 후 말씀 한 구절 자동 표시
- 한국어 마이크 음성 입력
- 오늘의 말씀 한국어 음성 낭독
- 작은 실천과 오늘의 마음 카드
- 마음 카드 전체 문구 기기 내부 저장
- 위기 표현 감지 및 109·112·119 안내
