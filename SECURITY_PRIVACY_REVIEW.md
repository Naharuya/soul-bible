# SoulBible 릴리즈 전 개인정보·보안 점검

## 2026-09-09 비용 원장 후속 점검

- 비용 원장을 회원 DB와 분리된 SQLite 파일에 저장하도록 추가했다. 원본 ID 대신 DB별 HMAC 가명, 허용된 사용량/단가 정보만 보관하며 prompt·memory·API key를 저장하지 않는다.
- 기본 보관기간 62일(32~366일 설정), POSIX 생성 권한 제한, public 경로 거부, DB 오류 시 유료 호출 제한, 안전성 응답 우회 및 임시 DB/WAL 민감 문자열 비노출을 검증했다.
- 이 환경에서는 SQLite native 연결이 현재 정상이며, 실제 임시 비용 DB로 쓰기·읽기·재시작·다중 프로세스·강제 종료를 검증했다. 과거 S2의 native 누락 기록은 당시 상태다. 실제 회원 DB와 운영 DB/ACL/백업 검증은 이번 범위에 포함하지 않았다.
- 변경 범위와 제약은 [AI_COST_GATE_PERSISTENCE_REPORT.md](AI_COST_GATE_PERSISTENCE_REPORT.md)를 따른다. 출시 보류 항목(운영 HTTPS, 사용자 인증, 개인정보 정책/삭제 등)은 별도로 남아 있다.

## 2026-09-09 후속 변경 (아래 9월 8일 점검보다 우선)

- **A1 부분 해소:** 익명 `/v1/mind/chat`에서 서버 memory Map 사용을 제거했다. sessionId는 서버 데이터 조회에 사용하지 않으며 요청에 포함된 `conversationMemory` 또는 `conversationSummary`만 해당 요청에 전달한다. 공통 bearer는 사용자 인증이 아니며 API 남용 방지와 회원 소유권 인증은 여전히 미해결이다.
- **P3 대화 요약 보관 축소:** HTTP chat은 요청 완료 후 요약을 서버 Map에 보관하지 않는다. 기존 프로세스가 보관한 요약은 배포 시 프로세스 종료가 필요하다. 회원 DB, 기기 저장, 로그 및 외부 AI의 보유기간 문제는 별도로 남는다.
- Flutter는 이미 응답의 memorySummary를 다음 요청의 conversationMemory로 전달한다. 이 필드에 문자열/4000자 검증을 추가했다. 서버 요약 복원을 기대하는 다른 클라이언트는 응답 요약을 다음 요청에 직접 포함해야 한다.
- 관리자 `activeSessions`는 서버에 보관하는 세션이 없으므로 0이다. 실제 접속 사용자 수를 뜻하지 않는다. memory_store 모듈은 HTTP 경로에서 분리되며 기존 단위 테스트용으로 유지한다.
- 검증: `npm.cmd test` 273개 통과. 동일 세션 ID를 사용하는 별도 요청의 이전 요약 비노출, 명시적 클라이언트 요약 재사용, 잘못된 타입/초과 길이 거부 포함. 운영 배포·HTTPS·실제 DB·실기기 검증은 수행하지 않았다.

점검일: 2026-09-08 / 대상: 현재 작업 트리 및 로컬 Git 전체 참조 이력.

**판정: 최소 보완과 Release 빌드는 완료했으나 운영 출시 승인은 보류해야 한다.** 운영 HTTPS 검증, 사용자별 인증·메모리 격리, 개인정보처리방침/동의, 삭제·보유기간 정책이 남아 있다. 운영 서버에는 접속하여 설정을 변경하거나 데이터를 조회하지 않았다. 아래 운영 상태는 저장소 설정과 구분한다. Secret 값, DB 레코드, 실제 대화 원문은 보고서에 포함하지 않는다.

## 등급 및 조치표

등급은 CRITICAL(출시 차단 또는 민감정보 직접 노출 경로), HIGH(출시 전 보완 필요), MEDIUM(제한적 위험/운영 검증 필요), LOW(현재 보호 유지)로 구분한다. 수정 완료는 작업 트리 기준이며 서버 배포 완료를 뜻하지 않는다.

| ID / 등급 | 현재 상태와 근거 | 위험 | 수정 여부 | 출시 전 필수 여부 | 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| N1 CRITICAL | 기존 `lib/app/api_config.dart`는 production HTTP 기본값, main `network_security_config.xml`은 해당 호스트 cleartext 허용. 이제 HTTPS 기본값, release/profile HTTP 거부, debug는 localhost/127.0.0.1/::1/10.0.2.2만 허용. 두 API client는 전송 전 검증 및 redirect 비활성화. | 회원정보·대화·공유 bearer의 평문 전송. | 코드 수정 완료 | 필수 | 운영 HTTPS 정상 응답 확인 후 배포. TLS 실패 시 HTTP로 되돌리지 말 것. |
| N2 CRITICAL | `https://lightshare8.mycafe24.com/health`를 인증·개인정보 없이 GET: 20초 timeout, HTTP status 000. TLS 연결/인증서 성공을 확인하지 못함. 웹 도구도 접근 불가. | HTTPS only 앱이 서버에 연결되지 않을 수 있음. TLS 미지원인지 이 환경의 연결 문제인지 판별 불가. | 운영 미수정 | 필수 | 호스팅 담당자가 443 포트, 인증서 SAN/체인/만료·자동 갱신, health 및 API POST를 확인. 다른 네트워크에서도 검사. |
| N3 HIGH | `script/soul-bible-http.conf`는 원래 80번에서 Node로 그대로 proxy. 현재 예시는 HTTP 전 경로 403 차단으로 변경. 저장소에 실제 인증서 경로/443 vhost 근거 없음. | HTTP redirect만으로 이미 전송한 request body/token을 보호할 수 없음. | HTTP 예시만 수정 | 필수 | 실제 TLS vhost를 별도 구성·검증한 뒤 배포. 이 예시만 적용하면 HTTP 서비스가 중단되므로 무검증 배포 금지. proxy→Node는 같은 호스트 loopback으로 한정. |
| N4 HIGH | `docker-compose.yml`의 외부 공개 8787 바인딩을 `127.0.0.1:8787:8787`로 변경. `backend/src/server.js`는 host 없는 listen, systemd 서비스에는 User 지정 없음. | Docker 외의 배포에서 proxy 우회 평문 포트/과도한 OS 권한 가능. 실제 운영 방화벽은 미확인. | Docker만 수정 | 필수 | systemd는 전용 사용자와 제한된 권한, loopback bind 또는 방화벽 설정. 컨테이너 구조를 바꾸지 않기 위해 Node 공통 listen은 유지. |
| N5 HIGH | `backend/src/openai_service.js`, `knowledge/openai_embedding_adapter.js`에 공식 `https://api.openai.com/v1`과 `logLevel: 'off'` 명시. 설치된 SDK는 `OPENAI_BASE_URL`, `OPENAI_LOG` 환경변수를 지원함을 확인. | 잘못된 환경설정이 AI key/대화의 외부 전송 주소 및 상세 로그를 바꿀 수 있음. | 수정 완료 | 필수(반영) | 배포 설정과 외부 AI 활성화/동의를 검증. 별도 AI proxy가 필요하면 독립 보안 검토 후 도입. |
| L1 HIGH | `backend/src/app.js` error logger는 과거 name/code/message를 기록. 현재 고정 이벤트명과 숫자 status만 기록. 정상 conversation telemetry는 원문 대신 모델·토큰 수·지연·검색 지표를 기록. | provider 오류에 request body/userMessage/token이 반사되어 로그 유출 가능. 검색 종교/자료 ID도 민감한 추론 가능. | 오류/SDK 로그 최소화 완료 | 필수(반영), telemetry 정책 필요 | 프록시/APM/호스팅 로그까지 request body·Authorization·URL query를 수집하지 않도록 확인. 검색 종교/자료 지표의 필요성·접근·보유기간 검토. |
| L2 LOW | `backend/src/app.js`의 모든 `/v1` 응답에 no-store를 body parser 전에 설정. 사용자에게는 고정 오류 메시지, stack 없음. `llm_api_client.dart`의 비JSON 오류 원문 fallback 제거. | 캐시와 서버 오류 원문 노출. | 수정 완료 | 유지 필수 | 프록시 캐시 우회도 검증. 회원가입 API의 고정 중복 오류는 유지. |
| M1 HIGH | `backend/src/member_store.js`는 SQLite에 이름·전화·교회명·provider·provider ID·시각 저장. 준비된 SQL 사용. 현재 관리자 이름 마스킹, 교회 비공개, 기존 전화 마스킹 유지(`member_schema.js: adminMember`). | 교회 가입 정보와 식별정보의 결합, 관리자 과다 노출. | 관리자 응답 최소화 완료 | 필수 | 교회명 필수 수집과 이름·전화 수집 목적을 재검토. 필요성 확정 전 임의 DB migration은 하지 않음. |
| M2 HIGH | DB/keystore/.env의 현재 tracked 파일 없음. `.gitignore`에 DB/WAL/SHM, data·backup 경로 및 env 예외 규칙 보완. DB는 기본 `process.cwd()/data/members.sqlite`, Docker는 `/app/data`, systemd는 `/opt/soul-bible/backend/data`. | 원문 DB/백업 유출 및 복구 데이터에 삭제 정보 잔존. 실제 운영 파일/ACL 미확인. | Git 방어 수정 | 필수 | 운영 권한·암호화·백업/삭제 정책 아래 절차로 확정. 다른 이름/확장자의 export도 검토. |
| A1 CRITICAL | `/v1/mind/chat`은 appToken이 비어 있으면 무인증. 설정돼도 모든 사용자에게 공통 bearer. 세션 ID는 클라이언트 timestamp이며 `memory_store.js` Map 조회에 사용자 소유권 검증 없음. | APK에서 추출 가능한 공통 token으로 API 남용, 타인의 세션 ID를 알거나 추측하면 요약이 다음 응답에 사용될 수 있음. | 구조 유지, 미수정 | 필수 | 사용자/세션 인증, 서버 발급 예측 불가 ID, 사용자 소유권 검증, 만료·회전·폐기 도입. 무인증 anonymous 모드도 독립 session credential 필요. |
| A2 HIGH | signup endpoint는 전화 검증/OTP 및 provider 증명 없이 입력을 받음. 앱 소셜 버튼은 준비 중. `SoulBibleApp` 시작은 CheckInPage이며 현재 SignUpPage 참조 경로가 없음. | 허위 가입·번호 존재 추론(409)·미검증 provider ID. 회원 가입이 현재 대화 인증을 제공하지 않음. | 미수정 | 실제 회원 수집 전 필수 | 수집 기능 공개 범위를 정하고 검증된 identity 흐름 도입. signup을 인증된 로그인으로 표시하지 않음. |
| A3 HIGH | `APP_BEARER_TOKEN`과 Flutter `SOUL_BIBLE_APP_TOKEN`은 APK에 넣으면 추출 가능. OpenAI key/admin token은 서버 설정이며 Flutter API key 저장 코드는 확인되지 않음. | 공통 app token을 진짜 비밀키/사용자 인증으로 오인. | 문서화, AI SDK 제한 | 필수 | 앱에는 OpenAI/admin secret 절대 포함 금지. user/session 인증 전환. 과거 APK의 공통 token은 비밀성에 의존하지 말 것. |
| A4 MEDIUM | 관리자 API는 admin bearer 없으면 항상 거부, no-store·rate limit 유지. 관리자 정적 shell은 공개. admin.js는 sessionStorage에 token을 보관하며 이제 비로컬 HTTP에서는 요청 차단. | 공개 관리자 공격 표면, 브라우저 XSS 시 sessionStorage token 노출. JS 차단은 악성 HTTP 페이지 자체를 막지 못함. | HTTPS 요청 가드 보완 | 운영 제한 필수 | proxy에서 `/admin/`, `/v1/admin/` 모두 VPN/IP allowlist, CSP 유지, token 교체/로그아웃 정책. 실제 운영 인터넷 노출 범위 미확인. |
| A5 MEDIUM | Git secret 검사: 현재 tracked 365개, 로컬 전체 참조 16커밋·448 blob 검사. 실제 secret으로 확인된 후보 및 로컬 secret 4개와의 일치 없음. | 패턴 검사는 유출 부재 증명이 아님. | 검사 완료 | 배포/CI에서 지속 필수 | 아래 범위·한계 참조. 노출 발견 시 값 출력 없이 폐기/교체부터 시행, 이력 삭제만으로 해결하지 않음. |
| P1 HIGH | `lib/features/signup_page.dart`, `check_in_page.dart`, `conversation_page.dart`, `backend/src/app.js`에서 개인정보처리방침 화면/URL·민감정보 및 AI 처리 동의 흐름을 확인하지 못함. 말씀 제안/알림 opt-in은 별개임. | 사용자가 종교·감정·대화의 수집과 AI 전송을 알지 못할 수 있음. | 미구현 항목 문서화 | 필수 | 실제 운영자·항목·목적·수신자·보유기간·권리 문의·국외 처리 조건을 확정하고 접근 가능한 정책 URL/화면 및 필요한 동의 기록 마련. 사실 미확정 정책을 임의 생성하지 않음. |
| P2 HIGH | `app.js`에 탈퇴/서버 개인정보 삭제 endpoint 없음. `memory_store.clear`는 내부 함수일 뿐 API 없음. 마음카드는 기기에서 개별 삭제 가능. | 회원·summary·백업 삭제 요청을 처리할 사용자 흐름 부재. | 미수정 | 필수 | 본인확인 후 member+memory+관련 백업 파기, 앱과 웹 요청 경로 및 완료/실패 안내. 공통 bearer만으로 임의 삭제 API를 추가하지 않음. |
| P3 HIGH | 회원 DB 무기한 저장, memory Map 최대 1000개/각 4000자이나 TTL 없음. 마음카드는 최신 최대 101개(새 카드+기존 100개), 날짜 기반 파기 없음. | 용량 제한을 보유기간으로 오인, 민감정보 장기 잔존. | 문서화 | 필수 | 데이터별 기간과 목적 종료/탈퇴 시 파기, SQLite WAL·백업·로그·AI 처리 범위까지 정책 수립 및 구현. |
| D1 MEDIUM | shared_preferences는 암호화 저장소 사용 코드 없음. 저장 후 문구에 기기 저장/감정·요약/삭제 위치를 명시하도록 보완. 서버 동기화 기능은 확인되지 않음. | 분실·공유 기기·OS 백업 등 노출 가능. '로컬'은 암호화나 백업 제외를 뜻하지 않음. | 안내 문구 수정 | 안내/백업 정책 필수 | 저장 전 안내와 전체 삭제 기능, Android/iOS 백업 제외 또는 암호화 필요성을 검토. 현 manifest는 명시적 Android 백업 제한 없음. |
| V1 MEDIUM | 음성 버튼에서만 `_speech.initialize()` 및 listen. 기기 plugin이 RECORD_AUDIO와 필요한 BLUETOOTH_CONNECT runtime 권한을 요청. onDevice 전용을 강제하지 않음. | OS 음성 인식 서비스가 오디오를 외부 처리할 수 있으며 보관/처리 위치는 기기/provider에 의존. | 권한 유지 | 음성 기능 고지 필수 | 실제 기기에서 권한 거부/허용, OS 제공자 및 네트워크 처리 조건 확인. 원본 오디오를 backend로 업로드/파일 저장하는 앱 코드는 확인되지 않음. |
| V2 LOW | Bluetooth는 speech_to_text 7.4.0의 헤드셋 지원 의존성이 확인됨. manifest legacy 권한 maxSdkVersion=30, CONNECT 사용. 알림 권한은 설정에서 enabled 요청 시 호출. | 미사용으로 오인해 제거하면 음성 헤드셋 기능 손상 가능. | 임의 제거 안 함 | 현재 유지 | Bluetooth 입력 지원을 없애기로 결정하면 plugin 설정과 실기기 의존성을 먼저 검증 후 제거. 알림은 거절해도 기본 기능 유지. |
| S1 LOW | helmet, CORS allowlist, `/v1` 20회/분, 16KB JSON limit, admin bearer, no-store 유지. 정적 제공 디렉터리는 `backend/public`뿐. DB/.env HTTP 경로 404 회귀 테스트 추가. | CORS는 비브라우저 인증을 대체하지 않으며 reverse proxy 설정에 따라 IP 기반 rate limit 정확도가 달라짐. | 보호 유지/테스트 보완 | 유지 및 운영 확인 필수 | proxy hop 신뢰를 좁게 설정. `trust proxy=true` 일괄 활성화 금지. Node 외 웹서버의 document root/alias도 DB 경로를 포함하지 않는지 확인. |
| S2 MEDIUM | 로컬 Node 24 환경에 better-sqlite3 native binding 없음. 기존 HTTP 테스트는 memberStore stub 사용. 추가 실제 SQLite 테스트 시 누락을 확인했고 최종 테스트는 개인정보 응답 mapper를 직접 검증. | 271개 통과가 실제 DB open/write 성공을 보장하지 않음. | 사실 기록, 의존성 교체 안 함 | 운영 DB 검증 필수 | 배포 Node 버전에 맞는 native dependency 설치 후 별도 임시 DB로 signup/read/masking/삭제 검증. 운영 DB에 테스트 회원 삽입 금지. |

## 데이터 흐름 목록

운영 데이터가 실제 수집됐다는 뜻이 아니라 현재 구현의 입력·저장·전송 능력이다. 특히 앱 시작은 회원가입을 거치지 않는 CheckInPage이며, 서버 signup endpoint는 존재한다.

| 데이터 | 수집/기기 상태 | 서버 처리·저장 | 외부 전송 | 근거 |
| --- | --- | --- | --- | --- |
| 이름·휴대폰·교회명 | 가입 화면의 필수 입력, controller 메모리. preferences 저장 없음. | signup 사용 시 SQLite members에 원문 저장, phone 중복 검사 및 정규화. signup 응답은 신청자 정보를 반환. 관리자 응답만 마스킹. | 회원정보를 직접 AI로 보내는 연결 없음. 사용자가 대화에 적으면 예외. | `signup_page.dart`, `member_api_client.dart`, `member_schema.js`, `member_store.js` |
| loginProvider/providerUserId | 앱 기본 phone. 소셜 버튼은 준비 중이며 provider ID를 보내지 않음. | API는 provider 종류와 optional ID를 받아 저장할 수 있음. provider 검증 없음. | 별도 소셜 OAuth 처리 미연결. | 같은 회원 파일, `social_auth_config.dart` |
| 감정 종류·자유 감정·강도 | 체크인 및 ConversationSession 메모리, 카드 저장 시 preferences. | 매 chat 요청의 session에 포함. 직접 DB 테이블 없음. summary에 반영될 수 있음. | AI 활성화 시 context/psychology/religion 처리에 포함될 수 있음. | `conversation_models.dart: toJson`, `llm_models.dart`, `schema.js`, `conversation_orchestrator.js: normalizeContext` |
| 사용자 대화 원문·직전 답변/질문 | 대화 페이지 메모리 및 session. 전체 transcript를 preferences에 저장하는 코드 없음. | HTTP request 처리, memory summary 생성. 원문 DB 영속화 코드 없음. | OpenAI 모드 시 prompt/context로 전송. local 모드는 자체 처리. RAG 외부 embeddings를 켜면 질의 텍스트도 전송 가능. | `conversation_page.dart`, `conversation_service.js`, `openai_service.js`, `openai_embedding_adapter.js` |
| conversation/memory summary·심리 성찰·통합 인사이트 | session 메모리, 명시적 카드 저장 시 preferences. | sessionId별 process Map에 summary 보관. 재시작 시 소실, 시간 TTL 없음. | AI 모드의 후속 context에 포함. `store:false` 사용하지만 외부 사업자의 보관조건 전체를 의미하지 않음. | `memory_store.js`, `mind_card_store.dart`, `openai_service.js` |
| 마음카드 | 날짜·감정/강도·말씀·묵상·행동·summary·심리 성찰 등을 로컬 JSON 저장. 개별 삭제 가능. | 카드 전용 업로드/동기화 endpoint 없음. 내용의 일부는 이전 AI 응답에서 온 것임. | 공유 이미지는 명시 선택 시 OS share sheet/갤러리. 현재 공유 변환은 감정/summary 대신 정규 말씀 또는 중립 문구 사용. | `mind_card_store.dart`, `saved_cards_page.dart`, `sharing/share_card.dart`, `sharing/native_share.dart` |
| 여정·기분·짧은 메모·성취·저장 말씀 | engagement preferences. | frontend engagement 이벤트의 서버 업로드 구현 확인되지 않음. | 공유 버튼 사용 시 구성된 이미지. | `engagement_controller.dart`, `journey/journey.dart`, `storage.dart` |
| 음성 입력/읽기 | OS speech recognition, 인식 결과를 입력창에 반영. TTS에 표시 문구 전달. | 앱의 오디오 전용 backend endpoint 없음. 전송 버튼의 인식 텍스트는 대화와 동일. | OS 음성 인식/TTS 제공자의 서버 사용 가능, 앱 코드만으로 실제 처리 위치 확정 불가. | `conversation_page.dart: _toggleVoiceInput`, 설치된 speech_to_text plugin |
| 방문 시각·알림 시간/종류·사용 횟수·테마 | preferences 및 notification plugin의 OS 예약 상태. | 업로드 구현 없음. | 알림은 기기 예약; 잠금화면 내용은 중립 문구 및 private visibility. | `reminder_controller.dart`, `native_notifications.dart`, `theme_controller.dart`, `mind_card_store.dart` |
| IP·User-Agent·접속 경로·검색 종교/자료 지표 | 앱 저장 없음. | proxy access log는 combined 형식, Node rate limit에 IP 사용, conversation_result에 운영 지표. | 호스팅/APM 외부 전송 설정 미확인. | `soul-bible-http.conf`, `app.js`, `conversation_service.js` |

## shared_preferences 전체 앱 키

| 키 | 내용 | Secret 여부 |
| --- | --- | --- |
| `appearance_theme` | 테마 이름 | 없음 |
| `soul_bible.mind_cards.v1` | 위 마음카드 JSON 목록, summary/성찰 포함 | 인증 secret은 없으나 민감 내용 가능 |
| `soul_bible.daily_usage.date.v1` | 사용 날짜 | 없음 |
| `soul_bible.daily_usage.count.v1` | 사용 횟수 | 없음 |
| `soul_bible.engagement.v1` | journey/checkins(mood/note 포함), saved/gratitude verse IDs, achievements, eggs, metrics | 인증 secret 없음, 감정·종교 추론 가능 |
| `soul_bible.reminders.v1` | enabled/hour/minute/kind/gentle/paused 및 lastVisit | 인증 secret 없음 |

`PreferencesEngagementStorage`는 SharedPreferencesAsync wrapper이다. 앱 코드에서 password/API key/bearer를 preferences에 쓰는 경로는 확인되지 않았다. 관리자 **웹**의 sessionStorage `soulBibleAdminToken`은 별개로 실제 bearer를 보관한다. OS/plugin 자체 저장소까지 이 표의 전수검사 대상이라고 주장하지 않는다.

사용자 안내 후속 문구 예: “저장한 카드에는 감정과 대화 요약이 포함되며 이 기기에 보관됩니다. 저장된 카드에서 삭제할 수 있습니다. AI 처리와 기기 백업에 관한 내용은 개인정보처리방침에서 확인하세요.” 마지막 문장은 정책/백업 조건을 실제 확정하고 연결한 뒤 사용한다. 이번에는 확인된 기기 저장·삭제 사실만 저장 완료 문구에 반영했다.

## Secret 검사 범위와 결과

- `git ls-files` 현재 파일 및 `git rev-list --objects --all`의 blob을 읽어 provider key/private key/GitHub token/AWS access key/장문 secret assignment 패턴 검사. 출력은 경로·행·object ID·검출 종류만 사용했다.
- 로컬 `backend/.env`, `android/key.properties`의 key/token/password 중 8자 이상 4개 값을 메모리에서만 대조. 실제 값은 출력·파일 기록하지 않았다. 해당 환경 파일 내용을 통째로 읽어 사용자 출력에 보내지 않았다.
- 후보: `android/app/build.gradle.kts`의 keystoreProperties 참조는 리터럴 secret이 아님. `backend/src/evaluation/critical_safety.js:9`, `backend/test/religion_specialization.test.js:73`는 외부 호출 방지/테스트 sentinel. 과거 `.env.example` object `9aecf7448e33`의 첫 행은 교체 안내 placeholder임을 값 출력 없이 판정했다.
- 실제 secret으로 확인된 검출과 로컬 secret 일치 없음. 검사는 365 tracked 파일, 16 commits, 448 historical blobs 기준. 현재 DB/서명키/env tracked 경로 없음.
- 한계: binary blob 내용, 짧거나 패턴 밖 secret, 암호화/인코딩 문자열, Git LFS 외부 object, unreachable/reflog-only object, 가져오지 않은 원격 브랜치/포크, CI log·릴리즈 파일·서버는 포함하지 않았다. 'Git에 secret이 절대 없다'는 보증이 아니다. 새 파일에는 설정값만 사용하고 별도 commit은 하지 않았다.

## 운영 DB·백업·proxy 적용 체크

이 절차는 권고이며 실제 서버 적용/현재 ACL 확인은 하지 않았다.

1. HTTPS 인증서를 호스팅이 제공하는 정상 경로에 설치하고 443 vhost에서 Node loopback으로만 proxy한다. 인증서 경로는 근거 없이 생성하지 않았다. 인증서 검증을 끄거나 HTTP fallback을 두지 않는다. HTTP endpoint는 민감 POST를 redirect로 수습하려 하지 말고 거부한다.
2. 운영 8787은 외부에서 접근 불가하게 한다. 관리자 shell과 API를 둘 다 VPN/IP allowlist 뒤에 둔다. proxy hop만 신뢰하도록 설정하고 전달 헤더 spoofing과 rate limit 작동을 확인한다.
3. Linux 운영 data/backup 디렉터리는 전용 서비스 사용자 소유, 디렉터리 0700, DB/WAL/SHM/backup 파일 0600, 서비스 umask 0077을 기준으로 배포 환경과 맞춘다. Windows는 동등한 NTFS ACL로 제한한다. 현재 `mkdirSync`에는 mode 지정 없으며 SQLite 암호화도 없다. 실제 파일 권한이 이미 안전하다고 추정하지 않는다.
4. 백업은 웹 루트 외부, 별도 암호화 저장소 및 최소 권한 계정으로 관리한다. SQLite 일관성 있는 backup 기능을 사용하고 WAL 누락 복사를 피한다. 보유기간 만료/탈퇴는 활성 DB뿐 아니라 WAL·snapshot·백업·복원 후 재삭제까지 포함해야 한다. 파일 삭제를 물리적 secure erase와 동일시하지 않는다.
5. HTTP/APM access log에서 body, Authorization, cookie, userMessage, summary를 수집하지 않는다. combined access log의 URL query에 개인정보/token을 넣지 않고 필요한 경우 query 없는 형식으로 바꾼다. IP/UA 로그 기간·접근권한도 정의한다.
6. 운영 Node에 맞는 better-sqlite3 native binding을 검증한다. 실제 운영 DB의 내용은 감사 출력에 사용하지 않는다. 회원명/교회명 축약은 현재 관리자 API 응답에만 적용하며 원본 DB가 비식별화됐다는 뜻이 아니다.

## 이번 변경 파일

- 네트워크: `lib/app/api_config.dart`, `lib/src/api/member_api_client.dart`, `lib/src/api/llm_api_client.dart`, `android/app/src/main/res/xml/network_security_config.xml`, `android/app/src/debug/AndroidManifest.xml`, `android/app/src/debug/res/xml/network_security_config.xml`.
- 서버: `backend/src/app.js`, `backend/src/member_schema.js`, `backend/src/member_store.js`, `backend/src/openai_service.js`, `backend/src/knowledge/openai_embedding_adapter.js`, `backend/public/admin.js`.
- 배포 예시/안내: `docker-compose.yml`, `script/soul-bible-http.conf`, `.gitignore`, `README.md`, `lib/features/conversation_page.dart`의 로컬 저장 안내.
- 검증/문서: `test/api_transport_security_test.dart`, `backend/test/privacy_security.test.js`, 본 문서 및 `BUILD_REPAIR_REPORT.md` 보안 후속 기록.

Safety/Psychology/Religion Router/RAG의 판단·검색·프롬프트 흐름과 Phase 1~9/Engagement/backend architecture는 유지했다. 데이터 삭제·사용자 인증은 안전한 소유권 설계가 필요하므로 불완전한 endpoint를 임의 추가하지 않았다. applicationId/namespace도 변경하지 않았다.

## 검증 결과

- Flutter analyze `--no-fatal-infos`: error 0, warning 0, 기존 info 15, 종료 코드 0.
- Flutter test: 28개 통과. Release transport 정책(debug=false), debug loopback 예외, 전송 전 signup 거부, redirect 차단 포함.
- Backend regression: 271개 통과. error message/name/code에 개인정보 sentinel을 넣어도 로그/응답에 남지 않는지, no-store, DB/.env 정적 경로 404, 관리자 개인정보 축약 검증 포함. 실제 SQLite native DB 경로는 검증하지 못했음(S2).
- 보안 수정 반영 `flutter build apk --release`: 성공, 실제 `build/app/outputs/flutter-apk/app-release.apk` 존재 확인. 생성 시각 2026-09-08 14:20:11, 52,410,846 bytes.
- APK 내부도 aapt2로 확인: manifest의 networkSecurityConfig 참조가 release XML 리소스에 연결되며 `base-config cleartextTrafficPermitted=false`. Release 최적화로 XML 파일명은 `res/8G.xml`로 변경되어 resource table을 통해 추적했다.
- Release AAB도 보안 수정 반영하여 빌드 성공. 최종 실물 점검은 BUILD_REPAIR_REPORT.md 보안 후속 기록 참조.
- Apache 설정은 저장소 예시만 변경했고 `httpd -t`, 실제 HTTPS/방화벽/운영 DB/실기기 음성·알림·TLS 테스트는 수행하지 않았다. 빌드 성공은 출시 개인정보·보안 승인과 다르다.

## 출시 전 우선 순서

1. N2/N3/N4: 실제 HTTPS 443·인증서·proxy·외부 8787 차단 확인. 서버 적용 없이 HTTPS 이용 가능하다고 공지하지 않는다.
2. A1/A2: 사용자/세션 소유권 인증과 필요 시 회원 본인확인 구현. timestamp/shared token만으로 민감 summary를 조회하지 않도록 한다.
3. P1/P2/P3: 필수 수집 최소화, 처리방침 및 필요한 민감정보/AI 고지·동의, 탈퇴/서버 삭제, 보유기간·백업 파기 확정 및 구현.
4. M2/A4/S2: DB native 동작·운영 권한·백업·관리자 접속 제한 검증.
5. 실기기 저장/삭제·음성/알림 권한 거부 흐름, Release APK/AAB와 Play Console 검증. 정식 applicationId/namespace 변경은 별도 작업.
