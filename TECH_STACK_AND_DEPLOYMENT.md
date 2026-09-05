# 소울바이블 기술스택 및 배포 가이드

작성 기준: 2026-09-04, 저장소 현재 구현

## 1. 전체 구성

```text
Flutter 모바일/Web 앱
        |
        | HTTPS JSON
        v
Node.js + Express LLM 프록시
        |
        | OpenAI Responses API
        v
OpenAI
```

앱은 API URL이 없으면 데모 클라이언트로 동작합니다. 실제 운영에서는 앱이 OpenAI에 직접 연결하지 않고 자체 백엔드만 호출합니다.

## 2. 기술스택

### 프론트엔드 및 앱

- Flutter 3.24 이상, Dart 3.5 이상
- Material 기반 Flutter UI
- Android, iOS, Web 대상
- `http`: 백엔드 JSON API 호출
- `shared_preferences`: 마음 카드와 일일 사용량의 기기 로컬 저장
- `speech_to_text`: 한국어 음성 입력
- `flutter_tts`: 말씀 낭독
- `url_launcher`: 109, 112, 119 전화 연결
- `flutter_svg`: SVG 에셋 표시

주요 구현은 `lib/features/`, `lib/src/conversation/`, `lib/src/safety/`에 있습니다.

### 백엔드

- Node.js 20 이상, 운영 이미지 기준 Node.js 22 Alpine
- Express 5 HTTP API
- OpenAI Node SDK 및 Responses API
- Zod: 요청과 모델 응답 구조 검증
- Helmet: HTTP 보안 헤더
- CORS: 허용 Origin 제한
- express-rate-limit: IP 기준 기본 분당 20회 제한
- dotenv: 환경변수 로드

주요 엔드포인트:

- `GET /health`: 상태 확인
- `POST /v1/mind/chat`: 위기 감지 후 안전한 대화 응답 생성

### 데이터베이스 및 저장소

현재 서버 데이터베이스는 없습니다.

- 말씀 데이터: `assets/data/bible_verses_ko.json` 앱 번들에 포함
- 시스템 프롬프트: `assets/prompts/system_prompt_ko.txt` 앱 번들에 포함
- 마음 카드: 사용자 기기의 `SharedPreferences`에 저장
- 대화 세션: 현재 앱 메모리에서만 유지
- 백엔드: stateless, 요청 처리 후 세션을 서버에 저장하지 않음
- OpenAI 요청: `store: false`로 설정

따라서 현재 배포에는 DB 서버가 필요하지 않습니다. 계정 동기화, 여러 기기 간 카드 공유, 운영 분석이 필요해질 때 PostgreSQL 같은 영속 DB와 인증 체계를 별도로 도입해야 합니다.

## 3. 사전 조건

- 호스팅 서버: Linux 권장, Docker Engine과 Docker Compose v2
- 공개 HTTPS 도메인과 TLS 인증서
- OpenAI API 키
- Android 배포 시 고유 application ID와 release keystore
- 정식 출시 전 성경 번역본 사용 라이선스 확인

OpenAI API 키와 `APP_BEARER_TOKEN`은 Git, Flutter 바이너리, 클라이언트 환경변수에 넣지 않습니다. 서버의 비밀 환경변수로만 관리합니다.

## 4. 호스팅 서버 설치

### 4.1 소스 준비

서버에 저장소를 배치한 뒤 다음을 실행합니다.

```bash
cp backend/.env.example backend/.env
```

`backend/.env`를 운영 값으로 수정합니다.

```dotenv
OPENAI_API_KEY=서버에서만_보관할_키
OPENAI_MODEL=gpt-5.6
PORT=8787
ALLOWED_ORIGINS=https://앱의웹도메인
APP_BEARER_TOKEN=충분히_긴_랜덤_토큰
```

네이티브 앱은 일반적으로 Origin 헤더를 보내지 않으므로 `ALLOWED_ORIGINS`는 Web 앱 도메인에만 맞춥니다. 공개 API 앞단에 reverse proxy를 두고 HTTPS를 종료하는 구성을 권장합니다.

### 4.2 운영 서버 실행

Docker가 설치되지 않은 서버에서는 `systemd`가 `/opt/soul-bible/backend`의
Node 프로세스를 관리합니다. 로컬 PowerShell에서 다음 명령을 실행합니다.

```powershell
.\script\deploy-backend.ps1
```

이 스크립트는 `src`, `package.json`, `package-lock.json`만 업로드하고 서버의
`backend/.env`는 덮어쓰지 않습니다. 설치 후 다음으로 상태를 확인합니다.

```bash
systemctl status soul-bible-backend
curl http://127.0.0.1:8787/health
journalctl -u soul-bible-backend -n 100 --no-pager
```

### 4.3 Docker Compose로 실행

Docker를 사용하는 서버라면 저장소 루트에서 실행합니다.

저장소 루트에서 실행합니다.

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8787/health
```

정상 응답은 `{"status":"ok"}`입니다. 로그는 다음으로 확인합니다.

```bash
docker compose logs -f soul-bible-backend
```

업데이트할 때는 새 이미지를 빌드하고 컨테이너를 교체합니다.

```bash
git pull
docker compose up -d --build
```

### 4.4 운영 점검

- reverse proxy에서 `/health`를 주기적으로 확인
- 8787 포트는 외부에 직접 공개하지 않고 방화벽에서 reverse proxy만 허용
- HTTPS 적용 및 도메인 인증서 자동 갱신
- OpenAI 비용 및 rate limit 모니터링
- 위기 응답 문구와 정규식은 임상·법률 검수 후 운영
- `backend/.env` 백업 시 키를 별도 비밀 저장소에서 관리

## 5. Flutter 앱 패키징

### 데모/테스트 APK

```bash
flutter pub get
flutter test
flutter build apk --debug
```

산출물: `build/app/outputs/flutter-apk/app-debug.apk`

### 운영 백엔드 연결 APK

```bash
flutter build apk --release \
  --dart-define=SOUL_BIBLE_API_BASE_URL=https://api.example.com
```

`APP_BEARER_TOKEN`을 활성화한 개발 환경에서는 `SOUL_BIBLE_APP_TOKEN`을 같은
빌드에 전달할 수 있습니다. 공개 모바일 앱에 정적 Bearer 토큰을 넣는 방식은
완전한 비밀 보장이 아니므로, 운영에서는 사용자 인증 또는 API Gateway 정책을
권장합니다.

### Android 스토어 배포 전 필수 작업

release 빌드는 `android/key.properties`에 지정한 별도 release 키로 서명합니다. 키 파일과 `key.properties`는 Git에 커밋하지 말고 안전하게 백업해야 합니다. Google Play 배포 전에 다음을 완료해야 합니다.

1. 고유한 `applicationId`로 변경
2. Play App Signing용 release keystore 생성 및 안전한 비밀 저장
3. `android/key.properties`에 키 경로와 비밀번호 설정
4. 앱 이름, 아이콘, 개인정보처리방침, 권한 설명 확인
5. `flutter build appbundle --release`로 AAB 생성

```bash
flutter build appbundle --release \
  --dart-define=SOUL_BIBLE_API_BASE_URL=https://api.example.com
```

산출물: `build/app/outputs/bundle/release/app-release.aab`

## 6. 현재 배포 한계

- 서버 세션과 사용자 계정이 없어 기기 간 데이터 동기화가 되지 않음
- 서버 로그에는 요청 본문을 기록하지 않지만, 운영 로그 보존 정책은 별도 수립 필요
- 로컬 위기 감지는 1차 방어선이며 의료·상담 판단을 대체하지 않음
- 성경 데이터의 현재 본문은 개발용 요약 문구이므로 정식 출시 전 라이선스 검토 및 본문 교체 필요
- iOS 배포는 macOS/Xcode와 Apple Developer 계정이 필요