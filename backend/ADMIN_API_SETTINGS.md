# onaria 관리자 API 설정

백엔드 실행 후 `/admin/`에서 기존 `ADMIN_TOKEN`으로 로그인하고 **API 설정**을 연다. 모바일·데스크톱 레이아웃과 기존 PWA 설치 기능을 제공한다. 원격 접속은 HTTPS를 사용한다. 관리자 토큰과 OpenAI 키는 서로 다른 자격 증명이다.

- 키 저장/교체: 새 요청부터 적용한다. 실제 OpenAI 연결 확인이나 유료 호출은 수행하지 않는다.
- 키 삭제: 저장된 빈 값으로 환경변수 키도 덮어써 새 요청의 AI 사용을 중단한다. 이미 진행 중인 요청은 완료될 수 있다.
- 처음 저장하기 전에는 기존 `OPENAI_API_KEY` 환경변수를 사용한다.
- AI 활성화에는 기존 `SOUL_AI_MODE=openai`, `SOUL_MULTI_AGENT_ENABLED=true` 및 외부 API 허용·비용·콘텐츠 정책이 여전히 필요하다. 키 입력만으로 이를 변경하지 않는다.

`GET/PUT/DELETE /v1/admin/settings`는 관리자 Bearer 인증을 요구하며 응답은 `no-store`다. 조회 결과에는 등록 여부·설정 출처·응답 모드·변경 시각만 포함한다. PUT 본문은 `{ "apiKey": "새 키" }`다. 키는 브라우저 저장소에 보관하지 않으며 전송 시 입력란을 비운다. 관리자 인증 토큰은 기존처럼 sessionStorage에 유지된다.

키는 `backend/data/admin-secrets/settings.enc`에 AES-256-GCM으로 저장한다. `master.key`는 같은 비공개 디렉터리에 생성되며 두 파일 모두 저장소 추적 대상에서 제외된다. POSIX에서는 파일 0600·디렉터리 0700을 요청한다. Windows에서는 서비스 계정만 접근하도록 NTFS ACL을 운영에서 확인해야 한다. 이 암호화는 서버 파일 전체를 읽을 수 있는 공격자로부터 보호하는 외부 비밀 관리 서비스가 아니다. 디렉터리 전체와 백업에 접근 제한이 필요하다.

Docker에는 관리자 정적 파일 복사와 `onaria-admin-secrets` 영속 볼륨을 추가했다. 암호화 파일과 master.key를 함께 보존한다. 현재 런타임 반영은 단일 서버 프로세스 기준이며 여러 프로세스/복제본 간 자동 동기화는 제공하지 않는다.

검증: backend 331개 통과(`build/admin-settings-tests.log`), 관리자 JS 구문 검사 통과. 인증 차단·키 비노출·재시작 복원·삭제·실패 시 기존 설정 보존·로그아웃 중 응답 경합·기존 Safety 불변조건 포함. 실제 브라우저 시각 검수, Docker 실행, 운영 배포 및 실제 OpenAI 키 연결은 미검증이다.
