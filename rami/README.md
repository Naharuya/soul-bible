# RAMI MVP v0.4.0 — NFC로 앱 실행하기 (Android MVP)

v0.3.0에서 **NFC 태그 → NDEF 값 → 콘텐츠** 연결을 실제 휴대폰에서 확인했습니다.
v0.4.0은 한 단계 더 나아가 **RAMI가 꺼져 있거나 다른 화면에 있을 때도 URI형 NFC 태그로 RAMI를 여는 흐름**을 테스트합니다.

## 현재 테스트용 URI

- `rami://t/E001` → 🐘 코끼리
- `rami://t/D001` → 🐶 강아지
- `rami://t/C001` → 🚗 자동차

앱 내부 NFC 리더는 기존 Text ID도 계속 지원합니다.

- `RAMI:ELEPHANT:001`
- `RAMI:DOG:001`
- `RAMI:CAR:001`

## 왜 이번에는 https://rami.app 보다 rami:// 를 먼저 쓰나요?

현재 MVP에서는 실제 웹 도메인과 Android Digital Asset Links 서버 설정 없이도 앱 실행을 확인해야 합니다.
`rami://` 커스텀 스킴은 이 테스트에 가장 단순합니다.

제품화 단계에서는 실제 RAMI 소유 도메인을 확보한 뒤 HTTPS App Link / iOS Universal Link로 전환합니다.

## NFC Tools 기록 방법

새 태그 또는 테스트용 두 번째 태그를 권장합니다.

1. NFC Tools → 쓰기
2. 레코드 추가 → URL/URI
3. `rami://t/E001` 입력
4. 쓰기 → 태그 접촉
5. 읽기에서 URI가 정확히 기록됐는지 확인
6. **읽기 전용 잠금은 하지 마세요.**

## v0.4.0 실제 테스트

1. `build_apk.bat`으로 APK 생성
2. `RAMI-v0.4.0-release.apk` 설치
3. RAMI를 한 번 실행한 후 홈으로 나가거나 앱을 종료
4. 휴대폰 화면은 켜 둔 상태에서 NFC 태그 접촉
5. 성공 기준: RAMI가 열리고 해당 콘텐츠가 표시됨

첫 테스트는 Android에서 진행합니다. 화면이 완전히 꺼져 있거나 기기가 잠긴 상태의 동작은 Android 제조사/보안 정책에 따라 달라질 수 있으므로 이번 합격 기준에 넣지 않습니다.

## Android 라우팅

빌드 스크립트가 자동으로 다음 처리를 합니다.

- `rami://t/...` VIEW 딥링크
- `rami://t/...` NFC NDEF_DISCOVERED
- 미래용 `https://rami.app/t/...` 라우팅
- `app_links`를 통한 cold start / running-state URI 수신

## Windows 빌드

1. ZIP 압축 해제
2. `build_apk.bat` 더블클릭
3. 빌드용 영문 경로 `C:\rami_build_temp\rami_mvp_v0.4.0`에서 자동 빌드
4. 성공하면 원래 폴더에 `RAMI-v0.4.0-release.apk` 생성

이 패키지를 준비한 환경에는 Flutter/Android SDK가 없어 APK 자체 컴파일은 수행하지 않았습니다. 실제 컴파일은 Windows PC의 빌드 스크립트가 수행합니다.
