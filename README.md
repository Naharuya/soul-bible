# onaria MVP v0.4.1 테스트 버전

개발 문서는 [문서 안내](docs/README.md)에서 찾을 수 있습니다. [현재 상태](ONARIA_STATUS.md), [작업 순서](ONARIA_ROADMAP.md), [완료 기준](ONARIA_GATES.md)을 기준으로 확인하고, 과거 보고서는 개발 이력으로 참고합니다.

앱의 공식 표기는 소문자 `onaria`입니다. Flutter 패키지는 `onaria`, 앱 진입 위젯은 `OnariaApp`이며, 공용 라이브러리는 `lib/onaria.dart`입니다.

빌드 설정은 `ONARIA_API_BASE_URL`, `ONARIA_APP_TOKEN`, `ONARIA_PREMIUM_MEMBER`를 사용합니다. 기존 `SOUL_BIBLE_*` 설정도 호환되며, 두 설정이 있으면 `ONARIA_*`가 우선합니다. 기존 설치 앱과 저장 데이터를 이어 쓰도록 Android/iOS 앱 식별자, 로컬 저장 키, 관리자 세션 키는 유지합니다. 실제 저장소 주소·작업 폴더·서버 경로·SSH 별칭·서비스 및 Docker 볼륨 이름 역시 기존 운영 연결과 데이터를 보존하기 위해 유지합니다.

감정적으로 공감하고 질문을 건네며, 사용자의 동의를 받은 뒤 마음에 맞는
말씀과 작은 실천을 제안하는 Flutter 앱입니다. AI Router가 한국어 성경,
영어 성경, 임상심리 성찰, 심리·신앙 통합 에이전트를 대화 목적에 맞게 선택합니다.

## 구현된 사용자 흐름

1. 오늘의 감정 16종 선택
2. 감정 강도 1~10 설정
3. 임상심리 면담 구조의 공감 질문 3개와 대화
4. 입력 전 로컬 위기 표현 감지
5. AI Router가 선택한 성경 에이전트의 말씀 추천
6. 작은 실천 선택
7. 에이전트, AI Memory Summary, 임상 성찰을 포함한 마음 카드 기기 저장
8. 109·112·119 전화 연결

모든 회원은 하루 사용 횟수 제한 없이 대화를 시작할 수 있습니다.
오늘 사용한 횟수는 안내용으로만 표시하며, 대화 시작을 제한하지 않습니다.

전화번호 회원가입 화면과 API는 구현되어 있으나, 현재 외부 서버 연결은 확인이 필요합니다. 네이버·카카오·Google OAuth는
아직 준비 중으로 표시됩니다.

## 처음 실행하기

Flutter 3.24 이상을 설치한 뒤 프로젝트 폴더에서 실행합니다.

```bash
flutter pub get
flutter test
flutter run
```

Windows에서 Android 앱을 실행하려면 Android Studio와 Android SDK가 필요합니다.
iOS 빌드는 macOS와 Xcode가 필요합니다.

## 마이크 및 음성 인식

마음 대화 화면에서 마이크 버튼을 처음 누르면 운영체제가 마이크·음성 인식
권한을 요청합니다. 허용하면 선택한 음성 언어의 인식 결과가 입력창에 실시간으로 표시됩니다.
듣는 중에는 버튼이 코랄색 정지 버튼으로 바뀌며, 다시 누르면 인식을 종료합니다.

- Android: 녹음, 음성 인식 서비스 조회, Bluetooth 헤드셋 권한 포함
- iOS: 마이크와 음성 인식 사용 목적 문구 포함
- 일부 에뮬레이터에는 한국어 음성 인식 서비스가 없으므로 실제 기기 테스트 권장

## 오늘의 말씀 음성 지원

오늘의 말씀 카드에서 `오늘의 말씀 음성으로 듣기`를 누르면 말씀의 출처, 본문,
묵상 질문을 한국어, 영어 또는 병기 음성으로 천천히 낭독합니다. 모든 AI 답변에도
다시 듣기 버튼이 제공됩니다. 마이크 입력과 말씀 낭독은 동시에 실행되지 않도록 서로
자동 정지합니다.

## AI Router와 Memory Summary

대화 화면의 조정 메뉴에서 에이전트와 말씀 언어를 직접 선택하거나 자동 라우팅을
사용할 수 있습니다. 자동 라우터는 사용자의 표현과 요청 언어를 바탕으로 다음을
선택합니다.

- 한국어 성경 에이전트
- 영어 성경 에이전트
- 임상심리 성찰 에이전트
- 심리·신앙 통합 에이전트

각 응답은 다음 턴에 필요한 사실·감정·욕구를 `memorySummary`로 요약합니다. 메모리는
세션 ID에 연결되며, 앱 세션에도 전달되어 대화 흐름과 마음 카드에 반영됩니다.

## 실제 AI 백엔드 실행

Node.js 20 이상과 OpenAI API 키가 필요합니다.

```bash
cd backend
cp .env.example .env
# .env의 OPENAI_API_KEY를 서버 키로 변경
npm install
npm test
npm start
```

회원가입 정보는 백엔드의 `data/members.sqlite` SQLite 데이터베이스에 저장됩니다.
앱 첫 화면에서 전화번호, 이름, 교회명을 입력하면 `POST /v1/auth/signup`으로
연결됩니다. 네이버·카카오·Google OAuth 버튼은 아직 준비 중이며, 현재는 전화번호
회원가입만 실제로 동작합니다.

API 키는 Flutter나 Git에 넣지 말고 백엔드의 `.env` 또는 배포 서비스의 비밀
환경변수로만 설정하세요. 상태 확인 주소는 `GET http://localhost:8787/health`,
대화 주소는 `POST http://localhost:8787/v1/mind/chat`입니다.

## Flutter에서 실제 AI 연결

앱에 LLM 제공자의 API 키를 넣지 마세요. `backend_contract/openapi.yaml` 계약을
구현한 자체 프록시 주소를 빌드 변수로 전달합니다.

```bash
flutter run \
  --dart-define=ONARIA_API_BASE_URL=http://10.0.2.2:8787
```

Android 에뮬레이터에서는 호스트의 `localhost` 대신 `10.0.2.2`를 사용합니다.
iOS 시뮬레이터와 Web은 보통 `http://localhost:8787`을 사용합니다.
운영 토큰을 사용하는 경우 `--dart-define=ONARIA_APP_TOKEN=...`도 함께
전달해야 합니다. 정적 토큰을 공개 앱에 포함하는 방식은 운영 비밀 보장이 되지
않으므로 사용자 인증으로 대체해야 합니다.

## 권장 구조

Flutter 앱 → 자체 백엔드 프록시 → LLM 제공자

LLM 제공자 API 키를 Flutter 앱에 직접 넣지 마세요. 프록시에서 인증, 속도 제한,
구조화 출력 검증, 위기 대응 재검증, 감사 로그를 처리해야 합니다.

## 처리 순서

1. 사용자 입력을 `CrisisDetector`로 먼저 검사
2. 위기라면 생성형 응답 전에 승인된 위기 UI 표시
3. 안전한 입력이면 `LlmConversationRequest` 생성
4. 프록시 API 호출
5. 서버가 구조화 JSON을 검증해 반환
6. `ConversationMachine`으로 허용된 상태 전이만 적용
7. 말씀 수락 시 `VerseRepository`에서 실제 구절 선택
8. 행동 선택 후 마음 카드 생성

## 중요한 제한

현재 `bible_verses_ko.json`의 `text`는 개발용 요약 문구입니다.
정식 성경 본문이 아니며, 출시 전 합법적으로 사용할 수 있는 번역본 라이선스를
확인한 뒤 교체해야 합니다.

위기 감지 정규식은 1차 방어선입니다. 오탐과 누락이 가능하므로 다음을 병행하세요.

- 서버 측 안전 분류
- 승인된 고정 위기 문구
- 임상·상담 전문가 검수
- 실제 위험 시나리오 레드팀 테스트
- 대한민국 긴급 연결 UI: 112, 119, 109

## 주요 파일

- `lib/main.dart`: 앱 시작점
- `lib/features/check_in_page.dart`: 감정·강도 선택 화면
- `lib/features/conversation_page.dart`: 대화·말씀·실천·위기지원 화면
- `lib/app/demo_llm_client.dart`: API 없이 실행되는 MVP 데모 응답
- `lib/src/`: 기존 대화·안전·API·말씀 핵심 로직
- `backend_contract/openapi.yaml`: 실제 백엔드 연동 계약
- `backend/`: OpenAI Responses API 기반 실제 LLM 프록시, 안전 필터 및 테스트

## 기술스택 및 운영 배포

전체 기술스택, 데이터 저장 방식, Docker 호스팅 설치, Flutter APK/AAB 패키징 절차는
[`TECH_STACK_AND_DEPLOYMENT.md`](docs/guides/TECH_STACK_AND_DEPLOYMENT.md)를 참고하세요.

## 백엔드 도메인
- https://lightshare8.mycafe24.com/ (출시 전 TLS 연결 검증 필요)
- ip : 104.105.128.84
- os : Rocky 9
- SSH 접속: `ssh soul-bible-server` (로컬 `~/.ssh/config`와 전용 키 필요)
- 비밀번호와 API 키는 문서나 Git에 저장하지 말고 서버의 비밀 환경변수로 관리
