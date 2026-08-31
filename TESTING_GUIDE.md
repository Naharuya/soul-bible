# 소울바이블 v0.4.0 테스트 안내

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
